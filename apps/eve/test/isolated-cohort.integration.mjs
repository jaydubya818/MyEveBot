/** Public PostgreSQL component fixtures only. No real cohort, owner, holdout or model. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes, randomUUID, createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Client} from 'pg';

const connection=process.env.MYEVE_ISOLATED_COHORT_TEST_DATABASE;
assert(connection,'Dedicated localhost PostgreSQL fixture URL required; never use DATABASE_URL');
const root=new URL(connection);
assert(['localhost','127.0.0.1'].includes(root.hostname)&&root.pathname==='/postgres','Dedicated localhost admin database required');
const sql=name=>readFile(new URL('../lib/external-alpha/'+name,import.meta.url),'utf8');
const preflight=await readFile(new URL('../../../scripts/unified-beta/check-isolated-accounting.sql',import.meta.url),'utf8');
const hash=text=>createHash('sha256').update(text).digest('hex');
const suffix=randomBytes(6).toString('hex');
const names=['history','fresh','custody'].map(x=>'myeve_qdev_'+x+'_'+suffix);
const roles=['old','runtime','verifier'].map(x=>'qdev_'+x+'_'+suffix);
const roleSecret=randomBytes(24).toString('hex');
const clients=[];
const admin=new Client({connectionString:connection});
await admin.connect();
async function connect(name,role){
 const url=new URL(root);url.pathname='/'+name;if(role){url.username=role;url.password=roleSecret;}
 const client=new Client({connectionString:url.href});
 try{await client.connect();}catch(error){await client.end().catch(()=>{});throw error;}
 clients.push(client);return client;
}
async function inspect(client){
 try{return await client.query(preflight);}finally{await client.query('ROLLBACK');}
}
const facts=async client=>JSON.stringify((await client.query(`SELECT
 (SELECT jsonb_agg(t ORDER BY t.id) FROM external_alpha_cohort t) cohorts,
 (SELECT jsonb_agg(t ORDER BY t.slot) FROM external_alpha_cohort_member t) members,
 (SELECT jsonb_agg(t ORDER BY t.id) FROM external_alpha_cohort_admission t) admissions,
 (SELECT jsonb_agg(t ORDER BY t.admission_id) FROM external_alpha_cohort_dispatch t) dispatches`)).rows);
try{
 for(const role of roles)await admin.query("CREATE ROLE "+role+" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '"+roleSecret+"'");
 for(const name of names){await admin.query('CREATE DATABASE '+name);await admin.query('REVOKE CONNECT ON DATABASE '+name+' FROM PUBLIC');}
 const [history,fresh,custody]=await Promise.all(names.map(name=>connect(name)));
 for(const db of [history,fresh])for(const file of ['shared-accounting.sql','shared-accounting-recovery.sql','shared-accounting-zero-gap.sql','shared-accounting-chat-only.sql'])await db.query(await sql(file));
 const fixture={cohort:randomUUID(),owner:randomUUID(),policy:'1'.repeat(64),token:'fixture-old-only',admission:randomUUID(),allowance:randomUUID()};
 await history.query('INSERT INTO external_alpha_cohort(id) VALUES($1)',[fixture.cohort]);
 await history.query(`INSERT INTO external_alpha_cohort_member(cohort_id,slot,owner_id,policy_sha256,credential_sha256)
 VALUES($1,'1',$2,$3,$4)`,[fixture.cohort,fixture.owner,fixture.policy,hash(fixture.token)]);
 await history.query(`INSERT INTO external_alpha_cohort_admission(id,cohort_id,owner_id,policy_sha256,kind,binding_sha256,request_sha256,day_index,ceiling_microusd,state,local_allowance_id,deadline)
 VALUES($1,$2,$3,$4,'WORK',$5,$6,0,1300000,'UNKNOWN',$7,clock_timestamp())`,[fixture.admission,fixture.cohort,fixture.owner,fixture.policy,'2'.repeat(64),'3'.repeat(64),fixture.allowance]);
 await history.query("INSERT INTO external_alpha_cohort_dispatch(admission_id,operation_sha256,state) VALUES($1,$2,'UNKNOWN')",[fixture.admission,'4'.repeat(64)]);
 const before=await facts(history);
 await test('empty dedicated store is a preparation observation only',async()=>{
  const result=await inspect(fresh);
  const observation=result.find(item=>item.rows?.[0]?.status)?.rows[0];
  assert.equal(observation?.status,'PREPARATION_OBSERVATION_ONLY_EXECUTION_NOT_AUTHORIZED');
  assert.equal(observation.accounting_function_body_sha256,hash((await sql('shared-accounting-chat-only.sql')).split('AS $$')[1].split('$$;')[0]));
  assert.equal((await fresh.query('SELECT count(*)::int n FROM external_alpha_cohort')).rows[0].n,0);
 });
 await test('historical UNKNOWN rows cannot qualify as a fresh empty store',async()=>{
  await assert.rejects(inspect(history),/QDEV_PRE_ENROLLMENT_DATABASE_NOT_EMPTY/);
  assert.equal(await facts(history),before);
 });
 await test('PUBLIC connection access is rejected before preparation',async()=>{
  await admin.query('GRANT CONNECT ON DATABASE '+names[1]+' TO PUBLIC');
  try{await assert.rejects(inspect(fresh),/QDEV_PUBLIC_CONNECT_FORBIDDEN/);}finally{await admin.query('REVOKE CONNECT ON DATABASE '+names[1]+' FROM PUBLIC');}
 });
 await test('PUBLIC table access is rejected without rewriting rows',async()=>{
  await fresh.query('GRANT SELECT ON external_alpha_cohort TO PUBLIC');
  try{await assert.rejects(inspect(fresh),/QDEV_PUBLIC_TABLE_ACCESS_FORBIDDEN/);}finally{await fresh.query('REVOKE SELECT ON external_alpha_cohort FROM PUBLIC');}
 });
 await test('an application or foreign ledger cannot be presented as a standalone accountant',async()=>{
  await fresh.query('CREATE TABLE unrelated_history(id integer)');
  try{await assert.rejects(inspect(fresh),/QDEV_STANDALONE_ACCOUNTING_DATABASE_REQUIRED/);}finally{await fresh.query('DROP TABLE unrelated_history');}
 });
 await test('PUBLIC security-definer execution is rejected',async()=>{
  await fresh.query('GRANT EXECUTE ON FUNCTION external_alpha_cohort_call(jsonb) TO PUBLIC');
  try{await assert.rejects(inspect(fresh),/QDEV_PUBLIC_FUNCTION_EXECUTE_FORBIDDEN/);}finally{await fresh.query('REVOKE EXECUTE ON FUNCTION external_alpha_cohort_call(jsonb) FROM PUBLIC');}
 });
 await test('old cohort credentials cannot create authority in the empty database',async()=>{
  await assert.rejects(fresh.query('SELECT external_alpha_cohort_call($1::jsonb)',[JSON.stringify({mode:'reserve',cohortId:fixture.cohort,ownerId:fixture.owner,slot:'1',policySha256:fixture.policy,credential:fixture.token,kind:'WORK'})]),/EXTERNAL_ALPHA_SHARED_DENIED/);
  await inspect(fresh);
 });
 await admin.query('GRANT CONNECT ON DATABASE '+names[0]+' TO '+roles[0]);
 await admin.query('GRANT CONNECT ON DATABASE '+names[1]+' TO '+roles[1]);
 await admin.query('GRANT CONNECT ON DATABASE '+names[2]+' TO '+roles[2]);
 await test('historical service role cannot connect to new accounting or custody',async()=>{
  await assert.rejects(connect(names[1],roles[0]),/permission denied/);
  await assert.rejects(connect(names[2],roles[0]),/permission denied/);
 });
 await test('new runtime cannot connect to historical accounting or verifier custody',async()=>{
  await assert.rejects(connect(names[0],roles[1]),/permission denied/);
  await assert.rejects(connect(names[2],roles[1]),/permission denied/);
 });
 await test('verifier role cannot read either accounting database',async()=>{
  await assert.rejects(connect(names[0],roles[2]),/permission denied/);
  await assert.rejects(connect(names[1],roles[2]),/permission denied/);
  await connect(names[2],roles[2]);
 });
 await test('new runtime receives no accounting-table privileges by connection alone',async()=>{
  const runtime=await connect(names[1],roles[1]);
  await assert.rejects(runtime.query('SELECT * FROM external_alpha_cohort'),/permission denied/);
 });
 const cohort=randomUUID(),owner=randomUUID(),token='fixture-new-only',policy='5'.repeat(64);
 await fresh.query('INSERT INTO external_alpha_cohort(id) VALUES($1)',[cohort]);
 await fresh.query(`INSERT INTO external_alpha_cohort_member(cohort_id,slot,owner_id,policy_sha256,credential_sha256) VALUES($1,'1',$2,$3,$4)`,[cohort,owner,policy,hash(token)]);
 const request={mode:'reserve',cohortId:cohort,ownerId:owner,slot:'1',policySha256:policy,credential:token,id:randomUUID(),kind:'WORK',bindingSha256:'6'.repeat(64),requestSha256:'7'.repeat(64)};
 await test('enrollment ends empty-store preparation and does not activate Work',async()=>{
  await assert.rejects(inspect(fresh),/QDEV_PRE_ENROLLMENT_DATABASE_NOT_EMPTY/);
  await assert.rejects(fresh.query('SELECT external_alpha_cohort_call($1::jsonb)',[JSON.stringify(request)]),/EXTERNAL_ALPHA_SHARED_FENCED|EXTERNAL_ALPHA_SHARED_CHAT_ONLY/);
 });
 await test('fresh activated fixture retains current CHAT-only Work denial',async()=>{
  await fresh.query('UPDATE external_alpha_cohort SET activated_at=clock_timestamp() WHERE id=$1',[cohort]);
  await assert.rejects(fresh.query('SELECT external_alpha_cohort_call($1::jsonb)',[JSON.stringify(request)]),/EXTERNAL_ALPHA_SHARED_CHAT_ONLY/);
  assert.equal((await fresh.query('SELECT count(*)::int n FROM external_alpha_cohort_admission')).rows[0].n,0);
 });
 await test('same-database cohort replacement and history reset remain impossible',async()=>{
  await assert.rejects(fresh.query('INSERT INTO external_alpha_cohort(id) VALUES($1)',[randomUUID()]),/unique|duplicate/);
  await assert.rejects(history.query("UPDATE external_alpha_cohort_admission SET state='BOUND' WHERE id=$1",[fixture.admission]),/immutable/);
  await assert.rejects(history.query('DELETE FROM external_alpha_cohort_admission WHERE id=$1',[fixture.admission]),/immutable/);
  assert.equal(await facts(history),before);
  assert.equal((await history.query('SELECT sum(ceiling_microusd)::text amount FROM external_alpha_cohort_admission')).rows[0].amount,'1300000');
 });
}finally{
 await Promise.all(clients.map(c=>c.end()));
 for(const name of names)await admin.query('DROP DATABASE IF EXISTS '+name+' WITH (FORCE)');
 for(const role of roles)await admin.query('DROP ROLE IF EXISTS '+role);
 await admin.end();
}
