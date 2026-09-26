import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { digest, type WorkContract } from "./contract.ts";
import { createCandidate, type RepositorySnapshot } from "./github.ts";
import { nowIso, type Candidate, type EngineeringRun, type Evidence } from "./execution.ts";
import type { Executor, ProtectedVerifier } from "./executor.ts";
import { attemptToken } from "./model-broker.ts";

export async function docker(args: string[], input?: string, timeout=20000): Promise<{code:number;out:string;err:string}> {
  return new Promise((resolve,reject)=>{
    const child=spawn("docker",args,{env:{PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:"production"},stdio:["pipe","pipe","pipe"]});
    let out="",err="",overflow=false;
    const timer=setTimeout(()=>{child.kill("SIGKILL");reject(new Error("Docker operation timed out; resource reconciliation is required."));},timeout);
    child.stdout.on("data",b=>{out+=b;if(out.length>1000000){overflow=true;child.kill("SIGKILL");}});
    child.stderr.on("data",b=>{err+=b;if(err.length>200000){overflow=true;child.kill("SIGKILL");}});
    child.on("error",e=>{clearTimeout(timer);reject(e);});
    child.on("close",code=>{clearTimeout(timer);if(overflow)reject(new Error("Container output exceeded bound."));else resolve({code:code??1,out,err});});
    child.stdin.end(input);
  });
}
async function checked(args:string[],input?:string) { const r=await docker(args,input);if(r.code)throw new Error(`Isolated resource operation failed: ${r.err.slice(0,500)}`);return r.out.trim(); }
const limits=["--cap-drop=ALL","--security-opt=no-new-privileges","--memory=768m","--cpus=1","--pids-limit=100","--read-only","--tmpfs=/tmp:rw,nosuid,nodev,size=128m"];
const init=`const fs=require('fs'),path=require('path');let s='';process.stdin.on('data',b=>s+=b);process.stdin.on('end',()=>{for(const [p,v] of Object.entries(JSON.parse(s))){if(p.startsWith('/')||p.split('/').some(x=>!x||x==='.'||x==='..'||x==='.git'))throw Error('path');const f=path.join('/work',p);fs.mkdirSync(path.dirname(f),{recursive:true,mode:0o777});fs.writeFileSync(f,v,{mode:0o666});}fs.chmodSync('/work',0o777);});`;
const collect=`const fs=require('fs'),path=require('path');let n=0,size=0,files={};function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isSymbolicLink())throw Error('symlink');if(e.isDirectory()){if(e.name==='.git'||e.name==='.claude')continue;walk(p);}else{if(!e.isFile()||++n>200)throw Error('file bound');const v=fs.readFileSync(p);size+=v.length;if(size>500000||v.includes(0))throw Error('content bound');files[path.relative('/work',p)]=v.toString('utf8');}}}walk('/work');console.log(JSON.stringify(files));`;
function assertResource(run: EngineeringRun) { if(run.resource!==`myeve-golden-${run.id}` || !/^[a-f0-9-]{36}$/.test(run.id)) throw new Error("Unowned resource."); }
export function containerCustodyState(run:EngineeringRun,result:{code:number;out:string;err:string}):"running"|"stopped"|"absent" {
  if(cleanupResourceState(run,"container",run.resource,result)==="absent")return "absent";
  const record=JSON.parse(result.out);
  if(typeof record.State?.Running!=="boolean")
    throw new Error("Executor container ownership is not established; custody remains unresolved.");
  return record.State.Running?"running":"stopped";
}
export function volumeCustodyState(run:EngineeringRun,result:{code:number;out:string;err:string}):"present"|"absent" {
  return cleanupResourceState(run,"volume",run.resource,result);
}
type CleanupResource = "container"|"network"|"volume";
/** Docker Engine uses both forms across versions; neither a generic error nor a different name proves absence. */
export function isMissingDockerVolume(name:string,error:string):boolean {
  const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  return new RegExp(`(?:^|\\n)(?:Error(?: response from daemon)?: )?(?:No such volume:\\s*${escaped}|get ${escaped}: no such volume)\\s*$`,"i").test(error);
}
/** Cleanup may only treat an exact Docker not-found response as absence.
 * A daemon outage, name collision, or missing ownership label leaves the Run fenced. */
export function cleanupResourceState(run:EngineeringRun,kind:CleanupResource,name:string,
  result:{code:number;out:string;err:string}):"present"|"absent" {
  assertResource(run);
  if(name!==run.resource && !(kind==="container"&&name===`${run.resource}-model`))
    throw new Error("Unowned resource.");
  if(result.code) {
    // assertResource restricts the name to ASCII hex and hyphens, so it is safe in a RegExp.
    const escaped=name;
    const missing=kind==="container" ? new RegExp(`No such (?:object|container):\\s*${escaped}(?:\\s|$)`,"i")
      : kind==="volume" ? new RegExp(`No such volume:\\s*${escaped}(?:\\s|$)`,"i")
      : new RegExp(`(?:No such network:\\s*${escaped}|network\\s+${escaped}\\s+not found)(?:\\s|$)`,"i");
    if(!(kind==="volume" ? isMissingDockerVolume(name,result.err) : missing.test(result.err)))
      throw new Error("Docker resource state is unavailable; cleanup remains unresolved.");
    return "absent";
  }
  const record=JSON.parse(result.out);
  const owned=kind==="container"
    ? record.Name===`/${name}`&&record.Config?.Labels?.["myeve.golden"]==="true"
    : record.Name===name&&record.Labels?.["myeve.golden"]==="true";
  if(!owned)throw new Error("Docker resource ownership is not established; cleanup remains unresolved.");
  return "present";
}
type DockerResult = {code:number;out:string;err:string};
function verifierContainer(name:string,result:DockerResult):Record<string,any>|null {
  if (result.code) {
    // Verifier names only contain a candidate UUID and profile check id.
    if (new RegExp(`No such (?:object|container):\\s*${name}(?:\\s|$)`,"i").test(result.err)) return null;
    throw new Error("Verifier container state is unavailable; outcome needs reconciliation.");
  }
  let record:Record<string,any>;
  try { record=JSON.parse(result.out); }
  catch { throw new Error("Verifier container inspection is invalid; outcome needs reconciliation."); }
  if (record.Name!==`/${name}` || record.Config?.Labels?.["myeve.golden"]!=="true")
    throw new Error("Verifier container ownership is unknown; outcome needs reconciliation.");
  return record;
}
function verifierVolume(name:string,result:DockerResult):boolean {
  if (result.code) {
    if (isMissingDockerVolume(name,result.err)) return false;
    throw new Error("Verifier volume state is unavailable; outcome needs reconciliation.");
  }
  let record:Record<string,any>;
  try { record=JSON.parse(result.out); }
  catch { throw new Error("Verifier volume inspection is invalid; outcome needs reconciliation."); }
  if (record.Name!==name || record.Labels?.["myeve.golden"]!=="true")
    throw new Error("Verifier volume ownership is unknown; outcome needs reconciliation.");
  return true;
}
/** Docker CLI exit status alone is not candidate evidence: 125 can mean the
 * daemon never created a container. Require exact owned container exit state. */
export function protectedCheckResult(name:string,observed:DockerResult,inspected:DockerResult,
  expectedExitCode:number,expectedOutput:string):"PASS"|"FAIL" {
  const container=verifierContainer(name,inspected);
  if (!container || container.State?.Running!==false ||
      !Number.isInteger(container.State?.ExitCode) ||
      container.State.ExitCode!==observed.code)
    throw new Error("Verifier container exit is unconfirmed; outcome needs reconciliation.");
  return container.State.ExitCode===expectedExitCode && observed.out===expectedOutput?"PASS":"FAIL";
}
async function volume(image:string,name:string,files:Record<string,string>) {
  await checked(["volume","create","--label","myeve.golden=true",name]);
  // Only this fixed initializer runs as root: a fresh named volume is root-owned.
  // Candidate code runs as UID 1000; protected checks use a read-only mount.
  await checked(["run","--rm","--network=none",...limits,"--user=0:0","--mount",`type=volume,src=${name},dst=/work`,"-i",image,"node","-e",init],JSON.stringify(files));
}

export class DockerClaudeExecutor implements Executor {
  readonly kind="claude-code" as const;
  readonly capabilities={resumeSession:false,automaticFailover:false} as const;
  constructor(private readonly config:{brokerPort:number;brokerSecret:string;model:string}) {}
  async start(contract:WorkContract,run:EngineeringRun,snapshot:RepositorySnapshot) {
    assertResource(run);
    if (!Number.isInteger(this.config.brokerPort)||this.config.brokerPort<1024||this.config.brokerPort>65535) throw new Error("Invalid isolated broker port.");
    const name=run.resource,image=contract.profile.image;
    const existing=await docker(["container","inspect","--format","{{json .}}",name]);
    if(containerCustodyState(run,existing)!=="absent")return; // Stable attempt identity: never launch a duplicate executor.
    // A previous launch could have left a partially initialized volume, network,
    // or model proxy. Never overwrite it as if it were a fresh attempt.
    const priorVolume=await docker(["volume","inspect","--format","{{json .}}",name]);
    const priorNetwork=await docker(["network","inspect","--format","{{json .}}",name]);
    const priorProxy=await docker(["container","inspect","--format","{{json .}}",`${name}-model`]);
    if(volumeCustodyState(run,priorVolume)!=="absent" ||
       cleanupResourceState(run,"network",name,priorNetwork)!=="absent" ||
       cleanupResourceState(run,"container",`${name}-model`,priorProxy)!=="absent")
      throw new Error("A partial executor launch needs resource reconciliation before a fresh start.");
    await volume(image,name,snapshot.files);
    await checked(["network","create","--internal","--label","myeve.golden=true",name]);
    const proxy=`const http=require('http');http.createServer(async(q,s)=>{try{if(q.method!=='POST'||new URL(q.url,'http://model').pathname!=='/v1/messages'){s.writeHead(403);return s.end();}let b='';for await(const c of q){b+=c;if(b.length>180000)throw Error('bound');}const r=await fetch('http://host.docker.internal:${this.config.brokerPort}/broker/${contract.workId}/${run.attemptId}',{method:'POST',headers:{authorization:q.headers.authorization||'','content-type':'application/json'},body:b,signal:AbortSignal.timeout(90000)});s.writeHead(r.status,{'content-type':r.headers.get('content-type')||'application/json'});s.end(Buffer.from(await r.arrayBuffer()));}catch(e){s.writeHead(503);s.end('Model broker unavailable');}}).listen(8080,'0.0.0.0');`;
    await checked(["run","-d","--name",name+"-model","--label","myeve.golden=true",...limits,image,"node","-e",proxy]);
    await checked(["network","connect","--alias","model",name,name+"-model"]);
    const token=attemptToken(this.config.brokerSecret,contract.workId,run.attemptId);
    const prompt=`You are the single coding executor for bounded Work. Modify only ${contract.profile.allowedPaths.join(', ')}. Do not publish, call external services, modify workflow/configuration, or claim authoritative tests. Implement the objective and acceptance criteria. The trusted supervisor checks results independently.\n${JSON.stringify({objective:contract.objective,issue:contract.issueBody,criteria:contract.criteria,reason:run.reason})}`;
    await checked(["run","-d","--name",name,"--label","myeve.golden=true","--network",name,...limits,
      "--mount",`type=volume,src=${name},dst=/work`,"--workdir=/work","--user=1000:1000",
      "-e","HOME=/tmp/home","-e","CLAUDE_CONFIG_DIR=/tmp/claude","-e","DISABLE_TELEMETRY=1","-e","DISABLE_ERROR_REPORTING=1",
      "-e","CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1","-e","MAX_THINKING_TOKENS=0","-e","ANTHROPIC_BASE_URL=http://model:8080",
      "-e",`CLAUDE_CODE_MAX_OUTPUT_TOKENS=${contract.profile.maxOutputTokens}`,
      "-e",`ANTHROPIC_AUTH_TOKEN=${token}`,"-e","ANTHROPIC_API_KEY=",image,"claude","-p",prompt,
      "--model",this.config.model,"--tools","Read,Write,Edit,Glob,Grep,Bash","--allowedTools","Read,Write,Edit,Glob,Grep,Bash",
      "--permission-mode","acceptEdits","--setting-sources","","--strict-mcp-config","--mcp-config",'{"mcpServers":{}}',
      "--disable-slash-commands","--max-turns","12","--max-budget-usd",String(contract.budgetUsd),"--output-format","json"]);
  }
  followUp(contract:WorkContract,run:EngineeringRun,snapshot:RepositorySnapshot) { return this.start(contract,run,snapshot); }
  async observe(run:EngineeringRun) {
    assertResource(run);
    const r=await docker(["container","inspect","--format","{{json .}}",run.resource]);
    const state=containerCustodyState(run,r);
    if(state==="absent")return "lost" as const;
    if(state==="running")return "running" as const;
    const exitCode=JSON.parse(r.out).State.ExitCode;
    if(!Number.isInteger(exitCode))throw new Error("Executor exit state is unavailable; custody remains unresolved.");
    return exitCode===0?"completed" as const:"failed" as const;
  }
  async requestStop(run:EngineeringRun) {
    assertResource(run);
    const inspect=()=>docker(["container","inspect","--format","{{json .}}",run.resource]);
    if(containerCustodyState(run,await inspect())==="running")
      await checked(["stop","--time","2",run.resource]);
    if(containerCustodyState(run,await inspect())==="running")
      throw new Error("Executor stop is unconfirmed; candidate custody remains unresolved.");
  }
  async inspectCustody(run:EngineeringRun) {
    assertResource(run);
    const container=await docker(["inspect","--format","{{json .}}",run.resource]);
    const containerState=containerCustodyState(run,container);
    const volume=await docker(["volume","inspect","--format","{{json .}}",run.resource]);
    const volumeState=volumeCustodyState(run,volume);
    return {container:containerState,volume:volumeState};
  }
  async collectCandidate(contract:WorkContract,run:EngineeringRun,snapshot:RepositorySnapshot) {
    assertResource(run);
    const files=JSON.parse(await checked(["run","--rm","--network=none",...limits,"--mount",`type=volume,src=${run.resource},dst=/work,readonly`,contract.profile.image,"node","-e",collect]));
    return createCandidate(contract,run,snapshot,files);
  }
  async collectUsage(_run:EngineeringRun) { return {coverage:"Durable broker reservations; executor self-reported costs are not authoritative",providerCostUsd:null}; }
  async cleanup(run:EngineeringRun) {
    assertResource(run);
    const resources:{kind:CleanupResource;name:string;remove:string[]}[]=[
      {kind:"container",name:run.resource,remove:["rm","-f",run.resource]},
      {kind:"container",name:`${run.resource}-model`,remove:["rm","-f",`${run.resource}-model`]},
      {kind:"network",name:run.resource,remove:["network","rm",run.resource]},
      {kind:"volume",name:run.resource,remove:["volume","rm",run.resource]},
    ];
    for(const resource of resources) {
      const inspect=()=>docker([resource.kind,"inspect","--format","{{json .}}",resource.name]);
      if(cleanupResourceState(run,resource.kind,resource.name,await inspect())==="present")
        await checked(resource.remove);
      if(cleanupResourceState(run,resource.kind,resource.name,await inspect())!=="absent")
        throw new Error("Isolated resource cleanup did not complete.");
    }
  }
}

export class DockerProtectedVerifier implements ProtectedVerifier {
  async verify(contract:Pick<WorkContract,"workId"|"baseSha"|"criteriaVersion"|"profileHash"|"profile">,candidate:Candidate):Promise<Evidence[]> {
    const name=`myeve-golden-verify-${candidate.id}`,image=contract.profile.image;
    const evidence:Evidence[]=[];
    let initializedVolume=false;
    try {
      // An interrupted verifier may still own these deterministic resources.
      // Never remove or overwrite them without explicit recovery.
      for(const check of contract.profile.checks) {
        if (verifierContainer(`${name}-${check.id}`,
          await docker(["container","inspect","--format","{{json .}}",`${name}-${check.id}`])))
          throw new Error("A prior verifier container needs reconciliation.");
      }
      if (verifierVolume(name,await docker(["volume","inspect","--format","{{json .}}",name])))
        throw new Error("A prior verifier volume needs reconciliation.");
      initializedVolume=true;
      await volume(image,name,candidate.files);
      for(const check of contract.profile.checks) {
        const container=`${name}-${check.id}`;
        let result:Evidence["result"]="UNKNOWN", artifact="";
        try {
          // Candidate executes in a separate deny-network process. The trusted host compares output.
          const observed=await docker(["run","--name",container,"--label","myeve.golden=true","--network=none",...limits,"--user=1000:1000",
            "--mount",`type=volume,src=${name},dst=/work,readonly`,"--workdir=/work","-i",image,"node",check.program],check.input,10000);
          artifact=JSON.stringify({exitCode:observed.code,stdout:observed.out,stderr:observed.err});
          result=protectedCheckResult(container,observed,
            await docker(["container","inspect","--format","{{json .}}",container]),
            check.expectedExitCode,check.expectedOutput);
        } catch(error) { artifact=String(error); }
        finally {
          const exists=verifierContainer(container,
            await docker(["container","inspect","--format","{{json .}}",container]));
          if (exists) {
            await checked(["rm","-f",container]);
            if (verifierContainer(container,
              await docker(["container","inspect","--format","{{json .}}",container])))
              throw new Error("Verifier container cleanup is unconfirmed.");
          }
        }
        evidence.push({id:randomUUID(),workId:contract.workId,candidate:candidate.sha,base:contract.baseSha,
          criteriaVersion:contract.criteriaVersion,profileHash:contract.profileHash,environment:image,check:check.id,
          producer:"protected-supervisor",attemptId:candidate.attemptId,observedAt:nowIso(),result,artifact,artifactHash:digest(artifact)});
      }
    } finally {
      if (initializedVolume && verifierVolume(name,await docker(["volume","inspect","--format","{{json .}}",name]))) {
        await checked(["volume","rm",name]);
        if (verifierVolume(name,await docker(["volume","inspect","--format","{{json .}}",name])))
          throw new Error("Verifier volume cleanup is unconfirmed.");
      }
    }
    return evidence;
  }
}
