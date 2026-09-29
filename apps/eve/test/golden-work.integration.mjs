import assert from 'node:assert/strict';
import { randomUUID,randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { Pool,Client } from 'pg';
import { loadMigrations,runMigrations } from '../scripts/migration-runner.ts';
import { WorkStore } from '../lib/engineering/store.ts';
import { ExecutionStore } from '../lib/engineering/execution-store.ts';
import { EngineeringWorker } from '../lib/engineering/worker.ts';
import { DockerProtectedVerifier } from '../lib/engineering/docker-executor.ts';
import { makeContract,digest } from '../lib/engineering/contract.ts';
import { readiness,manifest,nowIso } from '../lib/engineering/execution.ts';
import { createCandidate } from '../lib/engineering/github.ts';
import { brokerMessage,attemptToken } from '../lib/engineering/model-broker.ts';
import { fixture } from './engineering-fixtures.ts';

const adminUrl='postgresql://postgres@127.0.0.1:55468/postgres';
const admin=new Client({connectionString:adminUrl});await admin.connect();
const name=`golden_test_${randomBytes(8).toString('hex')}`;
let pool;const report={classification:'SIMULATED GitHub and executor; REAL PostgreSQL and protected Docker verifier',cases:[],trace:null};
try {
  await admin.query(`CREATE DATABASE ${name}`);const url=new URL(adminUrl);url.pathname='/'+name;pool=new Pool({connectionString:url.href,max:8});
  const migration=await pool.connect();
  await runMigrations({query:async(q,p)=>(await migration.query(q,p)).rows,transaction:async statements=>{await migration.query('BEGIN');try{for(const s of statements)await migration.query(s.sql,s.params);await migration.query('COMMIT');}catch(e){await migration.query('ROLLBACK');throw e;}}},await loadMigrations());migration.release();
  const db={query:async(q,p)=>(await pool.query(q,p)).rows};
  const template=fixture(),principal={scopeId:template.work.scopeId,scopeKind:'personal',actorId:template.work.scopeId};
  const store=new WorkStore(principal,db),execution=new ExecutionStore(store);
  const {work:prepared}=await store.create({title:template.work.title,objective:template.work.objective,repository:template.work.repository,criteria:template.work.criteria,maxCostUsd:5,maxDurationSeconds:1800,idempotencyKey:randomUUID()});
  const contract=makeContract(prepared,principal,template.profile,{number:1,url:'https://github.com/fixture/golden/issues/1',body:template.work.objective},'a'.repeat(40),'sofie');
  const admission=await Promise.allSettled([execution.admit(prepared,contract),execution.admit(prepared,contract)]);
  assert.equal(admission.filter(r=>r.status==='fulfilled').length,1);report.cases.push('Concurrent admission: exactly one contract');
  const workId=prepared.id;
  const admitted=await execution.get(workId);admitted.qualificationMode='simulation';await execution.save(await store.get(workId),admitted,'simulation_label');
  assert.equal(digest(admitted.contract.profile),admitted.contract.profileHash,'Profile hash must survive PostgreSQL jsonb');
  const foreign=new ExecutionStore(new WorkStore({...principal,scopeId:'foreign'},db));await assert.rejects(foreign.get(workId),/not found/);
  const claims=await Promise.all([execution.claim(workId),execution.claim(workId)]);assert.equal(claims.filter(Boolean).length,1);await execution.release(workId,claims.find(Boolean).token);
  report.cases.push('Cross-scope denial and exclusive PostgreSQL worker lease');
  const versions={};let publications=0,reviewIntroduced=false,forceAuthLoss=false,uncertainWrite=false;
  let head=null,pr=null;
  const original={sha:contract.baseSha,files:{'quantity.mjs':'console.log(0);'}};
  const provider={
    async issue(){return {number:1,url:contract.issueUrl,body:contract.issueBody};},
    async snapshot(sha){return sha===contract.baseSha?original:versions[sha];},
    async observe(){if(forceAuthLoss)throw Error('Controlled GitHub credential loss');return {observedAt:nowIso(),authority:true,repository:contract.repository,baseSha:contract.baseSha,head,pr,
      checks:head?[{id:String(publications),name:'quantity-ci',sha:head,attempt:publications,result:publications===1?'FAIL':'PASS',details:'Reject zero input with {"error":"invalid_quantity"}, newline, exit code 0.'}]:[],
      reviews:reviewIntroduced?[{id:'review-1',author:'human-reviewer',sha:Object.keys(versions)[1],state:'CHANGES_REQUESTED',submittedAt:nowIso(),body:JSON.stringify({scope:'within-existing-criteria',criterionId:contract.criteria[0].id,instruction:'Reject fractional quantities.',check:{program:'quantity.mjs',input:'1.5',expectedOutput:'{"error":"invalid_quantity"}\n',expectedExitCode:0}})}]:[]};},
    async publish(c,candidate,_branch,expected){assert.equal(head,expected);assert.equal(candidate.parentSha,head??contract.baseSha);publications++;head=candidate.sha;versions[head]={sha:head,files:candidate.files};pr??={number:1,url:'https://github.com/fixture/golden/pull/1',draft:true,open:true};if(uncertainWrite)throw Error('SIMULATED lost write response');return pr;},
  };
  const jobs=new Map();let starts=0,loseExecutor=false;
  const executor={kind:'claude-code',capabilities:{resumeSession:false,automaticFailover:false},
    async start(c,run,snapshot){starts++;jobs.set(run.id,{snapshot,files:{...snapshot.files,'quantity.mjs':`// Simulated attempt ${starts}\nlet s='';for await(const chunk of process.stdin)s+=chunk;const n=Number(s);console.log(JSON.stringify(${starts===1?'n<0':starts===2?'n<=0':'!Number.isInteger(n)||n<=0'}?{error:'invalid_quantity'}:{quantity:n}));\n`}});},
    async followUp(...args){return this.start(...args);},async observe(){return loseExecutor?'lost':'completed';},async requestStop(){},
    async collectCandidate(c,run){const job=jobs.get(run.id);return createCandidate(c,run,job.snapshot,job.files);},async collectUsage(){return {coverage:'SIMULATED',providerCostUsd:null};},async cleanup(run){jobs.delete(run.id);},
  };
  let worker=new EngineeringWorker(execution,provider,executor,new DockerProtectedVerifier(),()=>digest(template.profile),async()=>true);
  async function tickUntil(predicate,limit=30){for(let i=0;i<limit;i++){await worker.tick(workId);const s=await execution.get(workId);if(predicate(s))return s;if(s.phase==='needs_you')throw Error(s.blockers.join('; '));}throw Error('No terminal state within bounded ticks');}
  let state=await tickUntil(s=>s.phase==='approval');assert.equal(state.candidates.length,1);assert.equal(jobs.size,0);
  await assert.rejects(execution.approve(workId,state.revision,'b'.repeat(40),true),/no longer matches/);
  await execution.approve(workId,state.revision,state.candidates.at(-1).sha,true);
  // UI is absent from all ticks. Reconstructing this worker drops all worker-local state.
  worker=new EngineeringWorker(new ExecutionStore(new WorkStore(principal,db)),provider,executor,new DockerProtectedVerifier(),()=>digest(template.profile),async()=>true);
  state=await tickUntil(s=>s.phase==='ready');assert.equal(state.runs.length,2);assert.equal(publications,2);
  const firstResult=JSON.stringify(state.results[0]);report.cases.push('Candidate custody survives executor cleanup and worker-object replacement');
  report.cases.push('CI failure observed automatically; fresh Run, evidence invalidation, same-PR update');
  reviewIntroduced=true;state=await tickUntil(s=>s.phase==='ready'&&s.runs.length===3);assert.equal(publications,3);assert.equal(state.results.length,2);assert.equal(JSON.stringify(state.results[0]),firstResult);
  for(let i=0;i<3;i++)await worker.tick(workId);assert.equal(publications,3);assert.equal(starts,3);
  report.cases.push('Review continuation and duplicate observation suppression; immutable Result versions');
  assert.equal(readiness(await store.get(workId),state).ready,true);
  report.trace={workId,contract:state.contract,runs:state.runs,candidates:state.candidates.map(({files,patch,...c})=>c),evidence:state.evidence,approvals:[state.approval],effects:state.effects,github:state.truth,results:state.results,manifest:manifest(await store.get(workId),state),publications,coordinationDebtEvents:0,note:'Controlled simulation; not a live GitHub or real no-babysitting qualification.'};
  forceAuthLoss=true;await worker.tick(workId);state=await execution.get(workId);assert.equal(state.phase,'needs_you');assert.equal(readiness(await store.get(workId),state).ready,false);forceAuthLoss=false;report.cases.push('Controlled auth loss blocks readiness');
  // Human takeover fences the old generation before any further model call.
  let work=await store.get(workId);await store.change(workId,{operation:'takeover',expectedVersion:work.version});await worker.tick(workId);state=await execution.get(workId);assert.equal(state.phase,'stopped');assert.ok(state.evidence.every(e=>e.result==='STALE'));
  head='b'.repeat(40);versions[head]={sha:head,files:{'quantity.mjs':`// Human change\n${Object.values(versions).at(-1).files['quantity.mjs']}`}};
  work=await store.get(workId);await store.change(workId,{operation:'resume',expectedVersion:work.version});await worker.tick(workId);state=await execution.get(workId);assert.equal(state.phase,'executing');
  assert.equal(state.runs.at(-1).parentSha,head);assert.equal(state.runs.at(-1).publicationParentSha,head);assert.equal(state.approval,null);
  report.cases.push('Human head modification / give-back reconciles head and fences prior approval');
  // Reserve concurrently through the actual broker guard. Only one call fits the remaining allowance.
  await worker.tick(workId);loseExecutor=true;await worker.tick(workId);state=await execution.get(workId);
  assert.equal(state.phase,'needs_you');assert.equal(state.candidates.length,4);assert.ok(state.runs.at(-1).resourceReleasedAt);loseExecutor=false;
  await worker.continue(workId,state.revision);await worker.tick(workId);state=await execution.get(workId);const attempt=state.runs.at(-1).attemptId;
  report.cases.push('Simulated executor process loss preserves candidate custody; explicit same-executor replacement');
  await pool.query('UPDATE engineering_execution SET reserved_usd=4.95 WHERE work_id=$1',[workId]);
  const brokerInput={store:execution,workId,attemptId:attempt,secret:'qualification-secret-'.repeat(3),model:'claude-sonnet-5',body:JSON.stringify({model:'claude-sonnet-5',max_tokens:100,messages:[{role:'user',content:'test'}]}),maxInputRate:0.000005,outputRate:0.00001,upstream:async()=>new Response('{}')};
  brokerInput.token=attemptToken(brokerInput.secret,workId,attempt);
  const debit=await Promise.allSettled([brokerMessage(brokerInput),brokerMessage(brokerInput)]);assert.equal(debit.filter(r=>r.status==='fulfilled').length,1);
  assert.ok(Number((await pool.query('SELECT reserved_usd FROM engineering_execution WHERE work_id=$1',[workId])).rows[0].reserved_usd)<=5);
  report.cases.push('Real PostgreSQL concurrent broker reservations cannot overspend');
  state=await tickUntil(s=>s.phase==='approval');await execution.approve(workId,state.revision,state.candidates.at(-1).sha,true);
  uncertainWrite=true;await worker.tick(workId);state=await execution.get(workId);assert.equal(state.effects.at(-1).status,'UNKNOWN');assert.equal(readiness(await store.get(workId),state).ready,false);
  const writes=publications;await worker.tick(workId);state=await execution.get(workId);assert.equal(state.effects.at(-1).status,'CONFIRMED');assert.equal(publications,writes);uncertainWrite=false;
  report.cases.push('Uncertain external write reconciles without a duplicate publication');
  state.contract.limits.maxRuns=state.runs.length;state.phase='needs_you';await execution.save(await store.get(workId),state,'test_iteration_boundary');
  await assert.rejects(worker.continue(workId,(await execution.get(workId)).revision),/boundary/);report.cases.push('Iteration limit blocks continuation without a fresh contract');
  report.status='PASS';console.log(JSON.stringify({status:report.status,cases:report.cases,workId,classification:report.classification},null,2));
} finally {
  await writeFile('/private/tmp/myeve-golden-simulation-report.json',JSON.stringify(report,null,2));
  if(pool)await pool.end();await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);await admin.end();
}
