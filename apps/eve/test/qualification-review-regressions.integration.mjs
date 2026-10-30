/** Public PostgreSQL component fixtures only. Synthetic owners, credentials and digests; no real cohort, model or spend.
 * Run: MYEVE_ISOLATED_COHORT_TEST_DATABASE=postgres://postgres@127.0.0.1:PORT/postgres node --import tsx --test apps/eve/test/qualification-review-regressions.integration.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes, randomUUID, createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Client} from 'pg';
import {digest} from '../lib/engineering/contract.ts';
import {QualificationGate,ProviderNotSent} from '../lib/qualification/gate.ts';
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
/** Regressions for the independent review of 12ea9722 (QDEV-01..03), reproduced against the superseded implementation. */
const ready=async(x,id='w1')=>{await x.activate();const w=await reserve(x,id);const a=randomUUID();return {w:await x.q1().bind(w,a),a};};
const second=async x=>{const rt=await connect(x.name,x.role);return {rt,acct:(b=binding)=>new QualificationAccounting({query:async(q,p)=>(await rt.query(q,p)).rows},x.t1,x.policy.Q1,b)};};
const snap=async x=>JSON.stringify([(await x.db.query('SELECT state,operation_sha256 FROM qdev_dispatch ORDER BY operation_sha256')).rows,(await x.db.query('SELECT state,ordinal FROM qdev_work ORDER BY ordinal')).rows]);
try{
 await test('QDEV-01: a predecessor Work is closed on successor admission and can never dispatch or authorize again',async()=>{
  const x=await fixture('r1');const {w,a}=await ready(x);
  await x.q1().dispatch(w,a,op('s'),'SOFIE',100000);await x.q1().running(w,a,op('s'));await x.q1().settle(w,a,op('s'));
  const w2=await reserve(x,'w2');
  assert.equal((await x.db.query('SELECT state FROM qdev_work WHERE id=$1',[w.id])).rows[0].state,'CLOSED');
  const a2=randomUUID();const b2=await x.q1().bind(w2,a2);
  await x.q1().dispatch(b2,a2,op('c'),'CODING',100000);await x.q1().running(b2,a2,op('c'));
  await assert.rejects(x.q1().dispatch(w,a,op('late'),'CODING',100000),/QDEV_FENCED|QDEV_DENIED/);
  await x.q1().settle(b2,a2,op('c'));
  await assert.rejects(x.q1().dispatch(w,a,op('late'),'CODING',100000),/QDEV_DENIED/);
  await assert.rejects(x.q1().assertBound(w,a),/QDEV_DENIED/);
  assert.equal((await x.db.query("SELECT count(*)::int n FROM qdev_dispatch WHERE operation_sha256=$1",[digest(op('late'))])).rows[0].n,0);
 });
 await test('QDEV-01: competing sessions can never leave two Works dispatching',async()=>{
  for(const i of [1,2,3]){
   const x=await fixture('r1c'+i);const {w,a}=await ready(x);const s2=await second(x);
   await x.q1().dispatch(w,a,op('s'),'SOFIE',100000);await x.q1().running(w,a,op('s'));await x.q1().settle(w,a,op('s'));
   const results=await Promise.allSettled([x.q1().reserveWork({bindingId:'w2',requestSha256:h('8'),ceilingMicrousd:1300000}),s2.acct().dispatch(w,a,op('late'),'CODING',100000)]);
   const active=(await x.db.query("SELECT count(DISTINCT work_id)::int n FROM qdev_dispatch WHERE state IN('DISPATCHED','RUNNING')")).rows[0].n;
   assert(active<=1,'two Works active');
   const w2=(await x.db.query('SELECT count(*)::int n FROM qdev_work')).rows[0].n;
   assert(!(w2===2&&results[1].status==='fulfilled'),'successor admitted while predecessor dispatched');
  }
 });
 await test('QDEV-02: a repeated, concurrent or post-settlement dispatch never returns send permission again',async()=>{
  const x=await fixture('r2');const {w,a}=await ready(x);const s2=await second(x);
  const first=await x.q1().dispatch(w,a,op('once'),'SOFIE',100000);assert.equal(first.claim,'NEW');
  await x.q1().running(w,a,op('once'));await x.q1().settle(w,a,op('once'));
  const before=await snap(x);
  await assert.rejects(x.q1().dispatch(w,a,op('once'),'SOFIE',100000),/QDEV_ALREADY_CLAIMED/);
  assert.equal(await snap(x),before);
  const y=await fixture('r2c');const r=await ready(y);const s3=await second(y);
  const out=await Promise.allSettled([y.q1().dispatch(r.w,r.a,op('dup'),'SOFIE',100000),s3.acct().dispatch(r.w,r.a,op('dup'),'SOFIE',100000)]);
  assert.equal(out.filter(o=>o.status==='fulfilled').length,1);
  assert.match(String(out.find(o=>o.status==='rejected').reason.message),/QDEV_FENCED|QDEV_ALREADY_CLAIMED/);
  assert.equal((await y.db.query('SELECT count(*)::int n FROM qdev_dispatch')).rows[0].n,1);
 });
 await test('QDEV-02: commit-then-lost-response stays fenced; the gate never contacts the provider',async()=>{
  const x=await fixture('r2l');const {w,a}=await ready(x);let drop=true;
  const lossy=new QualificationAccounting({query:async(q,p)=>{const rows=(await x.rt.query(q,p)).rows;if(drop&&/dispatch/.test(String(p?.[0]))){drop=false;throw Error('socket reset');}return rows;}},x.t1,x.policy.Q1,binding);
  let sends=0;const send=async()=>{sends++;return {known:true,value:1};};
  await assert.rejects(new QualificationGate(lossy).run({admission:w,allowanceId:a,operationKey:op('lost'),purpose:'SOFIE',reserveMicrousd:100000,send}),/QDEV_UNAVAILABLE/);
  assert.equal(sends,0);
  await assert.rejects(new QualificationGate(x.q1()).run({admission:w,allowanceId:a,operationKey:op('lost'),purpose:'SOFIE',reserveMicrousd:100000,send}),/QDEV_FENCED/);
  assert.equal(sends,0);
  assert.equal((await x.q1().status()).state,'paused');
  assert.equal((await x.db.query("SELECT state FROM qdev_dispatch WHERE operation_sha256=$1",[digest(op('lost'))])).rows[0].state,'UNKNOWN');
 });
 await test('QDEV-03: every mutation verifies the exact project/source tuple, including capacity-releasing cancellation',async()=>{
  const x=await fixture('r3');const {w,a}=await ready(x);
  await x.q1().dispatch(w,a,op('big'),'CODING',1300000);
  const bad=qualificationBinding({...projectInput,operatingProfileSha256:h('9')});
  const badSource=qualificationBinding({...projectInput,factoryVersionSha256:h('9')});
  const before=await snap(x);
  const bound={id:w.id,allowanceId:a,operationSha256:digest(op('big'))};
  for(const mode of ['running','hold','settle','cancel_unsent','fence','assert','bind','dispatch'])for(const variant of ['wrong','omitted','wrong-source']){
   const tuple=variant==='wrong'?{projectSha256:bad.projectSha256}:variant==='omitted'?{projectSha256:undefined,sourceSha256:undefined}:{sourceSha256:badSource.sourceSha256};
   await assert.rejects(x.raw('Q1',x.t1,{...bound,...tuple,mode,purpose:'CODING',reserveMicrousd:1}),/QDEV_PARENT_BINDING_MISMATCH/,mode+':'+variant);
  }
  await assert.rejects(x.acct('Q1',x.t1,bad).cancelUnsent(w,a,op('big')),/QDEV_PARENT_BINDING_MISMATCH/);
  assert.equal(await snap(x),before);
  await assert.rejects(x.q1().dispatch(w,a,op('replacement'),'CODING',1300000),/QDEV_FENCED/);
  await x.q1().cancelUnsent(w,a,op('big'));
 });
 await test('QDEV-03: after revocation only exactly-bound settlement/fencing remains',async()=>{
  const x=await fixture('r3r');const {w,a}=await ready(x);
  await x.q1().dispatch(w,a,op('s'),'SOFIE',100000);await x.q1().running(w,a,op('s'));
  await x.db.query('UPDATE qdev_charter SET revoked_at=clock_timestamp()');
  const bad=qualificationBinding({...projectInput,factoryVersionSha256:h('9')});
  await assert.rejects(x.acct('Q1',x.t1,bad).settle(w,a,op('s')),/QDEV_PARENT_BINDING_MISMATCH/);
  await x.q1().settle(w,a,op('s'));
  await assert.rejects(x.q1().dispatch(w,a,op('n'),'CODING',100000),/QDEV_FENCED/);
 });
}finally{
 await Promise.all(clients.map(c=>c.end().catch(()=>{})));
 for(const name of names)await admin.query('DROP DATABASE IF EXISTS '+name+' WITH (FORCE)');
 for(const role of roles)await admin.query('DROP ROLE IF EXISTS '+role);
 await admin.end();
}
