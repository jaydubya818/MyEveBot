import {z} from "zod";
import {nativeDevelopmentToolSchema} from "../lib/engineering/native-input.ts";
// Opt-in real model + real independent Docker qualification on synthetic data.
// No production DB, repository credential, memory, account data or deployment.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { Client, Pool } from "pg";
import { loadMigrations, runMigrations } from "../scripts/migration-runner.ts";
import { WorkStore } from "../lib/engineering/store.ts";
import { NativeRouteAuthority, admitNativeWork, nativeProfileHash, NATIVE_PROVIDER } from "../lib/engineering/native-routing.ts";
import { nativeBudgetedModel } from "../lib/engineering/native-model.ts";
import { NativeModelBudget } from "../lib/engineering/native-model-budget.ts";
import { DirectDevelopmentStore } from "../lib/engineering/direct-development.ts";
import { DirectVerificationDriver, DockerVerificationResourceInspector } from "../lib/engineering/direct-verification-driver.ts";
import { DockerProtectedVerifier } from "../lib/engineering/docker-executor.ts";
import { NativeResultStore } from "../lib/engineering/native-results.ts";
import { manifestForSnapshot } from "../lib/engineering/base-preflight.ts";
import { ActionGateway, consumeActionAuthority, consumeProviderAuthority } from "../lib/action-gateway.ts";
import { runtimeSchema } from "../lib/engineering/runtime.ts";

assert.equal(process.env.MYEVE_NATIVE_LIVE,"1","Explicit synthetic live-test opt-in required.");
const credentialFile=process.env.MYEVE_NATIVE_CREDENTIAL_FILE;
assert(credentialFile?.startsWith("/private/tmp/"));
const env=parseEnv(await readFile(credentialFile,"utf8"));
for(const key of ["AI_GATEWAY_API_KEY","VERCEL_OIDC_TOKEN"])if(env[key])process.env[key]=env[key];
const adminURL="postgresql://postgres@127.0.0.1:55468/postgres";
const admin=new Client({connectionString:adminURL});await admin.connect();
const name=`native_live_${randomBytes(8).toString("hex")}`;
let pool;
let priorSpendUsd=0;
try{const prior=JSON.parse(await readFile("/private/tmp/myeve-native-live/report.json","utf8"));
  // Each invocation uses a new isolated Work. An uncertain prior reservation is
  // charged in full against the shared test allowance, never refunded or retried.
  // This does not reconcile or re-enable the fenced Work in the application.
  priorSpendUsd=Number(prior.priorSpendUsd??0)+(Number(prior.usage?.spent_microusd??0)+Number(prior.usage?.reserved_microusd??0))/1e6;
  if(prior.usage)await writeFile(`/private/tmp/myeve-native-live/attempt-${Date.now()}.json`,JSON.stringify(prior,null,2));
}catch(error){if(error.code!=="ENOENT")throw error;}
const remainingBudget=2-priorSpendUsd;assert(remainingBudget>0.2,"The authorized $2 qualification allowance is exhausted.");
const report={priorSpendUsd,attemptBudgetUsd:remainingBudget,toolResults:[],kind:"synthetic-native-model-and-docker",model:"anthropic/claude-sonnet-5",budgetUsd:2,authoredWebTool:false,steps:[],proofs:[],status:"NOT_RUN"};
try {
  await admin.query(`CREATE DATABASE ${name}`);
  const databaseURL=new URL(adminURL);databaseURL.pathname=`/${name}`;
  pool=new Pool({connectionString:databaseURL.href});
  const client=await pool.connect();
  try {await runMigrations({query:async(sql,params)=>(await client.query(sql,params)).rows,
    transaction:async statements=>{await client.query("BEGIN");try{for(const statement of statements)await client.query(statement.sql,statement.params);await client.query("COMMIT");}catch(error){await client.query("ROLLBACK");throw error;}}},await loadMigrations(),()=>{});}finally{client.release();}
  const database={query:async(sql,params)=>(await pool.query(sql,params)).rows};
  const owner="native-live-synthetic",agentId="native-live-sofie",sessionId=randomUUID(),actionRun=`native-live-${randomUUID()}`;
  await pool.query(`INSERT INTO agents(id,owner_id,name,slug,role,instructions,is_primary,max_estimated_cost_usd,max_runtime_seconds,max_steps,updated_at)
    VALUES($1,$2,'Sofie','sofie','engineer','Synthetic parser fixture only',true,2,1800,20,date_trunc('milliseconds',clock_timestamp()))`,[agentId,owner]);
  await pool.query(`INSERT INTO task_runs(id,owner_id,kind,title,agent_id,status,max_duration_seconds,max_specialists,max_model_steps,max_retries_per_specialist,max_estimated_cost_usd,deadline_at)
    VALUES($1,$2,'delegated_work','Synthetic native qualification',$3,'running',1800,0,20,0,2,now()+interval '30 minutes')`,[actionRun,owner,agentId]);
  const criterion={id:randomUUID(),statement:"Accept canonical positive integer quantities 1..100; reject fractional, zero, negative and junk input with INVALID.",method:"test"};
  const source={sha:"a".repeat(40),files:{"README.md":"Synthetic quantity parser fixture. quantity.mjs reads a trimmed stdin value. Valid integers 1..100 print the value; everything else prints INVALID.\\n",
    "quantity.mjs":"import fs from 'node:fs';\nconst value=parseInt(fs.readFileSync(0,'utf8').trim(),10);\nconsole.log(value>=1&&value<=100?value:'INVALID');\n"}};
  const profile={id:"native-live-synthetic",version:1,repository:"fixture/parser",privateQualification:true,baseBranch:"main",allowedPaths:["quantity.mjs"],
    checks:[...["1","100"].map(value=>({id:`valid-${value}`,program:"quantity.mjs",input:value+"\n",expectedOutput:value+"\n",expectedExitCode:0,criterionIds:[criterion.id]})),
      ...["2.5","0","-1","12junk"].map((value,index)=>({id:`invalid-${index}`,program:"quantity.mjs",input:value+"\n",expectedOutput:"INVALID\n",expectedExitCode:0,criterionIds:[criterion.id]}))],
    requiredCI:["quantity-ci"],reviewerLogins:["synthetic-owner"],policyVersion:1,executor:"claude-code",image:"node@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1",maxRuns:4,maxModelRequests:12,maxOutputTokens:2048};
  const config={mode:"isolated-dogfood",ownerId:owner,agentId,objective:"Fix the synthetic quantity parser using native Work tools.",criteria:[criterion],profile,
    approvedBase:manifestForSnapshot(source),brokerPort:55470,model:"claude-sonnet-5"};
  // Test-only eligibility record; this is not installed in an application runtime.
  config.nativeQualification={provider:NATIVE_PROVIDER,modelId:report.model,scopeId:owner,profileHash:nativeProfileHash(config),
    evidenceRef:"test-only:native-host-local-boundaries",qualifiedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+1800000).toISOString()};
  const store=new WorkStore({scopeId:owner,scopeKind:"personal",actorId:owner},database);
  const {work:created}=await store.create({title:"Synthetic native parser live test",objective:config.objective,repository:profile.repository,criteria:config.criteria,maxCostUsd:remainingBudget,maxDurationSeconds:1800,idempotencyKey:randomUUID()});
  const work=await store.change(created.id,{operation:"resume",expectedVersion:created.version});report.workId=work.id;
  const authority=new NativeRouteAuthority(store,async()=>runtimeSchema.parse(config));await admitNativeWork(store,work.id,work.version,work.generation,authority);
  const direct=new DirectDevelopmentStore(store,{...config,issueNumber:1,assertCurrentAuthority:id=>authority.assertEffect(id)});
  const driver=new DirectVerificationDriver(direct,new DockerProtectedVerifier());
  const budget=new NativeModelBudget(store,authority);
  const gateway=new ActionGateway(database,{evaluate:async()=>{await authority.assertEffect(work.id);return {decision:"ALLOW",source:"synthetic-native-test",reason:"Exact bounded Work and fixture target"};}},undefined,()=>true);
  const prompt=[{role:"system",content:"You are Sofie performing a synthetic qualification. Use only engineering_direct. Open then inspect/read the source, record a plan, and add one harmless comment to quantity.mjs without changing the algorithm, then submit that minimally changed candidate FIRST so the independent verifier demonstrates its defect. Then diagnose the returned failed checks, repair the parser, submit and inspect the final passing candidate. Do not modify any other file or claim readiness. Every plan, write and submit call MUST include expectedRevision equal to the latest returned workspace revision; each mutation advances the revision. Stop when independent checks pass. These are synthetic files, no private account data."},
    {role:"user",content:[{type:"text",text:criterion.statement}]}];
  const tool={type:"function",name:"engineering_direct",description:"Native Work operations. Submit automatically invokes the separate protected verifier in this test host and returns independent check observations.",inputSchema:z.toJSONSchema(nativeDevelopmentToolSchema)};
  function view(value){return {revision:value.revision,phase:value.phase,files:Object.keys(value.draftFiles),plan:value.plan,candidates:value.candidates.map(item=>({sha:item.sha,changedPaths:item.changedPaths})),evidence:value.evidence.map(item=>({check:item.check,result:item.result,candidate:item.candidate,artifact:item.artifact}))};}
  for(let step=0;step<12;step++){
    const model=nativeBudgetedModel({store,workId:work.id,sessionId,stepKey:`${sessionId}:live:${step}`,modelId:report.model},{authority,budget});
    const response=await model.doGenerate({prompt,tools:[tool],toolChoice:{type:"auto"}});
    prompt.push({role:"assistant",content:response.content});
    const calls=response.content.filter(item=>item.type==="tool-call");
    report.steps.push({step,text:response.content.filter(item=>item.type==="text").map(item=>item.text).join("\n"),finishReason:response.finishReason,operations:calls.map(item=>JSON.parse(item.input).request?.operation),toolCalls:calls});
    for(const call of calls){
      const parsed=nativeDevelopmentToolSchema.safeParse(JSON.parse(call.input));
      if(!parsed.success){
        // Match framework validation: invalid arguments produce feedback, never an effect.
        const error={error:"Invalid tool input. Use the required request object and the exact operation fields.",issues:parsed.error.issues};
        report.toolResults.push({step,validationError:error,rawInput:call.input});
        prompt.push({role:"tool",content:[{type:"tool-result",toolCallId:call.toolCallId,toolName:call.toolName,output:{type:"error-json",value:error}}]});
        continue;
      }
      const input=parsed.data.request;let result;
      try {
        await budget.assertSession(work.id,sessionId);
        const request={ownerId:owner,runId:actionRun,actionKey:call.toolCallId,capabilityId:"tool.engineering_direct",actionClass:"write",executor:{kind:"primary-agent",agentId},trigger:{kind:"goal_execution"},parameters:{workId:work.id,...input}};
        await authority.assertEffect(work.id);
        if(input.operation==="read")result=await direct.read(work.id,input.path);
        else if(input.operation==="inspect")result=view((await direct.inspect(work.id)).workspace);
        else result=await gateway.execute(request,{resolveTarget:async()=>({provider:NATIVE_PROVIDER.id,account:owner,resource:`engineering-work:${work.id}`,environment:"synthetic-test"}),
          execute:async(parameters,handle)=>{try{await consumeActionAuthority(handle,parameters,request.capabilityId);await consumeProviderAuthority(handle,parameters,request.capabilityId);
            if(input.operation==="open")return view(await direct.open(work.id,source));
            if(input.operation==="inspect")return view((await direct.inspect(work.id)).workspace);
            if(input.operation==="read")return direct.read(work.id,input.path);
            if(input.operation==="plan")return view(await direct.plan(work.id,input.expectedRevision,input.plan));
            if(input.operation==="write")return view(await direct.write(work.id,input.expectedRevision,input.path,input.content));
            if(input.operation==="submit") {const candidate=await direct.submit(work.id,input.expectedRevision);return {candidate:candidate.candidate.sha,revision:candidate.workspace.revision};}
            throw new Error("Unsupported fixture operation");}catch(error){console.log(JSON.stringify({adapterError:error.message,operation:input.operation,input}));throw error;}},receipt:result=>({...result}),verify:async result=>({verified:true,receipt:{...result}})});
        if(input.operation==="submit"){
          await driver.run(work.id);const retained=await new NativeResultStore(direct).retain(work.id);report.proofs.push(retained);
          const inspected=await direct.inspect(work.id);result={...result,verification:view(inspected.workspace)};
          assert(await new DockerVerificationResourceInspector().resourcesAbsent(inspected.workspace.candidates.at(-1),profile));
        }
      }catch(error){result={error:error.message};}
      report.toolResults.push({step,input,operation:input.operation,result});
      console.log(JSON.stringify({step,operation:input.operation,error:result.error??null}));
      if(result.error)throw new Error(`Native fixture action failed: ${result.error}`);
      prompt.push({role:"tool",content:[{type:"tool-result",toolCallId:call.toolCallId,toolName:call.toolName,output:{type:"json",value:result}}]});
    }
    const inspected=await direct.inspect(work.id);
    if(inspected.workspace?.phase==="VERIFICATION_PASSED"){
      assert(inspected.workspace.evidence.some(item=>item.result==="FAIL"),"A live failure→repair trace is required.");
      report.status="PASS";break;
    }
    if(!calls.length)throw new Error("Model stopped before the independently verified candidate.");
  }
  const [ledger]=await database.query("SELECT spent_microusd,reserved_microusd,usage_unknown,calls_started FROM engineering_native_runtime WHERE work_id=$1",[work.id]);report.usage=ledger;
  assert.equal(report.status,"PASS");assert(Number(ledger.spent_microusd)+Number(ledger.reserved_microusd)<=Math.floor(remainingBudget*1000000));assert.equal(ledger.usage_unknown,false);
  console.log(JSON.stringify({status:report.status,steps:report.steps.length,spendUsd:Number(ledger.spent_microusd)/1000000,independentResults:report.proofs.length}));
}catch(error){report.status="FAILED";report.error=error.message;console.error(error.message);process.exitCode=1;}
finally {
  if(pool && report.workId){try{const result=await pool.query("SELECT spent_microusd,reserved_microusd,usage_unknown,calls_started FROM engineering_native_runtime WHERE work_id=$1",[report.workId]);report.usage=result.rows[0]??null;}catch{/* Preserve the original failure. */}}
  await writeFile(process.env.MYEVE_NATIVE_REPORT??"/private/tmp/myeve-native-live/report.json",JSON.stringify(report,null,2));
  await pool?.end();await admin.query(`DROP DATABASE IF EXISTS ${name}`);await admin.end();
}
