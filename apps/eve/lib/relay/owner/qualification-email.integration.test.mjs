import {readFile,readdir} from 'node:fs/promises';
import {Pool} from 'pg';
import {beforeAll,beforeEach,afterAll,describe,it,expect,vi} from 'vitest';
import {pinnedQualificationEmail,qualificationEmailPin,registerQualificationEmailPin,qualificationDraftSha256} from './qualification-email.ts';
const suite=process.env.MYEVE_OWNER_CHANNEL_TESTS==='1'?describe:describe.skip;
const fixtureUrl=process.env.MYEVE_OWNER_TEST_DATABASE_URL??`postgresql://${process.env.USER}@127.0.0.1:55447/postgres`;
if(process.env.MYEVE_OWNER_CHANNEL_TESTS==='1'&&new URL(fixtureUrl).hostname!=='127.0.0.1')throw new Error('Loopback test database required.');
const env=(id,subject='Pin subject')=>({MYEVE_OWNER_LOCAL_EMAIL_RECIPIENT:'owner@example.test',MYEVE_OWNER_LOCAL_EMAIL_SUBJECT:subject,MYEVE_OWNER_LOCAL_EMAIL_TEXT:'Exact body.\n- Sofie',MYEVE_OWNER_LOCAL_EMAIL_MAX_SENDS:'1',MYEVE_OWNER_LOCAL_EMAIL_PIN_ID:id});
const draft=(subject='Pin subject')=>({to:['owner@example.test'],subject,text:'Exact body.\n- Sofie'});
suite('durable qualification email pins',()=>{
 let admin,pool,sends;const schema=`owner_email_pins_${process.pid}_${Date.now()}`;
 const query=async(text,params=[])=>(await pool.query(text,params)).rows;
 const database={query};
 const inner=()=>({resolveTarget:vi.fn(async()=>({provider:'agentmail',account:'inbox',resource:'[]'})),execute:vi.fn(async()=>{sends++;return 'sent';}),verify:vi.fn(async()=>({verified:true,receipt:{}}))});
 // A new adapter instance per call models a process restart or reload.
 const send=(pin,key)=>pinnedQualificationEmail(inner(),pin,()=>database).execute(draft(pin.subject),{idempotencyKey:key});
 beforeAll(async()=>{
  admin=new Pool({connectionString:fixtureUrl});await admin.query(`CREATE SCHEMA ${schema}`);
  pool=new Pool({connectionString:fixtureUrl,options:`-c search_path=${schema}`});
  const dir=new URL('../../../migrations/',import.meta.url);for(const file of (await readdir(dir)).filter(x=>x.endsWith('.sql')).sort())await query(await readFile(new URL(file,dir),'utf8'));
 });
 beforeEach(()=>{sends=0;});
 afterAll(async()=>{await pool?.end();if(admin){await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();}});
 it('allows one send per pin across restarts and never restores it on re-registration',async()=>{
  const pin=qualificationEmailPin(env('email-pin-2'));
  expect(await registerQualificationEmailPin(database,pin)).toEqual({attempts:0,remaining:1});
  await expect(send(pin,'act_first')).resolves.toBe('sent');
  await expect(send(pin,'act_restarted')).rejects.toThrow('send limit');
  expect(await registerQualificationEmailPin(database,pin)).toEqual({attempts:1,remaining:0});
  await expect(send(pin,'act_reloaded')).rejects.toThrow('send limit');
  expect(sends).toBe(1);
  const [row]=await query('SELECT attempts,first_attempt_action_id,exhausted_at FROM owner_qualification_email_pins WHERE pin_id=$1',['email-pin-2']);
  expect(row.attempts).toBe(1);expect(row.first_attempt_action_id).toBe('act_first');expect(row.exhausted_at).not.toBeNull();
 });
 it('refuses to rebind an exhausted draft to a new id or an id to another draft',async()=>{
  const pin=qualificationEmailPin(env('email-pin-3','Rebind subject'));await registerQualificationEmailPin(database,pin);await send(pin,'act_three');
  await expect(registerQualificationEmailPin(database,qualificationEmailPin(env('email-pin-4','Rebind subject')))).rejects.toThrow('conflicts');
  await expect(registerQualificationEmailPin(database,qualificationEmailPin(env('email-pin-3','Other subject')))).rejects.toThrow('conflicts');
  await expect(send(qualificationEmailPin(env('email-pin-4','Rebind subject')),'act_four')).rejects.toThrow('send limit');
  expect(sends).toBe(1);
 });
 it('blocks decrement, rebinding, delete and truncate of consumed allowance',async()=>{
  const pin=qualificationEmailPin(env('email-pin-5','Guard subject'));await registerQualificationEmailPin(database,pin);await send(pin,'act_five');
  await expect(query("UPDATE owner_qualification_email_pins SET attempts=0,exhausted_at=NULL WHERE pin_id='email-pin-5'")).rejects.toThrow();
  await expect(query("UPDATE owner_qualification_email_pins SET draft_sha256=$1 WHERE pin_id='email-pin-5'",['0'.repeat(64)])).rejects.toThrow('immutable');
  await expect(query("DELETE FROM owner_qualification_email_pins WHERE pin_id='email-pin-5'")).rejects.toThrow('append-only');
  await expect(query('TRUNCATE owner_qualification_email_pins')).rejects.toThrow('append-only');
  await expect(send(pin,'act_five_again')).rejects.toThrow('send limit');
 });
 it('lets exactly one of concurrent attempts through and sends nothing for an unregistered pin',async()=>{
  const pin=qualificationEmailPin(env('email-pin-6','Race subject'));await registerQualificationEmailPin(database,pin);
  const results=await Promise.allSettled([0,1,2,3].map(i=>send(pin,`act_race_${i}`)));
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(sends).toBe(1);
  await expect(send(qualificationEmailPin(env('email-pin-7','Never registered')),'act_unregistered')).rejects.toThrow('send limit');expect(sends).toBe(1);
 });
 it('keeps a backfilled exhausted pin exhausted',async()=>{
  const pin=qualificationEmailPin(env('email-pin-1','Backfilled subject'));
  await query("INSERT INTO owner_qualification_email_pins(pin_id,draft_sha256,max_sends,attempts,first_attempt_action_id,exhausted_at) VALUES($1,$2,1,1,'action_historical',now())",[pin.pinId,qualificationDraftSha256(pin)]);
  expect(await registerQualificationEmailPin(database,pin)).toEqual({attempts:1,remaining:0});
  await expect(send(pin,'act_retry')).rejects.toThrow('send limit');expect(sends).toBe(0);
 });
});
