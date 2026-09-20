import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { Authority, ddl, boundedHttp, boundedModel, emergencyStop } from './postgres.mjs';
const require = createRequire(process.env.FQ_PG_PACKAGE || '/Users/jaywest/relay/package.json');
const { Pool } = require('pg');
const url = process.env.FQ_TEST_DATABASE_URL;
if (!url || !['127.0.0.1','localhost'].includes(new URL(url).hostname)) throw Error('EXPLICIT_LOCAL_TEST_DATABASE_REQUIRED');
const database = `fq_controls_${randomUUID().replaceAll('-','')}`;
const admin = new Pool({ connectionString: url });
let pool, other;
before(async () => {
  await admin.query(`CREATE DATABASE "${database}"`);
  const target = new URL(url); target.pathname = database;
  pool = new Pool({ connectionString: target.href, max: 10 });
  other = new Pool({ connectionString: target.href, max: 10 });
  await pool.query(ddl);
});
after(async () => { await pool?.end(); await other?.end(); await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`); await admin.end(); });
async function fresh() { const a = new Authority(pool,randomUUID()); await a.create('local_test_authorization'); return a; }
async function alter(a, update) { await a.transaction(s => { update(s); }); }

test('two independent pools cannot exceed global HTTP concurrency', async () => {
  const a = await fresh(), b = new Authority(other,a.id);
  const results = await Promise.allSettled(Array.from({length:10},(_,i)=>(i%2?a:b).http(`request_${i}`)));
  assert.equal(results.filter(x=>x.status==='fulfilled').length,2); assert.equal((await a.status()).http,2);
});
test('only one concurrent model is admitted across hosts', async () => {
  const a=await fresh(),b=new Authority(other,a.id);
  const results=await Promise.allSettled([a.model('model_one','myeve',250000,'verified_bound'),b.model('model_two','peer',250000,'verified_bound')]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal((await b.status()).charged,250000);
});
test('restart retains charged budget and fences interrupted model slot', async () => {
  const a=await fresh();await a.model('model_one','myeve',250000,'verified_bound');
  const b=new Authority(other,a.id);assert.equal((await b.status()).charged,250000);
  await assert.rejects(b.model('model_two','peer',250000,'verified_bound'),/MODEL_CONCURRENCY/);
});
test('completed or interrupted operation IDs cannot execute again', async()=>{
  const a=await fresh();await a.model('model_one','myeve',250000,'verified_bound');await a.complete('model_one',1);
  await assert.rejects(new Authority(other,a.id).model('model_one','myeve',250000,'verified_bound'),/OPERATION_ALREADY/);
  assert.equal((await a.status()).charged,250000);
});
test('conservative reservations stop new work at $4 with no refund',async()=>{
  const a=await fresh();
  for(let i=0;i<16;i++){await a.model(`model_id_${i}`,i<8?'myeve':'peer',250000,'verified_bound');await a.complete(`model_id_${i}`,0);}
  await assert.rejects(a.model('model_final','peer',250000,'verified_bound'),/MODEL_SPEND/);
  assert.equal((await a.status()).charged,4000000);
});
test('remaining budget cannot cover next liability',async()=>{
  const a=await fresh();await alter(a,s=>{s.charged=4999999;s.components={myeve:2000000,peer:2999999};});
  await assert.rejects(a.model('model_one','peer',250000,'verified_bound'),/MODEL_SPEND/);
});
test('unknown cost commits stop and retains reservation',async()=>{
  const a=await fresh();await a.model('model_one','myeve',250000,'verified_bound');assert.equal(await a.complete('model_one'),false);
  const s=await new Authority(other,a.id).status();assert.equal(s.stopped,true);assert.equal(s.charged,250000);assert.ok(s.active.model_one);
});
test('over-reservation provider receipt stops session',async()=>{
  const a=await fresh();await a.model('model_one','myeve',250000,'verified_bound');assert.equal(await a.complete('model_one',250001),false);
});
test('HTTP limit, submissions limit, and retry accounting are durable',async()=>{
  const a=await fresh();await alter(a,s=>{s.http=1999;});await a.http('last_http');await a.complete('last_http');await assert.rejects(a.http('next_http'),/REQUEST_LIMIT/);
  const b=await fresh();await alter(b,s=>{s.submissions=119;s.http=119;});await b.http('last_submit',{submission:true});await b.complete('last_submit');await assert.rejects(b.http('next_submit',{submission:true}),/REQUEST_LIMIT/);
});
test('60 minute hard deadline and 45 minute admission cutoff',async()=>{
  const a=await fresh();await alter(a,s=>{s.start-=2701;});await assert.rejects(a.http('normal_req'),/SESSION_CLOSED/);await a.http('cleanup_req',{cleanup:true});await a.complete('cleanup_req');await alter(a,s=>{s.start-=900;});await assert.rejects(a.http('cleanup_end',{cleanup:true}),/SESSION_CLOSED/);
});
test('actual artifact bytes bounded before exposure and aggregated',async()=>{
  const a=await fresh();await assert.rejects(a.artifact('artifact_big',[Buffer.alloc(65536),Buffer.alloc(1)]),/ARTIFACT_SIZE/);
  assert.equal((await a.status()).artifacts,0);
  for(let i=0;i<8;i++)assert.equal((await a.artifact(`artifact_${i}`,[Buffer.alloc(65536)])).length,65536);
  await assert.rejects(a.artifact('artifact_last',[Buffer.alloc(1)]),/ARTIFACT_TOTAL/);assert.equal((await a.status()).artifactBytes,524288);
});
test('HTTP adapter owns slot until asynchronous body work completes',async()=>{
  const a=await fresh();let release;const blocked=new Promise(r=>{release=r;});
  const call=boundedHttp(a,'request_one',{},async()=>{await blocked;return 'body';});
  await new Promise(r=>setTimeout(r,30));assert.ok((await a.status()).active.request_one);release();assert.equal(await call,'body');assert.equal((await a.status()).active.request_one,undefined);
});
test('bounded model invokes once and permanently charges maximum',async()=>{
  const a=await fresh();let calls=0;
  const bound={component:'peer',maximumMicrousd:250000,reference:'verified_bound'};
  await boundedModel(a,'model_one',bound,async signal=>{calls++;assert.equal(signal.aborted,false);return {actualMicrousd:10};});
  await assert.rejects(boundedModel(a,'model_one',bound,async()=>{calls++;}),/ALREADY_RESERVED/);
  assert.equal(calls,1);assert.equal((await a.status()).charged,250000);
});
test('cross-host stop aborts active model and prevents subsequent work',async()=>{
  const a=await fresh(),b=new Authority(other,a.id);let started;
  const ready=new Promise(r=>{started=r;});
  const work=boundedModel(a,'model_one',{component:'peer',maximumMicrousd:250000,reference:'verified_bound'},async signal=>{
    started();await new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true});});
  });
  const rejection=assert.rejects(work,/UNCONFIRMED/);await ready;await b.stop();await rejection;await assert.rejects(a.http('after_stop'),/SESSION_CLOSED/);assert.equal((await a.status()).charged,250000);
});
test('all stop adapters attempted after failed revocation; no false complete',async()=>{
  const a=await fresh(),names=['revokeCredentials','revokeGrants','denyQueuedWork','stopWorkers','disableModelCredentials','preserveEvidence','freezeDatabaseLogins'],seen=[];
  const result=await emergencyStop(a,Object.fromEntries(names.map(name=>[name,async()=>{seen.push(name);if(name==='revokeCredentials')throw Error('do not expose');return true;}])));
  assert.deepEqual(seen,names);assert.equal(result.complete,false);assert.equal((await a.status()).stopped,true);assert.equal(JSON.stringify(result).includes('do not expose'),false);
});
test('missing state never creates a fresh allowance',async()=>{
  const a=new Authority(pool,'missing_session');await assert.rejects(a.http('request_one'),/SESSION_UNAVAILABLE/);
});
test('invalid liability and classifications rejected',async()=>{
  const a=await fresh();await assert.rejects(a.model('model_one','peer',NaN,'verified_bound'),/LIABILITY/);await assert.rejects(a.http('request_one',{submission:true,cleanup:true}),/CLASSIFICATION/);
});
test('clock rollback and corrupt state deny admission',async()=>{
  const a=await fresh();await alter(a,s=>{s.lastClock+=1000;});await assert.rejects(a.http('request_one'),/CLOCK_ROLLBACK/);
  const b=await fresh();await alter(b,s=>{s.version=2;});await assert.rejects(b.http('request_one'),/SESSION_UNAVAILABLE/);
});
test('hung stop adapter cannot prevent other emergency brakes',async()=>{
 const a=await fresh(),seen=[];
 const names=['revokeCredentials','revokeGrants','denyQueuedWork','stopWorkers','disableModelCredentials','preserveEvidence','freezeDatabaseLogins'];
 const adapters=Object.fromEntries(names.map(name=>[name,async()=>{seen.push(name);if(name==='revokeGrants')return new Promise(()=>{});return true;} ]));
 const result=await emergencyStop(a,adapters,20);assert.equal(result.complete,false);assert.equal(result.revokeGrants,'UNCONFIRMED');assert.deepEqual(seen,names);
});
test('uncertain upstream completion retains HTTP slot',async()=>{
 const a=await fresh();await assert.rejects(boundedHttp(a,'request_one',{},async()=>{throw Error('upstream timeout');}),/timeout/);
 assert.ok((await a.status()).active.request_one);
});
test('invalid persisted counters cannot replenish allowance',async()=>{
 const a=await fresh();await alter(a,s=>{s.charged=-1;});await assert.rejects(a.http('request_one'),/CORRUPT_STATE/);
});
