import {QualificationGate} from '../lib/qualification/gate.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {QualificationAccounting,qualificationBinding,QDEV_BASELINE} from '../lib/external-alpha/qualification-accounting.ts';
import {digest} from '../lib/engineering/contract.ts';
const {Client}=createRequire(new URL('../package.json',import.meta.url))('pg');
const root=process.env.MYEVE_ISOLATED_COHORT_TEST_DATABASE;
assert(root&&['localhost','127.0.0.1'].includes(new URL(root).hostname),'Dedicated localhost PostgreSQL fixture required');
const admin=new Client({connectionString:root});await admin.connect();
const schema=await readFile(new URL('../lib/external-alpha/qualification-accounting.sql',import.meta.url),'utf8');
const prefix='review_'+randomBytes(4).toString('hex');
const databases=[],roles=[],clients=[];
/** Generated per run; test-only; used for every disposable role so hosted PostgreSQL password auth is preserved. */
const rolePassword=randomBytes(24).toString('hex');
const hash=s=>createHash('sha256').update(s).digest('hex');
const h=c=>c.repeat(64);
const binding=qualificationBinding({...QDEV_BASELINE,operatingProfileSha256:h('1'),factoryVersionSha256:h('2'),protectedSpecificationSha256:h('3'),sources:{myeve:'a'.repeat(40),factory:'b'.repeat(40),relay:'c'.repeat(40),missioncontrol:'d'.repeat(40)}});
async function client(url){const c=new Client({connectionString:url});await c.connect();clients.push(c);return c;}
async function fixture(label,{history=false}={}){
 const name='myeve_qdev_'+prefix+'_'+label,role=prefix+'_'+label;
 databases.push(name);roles.push(role);
 await admin.query("CREATE ROLE "+role+" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '"+rolePassword+"'");
 await admin.query('CREATE DATABASE '+name);await admin.query('REVOKE CONNECT ON DATABASE '+name+' FROM PUBLIC');
 await admin.query('GRANT CONNECT ON DATABASE '+name+' TO '+role);
 const dbUrl=new URL(root);dbUrl.pathname='/'+name;const db=await client(dbUrl.href);if(history)for(const file of ['shared-accounting.sql','shared-accounting-recovery.sql','shared-accounting-zero-gap.sql','shared-accounting-chat-only.sql'])await db.query(await readFile(new URL('../lib/external-alpha/'+file,import.meta.url),'utf8'));await db.query(schema);
 await db.query('GRANT EXECUTE ON FUNCTION qdev_cohort_call(jsonb) TO '+role);
 const policy={cohortId:randomUUID(),ownerId:randomUUID(),slot:'Q1'},token=randomBytes(32).toString('hex');
 await db.query(`INSERT INTO qdev_charter(id,proposal_id,charter_sha256,funding_sha256,hold_disposition_sha256,price_revision_sha256,journey_ceiling_microusd,max_works,per_work_ceiling_microusd,concurrency,valid_until)
 VALUES($1,'qdev-20261029-01',$2,$2,$2,$2,5200000,4,1300000,1,clock_timestamp()+interval '1 hour')`,[policy.cohortId,h('4')]);
 await db.query(`INSERT INTO qdev_member(cohort_id,slot,owner_id,policy_sha256,credential_sha256,paid_works) VALUES($1,'Q1',$2,$3,$4,4)`,[policy.cohortId,policy.ownerId,digest(policy),hash(token)]);
 await db.query('INSERT INTO qdev_project(id,cohort_id,owner_id,project_sha256,source_sha256) VALUES($1,$2,$3,$4,$5)',[randomUUID(),policy.cohortId,policy.ownerId,binding.projectSha256,binding.sourceSha256]);
 await db.query('UPDATE qdev_charter SET activated_at=clock_timestamp()');
 const url=new URL(root);url.pathname='/'+name;url.username=role;url.password=rolePassword;
 const rt=await client(url.href);
 const adapter={query:async(q,p)=>(await rt.query(q,p)).rows};
 const accounting=new QualificationAccounting(adapter,token,policy,binding);
 return {db,rt,adapter,accounting,policy,token,url};
}
async function work(x,label){const admission=await x.accounting.reserveWork({bindingId:label,requestSha256:h('8'),ceilingMicrousd:1300000});const allowance=randomUUID();return {admission:await x.accounting.bind(admission,allowance),allowance};}
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};


import {LiveFactoryPort} from '../lib/qualification/factory-live-port.ts';
import {prepareAuthenticatedLocalFactoryInputV4} from '../lib/engineering/factory-authenticated-result.ts';
import {syntheticFactory} from './qualification-synthetic.mjs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
try {
 await test('F2: a Factory dispatch acknowledgment cannot release cohort concurrency before terminal quiescence and spend proof',async()=>{
  const x=await fixture('live_ack'),one=await work(x,'first'),fx=syntheticFactory(),e=fx.stage(1,fx.baseline).manifest.execution;
  const raw={workId:randomUUID(),workVersion:1,workGeneration:1,criteriaVersion:1,agentId:'synthetic-agent',factoryId:fx.factoryId,factoryVersion:fx.factoryVersion,
   requestId:e.requestId,requestDigest:e.requestDigest,sourceDigest:fx.sourceDigest,configurationDigest:fx.configurationDigest,workOrderId:e.workOrderId,runId:e.runId,attemptNumber:1,
   inputCommit:e.inputCommit,inputTree:e.inputTree,localSnapshotVersion:4,configuration:fx.configuration};
  const request={requestId:e.requestId,workId:raw.workId,workGeneration:1,repository:'synthetic/repo',deadline:'2099-01-01T00:00:00.000Z',maxSpendUsd:1,input:{baseRef:e.inputCommit,allowedPaths:fx.configuration.allowedPaths}};
  const identity={workId:raw.workId,workGeneration:1,factoryId:fx.factoryId,factoryVersion:fx.factoryVersion,requestId:e.requestId,workOrderId:e.workOrderId,remoteRunId:e.runId,repository:request.repository,baseSha:e.inputCommit,allowedPaths:request.input.allowedPaths,deadline:request.deadline};
  let remoteActive=0,terminalNow=false;
  const rb=over=>({requestId:e.requestId,workOrderId:e.workOrderId,runId:e.runId,state:'RUNNING',quiescent:false,evidenceRef:null,accounting:{activeMicrousd:1300000,unknownMicrousd:0,settledMicrousd:0},...over});
  const port=new LiveFactoryPort({enabled:true,retained:()=>({binding:raw,request,identity}),pollMs:20,settleTimeoutMs:20000,
   live:{prepared:async()=>({requestId:e.requestId,workOrderId:e.workOrderId,runId:e.runId,state:'PREPARED',snapshot:e}),dispatch:async()=>{remoteActive++;},
    read:async()=>terminalNow?rb({state:'COMPLETED',quiescent:true,evidenceRef:'evidence-1',accounting:{activeMicrousd:0,unknownMicrousd:0,settledMicrousd:1300000}}):rb(),
    result:async()=>({state:'RUNNING',result:null})}});
  await port.ready(1);
  const gate=new QualificationGate(x.accounting);
  const first=gate.run({admission:one.admission,allowanceId:one.allowance,operationKey:'factory-ack',purpose:'FACTORY',reserveMicrousd:1300000,send:()=>port.dispatch(prepareAuthenticatedLocalFactoryInputV4(port.admit(1,fx.baseline)))});
  await sleep(300);
  const stateWhileRunning=(await x.db.query("SELECT state FROM qdev_dispatch WHERE purpose='FACTORY'")).rows[0].state;
  let successor;
  try{const two=await work(x,'second');const g2=new QualificationGate(x.accounting);await g2.run({admission:two.admission,allowanceId:two.allowance,operationKey:'next',purpose:'CODING',reserveMicrousd:1300000,send:async()=>{remoteActive++;return {known:true,value:null}}});successor='SENT';}catch(error){successor=error.message;}
  assert.notEqual(stateWhileRunning,'SETTLED','the op stays active while the Factory is still RUNNING');
  assert.notEqual(successor,'SENT','no successor may be sent while the Factory is still RUNNING');
  assert.equal(remoteActive,1,'exactly one remote Factory execution is active');
  terminalNow=true;
  await first;
  assert.equal((await x.db.query("SELECT state FROM qdev_dispatch WHERE purpose='FACTORY'")).rows[0].state,'SETTLED');
 });
 await test('F2: an ambiguous Factory outcome (timeout) fences the cohort and never resends',async()=>{
  const x=await fixture('live_unknown'),one=await work(x,'first'),fx=syntheticFactory(),e=fx.stage(1,fx.baseline).manifest.execution;
  const raw={workId:randomUUID(),workVersion:1,workGeneration:1,criteriaVersion:1,agentId:'synthetic-agent',factoryId:fx.factoryId,factoryVersion:fx.factoryVersion,
   requestId:e.requestId,requestDigest:e.requestDigest,sourceDigest:fx.sourceDigest,configurationDigest:fx.configurationDigest,workOrderId:e.workOrderId,runId:e.runId,attemptNumber:1,
   inputCommit:e.inputCommit,inputTree:e.inputTree,localSnapshotVersion:4,configuration:fx.configuration};
  const request={requestId:e.requestId,workId:raw.workId,workGeneration:1,repository:'synthetic/repo',deadline:'2099-01-01T00:00:00.000Z',maxSpendUsd:1,input:{baseRef:e.inputCommit,allowedPaths:fx.configuration.allowedPaths}};
  const identity={workId:raw.workId,workGeneration:1,factoryId:fx.factoryId,factoryVersion:fx.factoryVersion,requestId:e.requestId,workOrderId:e.workOrderId,remoteRunId:e.runId,repository:request.repository,baseSha:e.inputCommit,allowedPaths:request.input.allowedPaths,deadline:request.deadline};
  let dispatches=0,t=0;
  const port=new LiveFactoryPort({enabled:true,retained:()=>({binding:raw,request,identity}),pollMs:10,settleTimeoutMs:50,now:()=>t,sleep:async ms=>{t+=ms;},
   live:{prepared:async()=>({requestId:e.requestId,workOrderId:e.workOrderId,runId:e.runId,state:'PREPARED',snapshot:e}),dispatch:async()=>{dispatches++;},
    read:async()=>({requestId:e.requestId,workOrderId:e.workOrderId,runId:e.runId,state:'RUNNING',quiescent:false,evidenceRef:null,accounting:{activeMicrousd:1,unknownMicrousd:0,settledMicrousd:0}}),result:async()=>({state:'RUNNING',result:null})}});
  await port.ready(1);
  const gate=new QualificationGate(x.accounting);
  await assert.rejects(gate.run({admission:one.admission,allowanceId:one.allowance,operationKey:'factory-timeout',purpose:'FACTORY',reserveMicrousd:1300000,send:()=>port.dispatch(prepareAuthenticatedLocalFactoryInputV4(port.admit(1,fx.baseline)))}),e2=>/QDEV_EXPOSURE_UNKNOWN/.test(e2.message));
  assert.equal(dispatches,1);
  await assert.rejects(gate.run({admission:one.admission,allowanceId:one.allowance,operationKey:'factory-timeout',purpose:'FACTORY',reserveMicrousd:1300000,send:()=>port.dispatch(prepareAuthenticatedLocalFactoryInputV4(port.admit(1,fx.baseline)))}));
  assert.equal(dispatches,1,'a second claim never reaches the Factory');
 });
} finally {
 await Promise.all(clients.map(c=>c.end()));
 for(const name of databases)await admin.query('DROP DATABASE IF EXISTS '+name+' WITH (FORCE)');
 for(const role of roles)await admin.query('DROP ROLE IF EXISTS '+role);
 await admin.end();
}
