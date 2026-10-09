import {CURRENT_DATABASE_MIGRATION} from "../lib/database-schema.ts";
import {assertReceiptDoesNotGrantAuthority} from './integration-authority-boundary.mjs';
import {engineeringConversationModel} from '../lib/engineering/conversation-model.ts';
import {EngineeringWorkerProjectionStore} from '../lib/engineering/worker-projection.ts';
import {currentTruthLines} from '../lib/engineering/current-truth-lines.ts';
import {z} from 'zod';
import {nativeDevelopmentToolSchema} from '../lib/engineering/native-input.ts';
import {fork} from 'node:child_process';
import {once} from 'node:events';
import {readFile,writeFile} from 'node:fs/promises';
import {DockerProtectedVerifier} from '../lib/engineering/docker-executor.ts';
import {prepareNativeCompletion} from '../lib/engineering/native-completion.ts';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {Pool,Client} from 'pg';
import {loadMigrations,runMigrations} from '../scripts/migration-runner.ts';
import {runtimeSchema} from '../lib/engineering/runtime.ts';
import {WorkStore} from '../lib/engineering/store.ts';
import {NativeRouteAuthority,admitNativeWork,nativeProfileHash,NATIVE_PROVIDER} from '../lib/engineering/native-routing.ts';
import {EngineeringConversationBudget} from '../lib/engineering/conversation-budget.ts';
import {NativeModelBudget} from '../lib/engineering/native-model-budget.ts';
import {manifestForSnapshot} from '../lib/engineering/base-preflight.ts';
import {digest,profileSchema} from '../lib/engineering/contract.ts';
import {nativeCompletionState,completionExposure} from '../lib/engineering/native-completion.ts';
import {nativeBudgetedModel} from '../lib/engineering/native-model.ts';
import {DirectDevelopmentStore} from '../lib/engineering/direct-development.ts';
import {DirectVerificationDriver} from '../lib/engineering/direct-verification-driver.ts';
import {NativeResultStore} from '../lib/engineering/native-results.ts';
const admin=new Client({connectionString:'postgresql://postgres@127.0.0.1:55479/postgres'});await admin.connect();
const name='gap2b_'+randomBytes(8).toString('hex');let pool;
try {
 await admin.query('CREATE DATABASE '+name);const databaseURL='postgresql://postgres@127.0.0.1:55479/'+name;
 pool=new Pool({connectionString:databaseURL});const client=await pool.connect();
 const migrations=await loadMigrations();
 try {
 assert.equal(migrations.at(-1).name,CURRENT_DATABASE_MIGRATION);
 const migrationDb={query:async(s,p)=>(await client.query(s,p)).rows,transaction:async statements=>{await client.query('BEGIN');try{for(const x of statements)await client.query(x.sql,x.params);await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}}};
 await runMigrations(migrationDb,migrations,()=>{});
 } finally { client.release(); }
 const database={query:async(s,p)=>(await pool.query(s,p)).rows};const owner='completion-owner',agentId='completion-sofie';
 await pool.query(`INSERT INTO agents(id,owner_id,name,slug,role,instructions,is_primary,status,max_estimated_cost_usd,max_runtime_seconds,max_steps)
 VALUES($1,$2,'Sofie','sofie','engineer','Bounded test engineer',true,'active',1.3,3600,30)`,[agentId,owner]);
 const store=new WorkStore({scopeId:owner,scopeKind:'personal',actorId:owner},database);
 const issued=JSON.parse(await readFile(new URL('../../../docs/verification/2026-09-26-m1er1-window/window-issued-config.json',import.meta.url),'utf8'));
 const criterion=issued.criteria[0];
 const retainedFixture=JSON.parse(await readFile(new URL('../../../docs/verification/2026-09-26-m1er1-window/window-closure.json',import.meta.url),'utf8'));
 const source={sha:retainedFixture.workspace[0].base_sha,files:retainedFixture.workspace[0].source_files};
 const profile=profileSchema.parse(issued.profile);
 let config=runtimeSchema.parse({...issued,ownerId:owner,agentId,profile,nativeQualification:undefined});
 assert.deepEqual(config.approvedBase,manifestForSnapshot(source));
 config.nativeQualification={provider:NATIVE_PROVIDER,modelId:'anthropic/claude-sonnet-5',scopeId:owner,profileHash:nativeProfileHash(config),evidenceRef:'local-controlled-test',qualifiedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()};
 const authority=new NativeRouteAuthority(store,async()=>config),budget=new EngineeringConversationBudget(store,authority),native=new NativeModelBudget(store,authority);
 const pricing={input:'0.000002',output:'0.000010',cachedInputTokens:'0.0000002',cacheCreationInputTokens:'0.0000025'};
 let serial=0;
 const request=(work,session='writer',extra={})=>({workId:work.id,sessionId:session,stepKey:session+':turn:'+serial++,modelId:'anthropic/claude-sonnet-5',requestHash:digest({serial}),microUsd:70000,maxCalls:30,pricing,bounds:{inputBytes:5000,maxOutputTokens:2048},...extra});
 async function prepare(title,cost=1000){const {work:saved}=await store.create({title,objective:config.objective,repository:profile.repository,criteria:config.criteria,maxCostUsd:1.3,maxDurationSeconds:3600,idempotencyKey:randomUUID()});const work=await store.change(saved.id,{operation:'resume',expectedVersion:saved.version});const req=request(work,'writer',{microUsd:Math.max(70000,cost)});await budget.reserve(req);await budget.assertDispatch(req);await budget.settle(req,cost,{content:[{type:'text',text:'Controlled admission'}]});return work;}
 async function admit(work){return admitNativeWork(store,work.id,work.version,work.generation,authority,'writer');}
 async function held(work){return Number((await pool.query('SELECT engineering_completion_remaining($1,$2) n',[owner,work.id])).rows[0].n);}
 async function crash(stage,w,reservation,action){
  const child=fork(new URL('./native-completion-process.mjs',import.meta.url),[],{execArgv:['--import','tsx'],stdio:['ignore','ignore','pipe','ipc']});let stderr='';child.stderr.on('data',v=>stderr+=v);
  try{const checkpoint=Promise.race([once(child,'message'),once(child,'exit').then(()=>{throw Error('Child exited: '+stderr)}),new Promise((_,reject)=>{const t=setTimeout(()=>reject(Error('Child timeout '+stderr)),60000);t.unref();})]);
   child.send({databaseURL,config,workId:w.id,stage,reservation,action});const [result]=await checkpoint;assert.equal(result.ready,true);
   const exit=once(child,'exit');child.kill('SIGKILL');assert.equal((await exit)[1],'SIGKILL');
  }finally{child.kill('SIGKILL');}
 }
 const work=await prepare('Atomic completion');const admission=await admit(work);assert(admission.runId);assert.equal(await held(work),9*completionExposure(pricing,14336,2048));
 console.log('PASS: minimum completion admitted within unchanged $1.30');
 const initialHold=await held(work);const outside=request(work,'observer',{microUsd:300000});
 await assert.rejects(budget.reserve(outside),/completion capacity/);assert.equal(await held(work),initialHold);
 const insufficient=await prepare('Too little remaining',400000);await assert.rejects(admit(insufficient),/Minimum completion/);
 assert.equal((await pool.query('SELECT count(*)::int n FROM engineering_route_runs WHERE work_id=$1',[insufficient.id])).rows[0].n,0);
 const duplicate=await admit(work);assert.equal(duplicate.alreadyAdmitted,true);assert.equal(await held(work),initialHold);
 async function nativeRequest(w,extra={}){const state=await nativeCompletionState(store,w.id);return request(w,'writer',{purpose:'NATIVE_EXECUTION',bounds:{inputBytes:5000,maxOutputTokens:2048,completion:{id:state.contract.id,stage:state.stage}},...extra});}
 const nr=await nativeRequest(work);await native.reserve(nr);assert.equal(await held(work),initialHold-completionExposure(pricing,14336,2048));
 await assert.rejects(native.reserve({...nr,stepKey:'writer:other:99',requestHash:digest('other')}),/uncertain|writer session/);
 await native.assertDispatch(nr);await native.unknown(nr);
 const uncertainBefore=(await pool.query('SELECT spent_microusd,reserved_microusd FROM engineering_work_model_budget WHERE work_id=$1',[work.id])).rows[0];
 await assert.rejects(native.releaseUndispatched(nr),/undispatched/);assert.deepEqual((await pool.query('SELECT spent_microusd,reserved_microusd FROM engineering_work_model_budget WHERE work_id=$1',[work.id])).rows[0],uncertainBefore);
 await native.retain(nr,{content:[{type:'text',text:'Recovered exact receipt'}]},{microUsd:1000,providerRequestId:'controlled-exact'});await native.reconcile(nr,1000);
 assert.equal((await native.reserve(nr)).result.content[0].text,'Recovered exact receipt');
 assert.equal((await pool.query("SELECT count(*)::int n FROM engineering_work_model_calls WHERE work_id=$1 AND purpose='NATIVE_EXECUTION'",[work.id])).rows[0].n,1);
 console.log('PASS: repair commitment protected, unknown exposure retained, exact replay not double-counted');
 // Race all participating calls through real independent PostgreSQL connections.
 for(const kind of ['conversation','native','two-admissions','fresh-chats']){
  const w=await prepare('race '+kind);let results;
  if(kind==='two-admissions')results=await Promise.allSettled([admit(w),admit(w)]);
  else if(kind==='conversation')results=await Promise.allSettled([admit(w),budget.reserve(request(w,'racing-observer',{microUsd:400000}))]);
  else {await admit(w);results=kind==='native'?await Promise.allSettled([native.reserve(await nativeRequest(w)),budget.reserve(request(w,'racing-observer',{microUsd:300000}))]):await Promise.allSettled([budget.reserve(request(w,'fresh-a',{microUsd:200000})),budget.reserve(request(w,'fresh-b',{microUsd:200000}))]);}
  assert(results.some(x=>x.status==='fulfilled'));
  const [b]=(await pool.query('SELECT *,engineering_completion_remaining(scope_id,work_id) hold FROM engineering_work_model_budget WHERE work_id=$1',[w.id])).rows;
  assert(Number(b.spent_microusd)+Number(b.reserved_microusd)+Number(b.hold)<=Number(b.ceiling_microusd));
  assert((await pool.query('SELECT count(*)::int n FROM engineering_route_runs WHERE work_id=$1',[w.id])).rows[0].n<=1);
  console.log('PASS: real SQL contention',kind,results.map(x=>x.status));
 }
 const slotsWork=await prepare('call-slot protection');await admit(slotsWork);
 await pool.query('UPDATE engineering_work_model_budget SET max_calls=10 WHERE work_id=$1',[slotsWork.id]);
 await assert.rejects(budget.reserve(request(slotsWork,'cheap-observer')),/call slots/);
 const protectedSlot=await nativeRequest(slotsWork);await native.reserve(protectedSlot);await native.releaseUndispatched(protectedSlot);
 assert.equal(Number((await pool.query('SELECT engineering_completion_slots($1,$2) n',[owner,slotsWork.id])).rows[0].n),8);
 console.log('PASS: cheap observers cannot steal completion call quota; undispatched attempts remain counted');
 const stale=await prepare('stale');await admit(stale);const sr=await nativeRequest(stale);await native.reserve(sr);
 await store.change(stale.id,{operation:'pause',expectedVersion:stale.version});await assert.rejects(native.assertDispatch(sr),/fence|authority/);
 const changed=await prepare('changed policy');await admit(changed);const cr=await nativeRequest(changed);await native.reserve(cr);
 const previous=config;config={...config,nativeMode:config.nativeMode==='potato'?'normal':'potato'};await assert.rejects(native.assertDispatch(cr),/fence/);config=previous;
 const agentChanged=await prepare('changed Agent');await admit(agentChanged);const ar=await nativeRequest(agentChanged);await native.reserve(ar);
 await pool.query("UPDATE agents SET updated_at=updated_at+interval '1 second' WHERE id=$1",[agentId]);await assert.rejects(native.assertDispatch(ar),/fence/);
 await pool.query("UPDATE agents SET updated_at=updated_at-interval '1 second' WHERE id=$1",[agentId]);
 console.log('PASS: stale Work, policy and Agent dispatch fenced');
 for(const stage of ['CONTRACT','RESERVED','DISPATCHED','RESULT_RETAINED']){
  const w=await prepare('crash '+stage);if(stage!=='CONTRACT')await admit(w);
  const req=stage==='CONTRACT'?null:await nativeRequest(w);await crash(stage,w,req);
  if(stage==='CONTRACT'){assert.equal(await held(w),initialHold);assert.equal((await pool.query('SELECT count(*)::int n FROM engineering_native_runtime WHERE work_id=$1',[w.id])).rows[0].n,1);}
  else {const recovered=new NativeModelBudget(store,authority);const receipt=await recovered.recover(req);assert.equal(receipt.status,stage);
   await assert.rejects(recovered.assertDispatch(req),/redispatch/);
   if(stage==='RESULT_RETAINED'){await recovered.reconcile(req,1000);assert.equal((await recovered.reserve(req)).result.content[0].text,'Exact retained controlled response');}
   else {assert.equal(Number((await pool.query('SELECT reserved_microusd FROM engineering_work_model_budget WHERE work_id=$1',[w.id])).rows[0].reserved_microusd),req.microUsd);await assert.rejects(native.reserve({...req,stepKey:'writer:after-crash:0',requestHash:digest('after')}),/writer session|uncertain/);}
  }
  console.log('PASS: actual SIGKILL after',stage,'preserves contract/exposure without replay');
 }
 for(const mutation of [k=>k.stages[0].calls=null,k=>delete k.stages[1].microUsd,k=>k.qualification.expiresAt=null,k=>delete k.modelId,k=>k.stages[0].calls=1,k=>k.stages[0].calls=5.2,k=>k.stages[0].microUsd=70000.5]){
  const w=await prepare('malformed contract');const alteredStore=new WorkStore(store.principal,{query:async(sql,params)=>{
   if(sql.includes('admission_authority_snapshot=$20::jsonb')){params=[...params];const snapshot=JSON.parse(params[19]);mutation(snapshot.completion);params[19]=JSON.stringify(snapshot);}
   return (await pool.query(sql,params)).rows;
  }});
  await assert.rejects(admitNativeWork(alteredStore,w.id,w.version,w.generation,new NativeRouteAuthority(alteredStore,async()=>config),'writer'),/completion|qualification|stage/i);
  assert.equal((await pool.query('SELECT count(*)::int n FROM engineering_route_runs WHERE work_id=$1',[w.id])).rows[0].n,0);
 }
 const narrowed=await prepare('narrowed ceiling');await admit(narrowed);const pending=request(narrowed,'observer');await budget.reserve(pending);
 await pool.query('UPDATE engineering_work SET max_cost_usd=0.9 WHERE id=$1',[narrowed.id]);
 await assert.rejects(budget.assertDispatch(pending),/completion/);await assert.rejects(budget.reserve(request(narrowed,'new-observer')),/completion/);
 console.log('PASS: NULL/adversarial contracts and narrowed ceilings denied atomically');
 for(const roleKind of ['application','worker']) {
  const role='gap2b_native_'+randomBytes(6).toString('hex'),w=await prepare('restricted native '+roleKind);await admit(w);
  const connection=await pool.connect();
  try {
   await connection.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE`);
   await connection.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
   await connection.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${role}`);
   await connection.query(`GRANT EXECUTE ON FUNCTION engineering_model_reserve(jsonb),engineering_model_transition(jsonb) TO ${role}`);
   await connection.query(`SET ROLE ${role}`);
   const scopedStore=new WorkStore(store.principal,{query:async(sql,params)=>(await connection.query(sql,params)).rows});
   const scopedBudget=new NativeModelBudget(scopedStore,new NativeRouteAuthority(scopedStore,async()=>config));
   const req=await nativeRequest(w);await scopedBudget.reserve(req);await scopedBudget.assertDispatch(req);await scopedBudget.settle(req,1000,{content:[{type:'text',text:'Restricted native receipt'}]});
   assert.equal((await scopedBudget.reserve(req)).result.content[0].text,'Restricted native receipt');
   await assert.rejects(connection.query('UPDATE engineering_work_model_budget SET spent_microusd=0'),/permission denied/);
   console.log('PASS: restricted '+roleKind+' native common-ledger completion stage reserve/dispatch/settlement/replay');
  } finally {await connection.query('RESET ROLE');await connection.query(`DROP OWNED BY ${role}`);await connection.query(`DROP ROLE ${role}`);connection.release();}
 }
 const cancelled=await prepare('cancel preserves UNKNOWN');await admit(cancelled);
 const unknownRequest=await nativeRequest(cancelled);await native.reserve(unknownRequest);await native.assertDispatch(unknownRequest);await native.unknown(unknownRequest);
 await store.change(cancelled.id,{operation:'cancel',expectedVersion:cancelled.version});
 assert.equal(await held(cancelled),0);
 assert.equal(Number((await pool.query('SELECT reserved_microusd FROM engineering_work_model_budget WHERE work_id=$1',[cancelled.id])).rows[0].reserved_microusd),unknownRequest.microUsd);
 const savedConfig=config;config={...config,nativeQualification:{...config.nativeQualification,expiresAt:new Date(Date.now()+1800).toISOString()}};
 const expired=await prepare('expiry retains capacity');await admit(expired);const expiryHold=await held(expired);
 await new Promise(resolve=>setTimeout(resolve,1850));assert.equal(await held(expired),expiryHold);
 await assert.rejects(native.reserve(await nativeRequest(expired)));config=savedConfig;
 const exhausted=await prepare('stage exhausted');await admit(exhausted);
 for(let i=0;i<5;i++){const req=await nativeRequest(exhausted);await native.reserve(req);await native.assertDispatch(req);await native.settle(req,1000,{content:[{type:'text',text:'Controlled stage call'}]});}
 await assert.rejects(native.reserve(await nativeRequest(exhausted)),/completion|stage/);
 const exhaustedTruth=(await new EngineeringWorkerProjectionStore(store,agentId,id=>authority.assertEffect(id)).get(exhausted.id)).projection;
 assert.equal(exhaustedTruth.completionStatus,'STAGE_EXHAUSTED');assert.match(exhaustedTruth.nextStep,/No additional model call/);
 const retainedPolicy=await prepare('Retained arithmetic mirror only',777654);
 await assert.rejects(admit(retainedPolicy),error=>error.code==='INSUFFICIENT_COMPLETION_BUDGET');
 assert.equal(Number((await pool.query('SELECT spent_microusd FROM engineering_work_model_budget WHERE work_id=$1',[retainedPolicy.id])).rows[0].spent_microusd),777654);
 assert.equal(1300000-777654,522346);assert.equal(599040-522346,76694);
 console.log('PASS: explicit cancellation preserves UNKNOWN; expiry retains hold; stage exhaustion blocks; retained budget arithmetic denies admission unchanged');


 // Local model/tool lifecycle: source edits originate only in controlled model
 // responses and pass real custody services; verification is a separate actor.
 await pool.query('UPDATE agents SET max_steps=10 WHERE id=$1',[agentId]);
 for(const explanationVariant of ['valid','empty']) {
 const {work:freshSaved}=await store.create({title:'Fresh local M1 ER1',objective:config.objective,repository:profile.repository,criteria:config.criteria,maxCostUsd:1.3,maxDurationSeconds:3600,idempotencyKey:randomUUID()});
 const journey=await store.change(freshSaved.id,{operation:'resume',expectedVersion:freshSaved.version});
 const freshTruth=(await new EngineeringWorkerProjectionStore(store,agentId,id=>authority.assertEffect(id)).get(journey.id)).projection;
 const freshOptions={prompt:[{role:'user',content:[{type:'text',text:'Begin the bounded parser Work. '+currentTruthLines(freshTruth).join('\n')}]}],tools:[{type:'function',name:'engineering_direct',inputSchema:z.toJSONSchema(nativeDevelopmentToolSchema,{target:'draft-7'})}]};
 const initialModel=engineeringConversationModel({store,workId:journey.id,sessionId:'writer',stepKey:'writer:admission:0',modelId:'anthropic/claude-sonnet-5',productive:true},
  {authority,catalog:async()=>({models:[{id:'anthropic/claude-sonnet-5',pricing}]}),model:()=>({doGenerate:async(scoped)=>{const part=scoped.prompt.flatMap(m=>Array.isArray(m.content)?m.content:[]).find(p=>p.type==='text'&&p.text.startsWith('Authoritative selected Work state'));const state=JSON.parse(part.text.slice(part.text.indexOf('\n')+1));const request=nativeDevelopmentToolSchema.parse({request:{operation:'admit',expectedWorkVersion:state.expectedWorkVersion,expectedWorkGeneration:state.expectedWorkGeneration}});return {content:[{type:'tool-call',toolName:'engineering_direct',toolCallId:'admit',input:JSON.stringify(request)}],usage:{inputTokens:{total:1000},outputTokens:{total:100}},finishReason:{unified:'tool-calls'},warnings:[],providerMetadata:{gateway:{cost:'0.003'}}};}})});
 freshOptions.prompt.unshift({role:'system',content:'Old unrelated context. '.repeat(3000)});
 const admissionResponse=await initialModel.doGenerate(freshOptions);assert.equal(JSON.parse(admissionResponse.content[0].input).request.operation,'admit');
 const proposalFromModel=nativeDevelopmentToolSchema.parse(JSON.parse(admissionResponse.content[0].input)).request;
 await admitNativeWork(store,journey.id,proposalFromModel.expectedWorkVersion,proposalFromModel.expectedWorkGeneration,authority,'writer');
 const assertFactoryUnchanged=explanationVariant==='valid'?await assertReceiptDoesNotGrantAuthority(pool,store,journey,agentId):null;
 const initialReceipt=(await pool.query("SELECT reserved_microusd,spent_microusd FROM engineering_work_model_calls WHERE work_id=$1",[journey.id])).rows[0];
 assert(Number(initialReceipt.reserved_microusd)+await held(journey)<=1300000);
 console.log('PASS: actual fresh conversation wrapper/schema/Current Truth plus full completion maximum fit unchanged $1.30',JSON.stringify({conversationBound:Number(initialReceipt.reserved_microusd),completionHold:await held(journey)}));
 const directConfig={profile,approvedBase:config.approvedBase,objective:config.objective,criteria:config.criteria,agentId,issueNumber:1,assertCurrentAuthority:id=>authority.assertEffect(id)};
 const direct=new DirectDevelopmentStore(store,directConfig);
 const actions=[{operation:'open'},{operation:'read',path:'README.md'},{operation:'plan',expectedRevision:1,plan:'Implement approved parser; submit and repair protected failure.'},
  {operation:'write',expectedRevision:2,path:'quantity.mjs',content:retainedFixture.workspace[0].candidates[0].files['quantity.mjs']},
  {operation:'submit',expectedRevision:3},{operation:'inspect'},
  {operation:'write',expectedRevision:5,path:'quantity.mjs',content:retainedFixture.workspace[0].draft_files['quantity.mjs']},
  {operation:'submit',expectedRevision:6},null];
 let providerCalls=0;const telemetry=[];let finalPrompt;
 const options={prompt:[{role:'user',content:[{type:'text',text:'Complete the bounded parser and repair protected failures. Never claim Ready.'}]}],tools:[{type:'function',name:'engineering_direct',inputSchema:z.toJSONSchema(nativeDevelopmentToolSchema,{target:'draft-7'})}]};
 const verifier=new DockerProtectedVerifier();
 let failedCandidate,failedResult;
 for(const action of actions){
  const expectedProjection=(await new EngineeringWorkerProjectionStore(store,agentId,id=>authority.assertEffect(id)).get(journey.id)).projection;
  const expectedLines=currentTruthLines(expectedProjection);
  const factory=action?nativeBudgetedModel:engineeringConversationModel;
  const model=factory({store,workId:journey.id,sessionId:action?'writer':'fresh-reader',stepKey:'writer:local:'+serial++,productive:false,modelId:'anthropic/claude-sonnet-5'},
   {authority,budget:action?new NativeModelBudget(store,authority):new EngineeringConversationBudget(store,authority),catalog:async()=>({models:[{id:'anthropic/claude-sonnet-5',pricing}]}),model:()=>({doGenerate:async(scoped)=>{const statePart=scoped.prompt.find(p=>p.role==='user').content.find(p=>p.type==='text'&&p.text.startsWith('Authoritative selected Work state'));const supplied=JSON.parse(statePart.text.slice(statePart.text.indexOf('\n')+1));if(supplied.failure){const c=expectedProjection.executionController;assert.deepEqual(supplied.nativeExecution,{admissionRequired:false,runId:c.runId,writerSessionId:c.writer});assert.equal(supplied.expectedWorkVersion,expectedProjection.workVersion);assert.equal(supplied.expectedWorkGeneration,expectedProjection.workGeneration);assert.equal(supplied.candidate.sha,c.candidate);assert.deepEqual(supplied.executionController.budget,c.budget);assert.equal(supplied.executionController.nextOperation,c.nextOperation);assert(Buffer.byteLength(JSON.stringify({prompt:scoped.prompt,tools:scoped.tools}))+4096<=13000);}else assert.deepEqual(supplied.currentTruth,expectedLines);if(!action){finalPrompt=JSON.stringify(scoped.prompt);assert.deepEqual(scoped.tools,[]);assert.equal(scoped.toolChoice.type,'none');assert.match(finalPrompt,/Candidate history:/);assert.match(finalPrompt,/FAIL/);assert.match(finalPrompt,/Completion budget:/);}providerCalls++;return {content:action?[{type:'tool-call',toolName:'engineering_direct',toolCallId:'step-'+providerCalls,input:JSON.stringify({request:action})}]:explanationVariant==='empty'?[]:[{type:'text',text:'The repaired exact candidate passed protected local verification. Result is PARTIAL; publication, CI and review are unqualified.'}],usage:{inputTokens:{total:1000},outputTokens:{total:100}},finishReason:{unified:action?'tool-calls':'stop'},warnings:[],providerMetadata:{gateway:{cost:'0.003'}}};}})});
  if(!action && explanationVariant==='empty'){await assert.rejects(model.doGenerate(options),/outside this conversation phase/);continue;}
  const result=await model.doGenerate(options);
  if(action){const accepted=JSON.parse(result.content[0].input).request;await new NativeModelBudget(store,authority).assertSession(journey.id,'writer');
   if(accepted.operation==='open')await direct.open(journey.id,source);
   if(accepted.operation==='read')await direct.read(journey.id,accepted.path);
   if(accepted.operation==='plan')await direct.plan(journey.id,accepted.expectedRevision,accepted.plan);
   if(accepted.operation==='write'){if(accepted.expectedRevision===5)await crash('DRAFT',journey,null,accepted);else await direct.write(journey.id,accepted.expectedRevision,accepted.path,accepted.content);}
   if(accepted.operation==='inspect')assert.equal((await direct.inspect(journey.id)).workspace.phase,'VERIFICATION_FAILED');
   if(accepted.operation==='submit'){
    const submitted=await direct.submit(journey.id,accepted.expectedRevision);
    const beforeWait=providerCalls;const pending=await model.doGenerate(options);assert.match(pending.content[0].text,/awaiting protected/);assert.equal(providerCalls,beforeWait);
    if(failedCandidate)await crash('VERIFICATION',journey);else await new DirectVerificationDriver(direct,verifier).run(journey.id);const retained=await new NativeResultStore(direct).retain(journey.id);
    const checked=(await direct.inspect(journey.id)).workspace.evidence.filter(e=>e.candidate===submitted.candidate.sha);assert.equal(checked.length,10);assert.equal(new Set(checked.map(e=>e.check)).size,10);
    if(!failedCandidate){assert(retained.proof.evidence.some(e=>e.state==='FAIL'));failedCandidate=submitted.candidate.sha;failedResult=retained.id;assert.equal(retained.proof.outcome,'FAILED');}
    else{assert(retained.proof.evidence.every(e=>e.state==='PASS'));assert.notEqual(submitted.candidate.sha,failedCandidate);assert.equal(retained.proof.outcome,'PARTIAL');}
   }
  }
  const [observed]=(await pool.query('SELECT spent_microusd,reserved_microusd,calls_admitted,engineering_completion_remaining(scope_id,work_id) held FROM engineering_work_model_budget WHERE work_id=$1',[journey.id])).rows;
  telemetry.push({stage:action?.operation??'fresh-explanation',...observed});
  assert(Number(observed.spent_microusd)+Number(observed.reserved_microusd)+Number(observed.held)<=1300000);
 }
 console.log('PASS: SIGKILL after repair draft and protected verification; real deny-network Docker checks retained');
 assert.equal(providerCalls,9);assert.equal(await held(journey),0);
 const final=(await direct.inspect(journey.id)).workspace;assert.equal(final.phase,'VERIFICATION_PASSED');assert.equal(final.candidates.length,2);
 assert.equal((await pool.query('SELECT proof FROM engineering_native_results WHERE id=$1',[failedResult])).rows[0].proof.outcome,'FAILED');
 const totals=(await pool.query('SELECT spent_microusd,reserved_microusd,ceiling_microusd FROM engineering_work_model_budget WHERE work_id=$1',[journey.id])).rows[0];
 assert.equal(Number(totals.spent_microusd),30000);assert.equal(Number(totals.reserved_microusd),0);assert.equal(Number(totals.ceiling_microusd),1300000);
 console.log('PASS: local controlled-model failure -> repair -> submission -> protected verification -> immutable PARTIAL; 10 charges including admission, no source edits outside model outputs');
 const finalTruth=(await new EngineeringWorkerProjectionStore(store,agentId,id=>authority.assertEffect(id)).get(journey.id)).projection;
 assert.equal(finalTruth.completionStatus,explanationVariant==='valid'?'COMPLETE':'RECONCILIATION_REQUIRED');assert.equal(finalTruth.verification.status,'PASS');assert.equal(finalTruth.runTruth.activeRun,null);
 assert.equal(finalTruth.runTruth.runHistory.length,1);assert(finalTruth.runTruth.latestRun);assert.equal(finalTruth.readiness.ready,false);
 assert.equal(finalTruth.candidateHistory[0].checks,'FAIL');assert.equal(finalTruth.candidateHistory[1].checks,'PASS');
 assert(finalPrompt.includes(finalTruth.verification.candidateSha));assert.match(currentTruthLines(finalTruth).join('\n'),/historical identity grants no authority/);
 // Exact second failed candidate is terminal for source repair even with profile.maxRuns=4.
 await pool.query("UPDATE engineering_direct_workspaces SET phase='VERIFICATION_FAILED' WHERE work_id=$1",[journey.id]);
 await assert.rejects(direct.write(journey.id,final.revision,'quantity.mjs',source.files['quantity.mjs']),/repair iteration/);
 await assert.rejects(direct.plan(journey.id,final.revision,'Third attempt'),/repair iteration/);
 await assert.rejects(direct.submit(journey.id,final.revision),/repair iteration/);
 if(explanationVariant==='valid' && process.env.NATIVE_COMPLETION_TELEMETRY)await writeFile(process.env.NATIVE_COMPLETION_TELEMETRY,JSON.stringify({kind:'LOCAL_SYNTHETIC_CONTROLLED_PROVIDER',ceilingMicrousd:1300000,initialConversationBoundMicrousd:Number(initialReceipt.reserved_microusd),completionHoldMicrousd:initialHold,maximumPlannedMicrousd:Number(initialReceipt.reserved_microusd)+initialHold,telemetry,finalTruth},null,2)+'\n');
 if(assertFactoryUnchanged)await assertFactoryUnchanged();
 console.log('PASS: '+explanationVariant+' fresh explanation truth/charge; third source repair denied');
 }

} finally {await pool?.end();await admin.query('DROP DATABASE IF EXISTS '+name);await admin.end();}
