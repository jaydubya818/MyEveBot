import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {Client} from 'pg';
import {neonConfig} from '@neondatabase/serverless';
import tool from '../agent/tools/federation_request.ts';
import {encryptSecret} from '../lib/relay/transport.ts';

// Existing loopback database supplies schema shapes only. Every test row and
// sequence is connection-local TEMP state, discarded on rollback/disconnect.
const url=new URL(process.env.FEDERATION_TEST_DATABASE_URL??'');
assert(['127.0.0.1','localhost'].includes(url.hostname));assert.equal(url.port,'55432');
const client=new Client({connectionString:url.href,ssl:false});await client.connect();
const tables=['agents','agent_capabilities','agent_runs','task_runs','task_run_sessions','task_approval_decisions','task_transitions','eve_events','action_requests','action_receipts','execution_occurrences','execution_routine_versions','execution_routines','review_deliveries','computer_control_leases','computer_sessions','myeve_relay_connections','myeve_relay_requests'];
const fetchBefore=globalThis.fetch,neonBefore=neonConfig.fetchFunction;
let sends=0,checks=0;const submitted=[];
process.env.DATABASE_URL='postgresql://fixture@approval-test.invalid/postgres';
process.env.MYEVE_RELAY_ENABLED='true';process.env.MYEVE_RELAY_ORIGIN='https://relay.example';process.env.MYEVE_RELAY_ENCRYPTION_KEY='a'.repeat(64);
const require=createRequire(import.meta.url),eveRoot=path.dirname(require.resolve('eve/package.json'));
const {resolvePendingInput}=await import(pathToFileURL(path.join(eveRoot,'dist/src/harness/input-requests.js')).href);
const principal={principalId:'approval-owner',principalType:'user',attributes:{owner:'true',myeveAgentId:'approval-agent'}};
const context=id=>({session:{id,auth:{current:principal,initiator:principal}},messages:[],channel:{},callId:id});
const input=id=>({operation:'request',request:{target:'relay://atlas/agent',resource:'synthetic-messages',capability:'message.send',idempotencyKey:`test-${id}`,expiresAt:'2099-01-01T00:00:00Z',payload:{body:'Federation approval continuation check'}}});
const decisionMessages=(id,value,answer='yes')=>{
 const call={type:'tool-call',toolName:'federation_request',toolCallId:id,input:value};
 const approval={type:'tool-approval-request',toolCallId:id,approvalId:`native-${id}`};
 const session={history:[],state:{'eve.runtime.pendingInputBatch':{requests:[{requestId:approval.approvalId,options:[{id:'approve',label:'Yes'},{id:'deny',label:'No'}],action:{kind:'tool-call',callId:id,toolName:'federation_request',input:value}}],responseMessages:[{role:'assistant',content:[call,approval]}]}}};
 const result=resolvePendingInput({session,stepInput:{message:answer}});assert.equal(result.outcome,'resolved');return result.messages;
};
const definition=ctx=>tool.events['step.started']({},ctx);
const stage=async id=>{
 const ctx=context(id),value=input(id),before=sends,def=await definition(ctx);
 assert.equal(await def.approval({...ctx,toolName:'federation_request',toolInput:value,approvedTools:new Set(['federation_request'])}),'user-approval');
 assert.equal(sends,before);const row=(await client.query('SELECT * FROM action_requests WHERE action_key=$1',[`tool:${id}`])).rows[0];
 assert.equal(row.status,'awaiting_approval');assert.equal(row.attempt_count,0);return {ctx,value,row};
};
const check=async(name,fn)=>{await fn();checks++;console.log(`PASS: ${name}`);};
try{
 await client.query('BEGIN');await client.query('SET LOCAL search_path=pg_temp');
 for(const table of tables) await client.query(`CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING ALL) ON COMMIT DROP`);
 const defaults=(await client.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY($1) AND column_default LIKE 'nextval(%'",[tables])).rows;
 for(const [index,row] of defaults.entries()) {await client.query(`CREATE TEMP SEQUENCE test_sequence_${index}`);await client.query(`ALTER TABLE ${row.table_name} ALTER COLUMN ${row.column_name} SET DEFAULT nextval('pg_temp.test_sequence_${index}')`);}
 neonConfig.fetchFunction=async(_url,options)=>{
  const body=JSON.parse(options.body);
  const query=async item=>{const result=await client.query({text:item.query,values:item.params,rowMode:'array',types:{getTypeParser:()=>v=>v}});return {fields:result.fields.map(f=>({name:f.name,dataTypeID:f.dataTypeID})),rows:result.rows,rowCount:result.rowCount,command:result.command,rowAsArray:true};};
  if(!body.queries)return Response.json(await query(body));
  const results=[];for(const item of body.queries)results.push(await query(item));return Response.json({results});
 };
 globalThis.fetch=async(url,options)=>{assert.equal(String(url),'https://relay.example/api/v2/federation');const command=JSON.parse(options.body);assert.equal(command.operation,'submit');sends++;submitted.push(command.input);return Response.json({requestId:`fixture-${sends}`,status:'QUEUED'});};
 await client.query("INSERT INTO agents(id,owner_id,slug,name,role,instructions,is_primary,status,max_steps,max_runtime_seconds,max_estimated_cost_usd) VALUES('approval-agent','approval-owner','sofie','Sofie','Test','Test',true,'active',30,900,2)");
 await client.query(`INSERT INTO myeve_relay_connections(owner_id,local_agent_id,relay_owner_id,relay_agent_id,address,issuer,signing_key_id,signing_public_key,agent_credential_encrypted,owner_session_encrypted) VALUES($1,$2,'relay-owner','relay-sofie','relay://owner/sofie','test','test','test',$3,$4)`,['approval-owner','approval-agent',encryptSecret('approval-owner','fixture-agent'),encryptSecret('approval-owner','fixture-owner')]);
 await check('exact native yes resumes original Action once with original payload',async()=>{
  const {ctx,value,row}=await stage('original');assert.equal((await client.query('SELECT count(*)::int n FROM task_approval_decisions')).rows[0].n,1);
  const resumed=await definition({...ctx,messages:decisionMessages('original',value)});
  assert.equal(await resumed.approval({...ctx,toolInput:value,toolName:'federation_request',approvedTools:new Set(['federation_request'])}),'approved');
  const first=await resumed.execute(value,ctx);assert.equal(first.response?.status,'QUEUED',JSON.stringify(first));assert.equal(sends,1);assert.deepEqual(submitted[0],value.request);
  await resumed.execute(value,ctx);assert.equal(sends,1);
  const after=(await client.query('SELECT status,attempt_count,approval_generation,approval_id FROM action_requests WHERE id=$1',[row.id])).rows[0];
  assert.equal(after.status,'completed');assert.equal(after.attempt_count,1);assert.equal(after.approval_generation,0);assert.equal(after.approval_id,row.approval_id);
 });
 await check('preparation replay cannot send or renew an expired approval',async()=>{
  const {ctx,value,row}=await stage('prepare-replay'),before=sends,def=await definition(ctx);
  await client.query("UPDATE task_approval_decisions SET expires_at=now()-interval '1 second' WHERE id=$1",[row.approval_id]);
  assert.equal(await def.approval({...ctx,toolName:'federation_request',toolInput:value,approvedTools:new Set()}),'denied');
  assert.equal(sends,before);
  assert.equal((await client.query('SELECT approval_generation FROM action_requests WHERE id=$1',[row.id])).rows[0].approval_generation,0);
  assert.equal((await client.query('SELECT count(*)::int n FROM task_approval_decisions WHERE task_id=$1',[row.run_id])).rows[0].n,1);
 });
 await check('model regeneration cannot execute or create a second Action',async()=>{
  const ctx=context('new-call'),def=await definition(ctx);const before=sends;
  assert.equal((await def.execute(input('original'),ctx)).code,'approval_continuation_expired_or_changed');assert.equal(sends,before);
  assert.equal((await client.query("SELECT count(*)::int n FROM action_requests WHERE action_key='tool:new-call'")).rows[0].n,0);
 });
 for(const condition of ['approval-expired','run-expired','generation-changed','owner-denied','content-changed','peer-changed','request-expired']) await check(`${condition} never sends or regenerates approval`,async()=>{
  const {ctx,value,row}=await stage(condition),before=sends;
  if(condition==='approval-expired')await client.query("UPDATE task_approval_decisions SET expires_at=now()-interval '1 second' WHERE id=$1",[row.approval_id]);
  if(condition==='run-expired')await client.query("UPDATE task_runs SET deadline_at=now()-interval '1 second' WHERE id=$1",[row.run_id]);
  if(condition==='generation-changed')await client.query('UPDATE action_requests SET approval_generation=1 WHERE id=$1',[row.id]);
  const changed=structuredClone(value);if(condition==='content-changed')changed.request.payload.body='changed';if(condition==='peer-changed')changed.request.target='relay://different/peer';if(condition==='request-expired')changed.request.expiresAt='2000-01-01T00:00:00Z';
  const def=await definition({...ctx,messages:decisionMessages(condition,changed,condition==='owner-denied'?'no':'yes')});
  assert.equal((await def.execute(changed,ctx)).status,'denied');assert.equal(sends,before);
  assert.equal((await client.query('SELECT count(*)::int n FROM task_approval_decisions WHERE task_id=$1',[row.run_id])).rows[0].n,1);
 });
 console.log(`Targeted SQL approval continuation: ${checks} passed; mocked Relay sends=${sends}; live Relay effects=0; qualified data unchanged.`);
}finally{globalThis.fetch=fetchBefore;neonConfig.fetchFunction=neonBefore;await client.query('ROLLBACK');await client.end();}
