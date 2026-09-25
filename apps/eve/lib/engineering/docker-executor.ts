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
async function volume(image:string,name:string,files:Record<string,string>) {
  await checked(["volume","create","--label","myeve.golden=true",name]);
  await checked(["run","--rm","--network=none",...limits,"--user=1000:1000","--mount",`type=volume,src=${name},dst=/work`,"-i",image,"node","-e",init],JSON.stringify(files));
}

export class DockerClaudeExecutor implements Executor {
  readonly kind="claude-code" as const;
  readonly capabilities={resumeSession:false,automaticFailover:false} as const;
  constructor(private readonly config:{brokerPort:number;brokerSecret:string;model:string}) {}
  async start(contract:WorkContract,run:EngineeringRun,snapshot:RepositorySnapshot) {
    assertResource(run);
    if (!Number.isInteger(this.config.brokerPort)||this.config.brokerPort<1024||this.config.brokerPort>65535) throw new Error("Invalid isolated broker port.");
    const name=run.resource,image=contract.profile.image;
    const existing=await docker(["inspect",name]);
    if(existing.code===0) return; // Stable attempt identity: never launch a duplicate executor.
    await volume(image,name,snapshot.files);
    const network=await docker(["network","inspect",name]);
    if(network.code) await checked(["network","create","--internal","--label","myeve.golden=true",name]);
    const proxy=`const http=require('http');http.createServer(async(q,s)=>{try{if(q.method!=='POST'||new URL(q.url,'http://model').pathname!=='/v1/messages'){s.writeHead(403);return s.end();}let b='';for await(const c of q){b+=c;if(b.length>180000)throw Error('bound');}const r=await fetch('http://host.docker.internal:${this.config.brokerPort}/broker/${contract.workId}/${run.attemptId}',{method:'POST',headers:{authorization:q.headers.authorization||'','content-type':'application/json'},body:b,signal:AbortSignal.timeout(90000)});s.writeHead(r.status,{'content-type':r.headers.get('content-type')||'application/json'});s.end(Buffer.from(await r.arrayBuffer()));}catch(e){s.writeHead(503);s.end('Model broker unavailable');}}).listen(8080,'0.0.0.0');`;
    const proxyExists=await docker(["inspect",name+"-model"]);
    if(proxyExists.code) {
      await checked(["run","-d","--name",name+"-model","--label","myeve.golden=true",...limits,image,"node","-e",proxy]);
      await checked(["network","connect","--alias","model",name,name+"-model"]);
    }
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
    assertResource(run);const r=await docker(["inspect","--format","{{json .State}}",run.resource]);
    if(r.code)return "lost" as const;const state=JSON.parse(r.out);
    return state.Running?"running" as const:state.ExitCode===0?"completed" as const:"failed" as const;
  }
  async requestStop(run:EngineeringRun) { assertResource(run);const r=await docker(["inspect",run.resource]);if(!r.code)await checked(["stop","--time","2",run.resource]); }
  async collectCandidate(contract:WorkContract,run:EngineeringRun,snapshot:RepositorySnapshot) {
    assertResource(run);
    const files=JSON.parse(await checked(["run","--rm","--network=none",...limits,"--mount",`type=volume,src=${run.resource},dst=/work,readonly`,contract.profile.image,"node","-e",collect]));
    return createCandidate(contract,run,snapshot,files);
  }
  async collectUsage(_run:EngineeringRun) { return {coverage:"Durable broker reservations; executor self-reported costs are not authoritative",providerCostUsd:null}; }
  async cleanup(run:EngineeringRun) {
    assertResource(run);
    for(const name of [run.resource,run.resource+"-model"]){const r=await docker(["inspect",name]);if(!r.code)await checked(["rm","-f",name]);}
    const net=await docker(["network","inspect",run.resource]);if(!net.code)await checked(["network","rm",run.resource]);
    const vol=await docker(["volume","inspect",run.resource]);if(!vol.code)await checked(["volume","rm",run.resource]);
    for(const [kind,name] of [["container",run.resource],["container",run.resource+"-model"],["volume",run.resource],["network",run.resource]])
      if((await docker([kind,"inspect",name])).code===0)throw new Error("Isolated resource cleanup did not complete.");
  }
}

export class DockerProtectedVerifier implements ProtectedVerifier {
  async verify(contract:WorkContract,candidate:Candidate):Promise<Evidence[]> {
    const name=`myeve-golden-verify-${candidate.id}`,image=contract.profile.image;
    const evidence:Evidence[]=[];
    try {
      // Reconcile deterministic verifier names after an interrupted worker before rebuilding its read-only volume.
      for(const check of contract.profile.checks) {const stale=await docker(["inspect",`${name}-${check.id}`]);if(!stale.code)await checked(["rm","-f",`${name}-${check.id}`]);}
      await volume(image,name,candidate.files);
      for(const check of contract.profile.checks) {
        const container=`${name}-${check.id}`;
        let result:Evidence["result"]="UNKNOWN", artifact="";
        try {
          // Candidate executes in a separate deny-network process. The trusted host compares output.
          const observed=await docker(["run","--name",container,"--label","myeve.golden=true","--network=none",...limits,
            "--mount",`type=volume,src=${name},dst=/work,readonly`,"--workdir=/work","-i",image,"node",check.program],check.input,10000);
          artifact=JSON.stringify({exitCode:observed.code,stdout:observed.out,stderr:observed.err});
          result=observed.code===check.expectedExitCode&&observed.out===check.expectedOutput?"PASS":"FAIL";
        } catch(error) { artifact=String(error); }
        finally { const exists=await docker(["inspect",container]);if(!exists.code)await checked(["rm","-f",container]); }
        evidence.push({id:randomUUID(),workId:contract.workId,candidate:candidate.sha,base:contract.baseSha,
          criteriaVersion:contract.criteriaVersion,profileHash:contract.profileHash,environment:image,check:check.id,
          producer:"protected-supervisor",attemptId:candidate.attemptId,observedAt:nowIso(),result,artifact,artifactHash:digest(artifact)});
      }
    } finally { const exists=await docker(["volume","inspect",name]);if(!exists.code)await checked(["volume","rm",name]); }
    return evidence;
  }
}
