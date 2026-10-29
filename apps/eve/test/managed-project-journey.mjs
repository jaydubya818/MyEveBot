import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {BetaIntegration} from '../lib/beta-integration/runtime.ts';
import {FactoryCodingSessionAdapter} from '../lib/engineering/coding-sessions.ts';
import {FactoryReceiptStore} from '../lib/engineering/factory-receipt-store.ts';
import {verifyResult,digest} from '../lib/engineering/factory-producer-protocol.ts';
import {manifestForSnapshot} from '../lib/engineering/base-preflight.ts';

/** One synthetic managed journey, ordinary canonical records/HTTP/ledger/custody
 * and independent Docker tests. No real model, cloud, publication or release. */
export async function qualifyManagedProject({pool,store,repo,dir,engineering,connection,configuration,setExecutor,supervisor}){
 const git=(...args)=>execFileSync('git',['-C',repo,...args],{encoding:'utf8'}).trim();
 const source=async sha=>({sha,files:Object.fromEntries(await Promise.all(git('ls-tree','-r','--name-only',sha).split('\n').map(async path=>[path,execFileSync('git',['-C',repo,'show',sha+':'+path],{encoding:'utf8'})])))});
 await writeFile(join(repo,'one.mjs'),'export const one = 0;\n');await writeFile(join(repo,'two.mjs'),'export const two = 0;\n');
 await writeFile(join(repo,'project.mjs'),"import {one} from './one.mjs';import {two} from './two.mjs';import {readFileSync} from 'node:fs';const key=readFileSync(0,'utf8').trim();console.log(key==='one'?one:key==='two'?two:one+two);\n");
 git('add','one.mjs','two.mjs','project.mjs');git('commit','-qm','Disposable managed project base');const original=await source(git('rev-parse','HEAD'));
 const projectRepository='fixture/sofie-managed-project',owner=store.principal.scopeId;
 const beta=new BetaIntegration(pool,{repository:projectRepository,maxCostUsd:1.3,maxDurationSeconds:600});
 const goals=beta.service(owner,'owner'),goalId=randomUUID(),oneTask=randomUUID(),twoTask=randomUUID();
 await goals.create({id:goalId,objective:'Implement and independently verify the combined project',criteria:['Combined one plus two equals five']});
 await goals.plan(goalId,'Two isolated roles, checkpoint handoff, then combined verification','Qualification owner approved fixed $5.20 envelope; four $1.30 Work allocations');
 for(const [id,objective,criterion,agent] of [[oneTask,'Project role one','One implementation returns two','coder-one'],[twoTask,'Project role two','Two implementation returns three','coder-two']])
  await goals.addTask(goalId,{id,objective,criteria:[criterion],assignedTo:agent,provenance:{kind:'owner',reference:'synthetic-owner-project-authorization'}});
 const materialize=async taskId=>{const linked=await goals.continue(await goals.context(goalId,taskId));let w=await store.get(linked.workId);return store.change(w.id,{operation:'resume',expectedVersion:w.version});};
 const a=await materialize(oneTask),b=await materialize(twoTask),catalogFile=join(dir,'managed-project-profiles.json'),catalog={ownerId:owner,projectId:goalId,ceilingMicrousd:5_200_000,profiles:[]};
 const oldEnv=Object.fromEntries(['MYEVE_FACTORY_WORK_PROFILES','MYEVE_ENGINEERING_MODE','VERCEL_ENV','MYEVE_BETA_MODE'].map(k=>[k,process.env[k]]));
 Object.assign(process.env,{MYEVE_FACTORY_WORK_PROFILES:catalogFile,MYEVE_ENGINEERING_MODE:'dogfood',VERCEL_ENV:'development',MYEVE_BETA_MODE:'qualification'});
 const register=async(w,base,role)=>{
  const allowedPaths=role==='one'?['one.mjs']:role==='two'?['two.mjs']:['one.mjs','two.mjs'];
  const cases=role==='one'?[['one','2\n']]:role==='two'?[['two','3\n']]:[['one','2\n'],['two','3\n'],['sum','5\n']];
  const profile={...engineering.profile,repository:projectRepository,allowedPaths,checks:cases.map(([input,output],i)=>({id:'project-'+i,program:'project.mjs',input:input+'\n',expectedOutput:output,expectedExitCode:0,criterionIds:w.criteria.map(c=>c.id)}))};
  const e={...engineering,ownerId:owner,objective:w.objective,criteria:w.criteria,profile,approvedBase:manifestForSnapshot(base)};
  const commands=['node --check one.mjs && node --check two.mjs'];
  const cfg={...configuration,commands,allowedPaths},configurationDigest=digest(cfg),factoryVersion=digest({sourceDigest:connection.sourceDigest,configurationDigest});
  const c={...connection,configurationDigest,factoryVersion,qualification:{...connection.qualification,profileHash:digest(profile),spendReview:{...connection.qualification.spendReview,factoryVersion}}};
  catalog.profiles.push({workId:w.id,allocationMicrousd:1_300_000,engineering:e,factory:{connection:c,commands,routing:{intent:'PRODUCE',boundedOperationQualified:false}}});
  assert(catalog.profiles.reduce((n,p)=>n+p.allocationMicrousd,0)<=catalog.ceilingMicrousd);
  await writeFile(catalogFile,JSON.stringify(catalog));
 };
 const sessions=new FactoryCodingSessionAdapter(store),calls=[],entered=new Map();let releaseTwo;const twoBarrier=new Promise(r=>releaseTwo=r);let integrationPatch;
 const wait=async predicate=>{for(let i=0;i<400;i++){const value=await predicate();if(value)return value;await new Promise(r=>setTimeout(r,25));}throw Error('Managed project state timeout');};
 const reconcile=async w=>wait(async()=>{const current=await store.get(w.id);const result=await sessions.reconcile(w.id,{expectedWorkVersion:current.version,expectedWorkGeneration:current.generation});return ['PARTIAL','FAILED','TERMINAL'].includes(result.state)?result:null;});
 try{
  await register(a,original,'one');await register(b,original,'two');
  setExecutor(async input=>{
   const completion=input.sandbox==='read-only';calls.push({workspace:input.workspacePath,completion,at:Date.now()});
   assert(input.gateway);const response=await fetch(input.gateway.baseUrl+'/responses',{method:'POST',headers:{authorization:'Bearer '+input.gateway.childToken,'content-type':'application/json'},body:JSON.stringify({model:input.model,input:'Synthetic project coding response'})});assert.equal(response.status,200);await response.text();
   if(completion)return {success:true,status:'completed',threadId:'synthetic-completion-'+calls.length,usage:null,eventsPath:'synthetic-project'};
   const integration=input.prompt.includes('Integrate the managed project'),one=input.prompt.includes('Project role one'),resumed=input.prompt.includes('Retained continuation context');
   if(integration){assert(integrationPatch);execFileSync('git',['-C',input.workspacePath,'apply','--whitespace=nowarn','-'],{input:integrationPatch});}
   else if(one)await writeFile(join(input.workspacePath,'one.mjs'),`export const one = ${resumed?2:1};\n`);
   else await writeFile(join(input.workspacePath,'two.mjs'),'export const two = 3;\n');
   entered.set(one?'one':integration?'integration':'two',{workspace:input.workspacePath,at:Date.now()});
   if(one&&!resumed){await new Promise(r=>{if(input.signal.aborted)r();else input.signal.addEventListener('abort',r,{once:true});});return {success:false,status:'cancelled',threadId:'synthetic-one-interrupted',usage:null,eventsPath:'synthetic-project'};}
   if(!one&&!integration)await twoBarrier;
   return {success:true,status:'completed',threadId:'synthetic-project-'+calls.length,usage:null,eventsPath:'synthetic-project'};
  });
  await sessions.start(a.id,{expectedWorkVersion:a.version,expectedWorkGeneration:a.generation});
  await sessions.start(b.id,{expectedWorkVersion:b.version,expectedWorkGeneration:b.generation});
  await wait(()=>entered.has('one')&&entered.has('two'));
  const beforeOne=await sessions.observe(a.id),beforeTwo=await sessions.observe(b.id);
  assert.notEqual(beforeOne.sessions[0].attemptId,beforeTwo.sessions[0].attemptId);assert.notEqual(beforeOne.sessions[0].worktree,beforeTwo.sessions[0].worktree);
  await sessions.interrupt(a.id,{expectedWorkVersion:a.version,expectedWorkGeneration:a.generation});
  await reconcile(a);releaseTwo();await reconcile(b);
  const stopped=await sessions.observe(a.id),second=await sessions.observe(b.id);
  assert(stopped.historicalCheckpoint);assert.equal(stopped.historicalCheckpoint.independentlyVerified,false);assert.equal(second.sessions[0].independentlyVerified,true);
  const checkpoint=stopped.historicalCheckpoint,oldAccounting=stopped.accounting;
  assert.equal(oldAccounting.unknownMicrousd,0);assert.equal(oldAccounting.reservedMicrousd,0);assert.equal(oldAccounting.safeAllowanceMicrousd,0);
  // Existing owner cancellation makes old Work terminal; neither budget nor
  // receipt is reopened. The Goal stores only advisory checkpoint context.
  await store.change(a.id,{operation:'cancel',expectedVersion:(await store.get(a.id)).version});
  const goal=await beta.queries(owner).goal(goalId),context=await goals.context(goalId,oneTask);
  const handoff={commandId:randomUUID(),expectedRevision:goal.revision,expectedTaskGeneration:context.taskGeneration,assignedTo:'coder-two',reason:'Resume the exact unverified checkpoint under fresh Work admission'};
  await goals.handoffTask(goalId,oneTask,handoff);await goals.handoffTask(goalId,oneTask,handoff);
  // Reconstruct coordinator after the handoff commits.
  const recovered=new BetaIntegration(pool,beta.policy).service(owner,'owner');
  const linked=await recovered.continue(await recovered.context(goalId,oneTask));
  const replay=await recovered.continue(await recovered.context(goalId,oneTask));assert.equal(linked.workId,replay.workId);
  let successor=await store.get(linked.workId);successor=await store.change(successor.id,{operation:'resume',expectedVersion:successor.version});
  assert(successor.objective.includes(checkpoint.candidate));assert.notEqual(successor.id,a.id);
  await register(successor,await source(checkpoint.candidate),'one');
  await sessions.start(successor.id,{expectedWorkVersion:successor.version,expectedWorkGeneration:successor.generation});await reconcile(successor);
  const resumed=await sessions.observe(successor.id);assert.equal(resumed.sessions[0].independentlyVerified,true);assert.equal(resumed.sessions[0].baseSha,checkpoint.candidate);
  assert.notEqual(resumed.sessions[0].attemptId,beforeOne.sessions[0].attemptId);
  // Integration source is the independently checked resumed role; apply the
  // second role's exact signed patch and verify ALL combined requirements.
  const receiptStore=new FactoryReceiptStore(store.principal,store.database),br=second.sessions[0];
  const [row]=await store.database.query('SELECT r.id,r.request_id FROM engineering_factory_receipts r JOIN engineering_factory_requests q ON q.id=r.request_id WHERE q.work_id=$1 AND q.scope_id=$2 AND r.state=\'ADMITTED\' ORDER BY r.received_at DESC LIMIT 1',[b.id,owner]);
  const request=await receiptStore.request(row.request_id),receipt=await receiptStore.get(row.request_id,row.id),envelope=JSON.parse(receipt.envelope),verified=verifyResult(envelope,{...request.binding,keys:[receipt.provenance.key],historical:true});
  integrationPatch=Buffer.from(envelope.artifacts.find(x=>x.id===verified.manifest.candidate.patchArtifactId).base64,'base64');
  const combinedTask=randomUUID();await goals.addTask(goalId,{id:combinedTask,objective:'Integrate the managed project from the two exact retained role candidates',criteria:['One plus two equals five under independent combined-tree checks'],assignedTo:'coder-two',provenance:{kind:'owner',reference:'Current protected role Results '+resumed.result.id+' '+second.result.id}});
  const combined=await materialize(combinedTask);await register(combined,await source(resumed.result.candidate),'integration');
  await sessions.start(combined.id,{expectedWorkVersion:combined.version,expectedWorkGeneration:combined.generation});await reconcile(combined);
  const consolidated=await sessions.observe(combined.id);assert.equal(consolidated.sessions[0].independentlyVerified,true);assert.equal(consolidated.readiness.ready,false);
  const priorCalls=calls.length;await sessions.reconcile(combined.id,{expectedWorkVersion:combined.version,expectedWorkGeneration:combined.generation});assert.equal(calls.length,priorCalls);
  const old=await sessions.observe(a.id);assert.equal(old.accountingHistory[0].cancelled,true);assert.equal(old.accountingHistory[0].settledMicrousd,oldAccounting.settledMicrousd);assert.equal(old.accountingHistory[0].ceilingMicrousd,oldAccounting.ceilingMicrousd);
  const result={mode:'SYNTHETIC_CODING_REAL_MANAGED_PATH',goalId,workIds:[a.id,b.id,successor.id,combined.id],checkpoint,
   twoInitialSessionsOverlap:true,separateWorktrees:true,reconstructedCoordinator:true,checkpointBasePreserved:true,
   duplicateConsequentialEffects:0,fixedEnvelopeMicrousd:catalog.ceilingMicrousd,allocations:catalog.profiles.map(p=>({workId:p.workId,ceilingMicrousd:p.allocationMicrousd})),
   originalLedgerRetained:true,consolidated:{resultId:consolidated.result.id,candidate:consolidated.result.candidate,independentVerification:consolidated.verification.status,artifacts:consolidated.artifacts,readiness:consolidated.readiness},codingCalls:calls.filter(c=>!c.completion).length,liveProviderCalls:0};
  return result;
 }finally{releaseTwo?.();setExecutor(null);for(const[k,v]of Object.entries(oldEnv)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
}
