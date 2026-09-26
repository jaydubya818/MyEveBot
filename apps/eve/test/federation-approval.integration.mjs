import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {Client} from 'pg';
import {neonConfig} from '@neondatabase/serverless';
import tool from '../agent/tools/federation_request.ts';
import {randomUUID,generateKeyPairSync,sign} from 'node:crypto';
import {executeIncomingPermission, correlatedReply, claimCorrelatedReply} from '../lib/relay/incoming-permissions.ts';
import {decideApproval} from '../lib/approvals.ts';
import {savePeerPermission} from '../lib/relay/peer-permissions.ts';
import {FederationStore} from '../lib/relay/store.ts';
import {receiveDelivery,decideExternalWork,getExternalResult} from '../lib/relay/inbox.ts';
import {encryptSecret, requestDigest} from '../lib/relay/transport.ts';
import {qualificationEnabled} from '../lib/qualification/client.ts';

// Existing loopback database supplies schema shapes only. Every test row and
// sequence is connection-local TEMP state, discarded on rollback/disconnect.
const url=new URL(process.env.FEDERATION_TEST_DATABASE_URL??'');
assert(['127.0.0.1','localhost'].includes(url.hostname));assert(['55439','55468','55470'].includes(url.port));assert(['/myeve_combined_v1','/golden_ui'].includes(url.pathname));
assert.equal(qualificationEnabled(),false,'Synthetic Relay test must not use an external qualification controller.');
assert.equal(Boolean(process.env.MYEVE_RELAY_INGRESS_SECRETS),false,'Synthetic Relay test must not read deployment ingress credentials.');
const client=new Client({connectionString:url.href,ssl:false});await client.connect();
const tables=['agents','agent_capabilities','agent_runs','task_runs','task_run_sessions','task_approval_decisions','task_transitions','task_milestones','task_specialists','task_acceptance_checks','task_artifacts','outcomes','eve_events','action_requests','action_receipts','execution_occurrences','execution_routine_versions','execution_routines','review_deliveries','computer_control_leases','computer_sessions','myeve_relay_connections','myeve_relay_requests','myeve_relay_reply_claims','myeve_peer_permissions','myeve_peer_action_bindings','myeve_relay_activity','web_chat_threads','app_settings'];
const fetchBefore=globalThis.fetch,neonBefore=neonConfig.fetchFunction;
let sends=0,checks=0,relayStatus="ACTIVE",reciprocalMessages=0;const submitted=[];
process.env.DATABASE_URL='postgresql://fixture@approval-test.invalid/postgres';
process.env.MYEVE_RELAY_ENABLED='true';process.env.MYEVE_RELAY_ORIGIN='https://relay.example';process.env.MYEVE_RELAY_ENCRYPTION_KEY='a'.repeat(64);
const require=createRequire(import.meta.url),eveRoot=path.dirname(require.resolve('eve/package.json'));
const {resolvePendingInput}=await import(pathToFileURL(path.join(eveRoot,'dist/src/harness/input-requests.js')).href);
const principal={principalId:'approval-owner',principalType:'user',attributes:{owner:'true',myeveAgentId:'approval-agent'}};
const context=id=>({session:{id,auth:{current:principal,initiator:principal}},messages:[],channel:{},callId:id});
const input=id=>({operation:'request',request:{target:'relay://atlas/agent',resource:'synthetic-messages',capability:'message.send',idempotencyKey:`test-${id}`,expiresAt:new Date(Date.now()+60*60*1000).toISOString(),payload:{body:'Federation approval continuation check'}}});
const decisionMessages=(id,value,answer='yes')=>{
 const call={type:'tool-call',toolName:'federation_request',toolCallId:id,input:value};
 const approval={type:'tool-approval-request',toolCallId:id,approvalId:`native-${id}`};
 const session={history:[],state:{'eve.runtime.pendingInputBatch':{requests:[{kind:"tool-approval",requestId:approval.approvalId,options:[{id:'approve',label:'Yes'},{id:'deny',label:'No'}],action:{kind:'tool-call',callId:id,toolName:'federation_request',input:value}}],responseMessages:[{role:'assistant',content:[call,approval]}]}}};
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
 await client.query('BEGIN');await client.query('SET LOCAL search_path=pg_temp,public');
 for(const table of tables) await client.query(`CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING ALL) ON COMMIT DROP`);
 const defaults=(await client.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY($1) AND column_default LIKE 'nextval(%'",[tables])).rows;
 for(const [index,row] of defaults.entries()) {await client.query(`CREATE TEMP SEQUENCE test_sequence_${index}`);await client.query(`ALTER TABLE ${row.table_name} ALTER COLUMN ${row.column_name} SET DEFAULT nextval('pg_temp.test_sequence_${index}')`);}
 neonConfig.fetchFunction=async(_url,options)=>{
  const body=JSON.parse(options.body);
  const query=async item=>{await client.query('SAVEPOINT neon_statement');try{const result=await client.query({text:item.query,values:item.params,rowMode:'array',types:{getTypeParser:()=>v=>v}});return {fields:result.fields.map(f=>({name:f.name,dataTypeID:f.dataTypeID})),rows:result.rows,rowCount:result.rowCount,command:result.command,rowAsArray:true};}catch(error){await client.query('ROLLBACK TO neon_statement');throw error}finally{await client.query('RELEASE neon_statement')}};
  if(!body.queries)return Response.json(await query(body));
  const results=[];for(const item of body.queries)results.push(await query(item));return Response.json({results});
 };
 globalThis.fetch=async(url,options)=>{assert.equal(String(url),'https://relay.example/api/v2/federation');const command=JSON.parse(options.body);if(command.operation==='authority.inspect')return Response.json({authorized:relayStatus==='ACTIVE',status:relayStatus,expiresAt:'2099-01-01T00:00:00Z',approvalRequired:true,observedAt:new Date().toISOString(),executionRecheckRequired:true});assert.equal(command.operation,'submit');sends++;submitted.push(command.input);return Response.json({requestId:`fixture-${sends}`,status:'QUEUED'});};
 await client.query("INSERT INTO agents(id,owner_id,slug,name,role,instructions,is_primary,status,max_steps,max_runtime_seconds,max_estimated_cost_usd) VALUES('approval-agent','approval-owner','sofie','Sofie','Test','Test',true,'active',30,900,2)");
 await client.query(`INSERT INTO myeve_relay_connections(owner_id,local_agent_id,relay_owner_id,relay_agent_id,address,issuer,signing_key_id,signing_public_key,agent_credential_encrypted,owner_session_encrypted) VALUES($1,$2,'relay-owner','relay-sofie','relay://owner/sofie','test','test','test',$3,$4)`,['approval-owner','approval-agent',encryptSecret('approval-owner','fixture-agent'),encryptSecret('approval-owner','fixture-owner')]);
 await client.query(`INSERT INTO myeve_peer_permissions(id,owner_id,local_agent_id,relay_origin,local_relay_account_id,local_relay_agent_id,peer_account_id,peer_agent_id,display_name,policies,mutation_id,mutation_hash)
 VALUES('permission','approval-owner','approval-agent','https://relay.example','relay-owner','relay-sofie','atlas','agent','Atlas',$1,'initial','initial')`,[JSON.stringify([{capability:'message.send',resource:'synthetic-messages',policy:'REQUIRE_APPROVAL',recordTypes:[],topics:[]}])]);
 await check('owner policy saves are durable, idempotent, audited and revision fenced',async()=>{
  const store=new FederationStore('approval-owner');
  const command={localAgentId:'approval-agent',peer:'relay://second/agent',displayName:'Second',policies:[{capability:'message.send',resource:'exact',policy:'REQUIRE_APPROVAL',recordTypes:[],topics:[]}],expiresAt:null,expectedRevision:0,mutationId:randomUUID()};
  const first=await savePeerPermission(store,command);assert.equal(first.revision,1);
  const replay=await savePeerPermission(store,command);assert.equal(replay.id,first.id);assert.equal(replay.revision,1);
  const changed=await savePeerPermission(store,{...command,permissionId:first.id,expectedRevision:1,mutationId:randomUUID(),displayName:'Renamed'});assert.equal(changed.revision,2);
  await assert.rejects(savePeerPermission(store,{...command,expectedRevision:1,mutationId:randomUUID()}),e=>e.code==='PERMISSION_CONFLICT');
  await assert.rejects(savePeerPermission(new FederationStore('other-owner'),{...command,permissionId:first.id,expectedRevision:2,mutationId:randomUUID()}));
  process.env.MYEVE_RELAY_ENABLED='false';
  const revoked=await savePeerPermission(store,{...command,permissionId:first.id,expectedRevision:2,mutationId:randomUUID(),revoke:true});assert.equal(revoked.revision,3);assert.ok(revoked.revoked_at);
  process.env.MYEVE_RELAY_ENABLED='true';
  const audit=(await client.query("SELECT metadata FROM myeve_relay_activity WHERE kind='peer-permission-changed'")).rows;
  assert.equal(audit.length,3);assert.ok(audit.every(r=>r.metadata.actor==='approval-owner'));assert.equal(JSON.stringify(audit).includes('fixture-agent'),false);
 });
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
  assert.equal(JSON.parse((await def.approval({...ctx,toolName:'federation_request',toolInput:value,approvedTools:new Set()})).reason).code,'ACTION_APPROVAL_EXPIRED');
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
 await check('expired admission creates no Action or approval, and surfaces specific reason',async()=>{
  const {ctx,row}=await stage('expired-admission');
  // This fixture stays in one transaction: make expiry earlier than its stable
  // now() as well as wall time so the historical approval reason is deterministic.
  await client.query("UPDATE task_runs SET deadline_at=now()-interval '1 second' WHERE id=$1",[row.run_id]);
  const before=(await client.query('SELECT (SELECT count(*) FROM action_requests)::int actions,(SELECT count(*) FROM task_approval_decisions)::int approvals')).rows[0];
  const def=await definition(ctx),denial=await def.approval({...ctx,callId:'new-expired-call',toolName:'federation_request',toolInput:input('new-expired-call')});
  assert.equal(denial.type,'denied');assert.equal(JSON.parse(denial.reason).code,'RUN_EXPIRED');
  assert.deepEqual((await client.query('SELECT (SELECT count(*) FROM action_requests)::int actions,(SELECT count(*) FROM task_approval_decisions)::int approvals')).rows[0],before);
 });
 await check('fresh recovery preserves historical approval and exact call binding',async()=>{
  const {ownerChatRun,toolActionRequest}=await import('../agent/lib/action-context.ts');
  const {listApprovalRequests,decideApproval}=await import('../lib/approvals.ts');
  const ctx=context('expired-admission');
  const old=(await client.query("SELECT * FROM action_requests WHERE action_key='tool:expired-admission'")).rows[0];
  const fresh=await ownerChatRun({ownerId:'approval-owner',sessionId:ctx.session.id,agentId:'approval-agent',recover:true,initialize:true});
  assert.notEqual(fresh,old.run_id);
  const historical=await toolActionRequest(ctx,{capabilityId:'federation.request',actionClass:'send',parameters:input('expired-admission')});assert.equal(historical.runId,old.run_id);
  const view=(await listApprovalRequests('approval-owner')).find(p=>p.id===old.approval_id);assert.equal(view.status,'expired');assert.equal(view.effectiveReason,'Parent Run expired');
  await assert.rejects(()=>decideApproval({ownerId:'approval-owner',id:old.approval_id,bindingHash:old.parameter_hash,decision:'approved',decidedBy:'approval-owner'}));
  assert.equal((await client.query('SELECT status FROM task_approval_decisions WHERE id=$1',[old.approval_id])).rows[0].status,'pending');
  const current=await toolActionRequest({...ctx,callId:'fresh-work'},{capabilityId:'federation.request',actionClass:'send',parameters:input('fresh-work')});assert.equal(current.runId,fresh);
 });
 await check('non-Federation and read admission reject expired Run before persistence',async()=>{
  const {ActionGateway}=await import('../lib/action-gateway.ts');
  const old=(await client.query("SELECT * FROM action_requests WHERE action_key='tool:expired-admission'")).rows[0];
  let effects=0;const adapter={resolveTarget:async()=>({provider:'mail',account:'local',resource:'test@example.invalid'}),execute:async()=>{effects++;return{}},receipt:()=>({}),verify:async()=>({verified:true,receipt:{}})};
  for(const actionClass of ['send','read'])await assert.rejects(()=>new ActionGateway().prepare({ownerId:'approval-owner',runId:old.run_id,actionKey:'non-federation-'+actionClass,capabilityId:'channel.web',actionClass,executor:{kind:'primary-agent',agentId:'approval-agent'},trigger:{kind:'owner_chat',id:'expired-admission'},parameters:{}},adapter),e=>e.actionId==='RUN_EXPIRED');
  assert.equal(effects,0);assert.equal((await client.query("SELECT count(*)::int n FROM action_requests WHERE action_key LIKE 'non-federation-%'")).rows[0].n,0);
 });
 await check('Run expires between proposal and admission: zero persisted Actions or approvals',async()=>{
  const {ActionGateway}=await import('../lib/action-gateway.ts');
  const {toolActionRequest}=await import('../agent/lib/action-context.ts');
  const ctx=context('admission-race');const action=await toolActionRequest(ctx,{capabilityId:'channel.web',actionClass:'send',parameters:{body:'test'}});
  let effects=0;
  const adapter={resolveTarget:async()=>{await client.query("UPDATE task_runs SET deadline_at=clock_timestamp() WHERE id=$1",[action.runId]);return {provider:'test',account:'test',resource:'test'}},execute:async()=>{effects++;return{}},receipt:()=>({}),verify:async()=>({verified:true,receipt:{}})};
  await assert.rejects(()=>new ActionGateway(undefined,{evaluate:async()=>({decision:'REQUIRE_APPROVAL',reason:'Test',source:'local'})}).prepare(action,adapter),e=>e.actionId==='RUN_EXPIRED');
  assert.equal(effects,0);assert.equal((await client.query('SELECT count(*)::int n FROM action_requests WHERE run_id=$1',[action.runId])).rows[0].n,0);
  assert.equal((await client.query('SELECT count(*)::int n FROM task_approval_decisions WHERE task_id=$1',[action.runId])).rows[0].n,0);
 });
 await check('canonical thread deletion preserves multi-Run evidence and owner isolation',async()=>{
  await client.query("INSERT INTO web_chat_threads(id,title,updated_at,owner_id) VALUES('expired-admission','Test',1,'approval-owner')");
  const {deleteThread}=await import('../lib/threads-db.ts');
  const before=(await client.query("SELECT task_id,is_current FROM task_run_sessions WHERE session_id='expired-admission' ORDER BY task_id")).rows;
  assert.equal(before.length,2);await deleteThread('other-owner','expired-admission');
  assert.equal((await client.query('SELECT count(*)::int n FROM web_chat_threads')).rows[0].n,1);
  await deleteThread('approval-owner','expired-admission');assert.equal((await client.query('SELECT count(*)::int n FROM web_chat_threads')).rows[0].n,0);
  assert.deepEqual((await client.query("SELECT task_id,is_current FROM task_run_sessions WHERE session_id='expired-admission' ORDER BY task_id")).rows,before);
 });
 for (const status of ['MISSING','EXPIRED','REVOKED','RESOURCE_NOT_AUTHORIZED','CAPABILITY_NOT_AUTHORIZED']) await check(`Relay ${status} preflight creates no approval or effect`,async()=>{
  relayStatus=status;const id=`preflight-${status}`,ctx=context(id),value=input(id),before=sends;
  const count=(await client.query('SELECT count(*)::int n FROM task_approval_decisions')).rows[0].n;
  const def=await definition(ctx);assert.equal(await def.approval({...ctx,toolInput:value}),'denied');
  assert.equal((await client.query('SELECT count(*)::int n FROM task_approval_decisions')).rows[0].n,count);assert.equal(sends,before);relayStatus='ACTIVE';
 });
 for (const dependency of ['relay-revoked','local-revoked','local-expired','local-revised']) await check(`${dependency} while pending blocks the original approved Action`,async()=>{
  const {ctx,value,row}=await stage(dependency),before=sends;
  if(dependency==='relay-revoked')relayStatus='REVOKED';
  if(dependency==='local-revoked')await client.query("UPDATE myeve_peer_permissions SET revoked_at=now() WHERE id='permission'");
  if(dependency==='local-expired')await client.query("UPDATE myeve_peer_permissions SET expires_at=now()-interval '1 second' WHERE id='permission'");
  if(dependency==='local-revised')await client.query("UPDATE myeve_peer_permissions SET revision=revision+1 WHERE id='permission'");
  const def=await definition({...ctx,messages:decisionMessages(dependency,value)});
  const result=await def.execute(value,ctx);assert.equal(result.status,'denied',JSON.stringify(result));assert.equal(sends,before);
  assert.equal((await client.query('SELECT count(*)::int n FROM task_approval_decisions WHERE task_id=$1',[row.run_id])).rows[0].n,1);
  relayStatus='ACTIVE';await client.query("UPDATE myeve_peer_permissions SET revoked_at=NULL,expires_at=NULL WHERE id='permission'");
 });
 await check('omitted messaging resource resolves durably and changed binding cannot inherit approval',async()=>{
  const original=(await client.query("SELECT policies FROM myeve_peer_permissions WHERE id='permission'")).rows[0].policies;
  const policies=original.map(p=>p.capability==='message.send'?{...p,resource:'relay://atlas/agent'}:p);
  await client.query("UPDATE myeve_peer_permissions SET policies=$1::jsonb WHERE id='permission'",[JSON.stringify(policies)]);
  const ctx=context('automatic-resource'),value=input(ctx.callId);delete value.request.resource;
  const before=sends,def=await definition(ctx);
  const substituted=await def.approval({...ctx,toolInput:{...value,request:{...value.request,resource:'model-invented-resource'}}});
  assert.equal(substituted.type,'denied');assert.equal(JSON.parse(substituted.reason).code,'PEER_MESSAGE_RESOURCE_CHANGED');
  assert.equal((await client.query('SELECT count(*)::int n FROM action_requests WHERE action_key=$1',[`tool:${ctx.callId}`])).rows[0].n,0);
  assert.equal(await def.approval({...ctx,toolInput:value}),'user-approval');
  const row=(await client.query('SELECT * FROM action_requests WHERE action_key=$1',[`tool:${ctx.callId}`])).rows[0];
  const changed=policies.map(p=>p.capability==='message.send'?{...p,resource:'different-resource'}:p);
  await client.query("UPDATE myeve_peer_permissions SET policies=$1::jsonb,revision=revision+1 WHERE id='permission'",[JSON.stringify(changed)]);
  const stale=await definition({...ctx,messages:decisionMessages(ctx.callId,value)});
  assert.equal((await stale.execute(value,ctx)).status,'denied');assert.equal(sends,before);
  assert.equal((await client.query('SELECT status FROM task_approval_decisions WHERE id=$1',[row.approval_id])).rows[0].status,'pending');
  await client.query("UPDATE myeve_peer_permissions SET policies='[]'::jsonb WHERE id='permission'");
  const missingCtx=context('missing-resource'),missing=await definition(missingCtx);
  const denial=await missing.approval({...missingCtx,toolInput:value});
  assert.equal(denial.type,'denied');assert.equal(JSON.parse(denial.reason).code,'PEER_MESSAGE_NOT_CONFIGURED');
  assert.match(JSON.parse(denial.reason).message,/\/manage\/relay/);
  assert.equal((await client.query('SELECT count(*)::int n FROM action_requests WHERE action_key=$1',[`tool:${missingCtx.callId}`])).rows[0].n,0);
  await client.query("UPDATE myeve_peer_permissions SET policies=$1::jsonb,revision=revision+1 WHERE id='permission'",[JSON.stringify(policies)]);
  const freshCtx=context('automatic-resource-fresh'),freshValue=input(freshCtx.callId);delete freshValue.request.resource;
  const fresh=await definition(freshCtx);assert.equal(await fresh.approval({...freshCtx,toolInput:freshValue}),'user-approval');
  const approved=await definition({...freshCtx,messages:decisionMessages(freshCtx.callId,freshValue)});
  const executed=await approved.execute(freshValue,freshCtx);assert.notEqual(executed.status,'denied');assert.equal(executed.execution.phase,'submitted');assert.equal(executed.execution.approvalPending,false);assert.equal(sends,before+1);
  assert.equal(submitted.at(-1).resource,'relay://atlas/agent');
  await approved.execute(freshValue,freshCtx);assert.equal(sends,before+1);
  await client.query("UPDATE myeve_peer_permissions SET policies=$1::jsonb,revision=revision+1 WHERE id='permission'",[JSON.stringify(original)]);
 });
 await check('three Runs retain one peer permission and require fresh authority, Actions and approvals',async()=>{
  const {ownerChatRun}=await import('../agent/lib/action-context.ts');
  const sessionId='three-run-permission';const actions=[],runs=[],approvals=[];const before=sends;
  const permission=(await client.query("SELECT id,revision FROM myeve_peer_permissions WHERE id='permission'")).rows[0];
  for(let cycle=0;cycle<3;cycle++){
   const run=await ownerChatRun({ownerId:'approval-owner',sessionId,agentId:'approval-agent',recover:true,initialize:true});runs.push(run);
   const callId=`three-run-call-${cycle}`,ctx={...context(sessionId),callId},value=input(callId),def=await definition(ctx);
   // Every new Run checks Relay and the durable local policy before staging work.
   relayStatus='REVOKED';assert.equal(await def.approval({...ctx,toolInput:value}),'denied');relayStatus='ACTIVE';
   await client.query("UPDATE myeve_peer_permissions SET revoked_at=now() WHERE id='permission'");
   assert.equal(await def.approval({...ctx,toolInput:value}),'denied');
   await client.query("UPDATE myeve_peer_permissions SET revoked_at=NULL WHERE id='permission'");
   assert.equal(await def.approval({...ctx,toolInput:value}),'user-approval');
   const row=(await client.query('SELECT * FROM action_requests WHERE action_key=$1',[`tool:${callId}`])).rows[0];
   assert.equal(row.run_id,run);actions.push(row.id);approvals.push(row.approval_id);
   const binding=(await client.query('SELECT permission_id,permission_revision FROM myeve_peer_action_bindings WHERE run_id=$1 AND action_key=$2',[run,`tool:${callId}`])).rows[0];
   assert.equal(binding.permission_id,permission.id);assert.equal(binding.permission_revision,permission.revision);
   await client.query("UPDATE task_runs SET deadline_at=now()-interval '1 second' WHERE id=$1",[run]);
   const approved=await definition({...ctx,messages:decisionMessages(callId,value)});
   assert.equal((await approved.execute(value,ctx)).status,'denied');assert.equal(sends,before);
  }
  assert.equal(new Set(runs).size,3);assert.equal(new Set(actions).size,3);assert.equal(new Set(approvals).size,3);
  assert.deepEqual((await client.query("SELECT id,revision FROM myeve_peer_permissions WHERE id='permission'")).rows[0],permission);
 });
 await check('incoming unsolicited messages require exact approval; revocation blocks continuation',async()=>{
  await client.query("UPDATE myeve_peer_permissions SET policies=policies || $1::jsonb,revision=revision+1 WHERE id='permission'",[JSON.stringify([{capability:'message.receive',resource:'synthetic-messages',policy:'REQUIRE_APPROVAL',recordTypes:[],topics:[]}])]);
  const store=new FederationStore('approval-owner');let effects=0;
  const incoming=async(id,conversationId,replyTo)=>{
   const envelope={id,protocol:'relay.federation',version:'1.0',caller:{ownerId:'atlas',agentId:'agent'},target:{ownerId:'relay-owner',agentId:'relay-sofie',address:'relay://owner/sofie'},capability:'message.send',resource:'synthetic-messages',createdAt:new Date().toISOString(),expiresAt:'2099-01-01T00:00:00Z',idempotencyKey:id,payload:{body:'Incoming fixture',...(replyTo?{replyTo}:{})},...(conversationId?{conversationId}:{}),publication:null,authorizationContext:{grantId:'fixture',policyDecisionId:'fixture',localAuthorizationRequired:true}};
   await client.query("INSERT INTO task_runs(id,owner_id,kind,title,status,agent_id,max_duration_seconds,max_specialists,max_model_steps,max_retries_per_specialist,max_estimated_cost_usd) VALUES($1,'approval-owner','delegated_work','Incoming fixture','running','approval-agent',300,1,1,0,0.01)",[id]);
   await client.query("INSERT INTO myeve_relay_requests(owner_id,request_id,direction,capability,conversation_id,sender_owner_id,sender_agent_id,envelope_hash,envelope_encrypted,local_run_id,expires_at) VALUES('approval-owner',$1,'incoming','message.send',$2,'atlas','agent',$3,$4,$1,'2099-01-01')",[id,conversationId??null,requestDigest(envelope),encryptSecret('approval-owner',envelope)]);
   return envelope;
  };
  const effect=async()=>{effects++;return {acknowledged:true};};
  const first=await incoming('incoming-approved');
  assert.equal((await executeIncomingPermission(store,first,effect)).status,'REQUIRE_APPROVAL');assert.equal(effects,0);
  const approval=(await client.query("SELECT p.id,p.binding_hash FROM task_approval_decisions p JOIN action_requests a ON a.approval_id=p.id WHERE a.action_key=$1",[first.id])).rows[0];
  await decideApproval({ownerId:store.ownerId,id:approval.id,bindingHash:approval.binding_hash,decision:'approved',decidedBy:store.ownerId});
  assert.equal((await executeIncomingPermission(store,first,effect)).status,'COMPLETED');assert.equal(effects,1);
  const second=await incoming('incoming-revoked');assert.equal((await executeIncomingPermission(store,second,effect)).status,'REQUIRE_APPROVAL');
  await client.query("UPDATE myeve_peer_permissions SET revoked_at=now(),revision=revision+1 WHERE id='permission'");
  assert.equal((await executeIncomingPermission(store,second,effect)).status,'REJECTED');assert.equal(effects,1);
  await client.query("UPDATE myeve_peer_permissions SET revoked_at=NULL,revision=revision+1 WHERE id='permission'");
  const reply=await incoming('incoming-reply','exact-thread','parent-message');
  const original={...input('parent').request,conversationId:'exact-thread'};
  await client.query("INSERT INTO myeve_relay_requests(owner_id,request_id,direction,capability,conversation_id,sender_owner_id,sender_agent_id,envelope_hash,envelope_encrypted,expires_at,state) VALUES('approval-owner','parent-message','outgoing','message.send','exact-thread','relay-owner','relay-sofie','fixture',$1,'2099-01-01','completed')",[encryptSecret(store.ownerId,original)]);
  assert.equal(await correlatedReply(store,reply),true);
  assert.equal(await correlatedReply(store,{...reply,caller:{ownerId:'atlas',agentId:'spoof'}}),false);
  assert.equal(await correlatedReply(store,{...reply,conversationId:'other-thread'}),false);
  await client.query("UPDATE myeve_relay_requests SET expires_at=now()-interval '1 second' WHERE owner_id=$1 AND request_id='parent-message'",[store.ownerId]);
  assert.equal(await correlatedReply(store,reply),false);
  await client.query("UPDATE myeve_relay_requests SET expires_at='2099-01-01' WHERE owner_id=$1 AND request_id='parent-message'",[store.ownerId]);
  const beforeApprovals=(await client.query('SELECT count(*)::int n FROM task_approval_decisions')).rows[0].n;
  assert.equal((await executeIncomingPermission(store,reply,effect)).status,'COMPLETED');assert.equal(effects,2);
  assert.equal((await client.query('SELECT count(*)::int n FROM task_approval_decisions')).rows[0].n,beforeApprovals);
  assert.equal(await claimCorrelatedReply(store,reply),true,'the same signed request can resume its claim');
  const nextReply=await incoming('incoming-reply-again','exact-thread','parent-message');
  assert.equal(await claimCorrelatedReply(store,nextReply),false,'a new request cannot reuse the approval exception');
  assert.equal((await executeIncomingPermission(store,nextReply,effect)).status,'REQUIRE_APPROVAL');
  assert.equal(effects,2);
  assert.equal((await client.query('SELECT count(*)::int n FROM myeve_relay_reply_claims')).rows[0].n,1);
  const secondApproval=(await client.query('SELECT p.id,p.binding_hash FROM task_approval_decisions p JOIN action_requests a ON a.approval_id=p.id WHERE a.action_key=$1',[nextReply.id])).rows[0];
  await decideApproval({ownerId:store.ownerId,id:secondApproval.id,bindingHash:secondApproval.binding_hash,decision:'approved',decidedBy:store.ownerId});
  assert.equal((await executeIncomingPermission(store,nextReply,effect)).status,'COMPLETED');
  assert.equal(effects,3,'the second request executes only after its own exact approval');
  assert.equal((await client.query('SELECT count(*)::int n FROM myeve_relay_reply_claims')).rows[0].n,1);
 });
 await check('synthetic Sofie and Atlas exchange authenticated, correlated messages in both directions',async()=>{
  const signing=generateKeyPairSync('ed25519');
  const publicKey=signing.publicKey.export({type:'spki',format:'pem'}).toString();
  await client.query("UPDATE myeve_relay_connections SET relay_owner_id='owner',relay_agent_id='sofie',issuer='https://relay.example',signing_key_id='fixture-pin',signing_public_key=$1 WHERE owner_id='approval-owner'",[publicKey]);
  await client.query("UPDATE myeve_peer_permissions SET local_relay_account_id='owner',local_relay_agent_id='sofie' WHERE owner_id='approval-owner' AND id='permission'");
  await client.query("INSERT INTO agents(id,owner_id,slug,name,role,instructions,is_primary,status,max_steps,max_runtime_seconds,max_estimated_cost_usd) VALUES('atlas-agent','atlas-owner','atlas','Atlas','Test','Synthetic public messages',true,'active',30,900,2)");
  await client.query(`INSERT INTO myeve_relay_connections(owner_id,local_agent_id,relay_owner_id,relay_agent_id,address,issuer,signing_key_id,signing_public_key,agent_credential_encrypted,owner_session_encrypted)
    VALUES('atlas-owner','atlas-agent','atlas','agent','relay://atlas/agent','https://relay.example','fixture-pin',$1,$2,$3)`,[publicKey,encryptSecret('atlas-owner','fixture-atlas'),encryptSecret('atlas-owner','fixture-atlas-owner')]);
  await client.query(`INSERT INTO myeve_peer_permissions(id,owner_id,local_agent_id,relay_origin,local_relay_account_id,local_relay_agent_id,peer_account_id,peer_agent_id,display_name,policies,mutation_id,mutation_hash)
    VALUES('permission-atlas','atlas-owner','atlas-agent','https://relay.example','atlas','agent','owner','sofie','Sofie',$1,'initial','initial')`,[JSON.stringify(['message.send','message.receive'].map(capability=>({capability,resource:'synthetic-messages',policy:'REQUIRE_APPROVAL',recordTypes:[],topics:[]})))]);
  const identities={
   'fixture-agent':{ownerId:'owner',agentId:'sofie',address:'relay://owner/sofie'},
   'fixture-atlas':{ownerId:'atlas',agentId:'agent',address:'relay://atlas/agent'},
  };
  const granted=new Set(['fixture-agent>relay://atlas/agent','fixture-atlas>relay://owner/sofie']);
  const relayRequests=new Map();let requestNumber=0;
  const signedDelivery=envelope=>{
   const header=Buffer.from(JSON.stringify({alg:'EdDSA',typ:'relay-federation+jwt',kid:'fixture-pin'})).toString('base64url');
   const claims=Buffer.from(JSON.stringify({iss:'https://relay.example',aud:envelope.target.address,jti:envelope.id,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+45,envelope})).toString('base64url');
   const material=`${header}.${claims}`;
   return `${material}.${sign(null,Buffer.from(material),signing.privateKey).toString('base64url')}`;
  };
  const previousFetch=globalThis.fetch;
  globalThis.fetch=async(url,options)=>{
   assert.equal(String(url),'https://relay.example/api/v2/federation');
   const credential=String(options.headers.authorization).replace(/^Bearer /,'');
   const caller=identities[credential];assert.ok(caller,'unknown synthetic Relay credential');
   const command=JSON.parse(options.body);
   if(command.operation==='authority.inspect'){
    const active=granted.has(`${credential}>${command.input.target}`) && command.input.capability==='message.send' && command.input.resource==='synthetic-messages';
    return Response.json({authorized:active,status:active?'ACTIVE':'REVOKED',expiresAt:active?'2099-01-01T00:00:00Z':null,approvalRequired:true,observedAt:new Date().toISOString(),executionRecheckRequired:true});
   }
   if(command.operation==='submit'){
    const input=command.input,key=`${credential}>${input.target}`;
    if(!granted.has(key)||input.capability!=='message.send'||input.resource!=='synthetic-messages')return Response.json({error:'denied'},{status:403});
    const [,ownerId,agentId]=/^relay:\/\/([^/]+)\/([^/]+)$/.exec(input.target)??[];
    assert.ok(ownerId&&agentId);
    const id=`synthetic-peer-${++requestNumber}`;
    const envelope={id,protocol:'relay.federation',version:'1.0',caller:{ownerId:caller.ownerId,agentId:caller.agentId},target:{ownerId,agentId,address:input.target},capability:'message.send',resource:input.resource,createdAt:new Date().toISOString(),expiresAt:input.expiresAt,idempotencyKey:input.idempotencyKey,payload:input.payload,...(input.conversationId?{conversationId:input.conversationId}:{}),publication:null,authorizationContext:{grantId:key,policyDecisionId:`decision-${id}`,localAuthorizationRequired:true}};
    relayRequests.set(id,{sender:credential,recipient:input.target,envelope,token:signedDelivery(envelope),status:'QUEUED'});
    return Response.json({requestId:id,status:'QUEUED'});
   }
   const record=relayRequests.get(command.requestId);assert.ok(record,'unknown synthetic request');
   if(command.operation==='respond'){
    assert.equal(caller.address,record.recipient);
    if(!granted.has(`${record.sender}>${record.recipient}`))return Response.json({error:'revoked'},{status:403});
    record.status=command.input.status;record.result=command.input.result;
    return Response.json({requestId:command.requestId,status:record.status});
   }
   if(command.operation==='get'){
    assert.equal(credential,record.sender);
    return Response.json({requestId:command.requestId,status:record.status,...(record.result?{result:record.result}:{})});
   }
   throw Error(`Unexpected synthetic Relay operation ${command.operation}`);
  };
  try{
   const sofieStore=new FederationStore('approval-owner'),atlasStore=new FederationStore('atlas-owner');
   const send=async({ownerId,agentId,id,target,conversationId,body,replyTo})=>{
    const current={principalId:ownerId,principalType:'user',attributes:{owner:'true',myeveAgentId:agentId}};
    const ctx={session:{id,auth:{current,initiator:current}},messages:[],channel:{},callId:id};
    const value={operation:'request',request:{target,resource:'synthetic-messages',capability:'message.send',idempotencyKey:id,expiresAt:new Date(Date.now()+3600000).toISOString(),conversationId,payload:{body,...(replyTo?{replyTo}:{})}}};
    const initial=await definition(ctx);
    assert.equal(await initial.approval({...ctx,toolName:'federation_request',toolInput:value,approvedTools:new Set(['federation_request'])}),'user-approval');
    const resumed=await definition({...ctx,messages:decisionMessages(id,value)});
    assert.equal(await resumed.approval({...ctx,toolName:'federation_request',toolInput:value,approvedTools:new Set(['federation_request'])}),'approved');
    const result=await resumed.execute(value,ctx);
    assert.equal(result.response?.status,'QUEUED',JSON.stringify(result));
    return result.response.requestId;
   };
   const deliver=async(store,requestId,needsApproval)=>{
    const token=relayRequests.get(requestId).token;
    const received=await receiveDelivery(store,token);
    assert.equal(received.state,needsApproval?'needs_approval':'completed');
    if(needsApproval){
     const approved=await decideExternalWork(store,requestId,true);
     assert.equal(approved.state,'completed');
    }
    return token;
   };
   const first=await send({ownerId:'approval-owner',agentId:'approval-agent',id:'sofie-question',target:'relay://atlas/agent',conversationId:'sofie-thread',body:'What can Atlas share about this synthetic task?'});
   const originalToken=await deliver(atlasStore,first,true);
   const originalActions=(await client.query("SELECT count(*)::int n FROM action_requests WHERE owner_id='atlas-owner'")).rows[0].n;
   assert.equal((await receiveDelivery(atlasStore,originalToken)).replay,true);
   assert.equal((await client.query("SELECT count(*)::int n FROM action_requests WHERE owner_id='atlas-owner'")).rows[0].n,originalActions);
   const altered={...relayRequests.get(first).envelope,payload:{body:'Changed after signing'}};
   await assert.rejects(receiveDelivery(atlasStore,signedDelivery(altered)),/changed its content/);
   const atlasReply=await send({ownerId:'atlas-owner',agentId:'atlas-agent',id:'atlas-answer',target:'relay://owner/sofie',conversationId:'sofie-thread',body:'Atlas can review the synthetic acceptance checks.',replyTo:first});
   await deliver(sofieStore,atlasReply,false);
   const sofieResult=await getExternalResult(sofieStore,first);
   assert.deepEqual(sofieResult.replies.map(({replyTo,peer,body})=>({replyTo,peer,body})),[{replyTo:first,peer:'relay://atlas/agent',body:'Atlas can review the synthetic acceptance checks.'}]);
   assert.match(sofieResult.replies[0].provenance,/Authenticated peer message/);
   const second=await send({ownerId:'atlas-owner',agentId:'atlas-agent',id:'atlas-question',target:'relay://owner/sofie',conversationId:'atlas-thread',body:'What can Sofie share about owner control?'});
   await deliver(sofieStore,second,true);
   const sofieReply=await send({ownerId:'approval-owner',agentId:'approval-agent',id:'sofie-answer',target:'relay://atlas/agent',conversationId:'atlas-thread',body:'Sofie keeps the owner in control of the synthetic Work.',replyTo:second});
   await deliver(atlasStore,sofieReply,false);
   const atlasResult=await getExternalResult(atlasStore,second);
   assert.deepEqual(atlasResult.replies.map(({replyTo,peer,body})=>({replyTo,peer,body})),[{replyTo:second,peer:'relay://owner/sofie',body:'Sofie keeps the owner in control of the synthetic Work.'}]);
   assert.match(atlasResult.replies[0].provenance,/Authenticated peer message/);
   const duplicateReply=await send({ownerId:'approval-owner',agentId:'approval-agent',id:'sofie-second-answer',target:'relay://atlas/agent',conversationId:'atlas-thread',body:'A second reply needs its own incoming approval.',replyTo:second});
   await deliver(atlasStore,duplicateReply,true);
   assert.equal((await client.query("SELECT count(*)::int n FROM myeve_relay_reply_claims WHERE owner_id='atlas-owner' AND parent_request_id=$1",[second])).rows[0].n,1);
   granted.delete('fixture-agent>relay://atlas/agent');
   const beforeRevoked=requestNumber;
   const beforeApprovals=(await client.query("SELECT count(*)::int n FROM task_approval_decisions WHERE owner_id='approval-owner'")).rows[0].n;
   const deniedCtx=context('sofie-revoked');const deniedValue={operation:'request',request:{target:'relay://atlas/agent',resource:'synthetic-messages',capability:'message.send',idempotencyKey:'sofie-revoked',expiresAt:new Date(Date.now()+3600000).toISOString(),payload:{body:'Must not send'}}};
   const denied=await definition(deniedCtx);
   assert.equal(await denied.approval({...deniedCtx,toolName:'federation_request',toolInput:deniedValue}),'denied');
   assert.equal(requestNumber,beforeRevoked,'revoked exact grant cannot create a new Relay request');
   assert.equal((await client.query("SELECT count(*)::int n FROM task_approval_decisions WHERE owner_id='approval-owner'")).rows[0].n,beforeApprovals);
   await assert.rejects(getExternalResult(sofieStore,first),/current authority|Relay authorization/i);
   assert.equal(relayRequests.size,5);
   reciprocalMessages=requestNumber;
  }finally{globalThis.fetch=previousFetch;}
 });
 console.log(`Targeted SQL approval continuation: ${checks} passed; approval-test sends=${sends}; signed synthetic reciprocal messages=${reciprocalMessages}; live Relay effects=0; qualified data unchanged.`);
}finally{globalThis.fetch=fetchBefore;neonConfig.fetchFunction=neonBefore;await client.query('ROLLBACK');await client.end();}
