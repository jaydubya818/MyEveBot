import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fork} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {Client} from 'pg';
import {loadMigrations,runMigrations} from '../scripts/migration-runner.ts';
import {admitFactoryResult,resumeFactoryResult} from '../lib/engineering/factory-result-consumer.ts';
import {digest,sha256,signResult} from '../lib/engineering/factory-producer-protocol.ts';
import {prepareAuthenticatedFactoryInput} from '../lib/engineering/factory-authenticated-result.ts';
import {golden,manifest,adminURL,poolFor,storeFor,fixture,resign} from './factory-receipt-fixture.mjs';
const admin=new Client({connectionString:adminURL});await admin.connect();
const name='q37_gatec_'+randomBytes(8).toString('hex'),url=adminURL.replace('/postgres','/'+name);
await admin.query('CREATE DATABASE '+name);
const pool=poolFor(url);
const db={query:async(s,p)=>(await pool.query(s,p)).rows,transaction:async ss=>{const c=await pool.connect();try{await c.query('BEGIN');for(const s of ss)await c.query(s.sql,s.params);await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}};
const options={keys:async()=>golden.expected.keys};let count=0;
const pass=name=>{count++;console.log('PASS '+name);};
async function snapshot() {
 const tables=(await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT LIKE 'engineering_factory_%' ORDER BY tablename")).rows;
 const data={};for(const {tablename:t} of tables)data[t]=(await pool.query('SELECT to_jsonb(t) row FROM "'+t+'" t ORDER BY to_jsonb(t)::text')).rows;
 return data;
}
try {
 const allMigrations=await loadMigrations();assert.equal(allMigrations.at(-1).name,'0055_engineering_factory_results.sql');
 const migrations=allMigrations.slice(0,54);assert.equal(migrations.at(-1).name,'0054_factory_result_receipts.sql');
 const freshName='q37_gatec_'+randomBytes(8).toString('hex');await admin.query('CREATE DATABASE '+freshName);
 const fresh=new Client({connectionString:adminURL.replace('/postgres','/'+freshName)});await fresh.connect();
 try {await runMigrations({query:async(s,p)=>(await fresh.query(s,p)).rows,transaction:async ss=>{await fresh.query('BEGIN');try{for(const s of ss)await fresh.query(s.sql,s.params);await fresh.query('COMMIT');}catch(e){await fresh.query('ROLLBACK');throw e;}}},allMigrations,()=>{});
  assert.equal((await fresh.query('SELECT count(*)::int n FROM sofie_schema_migrations')).rows[0].n,55);pass('fresh complete 55 migration chain');
 } finally {await fresh.end();await dropQuiescentDatabase(freshName);}
 await runMigrations(db,migrations.slice(0,-1),()=>{});
 await fixtureSeedOnly();
 const before=await snapshot();
 await assert.rejects(runMigrations(db,[...migrations.slice(0,-1),{...migrations.at(-1),statements:[...migrations.at(-1).statements,'SELECT q37_injected_failure()']}],()=>{}),/q37_injected_failure/);
 assert.deepEqual(await snapshot(),before);
 assert.equal((await pool.query("SELECT to_regclass('engineering_factory_requests') value")).rows[0].value,null);
 pass('migration injected failure rolls back DDL and ledger');
 await runMigrations(db,migrations,()=>{});
 const after=await snapshot();delete before.sofie_schema_migrations;delete after.sofie_schema_migrations;assert.deepEqual(after,before);
 pass('populated supported 0053 to 0054 preserves all historical tables/data');
 const stable=await snapshot();await runMigrations(db,migrations,()=>{});assert.deepEqual(await snapshot(),stable);pass('migration rerun is no-op');
 await runMigrations(db,allMigrations,()=>{}); // Qualify every receipt/restart case with both migrations installed.
 const f=await fixture(pool);
 const outputs=await Promise.all(Array.from({length:12},()=>admitFactoryResult(f.store,f.request.id,golden.result,options)));
 assert(outputs.every(r=>r.status==='ADMITTED'&&r.receiptId===outputs[0].receiptId&&r.readiness==='NOT_READY'&&r.independentVerification==='NOT_RUN'&&r.factoryGrantedAuthority===0));
 assert.equal((await pool.query('SELECT count(*)::int n FROM engineering_factory_admissions WHERE request_id=$1',[f.request.id])).rows[0].n,1);
 const row=await f.store.get(f.request.id,outputs[0].receiptId);
 assert.deepEqual(row.history.map(x=>x.state),['RECEIVED','AUTHENTICATED','ATTESTED','INTEGRITY_VERIFIED','ADMITTED']);
 assert.equal(JSON.parse(row.envelope).signature,golden.result.signature);pass('real producer golden, twelve concurrent exact deliveries, one receipt/admission');
 if(process.env.Q37_GATE_C_EVIDENCE){mkdirSync(process.env.Q37_GATE_C_EVIDENCE,{recursive:true});
  writeFileSync(join(process.env.Q37_GATE_C_EVIDENCE,'consumer-golden.json'),JSON.stringify({scope:'LOCAL_SYNTHETIC_POSTGRESQL_CONSUMER',producerCommit:'fcd8afd6fbaa2b9045b9e9700608d546edf011a9',expectedBinding:f.binding,receipt:row,admission:await f.store.admission(f.request.id),projection:outputs[0],concurrentDeliveries:12,logicalAdmissions:1,independentVerification:'NOT_RUN',readiness:'NOT_READY',liveFactory:'NOT_RUN'},null,2)+'\n');}

 for(const stage of ['RECEIVED','AUTHENTICATED','ATTESTED','INTEGRITY_VERIFIED','ADMITTED']) {
  const f=await fixture(pool);
  const child=fork(new URL('./factory-receipt-process.mjs',import.meta.url),[],{execArgv:['--import','tsx'],stdio:['ignore','inherit','inherit','ipc']});
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('checkpoint timeout '+stage));},15000);
   child.once('error',reject);child.once('message',msg=>{clearTimeout(timer);if(msg.error){child.kill();reject(Error(msg.error));return;}
    assert.equal(msg.committed,stage);child.once('exit',resolve);child.kill('SIGKILL');});
   child.send({url,principal:f.principal,requestId:f.request.id,stage});
  });
  const saved=(await pool.query('SELECT * FROM engineering_factory_receipts WHERE request_id=$1',[f.request.id])).rows;
  assert.equal(saved.length,1);assert.equal(saved[0].state,stage);assert.deepEqual(JSON.parse(saved[0].envelope),golden.result);
  const restarted=storeFor(pool,f.principal);
  const result=await resumeFactoryResult(restarted,f.request.id,saved[0].id,options);assert.equal(result.status,'ADMITTED');
  for(let i=0;i<2;i++)assert.equal((await admitFactoryResult(restarted,f.request.id,golden.result,options)).receiptId,saved[0].id);
  assert.equal((await pool.query('SELECT count(*)::int n FROM engineering_factory_admissions WHERE request_id=$1',[f.request.id])).rows[0].n,1);
  pass('SIGKILL/restart/replay after '+stage);
 }
 // Signed same-operation alternative manifests retain forensic deliveries.
 const c=await fixture(pool),r=resign();
 const one=await admitFactoryResult(c.store,c.request.id,r.result,{keys:async()=>[r.key]});assert.equal(one.status,'ADMITTED');
 const m2=structuredClone(r.m);m2.issuedAt=new Date(Date.parse(m2.issuedAt)+1).toISOString();
 const second=await admitFactoryResult(c.store,c.request.id,signResult(m2,r.artifacts,r.privateKey),{keys:async()=>[r.key]});
 assert.equal(second.status,'CONFLICT');assert.equal((await c.store.admission(c.request.id)).receipt_id,one.receiptId);
 assert.equal((await pool.query('SELECT count(*)::int n FROM engineering_factory_receipts WHERE request_id=$1',[c.request.id])).rows[0].n,2);pass('conflicting signed manifest preserves both, no replacement');
 // Staleness is checked against locked authoritative Work and Q37 request mapping.
 for(const mode of ['generation','cancelled','takeover','superseded','work_cancelled']) {
  const s=await fixture(pool);
  if(mode==='generation')await pool.query('UPDATE engineering_work SET generation=generation+1 WHERE id=$1',[s.binding.workId]);
  if(mode==='cancelled')await s.store.cancel(s.request.id);
  if(mode==='takeover')await pool.query("UPDATE engineering_work SET control='human' WHERE id=$1",[s.binding.workId]);
  if(mode==='work_cancelled')await pool.query("UPDATE engineering_work SET lifecycle='cancelled' WHERE id=$1",[s.binding.workId]);
  if(mode==='superseded'){const {operationId,...b}=s.binding;await s.store.register(prepareAuthenticatedFactoryInput({...b,runId:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',attemptNumber:2}));}
  const result=await admitFactoryResult(s.store,s.request.id,golden.result,options);assert.equal(result.status,'STALE');assert.equal(await s.store.admission(s.request.id),null);pass(mode+' preserves historical provenance only');
 }
 // Wrong Work cannot claim the producer operation already mapped in this scope.
 const x=await fixture(pool);await assert.rejects(x.store.register({...x.binding,workId:f.binding.workId}));
 await assert.rejects(f.store.get(f.request.id,one.receiptId));pass('cross-Work/scoped receipt denial');
 for(const mode of ['revoked','retired','expired']) {
  const s=await fixture(pool),key={...golden.expected.keys[0]};
  if(mode==='revoked')key.revokedAt=new Date().toISOString();
  if(mode==='retired')key.retiredAt=new Date(Date.parse(manifest.issuedAt)+1000).toISOString();
  if(mode==='expired')key.notAfter=new Date(Date.parse(manifest.issuedAt)+1000).toISOString();
  const result=await admitFactoryResult(s.store,s.request.id,golden.result,{keys:async()=>[key]});
  assert.equal(result.status,'STALE');assert.equal(result.factoryProvenance,'VERIFIED');assert.equal(result.eligibleForCurrentAdmission,false);pass(mode+' key historical only');
 }
 const revoked={...golden.expected.keys[0],revokedAt:new Date().toISOString()};
 const history=await admitFactoryResult(f.store,f.request.id,golden.result,{keys:async()=>[revoked]});
 assert.equal(history.receiptId,outputs[0].receiptId);assert.equal(history.eligibleForCurrentAdmission,false);pass('revocation retains prior admitted bytes without current eligibility');
 // Durable denials: raw provenance is retained, but no invalid return admits.
 for(const mode of ['signature','unknown_key','protocol','malformed','manifest','artifact','wrong_factory','wrong_version','wrong_request','wrong_workorder','wrong_attempt','candidate','evidence','ready','authority']) {
  const s=await fixture(pool),r=resign();let result=structuredClone(r.result),keys=[r.key];
  if(mode==='signature')result.signature='a'.repeat(86);
  else if(mode==='unknown_key')keys=[];
  else if(mode==='protocol')result.protocol='UNSUPPORTED_V2';
  else if(mode==='malformed')result={protocol:'MYFACTORY_RESULT_V1'};
  else if(mode==='manifest')result.manifestDigest='0'.repeat(64);
  else if(mode==='artifact')result.artifacts[0].base64=Buffer.from('changed').toString('base64');
  else {
   const m=structuredClone(r.m);
   if(mode==='wrong_factory')m.producer='forged';
   if(mode==='wrong_version')m.execution.factoryVersion='a'.repeat(64);
   if(mode==='wrong_request')m.execution.requestId='other';
   if(mode==='wrong_workorder')m.execution.workOrderId='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
   if(mode==='wrong_attempt')m.execution.attemptNumber=2;
   if(mode==='candidate')m.candidate.commit='a'.repeat(40);
   if(mode==='evidence')m.evidence[0].command='different check';
   if(mode==='ready')m.ready=true;
   if(mode==='authority')m.authority='writer';
   const {canonical}=await import('../lib/engineering/factory-producer-protocol.ts');
   const {signProtocolPayload}=await import('../lib/engineering/factory-producer-signature.ts');
   result.encoded=Buffer.from(canonical(m)).toString('base64url');result.manifestDigest=digest(m);
   result.signature=signProtocolPayload('MYFACTORY_RESULT_V1',result.encoded,r.privateKey);
  }
  const denied=await admitFactoryResult(s.store,s.request.id,result,{keys:async()=>keys});
  assert.equal(denied.status,'REJECTED',mode);assert.equal(await s.store.admission(s.request.id),null);assert.equal(denied.factoryGrantedAuthority,0);assert.equal(denied.readiness,'NOT_READY');
  pass('durable denial '+mode);
 }
 const variant=structuredClone(golden.result);variant.artifacts.reverse();
 assert.equal((await admitFactoryResult(f.store,f.request.id,variant,options)).receiptId,outputs[0].receiptId);
 assert.equal((await pool.query('SELECT count(*)::int n FROM engineering_factory_admissions WHERE request_id=$1',[f.request.id])).rows[0].n,1);pass('same manifest reordered transport yields same logical receipt/admission');
 for(const status of ['CANCELLED','FAILED']){
  const s=await fixture(pool),r=resign(m=>{m.status=status;});
  const result=await admitFactoryResult(s.store,s.request.id,r.result,{keys:async()=>[r.key]});
  assert.equal(result.status,'STALE');assert.equal(await s.store.admission(s.request.id),null);pass('signed producer '+status+' remains historical');
 }
 // A trust-store outage is retryable, not a permanent rejection.
 const outage=await fixture(pool),received=await outage.store.receive(outage.request.id,golden.result);
 await assert.rejects(resumeFactoryResult(outage.store,outage.request.id,received.id,{keys:async()=>{throw Error('Unavailable trust registry');}}),/Unavailable/);
 assert.equal((await outage.store.get(outage.request.id,received.id)).state,'RECEIVED');
 assert.equal((await resumeFactoryResult(outage.store,outage.request.id,received.id,options)).status,'ADMITTED');pass('trust registry outage leaves durable recoverable receipt');
 // A stale result also freezes its verified manifest: alternatives conflict.
 const staleConflict=await fixture(pool),sc=resign();await staleConflict.store.cancel(staleConflict.request.id);
 assert.equal((await admitFactoryResult(staleConflict.store,staleConflict.request.id,sc.result,{keys:async()=>[sc.key]})).status,'STALE');
 sc.m.issuedAt=new Date(Date.parse(sc.m.issuedAt)+2).toISOString();
 assert.equal((await admitFactoryResult(staleConflict.store,staleConflict.request.id,signResult(sc.m,sc.artifacts,sc.privateKey),{keys:async()=>[sc.key]})).status,'CONFLICT');pass('historical manifest conflict is retained, not replaced');

 // Exercise authenticated channel -> durable receipt with bytes larger than the
 // removed Linear envelope profile, without any upload/public URL or dispatch.
 const channel=await fixture(pool),large=resign(),largeBytes=Buffer.alloc(256*1024,65);
 const log=large.m.artifacts.find(a=>a.kind==='check-log');log.size=largeBytes.length;log.sha256=sha256(largeBytes);
 large.artifacts.find(a=>a.id===log.id).base64=largeBytes.toString('base64');large.m.artifactDigest=digest(large.m.artifacts);
 const returned=signResult(large.m,large.artifacts,large.privateKey);
 const {createServer}=await import('node:http');let gets=0;
 const server=createServer((req,res)=>{
  if(req.method!=='GET'||req.headers.authorization!=='Bearer q37-fixture-only'||req.url!==`/api/connect/v1/work-orders/${channel.binding.workOrderId}/runs/${channel.binding.runId}/result`){res.writeHead(403).end();return;}
  gets++;res.end(JSON.stringify({state:'COMPLETED',result:returned}));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try {
  const {reconcileFactoryAttempt}=await import('../lib/engineering/factory-result-consumer.ts');
  const config={origin:`http://127.0.0.1:${server.address().port}`,token:'q37-fixture-only'};
  const got=await reconcileFactoryAttempt(channel.store,channel.request.id,config,{keys:async()=>[large.key]});
  assert.equal(got.status,'ADMITTED');
  const saved=await channel.store.get(channel.request.id,got.receiptId);
  assert.equal(sha256(Buffer.from(JSON.parse(saved.envelope).artifacts.find(a=>a.id===log.id).base64,'base64')),log.sha256);
  assert.equal((await resumeFactoryResult(storeFor(pool,channel.principal),channel.request.id,got.receiptId,{keys:async()=>[large.key]})).receiptId,got.receiptId);
  assert.equal(gets,1);pass('256 KiB authenticated exact-attempt retrieval, durable admission and restart without refetch');
 } finally {await new Promise(resolve=>server.close(resolve));}

 // Database referential constraints independently prevent a cross-Work pointer.
 const cross=await fixture(pool),crossSource=await fixture(pool);
 const crossReceipt=await crossSource.store.receive(crossSource.request.id,golden.result);
 await assert.rejects(pool.query(`INSERT INTO engineering_factory_admissions(request_id,receipt_id,manifest_digest,key_policy)
 VALUES($1,$2,$3,$4)`,[cross.request.id,crossReceipt.id,r.result.manifestDigest,JSON.stringify(r.key)]),/foreign key/);
 pass('database composite foreign key denies cross-Work attachment');
 const racing=await fixture(pool),rc=resign(),alternative=structuredClone(rc.m);alternative.issuedAt=new Date(Date.parse(alternative.issuedAt)+3).toISOString();
 const raced=await Promise.all([rc.result,signResult(alternative,rc.artifacts,rc.privateKey)].map(result=>admitFactoryResult(racing.store,racing.request.id,result,{keys:async()=>[rc.key]})));
 assert.deepEqual(raced.map(r=>r.status).sort(),['ADMITTED','CONFLICT']);
 assert.equal((await pool.query('SELECT count(*)::int n FROM engineering_factory_admissions WHERE request_id=$1',[racing.request.id])).rows[0].n,1);
 pass('concurrent conflicting manifests admit exactly one, retain loser as conflict');

 // Restricted application and worker roles use only the scoped mutation API.
 for(const kind of ['application','worker']) {
  const role='q37_'+kind+'_'+randomBytes(4).toString('hex'),s=await fixture(pool),client=await pool.connect();
  try {
   await client.query('CREATE ROLE '+role+' NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE');
   await client.query('GRANT USAGE ON SCHEMA public TO '+role);
   await client.query('GRANT SELECT ON engineering_factory_requests,engineering_factory_receipts,engineering_factory_admissions,engineering_work,agents TO '+role);
   await client.query('GRANT EXECUTE ON FUNCTION engineering_factory_receipt(jsonb) TO '+role);
   await client.query('SET ROLE '+role);
   const store=storeFor(client,s.principal);assert.equal((await admitFactoryResult(store,s.request.id,golden.result,options)).status,'ADMITTED');
   await assert.rejects(client.query("UPDATE engineering_work SET control='human' WHERE id=$1",[s.binding.workId]),/permission denied/);
   await assert.rejects(client.query("UPDATE engineering_factory_receipts SET state='ADMITTED'"),/permission denied/);
   await assert.rejects(client.query('CREATE TABLE q37_forbidden(x int)'),/permission denied/);
   pass('restricted '+kind+' role; no direct receipt/writer mutation');
  } finally {await client.query('RESET ROLE');await client.query('DROP OWNED BY '+role);await client.query('DROP ROLE '+role);client.release();}
 }
 for(const table of ['engineering_execution','engineering_native_runtime','engineering_route_runs','engineering_work_model_calls'])
  assert.equal((await pool.query('SELECT count(*)::int n FROM '+table)).rows[0].n,0);
 pass('zero writer/budget/route side effects; zero false Ready');
 console.log(JSON.stringify({passed:count,unauthenticatedAdmissions:0,factoryGrantedAuthority:0,falseReady:0,duplicateAdmissions:0,liveFactory:'NOT_RUN'}));
} finally {await pool.end();await dropQuiescentDatabase(name);await admin.end();}
async function fixtureSeedOnly(){await pool.query(`INSERT INTO engineering_work(id,scope_id,scope_kind,created_by,title,objective,repository,max_cost_usd,max_duration_seconds,idempotency_key,request_hash)
 VALUES('bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb','historical','personal','historical','Preserve','Preserve','fixture/history',1,3600,'cccccccc-cccc-4ccc-accc-cccccccccccc','historical')`);}

async function dropQuiescentDatabase(database) {
 // pg Pool.end drains clients before PostgreSQL necessarily observes every TCP
 // close. Wait for this disposable DB only; never terminate another connection.
 for(let i=0;i<100;i++) {
  const {rows}=await admin.query('SELECT count(*)::int n FROM pg_stat_activity WHERE datname=$1',[database]);
  if(rows[0].n===0){await admin.query('DROP DATABASE '+database);return;}
  await new Promise(resolve=>setTimeout(resolve,10));
 }
 throw Error('Disposable database did not quiesce: '+database);
}
