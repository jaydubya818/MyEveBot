/** Public PostgreSQL component fixtures only. Synthetic owners, credentials and digests; no real cohort, model or spend.
 * Run: MYEVE_ISOLATED_COHORT_TEST_DATABASE=postgres://postgres@127.0.0.1:PORT/postgres node --import tsx --test apps/eve/test/qualification-accounting.integration.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes, randomUUID, createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Client} from 'pg';
import {digest} from '../lib/engineering/contract.ts';
import {QualificationAccounting, qualificationBinding, QDEV_BASELINE} from '../lib/external-alpha/qualification-accounting.ts';

const connection=process.env.MYEVE_ISOLATED_COHORT_TEST_DATABASE;
assert(connection,'Dedicated localhost PostgreSQL fixture URL required; never use DATABASE_URL');
const root=new URL(connection);
assert(['localhost','127.0.0.1'].includes(root.hostname)&&root.pathname==='/postgres','Dedicated localhost admin database required');
const file=name=>readFile(new URL('../lib/external-alpha/'+name,import.meta.url),'utf8');
const hash=text=>createHash('sha256').update(text).digest('hex');
const suffix=randomBytes(6).toString('hex');
const secret=randomBytes(24).toString('hex');
const admin=new Client({connectionString:connection});
const clients=[],names=[],roles=[];
await admin.connect();
const h=c=>c.repeat(64);
const sources={myeve:'a'.repeat(40),factory:'b'.repeat(40),relay:'c'.repeat(40),missioncontrol:'d'.repeat(40)};
const projectInput={...QDEV_BASELINE,operatingProfileSha256:h('1'),factoryVersionSha256:h('2'),protectedSpecificationSha256:h('3'),sources};
const binding=qualificationBinding(projectInput);
const op=name=>'op:'+name;
async function connect(name,role){
 const url=new URL(root);url.pathname='/'+name;if(role){url.username=role;url.password=secret;}
 const client=new Client({connectionString:url.href});await client.connect();clients.push(client);return client;
}
/** A disposable accounting DB with the qdev schema; the runtime role can only EXECUTE the entry point. */
async function fixture(label,{journey=5200000,perWork=1300000,maxWorks=4,validSeconds=3600,history=false,enroll=true}={}){
 const name='myeve_qdev_'+label+'_'+suffix,role='qdev_rt_'+label+'_'+suffix;
 names.push(name);roles.push(role);
 await admin.query("CREATE ROLE "+role+" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '"+secret+"'");
 await admin.query('CREATE DATABASE '+name);await admin.query('REVOKE CONNECT ON DATABASE '+name+' FROM PUBLIC');
 await admin.query('GRANT CONNECT ON DATABASE '+name+' TO '+role);
 const db=await connect(name);
 if(history)for(const f of ['shared-accounting.sql','shared-accounting-recovery.sql','shared-accounting-zero-gap.sql','shared-accounting-chat-only.sql'])await db.query(await file(f));
 await db.query(await file('qualification-accounting.sql'));
 await db.query('GRANT EXECUTE ON FUNCTION qdev_cohort_call(jsonb) TO '+role);
 const cohort=randomUUID(),q1=randomUUID(),q2=randomUUID(),t1=randomBytes(32).toString('hex'),t2=randomBytes(32).toString('hex');
 const policy={Q1:{cohortId:cohort,ownerId:q1,slot:'Q1'},Q2:{cohortId:cohort,ownerId:q2,slot:'Q2'}};
 if(enroll){
  await db.query(`INSERT INTO qdev_charter(id,proposal_id,charter_sha256,funding_sha256,hold_disposition_sha256,price_revision_sha256,journey_ceiling_microusd,max_works,per_work_ceiling_microusd,concurrency,valid_until)
   VALUES($1,'qdev-20261029-01',$2,$3,$4,$5,$6,$7,$8,1,clock_timestamp()+($9||' seconds')::interval)`,[cohort,h('4'),h('5'),h('6'),h('7'),journey,maxWorks,perWork,String(validSeconds)]);
  await db.query(`INSERT INTO qdev_member(cohort_id,slot,owner_id,policy_sha256,credential_sha256,paid_works) VALUES($1,'Q1',$2,$3,$4,4),($1,'Q2',$5,$6,$7,0)`,
   [cohort,q1,digest(policy.Q1),hash(t1),q2,digest(policy.Q2),hash(t2)]);
  for(const owner of [q1,q2])await db.query('INSERT INTO qdev_project(id,cohort_id,owner_id,project_sha256,source_sha256) VALUES($1,$2,$3,$4,$5)',[randomUUID(),cohort,owner,binding.projectSha256,binding.sourceSha256]);
 }
 const activate=()=>db.query('UPDATE qdev_charter SET activated_at=clock_timestamp() WHERE id=$1',[cohort]);
 const rt=await connect(name,role);
 const adapter={query:async(q,p)=>(await rt.query(q,p)).rows};
 const acct=(slot,token,b=binding)=>new QualificationAccounting(adapter,token,policy[slot],b);
 return {name,role,db,rt,cohort,policy,t1,t2,activate,adapter,q1:()=>acct('Q1',t1),q2:()=>acct('Q2',t2),acct,
  raw:(slot,token,payload)=>rt.query('SELECT qdev_cohort_call($1::jsonb) r',[JSON.stringify({cohortId:cohort,ownerId:policy[slot].ownerId,slot,policySha256:digest(policy[slot]),credential:token,projectSha256:binding.projectSha256,sourceSha256:binding.sourceSha256,...payload})]).then(r=>r.rows[0].r)};
}
const preflight=await readFile(new URL('../../../scripts/unified-beta/check-isolated-accounting.sql',import.meta.url),'utf8');
const inspect=async client=>{try{return await client.query(preflight);}finally{await client.query('ROLLBACK');}};
const reserve=(x,id,ceiling=1300000)=>x.q1().reserveWork({bindingId:id,requestSha256:h('8'),ceilingMicrousd:ceiling});
try{
 const f=await fixture('main',{history:true});
 const legacy=async()=>JSON.stringify((await f.db.query(`SELECT (SELECT count(*) FROM external_alpha_cohort) a,(SELECT count(*) FROM external_alpha_cohort_member) b,(SELECT count(*) FROM external_alpha_cohort_admission) c,(SELECT count(*) FROM external_alpha_cohort_dispatch) d`)).rows);
 const legacyBefore=await legacy();
 await test('installing the schema grants no authority and exposes no table to the runtime role',async()=>{
  await assert.rejects(f.rt.query('SELECT * FROM qdev_work'),/permission denied/);
  await assert.rejects(f.rt.query('SELECT * FROM qdev_charter'),/permission denied/);
  assert.equal((await f.db.query("SELECT count(*)::int n FROM information_schema.role_table_grants WHERE grantee='PUBLIC' AND table_name LIKE 'qdev_%'")).rows[0].n,0);
  assert.equal((await f.db.query("SELECT count(*)::int n FROM pg_proc p,LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE p.proname='qdev_cohort_call' AND a.grantee=0")).rows[0].n,0);
 });
 await test('an inactive charter denies every effect and unknown credentials are denied',async()=>{
  await assert.rejects(reserve(f,'w1'),/QDEV_FENCED/);
  await assert.rejects(f.raw('Q1','wrong-token',{mode:'status'}),/QDEV_DENIED/);
  assert.equal((await f.q1().status()).state,'inactive');
 });
 await f.activate();
 await test('Q2 is an isolation control with no paid Work, and cannot use Q1 credentials',async()=>{
  await assert.rejects(f.q2().reserveWork({bindingId:'q2-w1',requestSha256:h('8'),ceilingMicrousd:100000}),/QDEV_NO_PAID_WORK/);
  await assert.rejects(f.raw('Q2',f.t1,{mode:'status'}),/QDEV_DENIED/);
  assert.equal((await f.q2().status()).paidWorksAllowed,0);
  assert.equal((await f.db.query("SELECT count(*)::int n FROM qdev_work WHERE owner_id=$1",[f.policy.Q2.ownerId])).rows[0].n,0);
 });
 await test('a wrong project parent or source tuple is refused before any charge',async()=>{
  const otherSource=qualificationBinding({...projectInput,sources:{...sources,factory:'e'.repeat(40)}});
  await assert.rejects(f.acct('Q1',f.t1,otherSource).reserveWork({bindingId:'w1',requestSha256:h('8'),ceilingMicrousd:1300000}),/QDEV_PARENT_BINDING_MISMATCH/);
  const otherProfile=qualificationBinding({...projectInput,operatingProfileSha256:h('9')});
  await assert.rejects(f.acct('Q1',f.t1,otherProfile).reserveWork({bindingId:'w1',requestSha256:h('8'),ceilingMicrousd:1300000}),/QDEV_PARENT_BINDING_MISMATCH/);
  assert.equal((await f.db.query('SELECT count(*)::int n FROM qdev_work')).rows[0].n,0);
 });
 await test('placeholder identities and non-baseline repositories cannot even be hashed',()=>{
  assert.throws(()=>qualificationBinding({...projectInput,sources:{...sources,myeve:'0'.repeat(40)}}));
  assert.throws(()=>qualificationBinding({...projectInput,operatingProfileSha256:'0'.repeat(64)}));
  assert.throws(()=>qualificationBinding({...projectInput,inputCommit:'f'.repeat(40)}));
  assert.throws(()=>qualificationBinding({...projectInput,outputBranch:'main'}));
  assert.throws(()=>qualificationBinding({...projectInput,repository:'jaydubya818/MyEveBot'}));
 });
 let w1;
 await test('Work 1 reserves the full ceiling once; the same binding is idempotent and cannot change',async()=>{
  w1=await reserve(f,'w1');
  assert.equal(w1.ordinal,1);assert.equal(w1.state,'RESERVED');
  assert.deepEqual(await reserve(f,'w1'),w1);
  await assert.rejects(f.q1().reserveWork({bindingId:'w1',requestSha256:h('a'),ceilingMicrousd:1300000}),/QDEV_BINDING_CHANGED/);
  await assert.rejects(reserve(f,'w1-big',1300001),/QDEV_WORK_CEILING_EXCEEDED/);
  assert.equal((await f.db.query('SELECT count(*)::int n FROM qdev_work')).rows[0].n,1);
 });
 await test('concurrency one: Work 2 is fenced until Work 1 is bound and every operation is accounted',async()=>{
  await assert.rejects(reserve(f,'w2'),/QDEV_FENCED/);
  const allowance=randomUUID();
  await assert.rejects(f.q1().dispatch(w1,allowance,op('sofie'),'SOFIE',100000),/QDEV_DENIED/);
  w1=await f.q1().bind(w1,allowance);
  await assert.rejects(reserve(f,'w2'),/QDEV_FENCED/);
  await f.q1().dispatch(w1,allowance,op('sofie'),'SOFIE',200000);
  await assert.rejects(reserve(f,'w2'),/QDEV_FENCED/);
 });
 await test('operations are sequential, bounded by the Work ceiling and idempotent',async()=>{
  const a=w1.local_allowance_id;
  await assert.rejects(f.q1().dispatch(w1,a,op('coding'),'CODING',500000),/QDEV_FENCED/);
  await f.q1().running(w1,a,op('sofie'));
  await f.q1().dispatch(w1,a,op('sofie'),'SOFIE',200000);
  await assert.rejects(f.q1().dispatch(w1,a,op('sofie'),'SOFIE',200001),/QDEV_BINDING_CHANGED/);
  await f.q1().settle(w1,a,op('sofie'));
  await f.q1().dispatch(w1,a,op('coding'),'CODING',900000);
  await f.q1().settle(w1,a,op('coding'));
  await assert.rejects(f.q1().dispatch(w1,a,op('factory'),'FACTORY',300000),/QDEV_WORK_CEILING_EXCEEDED/);
  await f.q1().dispatch(w1,a,op('factory'),'FACTORY',200000);
  await f.q1().settle(w1,a,op('factory'));
  assert.equal((await f.db.query('SELECT count(*)::int n FROM qdev_dispatch')).rows[0].n,3);
 });
 await test('a dispatch on a foreign project digest is refused and Q2 cannot touch Q1 Work',async()=>{
  const bad=qualificationBinding({...projectInput,factoryVersionSha256:h('9')});
  await assert.rejects(f.acct('Q1',f.t1,bad).dispatch(w1,w1.local_allowance_id,op('verifier'),'VERIFIER',100000),/QDEV_PARENT_BINDING_MISMATCH/);
  for(const m of ['assert','fence','settle','hold','running','cancel_unsent'])
   await assert.rejects(f.raw('Q2',f.t2,{mode:m,id:w1.id,allowanceId:w1.local_allowance_id,operationSha256:hash(op('sofie'))}),/QDEV_DENIED/,m);
  assert.equal((await f.db.query("SELECT state FROM qdev_work WHERE id=$1",[w1.id])).rows[0].state,'BOUND');
 });
 await test('Works 2-4 follow in strict sequence; the fifth Work and any cap overflow are refused',async()=>{
  for(const n of [2,3,4]){
   const w=await reserve(f,'w'+n);
   assert.equal(w.ordinal,n);const a=randomUUID();const bound=await f.q1().bind(w,a);
   await f.q1().dispatch(bound,a,op('c'+n),'CODING',100000);await f.q1().settle(bound,a,op('c'+n));
  }
  assert.equal((await f.db.query('SELECT sum(ceiling_microusd)::text s FROM qdev_work')).rows[0].s,'5200000');
  await assert.rejects(reserve(f,'w5',1),/QDEV_EXHAUSTED/);
  assert.equal((await f.q1().status()).ownWorks,4);
 });
 await test('history is immutable and the legacy tester ledgers are unchanged by the qualification flow',async()=>{
  await assert.rejects(f.db.query("UPDATE qdev_dispatch SET state='RUNNING' WHERE state='SETTLED'"),/QDEV_HISTORY_IMMUTABLE/);
  await assert.rejects(f.db.query('DELETE FROM qdev_work'),/QDEV_HISTORY_IMMUTABLE/);
  await assert.rejects(f.db.query("UPDATE qdev_work SET ceiling_microusd=1"),/QDEV_HISTORY_IMMUTABLE/);
  await assert.rejects(f.db.query("UPDATE qdev_member SET paid_works=0"),/QDEV_HISTORY_IMMUTABLE/);
  await assert.rejects(f.db.query("UPDATE qdev_charter SET journey_ceiling_microusd=1"),/QDEV_HISTORY_IMMUTABLE/);
  assert.equal(await legacy(),legacyBefore);
 });
 await test('a lost acknowledgment (reserved, never bound) stays charged and fences the cohort without replacement',async()=>{
  const u=await fixture('lost');await u.activate();
  const w=await reserve(u,'lost');
  await assert.rejects(reserve(u,'replacement'),/QDEV_FENCED/);
  assert.equal((await u.db.query('SELECT sum(ceiling_microusd)::text s FROM qdev_work')).rows[0].s,'1300000');
  assert.equal(w.state,'RESERVED');
 });
 await test('UNKNOWN exposure fences all further reservation and dispatch and cannot be reverted',async()=>{
  const x=await fixture('unknown');await x.activate();
  const w=await reserve(x,'w1');const a=randomUUID();const b=await x.q1().bind(w,a);
  await x.q1().dispatch(b,a,op('sofie'),'SOFIE',100000);
  await x.q1().fence(b);
  assert.equal((await x.q1().status()).state,'paused');
  await assert.rejects(x.q1().dispatch(b,a,op('coding'),'CODING',100000),/QDEV_FENCED/);
  await assert.rejects(reserve(x,'w2'),/QDEV_FENCED/);
  await assert.rejects(x.q1().settle(b,a,op('sofie')),/QDEV_DENIED/);
  await assert.rejects(x.db.query("UPDATE qdev_work SET state='BOUND'"),/QDEV_HISTORY_IMMUTABLE/);
  assert.equal((await x.db.query("SELECT state FROM qdev_dispatch")).rows[0].state,'UNKNOWN');
 });
 await test('a no-send tombstone keeps the charge, blocks the operation and never refunds',async()=>{
  const x=await fixture('nosend');await x.activate();
  const w=await reserve(x,'w1');const a=randomUUID();const b=await x.q1().bind(w,a);
  await x.q1().dispatch(b,a,op('sofie'),'SOFIE',100000);
  await x.q1().cancelUnsent(b,a,op('sofie'));
  await assert.rejects(x.q1().dispatch(b,a,op('sofie'),'SOFIE',100000),/QDEV_NOT_DISPATCHED/);
  assert.equal((await x.db.query('SELECT sum(ceiling_microusd)::text s FROM qdev_work')).rows[0].s,'1300000');
 });
 await test('the aggregate journey ceiling is atomic across Works',async()=>{
  const x=await fixture('cap',{journey:2000000});await x.activate();
  const w=await reserve(x,'w1');
  const a=randomUUID();const b=await x.q1().bind(w,a);await x.q1().dispatch(b,a,op('c'),'CODING',100000);await x.q1().settle(b,a,op('c'));
  await assert.rejects(reserve(x,'w2'),/QDEV_EXHAUSTED/);
  const w2=await reserve(x,'w2-small',700000);
  assert.equal(w2.ordinal,2);
  await assert.rejects(reserve(x,'w3',1),/QDEV_FENCED|QDEV_EXHAUSTED/);
 });
 await test('concurrent reservations serialize: exactly one wins and the loser is refused',async()=>{
  const x=await fixture('race');await x.activate();
  const peer=await connect(x.name,x.role);
  const other=new QualificationAccounting({query:async(q,p)=>(await peer.query(q,p)).rows},x.t1,x.policy.Q1,binding);
  const results=await Promise.allSettled([reserve(x,'a'),other.reserveWork({bindingId:'b',requestSha256:h('8'),ceilingMicrousd:1300000})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.match(String(results.find(r=>r.status==='rejected').reason.message),/QDEV_FENCED/);
  assert.equal((await x.db.query('SELECT count(*)::int n FROM qdev_work')).rows[0].n,1);
 });
 await test('revocation and expiry deny new effects but still allow proven settlement',async()=>{
  const x=await fixture('expiry',{validSeconds:3});await x.activate();
  const w=await reserve(x,'w1');const a=randomUUID();const b=await x.q1().bind(w,a);await x.q1().dispatch(b,a,op('sofie'),'SOFIE',100000);
  await new Promise(r=>setTimeout(r,3500));
  assert.equal((await x.q1().status()).state,'expired');
  await assert.rejects(x.q1().dispatch(b,a,op('coding'),'CODING',100000),/QDEV_FENCED/);
  await assert.rejects(reserve(x,'w2'),/QDEV_FENCED/);
  await assert.rejects(x.q1().running(b,a,op('sofie')),/QDEV_FENCED/);
  await x.q1().settle(b,a,op('sofie'));
  const y=await fixture('revoke');await y.activate();
  await y.db.query('UPDATE qdev_charter SET revoked_at=clock_timestamp() WHERE id=$1',[y.cohort]);
  assert.equal((await y.q1().status()).state,'revoked');
  await assert.rejects(reserve(y,'w1'),/QDEV_FENCED/);
 });
 await test('charter bounds cannot exceed the approved design baseline even if an operator tries',async()=>{
  for(const [i,[journey,perWork,maxWorks]] of [[5200001,1300000,4],[5200000,1300001,4],[5200000,1300000,5]].entries())
   await assert.rejects(fixture('bad'+i,{journey,perWork,maxWorks}),/violates check constraint/);
 });
 await test('the read-only preparation audit covers the qualification schema and rejects unsafe states',async()=>{
  const e=await fixture('audit',{history:true,enroll:false});
  const result=await inspect(e.db);
  const row=result.find(item=>item.rows?.[0]?.status)?.rows[0];
  assert.equal(row.status,'PREPARATION_OBSERVATION_ONLY_EXECUTION_NOT_AUTHORIZED');
  const body=(await e.db.query("SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') h FROM pg_proc WHERE proname='qdev_cohort_call'")).rows[0].h;
  assert.equal(row.qualification_function_body_sha256,body);
  await e.db.query('GRANT SELECT ON qdev_work TO PUBLIC');
  try{await assert.rejects(inspect(e.db),/QDEV_PUBLIC_TABLE_ACCESS_FORBIDDEN/);}finally{await e.db.query('REVOKE SELECT ON qdev_work FROM PUBLIC');}
  await e.db.query('GRANT EXECUTE ON FUNCTION qdev_cohort_call(jsonb) TO PUBLIC');
  try{await assert.rejects(inspect(e.db),/QDEV_PUBLIC_FUNCTION_EXECUTE_FORBIDDEN/);}finally{await e.db.query('REVOKE EXECUTE ON FUNCTION qdev_cohort_call(jsonb) FROM PUBLIC');}
  await inspect(e.db);
  await e.db.query('INSERT INTO qdev_charter(id,proposal_id,charter_sha256,funding_sha256,hold_disposition_sha256,price_revision_sha256,journey_ceiling_microusd,max_works,per_work_ceiling_microusd,concurrency,valid_until) VALUES($1,$2,$3,$3,$3,$3,1,1,1,1,clock_timestamp()+interval \'1 hour\')',[randomUUID(),'qdev-20261029-01',h('4')]);
  await assert.rejects(inspect(e.db),/QDEV_PRE_ENROLLMENT_DATABASE_NOT_EMPTY/);
  const g=await fixture('audit2',{history:true,enroll:false});
  await g.db.query('DROP TABLE qdev_dispatch');
  await assert.rejects(inspect(g.db),/QDEV_QUALIFICATION_SCHEMA_INCOMPLETE/);
 });
 await test('errors never expose the credential',async()=>{
  const x=await fixture('leak');await x.activate();
  const err=await x.acct('Q1',x.t1,qualificationBinding({...projectInput,factoryVersionSha256:h('9')})).reserveWork({bindingId:'z',requestSha256:h('8'),ceilingMicrousd:5}).then(()=>null,e=>e);
  assert(err&&!String(err.message).includes(x.t1)&&!String(err.message).includes(hash(x.t1)));
 });
}finally{
 await Promise.all(clients.map(c=>c.end().catch(()=>{})));
 for(const name of names)await admin.query('DROP DATABASE IF EXISTS '+name+' WITH (FORCE)');
 for(const role of roles)await admin.query('DROP ROLE IF EXISTS '+role);
 await admin.end();
}
