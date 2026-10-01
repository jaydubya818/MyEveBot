import {afterAll,beforeAll,describe,expect,it,vi} from "vitest";
import {createHash,randomUUID} from "node:crypto";
import {mkdtemp,writeFile,rm,realpath} from "node:fs/promises";
import {createServer} from "node:http";
import {spawn} from "node:child_process";
import path from "node:path";
import os from "node:os";
// The repository's optional PostgreSQL integration fixtures use the JS driver.
// @ts-expect-error pg has no declaration package in this workspace.
import {Client} from "pg";
const state=vi.hoisted(()=>({client:null as any,admin:null as any}));
vi.mock("../agent/lib/receipts-db.ts",()=>({db:()=>({query:async(sql:string,params?:unknown[])=>(await state.client.query(sql,params)).rows})}));
import {revokeLocalPairing,pollLocalDevice,completeLocalJob,localJob,localDeviceStatus} from "./local-computer-store.ts";
import {loadMigrations,runMigrations} from "../scripts/migration-runner.ts";
import {POST} from "../app/api/local-computer/worker/route.ts";
const connection=process.env.LOCAL_COMPUTER_TEST_DATABASE_URL;
const schema=`local_mac_${randomUUID().replaceAll("-","")}`;
const hash=createHash("sha256").update("a".repeat(64)).digest("hex");
const permissions={accessibility:false,screenRecording:false};
let actionNumber=0;
describe.skipIf(!connection)("local companion real SQL dispatch",()=>{
  beforeAll(async()=>{
    const url=new URL(connection!);if(url.hostname!=="127.0.0.1"||url.port!=="55441")throw new Error("Disposable test database required.");
    state.admin=new Client({connectionString:connection});await state.admin.connect();
    await state.admin.query(`CREATE DATABASE ${schema}`);
    url.pathname=`/${schema}`;state.client=new Client({connectionString:url.href});await state.client.connect();
    await runMigrations({query:async(sql,params)=>(await state.client.query(sql,params)).rows,transaction:async statements=>{
      await state.client.query("BEGIN");try{for(const s of statements)await state.client.query(s.sql,s.params);await state.client.query("COMMIT");}catch(e){await state.client.query("ROLLBACK");throw e;}
    }},await loadMigrations(),()=>{});
    await state.client.query(`INSERT INTO agents(id,owner_id,slug,name,role,instructions,max_runtime_seconds,max_steps,max_estimated_cost_usd)
      VALUES('agent','owner','agent','Agent','Test','Test',900,100,10)`);
    await state.client.query(`SELECT owner_chat_run('owner','session','agent','run',true,true)`);
    vi.stubEnv("SOFIE_LOCAL_CAPABILITIES","computer.local.read,computer.local.shell");vi.stubEnv("MYEVE_OWNER_ID","owner");vi.stubEnv("SOFIE_LOCAL_DEVICE_ID","mac-test");vi.stubEnv("SOFIE_LOCAL_DEVICE_TOKEN","a".repeat(64));
  },30000);
  afterAll(async()=>{vi.unstubAllEnvs();if(state.client)await state.client.end();if(state.admin){await state.admin.query(`DROP DATABASE IF EXISTS ${schema}`);await state.admin.end();}});
  async function job(needsApproval=false){
    const id=randomUUID(),action=`fixture-action-${++actionNumber}`;
    await state.client.query(`INSERT INTO action_requests(id,owner_id,run_id,action_key,executor,trigger,capability_id,action_class,target,parameter_hash,safe_summary,decision,authority_source,status)
      VALUES($1,'owner','run',$1,'{}','{}',$2,$3,'{}','binding','{}','ALLOW','fixture','completed')`,[action,needsApproval?"computer.local.shell":"computer.local.read",needsApproval?"execute":"read"]);
    await state.client.query(`INSERT INTO local_computer_jobs(id,owner_id,device_id,pairing_hash,agent_id,agent_revision,session_id,action_id,parameters,needs_approval)
      SELECT $1,'owner','mac-test',$2,'agent',updated_at,'session',$3,'{"operation":"roots"}',$4 FROM agents WHERE id='agent'`,[id,hash,action,needsApproval]);
    return {id,action};
  }
  it("claims a read once and accepts only the matching result",async()=>{
    const {id}=await job();const claimed=await pollLocalDevice(["/shared"],permissions);
    expect(claimed?.id).toBe(id);expect(await pollLocalDevice(["/shared"],permissions)).toBeNull();
    expect(await completeLocalJob(id,randomUUID(),{text:"wrong claim"})).toBe(false);
    expect(await completeLocalJob(id,String(claimed!.claim_id),{text:"read result"})).toBe(true);
    expect(await completeLocalJob(id,String(claimed!.claim_id),{text:"replayed"})).toBe(false);
    expect(await localJob("owner","agent","session",id)).toMatchObject({status:"completed",result:{text:"read result"}});
    await expect(localJob("another-owner","agent","session",id)).rejects.toThrow();
    expect(await localDeviceStatus("owner")).toMatchObject({status:"ready",roots:["/shared"]});
  });
  it("never releases a change without a matching canonical approval",async()=>{
    const {id}=await job(true);expect(await pollLocalDevice(["/shared"],permissions)).toBeNull();
    await state.client.query("UPDATE local_computer_jobs SET status='expired' WHERE id=$1",[id]);
  });
  it("releases only the exact approved change, and checks expiry again at dispatch",async()=>{
    const {id,action}=await job(true);
    await state.client.query(`INSERT INTO task_approval_decisions(id,task_id,owner_id,agent_id,requested_by,prompt,
      capability_id,action,action_class,binding_hash,risk,expires_at,status,decision)
      VALUES($1,'run','owner','agent','agent','Exact command approval','computer.local.shell','execute','execute',
        'wrong-binding','critical',now()+interval '1 hour','approved','approved')`,[`approval-${action}`]);
    await state.client.query("UPDATE action_requests SET approval_id=$2 WHERE id=$1",[action,`approval-${action}`]);
    expect(await pollLocalDevice(["/shared"],permissions)).toBeNull();
    await state.client.query("UPDATE task_approval_decisions SET binding_hash='binding',expires_at=now()-interval '1 second' WHERE id=$1",[`approval-${action}`]);
    expect(await pollLocalDevice(["/shared"],permissions)).toBeNull();
    await state.client.query("UPDATE task_approval_decisions SET expires_at=now()+interval '1 hour' WHERE id=$1",[`approval-${action}`]);
    const claimed=await pollLocalDevice(["/shared"],permissions);expect(claimed?.id).toBe(id);
    expect(await completeLocalJob(id,String(claimed!.claim_id),{text:"approved result"})).toBe(true);
  });
  it("does not reclaim a running action after its deadline",async()=>{
    const {id}=await job();const claimed=await pollLocalDevice(["/shared"],permissions);expect(claimed?.id).toBe(id);
    await state.client.query("UPDATE local_computer_jobs SET expires_at=now()-interval '1 second' WHERE id=$1",[id]);
    expect(await pollLocalDevice(["/shared"],permissions)).toBeNull();expect(await localJob("owner","agent","session",id)).toMatchObject({status:"unknown"});
    expect(await completeLocalJob(id,String(claimed!.claim_id),{text:"late"})).toBe(false);
  });
  it("does not release jobs to a rotated pairing token",async()=>{
    const {id}=await job();vi.stubEnv("SOFIE_LOCAL_DEVICE_TOKEN","b".repeat(64));
    expect(await pollLocalDevice(["/shared"],permissions)).toBeNull();vi.stubEnv("SOFIE_LOCAL_DEVICE_TOKEN","a".repeat(64));
    await state.client.query("UPDATE local_computer_jobs SET status='expired' WHERE id=$1",[id]);
  });
  it("rechecks Agent revision and status at device dispatch",async()=>{
    const {id}=await job();await state.client.query("UPDATE agents SET updated_at=now()+interval '1 second' WHERE id='agent'");
    expect(await pollLocalDevice(["/shared"],permissions)).toBeNull();await state.client.query("UPDATE local_computer_jobs SET status='expired' WHERE id=$1",[id]);
  });
  it("runs the actual outbound companion and returns the requested local file",async()=>{
    const directory=await realpath(await mkdtemp(path.join(os.tmpdir(),"sofie-worker-e2e-")));
    const readme=path.join(directory,"README.md");await writeFile(readme,"# Local companion acceptance\nActual file on the Mac.");
    const server=createServer(async(req,res)=>{
      const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
      const reply=await POST(new Request("http://127.0.0.1/api/local-computer/worker",{method:"POST",headers:{authorization:req.headers.authorization??""},body:Buffer.concat(chunks)}));
      res.writeHead(reply.status,{"Content-Type":"application/json"});res.end(await reply.text());
    });
    await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
    const address=server.address() as {port:number};
    const credentialHelper=path.join(directory,"fixture-credential");await writeFile(credentialHelper,`#!/bin/sh\nprintf %s ${"a".repeat(64)}\n`,{mode:0o700});
    const config=path.join(directory,"config.json");await writeFile(config,JSON.stringify({appUrl:`http://127.0.0.1:${address.port}`,deviceId:"mac-test",credentialHelper,keychainAccount:"fixture",roots:[directory],helper:"/nonexistent/helper"}));
    const {id}=await job();await state.client.query("UPDATE local_computer_jobs SET parameters=$2::jsonb WHERE id=$1",[id,JSON.stringify({operation:"read_text",path:readme})]);
    const worker=spawn(process.execPath,["--import","tsx",new URL("../scripts/local-computer/worker.ts",import.meta.url).pathname],{cwd:process.cwd(),env:{...process.env,SOFIE_LOCAL_CONFIG:config},stdio:"pipe"});
    try{
      const until=Date.now()+15000;let result;
      do{result=await localJob("owner","agent","session",id);if(result.status==="completed")break;await new Promise(resolve=>setTimeout(resolve,200));}while(Date.now()<until);
      expect(result).toMatchObject({status:"completed"});expect(JSON.parse(result!.result!.text).content).toContain("Actual file on the Mac.");
    }finally{if(worker.exitCode===null){worker.kill("SIGTERM");await new Promise<void>(resolve=>worker.once("exit",()=>resolve()));}await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(directory,{recursive:true,force:true});}
  },20000);
  it("revokes the exact pairing without permitting queued or stale mutations",async()=>{
    const {id}=await job();await revokeLocalPairing();
    expect(await localDeviceStatus("owner")).toMatchObject({status:"revoked"});
    await expect(pollLocalDevice(["/shared"],permissions)).rejects.toThrow("revoked");
    expect(await completeLocalJob(id,randomUUID(),{text:"stale"})).toBe(false);
    expect(await localJob("owner","agent","session",id)).toMatchObject({status:"expired"});
    const response=await POST(new Request("https://example.com/api/local-computer/worker",{method:"POST",headers:{authorization:`Bearer ${"a".repeat(64)}`},body:JSON.stringify({operation:"poll",roots:["/shared"],permissions})}));
    expect(response.status).toBe(410);
    vi.stubEnv("SOFIE_LOCAL_DEVICE_TOKEN","b".repeat(64));
    expect(await pollLocalDevice(["/shared"],permissions)).toBeNull();
  });
});
