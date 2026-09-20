import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { Client } from 'pg';
import { loadMigrations, runMigrations, RECONCILIATION, SATISFIED_MIGRATION, VERIFY_ACTION_BINDING } from '../scripts/migration-runner.ts';
import { ActionGateway, consumeActionAuthority } from '../lib/action-gateway.ts';
import { approvalBinding, approvalRequestId } from '../lib/approvals.ts';
import { routineConfigurationSchema } from '../lib/execution-types.ts';
import { admissionFixture } from './admission-fixtures.mjs';
import { ROUTINE_RELEASE } from '../lib/routine-release.ts';

// Dedicated loopback cluster only. Never loads .env or accepts DATABASE_URL.
const connection = { host:'127.0.0.1',port:55441,user:process.env.USER };
const admin = new Client({...connection,database:'postgres'});
await admin.connect();
const created = [], clients = [];
const migrations = await loadMigrations();
const digest = value => createHash('sha256').update(value).digest('hex');
const adapter = client => ({
  query: async (sql,params) => (await client.query(sql,params)).rows,
  transaction: async statements => {
    await client.query('BEGIN');
    try { for(const s of statements) await client.query(s.sql,s.params); await client.query('COMMIT'); }
    catch(e) {await client.query('ROLLBACK'); throw e;}
  },
});
const quiet = () => {};
const stamp=Date.now();
async function database(label) {
  const name=`lineage_${label}_${stamp}`;
  await admin.query(`CREATE DATABASE ${name}`); created.push(name);
  const client=new Client({...connection,database:name}); await client.connect();clients.push(client);
  return {name,client,db:adapter(client)};
}
const target={account:'owner',provider:'fixture',resource:'self'};
function action(id,computer) {return {ownerId:'owner',runId:'run',actionKey:id,capabilityId:'tool.send_email',actionClass:'send',executor:{kind:'primary-agent',agentId:'ava'},trigger:{kind:'owner_chat'},parameters:{text:'synthetic only',recipient:'owner@example.invalid'},...(computer?{computer:{sessionId:'stale-computer',controlVersion:1}}:{})};}
function binding(a) {return approvalBinding({taskId:a.runId,capabilityId:a.capabilityId,resource:JSON.stringify(target),action:a.actionClass,parameters:{payload:a.parameters,target,executor:a.executor,trigger:a.trigger,computer:a.computer??null}});}
async function seedBefore20(c) {
  await c.query(`INSERT INTO agents(id,owner_id,slug,name,role,instructions,is_primary,status,max_steps,max_runtime_seconds,max_estimated_cost_usd)
    VALUES('ava','owner','ava','Ava','Research','Synthetic',true,'active',30,600,1),('other','sarah','other','Sofie','Research','Synthetic',true,'active',30,600,1)`);
  await c.query(`INSERT INTO web_chat_threads(id,title,updated_at,owner_id,agent_id) VALUES('thread','Synthetic',0,'owner','ava'),('other-thread','Synthetic',0,'sarah','other')`);
  await c.query(`INSERT INTO goals(id,owner_id,title) VALUES('goal','owner','Synthetic goal')`);
  await c.query(`INSERT INTO knowledge_sources(id,owner_id,source_type) VALUES('source','owner','manual')`);
  await c.query(`INSERT INTO knowledge_records(id,owner_id,kind,statement,status,created_by_type) VALUES('knowledge','owner','fact','Synthetic fact','active','owner')`);
  await c.query(`INSERT INTO task_runs(id,owner_id,kind,title,agent_id,status,max_duration_seconds,max_specialists,max_model_steps,max_retries_per_specialist,max_estimated_cost_usd) VALUES('run','owner','delegated_work','Synthetic','ava','running',600,0,30,0,1)`);
  for(const [id,decision,age] of [['approved','approved',0],['rejected','denied',0],['expired','approved',48],['pending',null,0]])
    await c.query(`INSERT INTO task_approval_decisions(id,task_id,requested_by,prompt,decision,requested_at) VALUES($1,'run','ava','Synthetic',$2,now()-($3*interval '1 hour'))`,[id,decision,age]);
  await c.query(`INSERT INTO computer_sessions(id,owner_id,agent_id,run_id,runtime_session_id,status,expires_at) VALUES('stale-computer','owner','ava','run','synthetic-runtime','ready',now()-interval '1 day')`);
  await c.query(`INSERT INTO persistent_browser_profiles(id,owner_id,agent_id) VALUES('profile','owner','ava')`);
  await c.query(`INSERT INTO persistent_browser_profile_grants(id,owner_id,profile_id,agent_id) VALUES('profile-grant','owner','profile','ava')`);
  await c.query(`INSERT INTO reminders(prompt,cron,timezone,next_fire_at,routine_name) VALUES('Synthetic review','0 9 * * *','UTC',now(),'Daily Brief')`);
}
async function seedAfter(c,feature) {
  const config=routineConfigurationSchema.parse({instructions:'Synthetic review',authority:{allowedCapabilities:['tool.list_goals']}});
  await c.query(`INSERT INTO execution_routines(id,owner_id,source_kind,source_id,name,agent_id,status,configuration) VALUES('routine','owner','reminder','1','Daily Brief','ava','disabled',$1)`,[JSON.stringify(config)]);
  await c.query(`INSERT INTO execution_routine_versions(owner_id,routine_id,version,configuration,changed_by) VALUES('owner','routine',1,$1,'owner')`,[JSON.stringify(config)]);
  await c.query(`UPDATE reminders SET execution_routine_id='routine' WHERE id=1`);
  await c.query(`INSERT INTO myeve_relay_grants(id,owner_id,document) VALUES('grant','owner','{"capability":"knowledge.query","synthetic":true}')`);
  for(const id of ['approved','rejected','expired','pending']) {
    const a=action(id);
    await c.query(`INSERT INTO action_requests(id,owner_id,run_id,action_key,executor,trigger,capability_id,action_class,target,parameter_hash,decision,authority_source,approval_id,status) VALUES($1,'owner','run',$1,'{}','{}','tool.send_email','send','{}',$2,'REQUIRE_APPROVAL','local',$1,'awaiting_approval')`,[id,binding(a)+id]);
  }
  // Each historical Action has its own binding; install its exact replay binding only during a rolled-back test.
  await c.query(`UPDATE action_requests SET status='result_unknown',provider_receipt='{"messageId":"synthetic-receipt"}',attempt_count=1,approval_generation=7 WHERE id='expired'`);
  await c.query(`INSERT INTO routine_pending_sends(owner_id,run_id,action_id,request) VALUES('owner','run','pending','{"text":"preserved synthetic draft"}')`);
  const files=[['legacy','thread',feature?'web:owner':null],['owned','thread','owner'],['other-legacy','other-thread',feature?'web:owner':null],['other-owned','other-thread','sarah']];
  for(const [id,thread,owner] of files) await c.query(`INSERT INTO chat_files(id,thread_id,filename,media_type,size_bytes,blob_url,blob_path,owner_id) VALUES($1,$2,'synthetic.txt','text/plain',1,'https://blob.invalid/synthetic','synthetic',$3)`,[id,thread,owner]);
}
async function build(origin,label) {
  const d=await database(label);
  await d.client.query(`CREATE TABLE sofie_schema_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())`);
  const ref=origin==='feature'?'396631afa4739e5ca8ac0c5c81781f82f3160403':'88370d0662c7824445b59779a8b8e8b21abfa10b';
  const names=execFileSync('git',['ls-tree','--name-only',`${ref}:apps/eve/migrations`],{encoding:'utf8'}).trim().split('\n').filter(n=>n.endsWith('.sql'));
  for(const name of names) {
    const source=execFileSync('git',['show',`${ref}:apps/eve/migrations/${name}`],{encoding:'utf8'});
    await d.client.query(source);
    await d.client.query('INSERT INTO sofie_schema_migrations(name,checksum) VALUES($1,$2)',[name,digest(source)]);
    if(name.startsWith('0019'))await seedBefore20(d.client);
  }
  await seedAfter(d.client,origin==='feature');
  return d;
}
const authorityTables=['agents','goals','knowledge_sources','knowledge_records','web_chat_threads','task_runs','task_approval_decisions','action_requests','computer_sessions','computer_control_leases','persistent_browser_profiles','persistent_browser_profile_grants','reminders','execution_routines','execution_routine_versions','myeve_relay_grants','routine_pending_sends'];
async function snapshot(c) {const state={};for(const table of authorityTables)state[table]=(await c.query(`SELECT * FROM ${table} ORDER BY 1`)).rows;return state;}
function dump(name) {return execFileSync('/opt/homebrew/opt/postgresql@17/bin/pg_dump',['-h','127.0.0.1','-p','55441','-U',connection.user,'--schema-only','--no-owner','--no-privileges',name],{encoding:'utf8'}).split('\n').filter(l=>!l.startsWith('\\restrict')&&!l.startsWith('\\unrestrict')).join('\n');}
async function safety(d) {
  const c=d.client;
  let calls=0;
  const requireApproval={evaluate:async()=>({decision:'REQUIRE_APPROVAL',source:'fixture',reason:'exact approval'})};
  const provider={resolveTarget:async()=>target,execute:async(p,h)=>{await consumeActionAuthority(h,p,'tool.send_email');calls++;return {};},verify:async()=>({verified:true,receipt:{}})};
  const gateway=new ActionGateway(d.db,requireApproval,async()=>{throw new Error('unexpected new approval');});
  for(const id of ['approved','rejected','expired','pending']) {
    await c.query('BEGIN');
    try {await c.query("UPDATE action_requests SET parameter_hash=$2,status='awaiting_approval' WHERE id=$1",[id,binding(action(id))]);
      await assert.rejects(gateway.execute(action(id),provider));assert.equal(calls,0,`historical ${id}`);
    } finally {await c.query('ROLLBACK');}
  }
  await c.query('BEGIN');
  try {const computerGateway=new ActionGateway(d.db,{evaluate:async()=>({decision:'ALLOW',source:'fixture',reason:'synthetic'})});await assert.rejects(computerGateway.execute(action('computer',true),provider));assert.equal(calls,0,'expired Computer has no provider authority');}finally{await c.query('ROLLBACK');}
  // Exact modern approval baseline plus independently corrupted authority fields.
  for(const fault of ['none','owner','run','class','capability','decision','binding','generation','expiry','status','current-authority','handle-revocation']) {
    await c.query('BEGIN');
    try {
      const a=action('matrix-'+fault); a.parameters.text=fault;
      const hash=binding(a), id='matrix-'+fault;
      const approval=approvalRequestId({ownerId:'owner',taskId:'run',requestKey:`${id}:0:0`});
      await c.query(`INSERT INTO task_approval_decisions(id,task_id,owner_id,requested_by,prompt,action,action_class,capability_id,agent_id,binding_hash,risk,expires_at,status,decision)
        VALUES($1,'run','owner','ava','Synthetic','send','send','tool.send_email','ava',$2,'high',now()+interval '1 hour','approved','approved')`,[approval,hash]);
      await c.query(`INSERT INTO action_requests(id,owner_id,run_id,action_key,executor,trigger,capability_id,action_class,target,parameter_hash,decision,authority_source,approval_id,status)
        VALUES($1,'owner','run',$1,'{}','{}','tool.send_email','send','{}',$2,'REQUIRE_APPROVAL','local',$3,'awaiting_approval')`,[id,hash,approval]);
      const changes={owner:"owner_id='sarah'",run:"task_id='other-run'",class:"action_class='write'",capability:"capability_id='files.write'",decision:"decision='denied'",binding:"binding_hash='legacy:synthetic'",expiry:"expires_at=now()-interval '1 day'",status:"status='pending'"};
      if(fault==='run')await c.query(`INSERT INTO task_runs SELECT (jsonb_populate_record(NULL::task_runs,to_jsonb(r)||'{"id":"other-run"}'::jsonb)).* FROM task_runs r WHERE id='run'`);
      if(changes[fault])await c.query(`UPDATE task_approval_decisions SET ${changes[fault]} WHERE id=$1`,[approval]);
      if(fault==='generation')await c.query('UPDATE action_requests SET approval_generation=1 WHERE id=$1',[id]);
      const deny={evaluate:async()=>({decision:'DENY',source:'fixture',reason:'revoked'})};
      const g=new ActionGateway(d.db,fault==='current-authority'?deny:requireApproval,async()=>{throw new Error('fresh approval required');});
      const before=calls;
      const transport={...provider,execute:async(p,h)=>{
        if(fault==='handle-revocation')await c.query("UPDATE task_approval_decisions SET decision='denied' WHERE id=$1",[approval]);
        return provider.execute(p,h);
      }};
      if(fault==='none') {await g.execute(a,transport);assert.equal(calls,before+1,'valid current exact approval executes the synthetic adapter');}
      else {await assert.rejects(g.execute(a,transport));assert.equal(calls,before,`approval ${fault} denied before provider`);}
    } finally {await c.query('ROLLBACK');}
  }
  const readiness=await admissionFixture(d.db,{executionEnabled:()=>false}).inspect('owner','routine');
  assert.equal(readiness.canRun,false);assert.ok(['NEEDS_APPROVAL','DISABLED'].includes(readiness.state),readiness.state);
  assert.equal(ROUTINE_RELEASE.enabled,false);
  assert.equal((await c.query('SELECT reviewed_version FROM reminders')).rows[0].reviewed_version,null);
  assert.equal(calls,1,"only the valid synthetic baseline executed");
}
try {
  const a=await build('canonical','a'),b=await build('feature','b');
  const beforeA=dump(a.name),beforeB=dump(b.name);
  const canonicalWithoutDifference=beforeA.replace(/CREATE TABLE public.chat_files \([\s\S]*?\n\);/, table=>table.replace('owner_id text,',"owner_id text DEFAULT 'web:owner'::text NOT NULL,"));
  assert.equal(digest(canonicalWithoutDifference),digest(beforeB),'entire starting DDL differs only in chat_files.owner_id');
  const stateA=await snapshot(a.client),stateB=await snapshot(b.client);
  const ledgerB=(await b.client.query('SELECT * FROM sofie_schema_migrations ORDER BY name')).rows;
  await runMigrations(a.db,migrations,quiet);await runMigrations(b.db,migrations,quiet);
  assert.equal(digest(dump(a.name)),digest(dump(b.name)),'all table/column/default/index/constraint/FK/trigger/sequence/function DDL converges');
  assert.deepEqual(await snapshot(a.client),stateA,'canonical authority/data unchanged');
  assert.deepEqual(await snapshot(b.client),stateB,'feature authority/data unchanged');
  assert.deepEqual((await b.client.query("SELECT * FROM sofie_schema_migrations WHERE name<'0030' ORDER BY name")).rows,ledgerB,'historical ledger byte values/timestamps unchanged');
  const fileQuery='SELECT id,owner_id FROM chat_files ORDER BY id';
  assert.deepEqual((await a.client.query(fileQuery)).rows,(await b.client.query(fileQuery)).rows);
  assert.deepEqual((await b.client.query("SELECT id FROM chat_files WHERE owner_id='owner' ORDER BY id")).rows,[{id:'legacy'},{id:'owned'}]);
  assert.deepEqual((await b.client.query("SELECT id FROM chat_files WHERE owner_id='sarah' ORDER BY id")).rows,[{id:'other-legacy'},{id:'other-owned'}]);
  assert.equal((await b.client.query('SELECT count(*) FROM sofie_file_owner_reconciliations')).rows[0].count,'2');
  await b.client.query(`INSERT INTO chat_files(id,thread_id,filename,media_type,size_bytes,blob_url,blob_path) VALUES('omitted','thread','synthetic','text/plain',0,'synthetic','synthetic')`);
  assert.equal((await b.client.query("SELECT owner_id FROM chat_files WHERE id='omitted'")).rows[0].owner_id,null,'new omitted owners never inherit web:owner');
  await b.client.query("DELETE FROM chat_files WHERE id='omitted'");
  await safety(a);await safety(b);
  const stable=(await b.client.query('SELECT * FROM sofie_migration_reconciliations')).rows;
  await runMigrations(a.db,migrations,quiet);await runMigrations(b.db,migrations,quiet);
  assert.deepEqual((await b.client.query('SELECT * FROM sofie_migration_reconciliations')).rows,stable);
  // Runner fixture only; no real 0032 file or production numbering change.
  const future={name:'0032_qualification_fixture.sql',checksum:digest('qualification only'),statements:['CREATE TABLE qualification_future(id integer PRIMARY KEY)']};
  await runMigrations(a.db,[...migrations,future],quiet);await runMigrations(b.db,[...migrations,future],quiet);
  await runMigrations(b.db,[...migrations,future],quiet);
  assert.equal(digest(dump(a.name)),digest(dump(b.name)),'next canonical migration converges');
  await b.client.query("UPDATE sofie_schema_migrations SET checksum='unknown' WHERE name LIKE '0017%'");
  await assert.rejects(runMigrations(b.db,[...migrations,future],quiet),/Unknown/);
  await b.client.query('UPDATE sofie_schema_migrations SET checksum=$1 WHERE name=$2',[ledgerB.find(r=>r.name.startsWith('0017')).checksum,ledgerB.find(r=>r.name.startsWith('0017')).name]);
  await b.client.query("DELETE FROM sofie_schema_migrations WHERE name=$1",[RECONCILIATION]);
  await assert.rejects(runMigrations(b.db,[...migrations,future],quiet),/Partial/);
  const ambiguous=await build('feature','ambiguous');
  await ambiguous.client.query("UPDATE chat_files SET thread_id='missing-thread' WHERE id='legacy'");
  const ambiguousBefore=dump(ambiguous.name),ambiguousData=await snapshot(ambiguous.client);
  await assert.rejects(runMigrations(ambiguous.db,migrations,quiet),/Ambiguous/);
  assert.equal(digest(dump(ambiguous.name)),digest(ambiguousBefore),'ambiguous migration rolls back all DDL');
  assert.deepEqual(await snapshot(ambiguous.client),ambiguousData);
  await ambiguous.client.query("UPDATE chat_files SET thread_id='thread' WHERE id='legacy'");
  await ambiguous.client.query("UPDATE chat_files SET owner_id='sarah' WHERE id='owned'");
  await assert.rejects(runMigrations(ambiguous.db,migrations,quiet),/Conflicting/);
  await ambiguous.client.query("UPDATE chat_files SET owner_id='owner' WHERE id='owned'");
  // Same index name but wrong semantics must fail; restore and retry afterward.
  await ambiguous.client.query('DROP INDEX action_requests_live_binding');
  await ambiguous.client.query('CREATE INDEX action_requests_live_binding ON action_requests(owner_id,run_id,parameter_hash)');
  await assert.rejects(runMigrations(ambiguous.db,migrations,quiet),/not canonical/);
  await ambiguous.client.query('DROP INDEX action_requests_live_binding');
  const indexSql=migrations.find(m=>m.name===SATISFIED_MIGRATION).statements[1];
  await ambiguous.client.query(indexSql);
  await runMigrations(ambiguous.db,migrations,quiet);
  // Canonical old runner may have set NOT NULL; 0031 must still converge.
  const canonicalNotNull=await build('canonical','notnull');
  await canonicalNotNull.client.query("UPDATE chat_files f SET owner_id=t.owner_id FROM web_chat_threads t WHERE t.id=f.thread_id AND f.owner_id IS NULL");
  await canonicalNotNull.client.query('ALTER TABLE chat_files ALTER COLUMN owner_id SET NOT NULL');
  await runMigrations(canonicalNotNull.db,migrations,quiet);
  await canonicalNotNull.client.query(VERIFY_ACTION_BINDING);
  await canonicalNotNull.client.query("ALTER TABLE chat_files ALTER COLUMN owner_id SET DEFAULT 'web:owner'");
  await assert.rejects(runMigrations(canonicalNotNull.db,migrations,quiet),/drifted/);
  await canonicalNotNull.client.query('ALTER TABLE chat_files ALTER COLUMN owner_id DROP DEFAULT');
  await canonicalNotNull.client.query('ALTER TABLE action_requests ALTER COLUMN approval_generation SET DEFAULT 1');
  await assert.rejects(runMigrations(canonicalNotNull.db,migrations,quiet),/not canonical/);
  await canonicalNotNull.client.query('ALTER TABLE action_requests ALTER COLUMN approval_generation SET DEFAULT 0');
  await runMigrations(canonicalNotNull.db,migrations,quiet);
  const fresh=await database('fresh');
  await runMigrations(fresh.db,migrations,quiet);await runMigrations(fresh.db,migrations,quiet);
  assert.equal(digest(dump(fresh.name)),digest(dump(ambiguous.name)),'fresh canonical migration command produces the same schema');
  const output=process.env.LINEAGE_EVIDENCE_DIR;
  if(output){await mkdir(output,{recursive:true});await writeFile(`${output}/canonical-before.sql`,beforeA);await writeFile(`${output}/deployed-before.sql`,beforeB);await writeFile(`${output}/converged.sql`,dump(ambiguous.name));}
  console.log('PASS: two exact origins; full pg_dump structural comparison; 17 preserved state groups; thread-proven owner visibility; ambiguous rollback; historical approval/expired Computer denial; legacy Routine blocked; original ledger preserved; rerun; future migration; unknown/partial ledger and wrong-index denial. External provider calls: 0; one synthetic positive control per origin.');
} finally {
  for(const c of clients)await c.end();
  for(const name of created)await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
  await admin.end();
}
