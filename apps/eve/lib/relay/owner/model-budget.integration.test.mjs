import {readFile,readdir} from 'node:fs/promises';
import {Pool} from 'pg';
import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import {OwnerModelBudget} from './model-budget.ts';
const suite=process.env.MYEVE_OWNER_CHANNEL_TESTS==='1'?describe:describe.skip;
const fixtureUrl=process.env.MYEVE_OWNER_TEST_DATABASE_URL??`postgresql://${process.env.USER}@127.0.0.1:55447/postgres`;
if(process.env.MYEVE_OWNER_CHANNEL_TESTS==='1'&&new URL(fixtureUrl).hostname!=='127.0.0.1')throw new Error('Loopback test database required.');
suite('durable owner model budget',()=>{
 let admin,pool,budget;const schema=`owner_budget_${process.pid}_${Date.now()}`;
 const query=async(text,params=[])=>(await pool.query(text,params)).rows;
 const database={query};
 const input=(stepKey='turn:0')=>({ownerId:'owner',runId:'run',stepKey,requestHash:'sha256:fixture',modelId:'fixture/model',microUsd:60000,tokens:6000});
 beforeAll(async()=>{
  admin=new Pool({connectionString:fixtureUrl});await admin.query(`CREATE SCHEMA ${schema}`);
  pool=new Pool({connectionString:fixtureUrl,options:`-c search_path=${schema}`});
  const dir=new URL('../../../migrations/',import.meta.url);for(const file of (await readdir(dir)).filter(x=>x.endsWith('.sql')).sort())await query(await readFile(new URL(file,dir),'utf8'));
  await query("INSERT INTO agents(id,owner_id,slug,name,role,instructions,is_primary,status,max_steps,max_runtime_seconds,max_estimated_cost_usd) VALUES('agent','owner','budget','Budget fixture','Qualification','Synthetic',true,'active',8,60,0.1)");
 });
 beforeEach(async()=>{
  await query('TRUNCATE task_runs CASCADE');await query("UPDATE agents SET status='active',is_primary=true,max_estimated_cost_usd=0.1");
  // Each test is a separate synthetic campaign. Production has no reset path.
  await query('UPDATE owner_qualification_budget SET reserved_microusd=0,spent_microusd=0');
  await query("INSERT INTO task_runs(id,owner_id,agent_id,kind,title,status,max_duration_seconds,max_specialists,max_model_steps,max_retries_per_specialist,max_estimated_cost_usd,deadline_at) VALUES('run','owner','agent','delegated_work','Fixture','running',60,0,8,0,0.1,now()+interval '60 seconds')");
  await query("INSERT INTO owner_channel_requests(relay_account_id,request_id,owner_id,agent_id,source_identity,relay_thread_id,work_hash,run_id,request,expires_at) VALUES('relay','request','owner','agent','source','thread','hash','run','{}',now()+interval '1 hour')");
  budget=new OwnerModelBudget(database);
 });
 afterAll(async()=>{await pool?.end();if(admin){await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();}});
 it('serializes concurrent reservations without overspending',async()=>{
  const results=await Promise.allSettled([0,1,2,3].map(i=>budget.reserve(input(`turn:${i}`))));
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect((await query('SELECT model_reserved_microusd,model_calls_started FROM owner_channel_requests'))[0]).toMatchObject({model_reserved_microusd:'60000',model_calls_started:1});
 });
 it('restart and retry cannot repeat an ambiguous call',async()=>{
  await budget.reserve(input());await expect(new OwnerModelBudget(database).reserve(input())).rejects.toThrow('ambiguous');
  expect((await query('SELECT count(*)::int n FROM owner_model_calls'))[0].n).toBe(1);
 });
 it('replays completed results and settles exactly once',async()=>{
  await budget.reserve(input());await budget.settle(input(),{microUsd:10000,tokens:1000},{content:'safe result'});
  expect(await new OwnerModelBudget(database).reserve(input())).toEqual({result:{content:'safe result'}});
  await expect(budget.settle(input(),{microUsd:10000,tokens:1000},{})).rejects.toThrow();
  expect((await query('SELECT model_spent_microusd,model_reserved_microusd,tokens_used,tokens_reserved FROM owner_channel_requests'))[0]).toMatchObject({model_spent_microusd:'10000',model_reserved_microusd:'0',tokens_used:1000,tokens_reserved:0});
  expect((await query('SELECT model_steps,estimated_cost_usd FROM task_runs'))[0].model_steps).toBe(1);
 });
 it('cancellation retains ambiguous cost and denies new calls',async()=>{
  await budget.reserve(input());await query("UPDATE task_runs SET status='cancelled'");await budget.unknown(input());
  await expect(budget.reserve(input('turn:1'))).rejects.toThrow();
  expect((await query('SELECT model_reserved_microusd,usage_unknown FROM owner_channel_requests'))[0]).toMatchObject({model_reserved_microusd:'60000',usage_unknown:true});
 });
 it('a known completed call settles after cancellation without refunding incurred usage',async()=>{
  await budget.reserve(input());await query("UPDATE task_runs SET status='cancelled'");await budget.settle(input(),{microUsd:20000,tokens:2000},{});
  expect((await query('SELECT model_spent_microusd,model_reserved_microusd FROM owner_channel_requests'))[0]).toMatchObject({model_spent_microusd:'20000',model_reserved_microusd:'0'});
 });
 it('approval waiting and continuation cannot reset consumed budget',async()=>{
  await budget.reserve(input());await budget.settle(input(),{microUsd:60000,tokens:6000},{});
  await query("UPDATE task_runs SET status='awaiting_approval'");await expect(budget.reserve(input('turn:1'))).rejects.toThrow();
  await query("UPDATE task_runs SET status='running',deadline_at=now()+interval '7 seconds'");await expect(new OwnerModelBudget(database).reserve(input('turn:1'))).rejects.toThrow();
 });
 it.each(['revoked','expired','agent-denied','time-expired'])('denies %s before reservation',async reason=>{
  if(reason==='revoked')await query('UPDATE owner_channel_requests SET revoked_at=now()');
  if(reason==='expired')await query("UPDATE owner_channel_requests SET expires_at=now()-interval '1 second'");
  if(reason==='agent-denied')await query("UPDATE agents SET status='paused',is_primary=false");
  if(reason==='time-expired')await query("UPDATE task_runs SET deadline_at=now()-interval '1 second'");
  await expect(budget.reserve(input())).rejects.toThrow();expect((await query('SELECT count(*)::int n FROM owner_model_calls'))[0].n).toBe(0);
 });
 it('denies changed material request and missing or excessive usage',async()=>{
  await budget.reserve(input());await expect(budget.reserve({...input(),requestHash:'changed'})).rejects.toThrow();
  await expect(budget.settle(input(),{microUsd:NaN,tokens:100},{})).rejects.toThrow();
  await expect(budget.reserve(input('turn:1'))).rejects.toThrow();
 });
 it('reserves token and step limits independently of spend',async()=>{
  await query('UPDATE owner_channel_requests SET tokens_used=11900');await expect(budget.reserve({...input(),microUsd:1})).rejects.toThrow();
  await query('UPDATE owner_channel_requests SET tokens_used=0,model_calls_started=8');await expect(budget.reserve({...input(),microUsd:1})).rejects.toThrow();
 });
 it('newly narrowed local Agent spend policy overrides the admitted Relay allowance',async()=>{
  await query('UPDATE agents SET max_estimated_cost_usd=0.05');
  await expect(budget.reserve(input())).rejects.toThrow();
  expect((await query('SELECT count(*)::int n FROM owner_model_calls'))[0].n).toBe(0);
 });

 const totals=async()=> (await query('SELECT reserved_microusd,spent_microusd FROM owner_qualification_budget'))[0];
 async function anotherRun(index){
  const runId=`run-${index}`;
  await query(`INSERT INTO task_runs(id,owner_id,agent_id,kind,title,status,max_duration_seconds,max_specialists,max_model_steps,max_retries_per_specialist,max_estimated_cost_usd,deadline_at)
   SELECT $1,owner_id,agent_id,kind,title,status,max_duration_seconds,max_specialists,max_model_steps,max_retries_per_specialist,max_estimated_cost_usd,deadline_at FROM task_runs WHERE id='run'`,[runId]);
  await query(`INSERT INTO owner_channel_requests(relay_account_id,request_id,owner_id,agent_id,source_identity,relay_thread_id,work_hash,run_id,request,expires_at)
   SELECT relay_account_id,$1,owner_id,agent_id,source_identity,relay_thread_id,work_hash,$1,request,expires_at FROM owner_channel_requests WHERE run_id='run'`,[runId]);
  return {...input(),runId,microUsd:100000,tokens:1000};
 }
 it('enforces the shared $5 ceiling across concurrent independent Runs',async()=>{
  const calls=[];for(let i=0;i<60;i++)calls.push(await anotherRun(i));
  const results=await Promise.allSettled(calls.map(call=>budget.reserve(call)));
  expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(50);
  expect(await totals()).toEqual({reserved_microusd:'5000000',spent_microusd:'0'});
  expect((await query('SELECT count(*)::int n FROM owner_model_calls'))[0].n).toBe(50);
  // Failed aggregate admission also rolls back the existing per-Run counters.
  expect((await query('SELECT sum(model_calls_started)::int n FROM owner_channel_requests'))[0].n).toBe(50);
  await expect(new OwnerModelBudget(database).reserve({...input(),microUsd:1,tokens:1})).rejects.toThrow('aggregate');
 });
 it('a phase ceiling inside the same ledger denies admission before invocation without altering liability',async()=>{
  // Mirrors scripts/qualification/phase-ceiling.mjs: prior liability 78,533 plus a 60,000 phase allowance.
  await query('UPDATE owner_qualification_budget SET reserved_microusd=62221,spent_microusd=16312');
  await query('ALTER TABLE owner_qualification_budget ADD CONSTRAINT owner_qualification_phase_ceiling CHECK(reserved_microusd+spent_microusd<=138533)');
  try{
   await budget.reserve(input());
   expect(await totals()).toEqual({reserved_microusd:'122221',spent_microusd:'16312'});
   await expect(new OwnerModelBudget(database).reserve({...input('turn:1'),microUsd:1,tokens:1})).rejects.toThrow();
   expect(await totals()).toEqual({reserved_microusd:'122221',spent_microusd:'16312'});
   expect((await query('SELECT count(*)::int n FROM owner_model_calls'))[0].n).toBe(1);
   expect((await query('SELECT model_calls_started FROM owner_channel_requests'))[0].model_calls_started).toBe(1);
   // Settlement releases only proven unused reservation and stays inside the ceiling.
   await budget.settle(input(),{microUsd:10000,tokens:1000},{content:'safe'});
   expect(await totals()).toEqual({reserved_microusd:'62221',spent_microusd:'26312'});
  }finally{await query('ALTER TABLE owner_qualification_budget DROP CONSTRAINT owner_qualification_phase_ceiling');}
 });
 it('retains aggregate uncertainty after cancellation, restart and receipt cleanup',async()=>{
  await budget.reserve(input());await budget.unknown(input());
  await query("UPDATE task_runs SET status='cancelled'");
  await expect(new OwnerModelBudget(database).reserve(input())).rejects.toThrow('ambiguous');
  await query('DELETE FROM owner_model_calls');
  expect(await totals()).toEqual({reserved_microusd:'60000',spent_microusd:'0'});
 });
 it('releases only proven unused aggregate reservation and never settles twice',async()=>{
  await budget.reserve(input());await query("UPDATE task_runs SET status='cancelled'");
  await budget.settle(input(),{microUsd:20000,tokens:1000},{});
  await expect(new OwnerModelBudget(database).settle(input(),{microUsd:20000,tokens:1000},{})).rejects.toThrow();
  expect(await totals()).toEqual({reserved_microusd:'0',spent_microusd:'20000'});
 });
 it('rolls back duplicate step reservations without charging aggregate twice',async()=>{
  const call={...input(),microUsd:10000,tokens:100};
  await Promise.allSettled(Array.from({length:10},()=>budget.reserve(call)));
  expect(await totals()).toEqual({reserved_microusd:'10000',spent_microusd:'0'});
  expect((await query('SELECT model_calls_started FROM owner_channel_requests'))[0].model_calls_started).toBe(1);
 });
 it('fails closed if the aggregate account is missing',async()=>{
  await query('DELETE FROM owner_qualification_budget');
  try{
   await expect(budget.reserve(input())).rejects.toThrow('aggregate');
   expect((await query('SELECT model_calls_started FROM owner_channel_requests'))[0].model_calls_started).toBe(0);
  }finally{await query('INSERT INTO owner_qualification_budget VALUES(true,0,0)');}
 });
 it('preserves liability when upgrading populated 0031 receipts',async()=>{
  await budget.reserve(input());await budget.settle(input(),{microUsd:20000,tokens:1000},{});
  const other=await anotherRun('upgrade');await budget.reserve(other);await budget.unknown(other);
  await query('DROP TRIGGER owner_model_qualification_accounting ON owner_model_calls; DROP FUNCTION account_owner_qualification_model_call(); DROP TABLE owner_qualification_budget');
  await query(await readFile(new URL('../../../migrations/0038_owner_qualification_budget.sql',import.meta.url),'utf8'));
  expect(await totals()).toEqual({reserved_microusd:'100000',spent_microusd:'20000'});
  expect((await query('SELECT count(*)::int n FROM owner_model_calls'))[0].n).toBe(2);
 });

});
