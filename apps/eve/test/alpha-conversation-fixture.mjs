import {generateText,tool,jsonSchema} from 'ai';
import {factoryActionSchema} from '../lib/engineering/factory-api.ts';
import {z} from 'zod';
import {LiveFactoryAdapter} from '../lib/engineering/factory-live-adapter.ts';
import {EngineeringWorkerProjectionStore} from '../lib/engineering/worker-projection.ts';
import {ALPHA_FACTORY_ADMISSION_INSTRUCTIONS,FACTORY_START_PROPOSAL_CONTRACT} from '../lib/engineering/factory-proposal-contract.ts';
import {readFileSync} from 'node:fs';
import {enqueueFactoryCommand,consumeFactoryCommands} from '../lib/engineering/factory-commands.ts';
const captured=JSON.parse(readFileSync(new URL('../lib/engineering/fixtures/first-live-factory-proposal.json',import.meta.url),'utf8'));
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {engineeringConversationModel} from '../lib/engineering/conversation-model.ts';
import {EngineeringConversationBudget} from '../lib/engineering/conversation-budget.ts';
import {NativeRouteAuthority} from '../lib/engineering/native-routing.ts';
import {FactoryRouteAuthority} from '../lib/engineering/factory-routing.ts';
import {FactoryWorkDriver} from '../lib/engineering/factory-work-driver.ts';
import {digest} from '../lib/engineering/contract.ts';
import {DockerProtectedVerifier} from '../lib/engineering/docker-executor.ts';
export async function qualifyAlphaConversation({store,pool,engineering,connection,direct,source,commands,pass,executionCount,stopAtProviderBoundary,recordJourney}) {
 await pool.query('UPDATE agents SET max_estimated_cost_usd=GREATEST(max_estimated_cost_usd,1.35),max_steps=GREATEST(max_steps,5) WHERE id=$1 AND owner_id=$2',[engineering.agentId,engineering.ownerId]);
 const qualification={mode:'FACTORY_CONVERSATION_V1',modelId:'openai/gpt-5.4-mini',expiresAt:new Date(Date.now()+3600000).toISOString(),evidenceRef:'synthetic connected fixture only',ceilingMicrousd:300000,perCallMicrousd:150000,maxCalls:2,maxOutputTokens:1024,factoryCeilingMicrousd:1050000};
 const config={...engineering,conversationQualification:qualification};
 const authority=new NativeRouteAuthority(store,async()=>config),budget=new EngineeringConversationBudget(store,authority);
 const factoryConfig={engineering:config,connection:{...connection,spendPlan:{...connection.spendPlan,plannedProductiveOperations:2,plannedCompletionOperations:1,maxPaidOperations:3,completionReserveMicrousd:336864}},commands,routing:{intent:'PRODUCE',boundedOperationQualified:false}};
 let trackedWorkId=null;const handoff=[];
 const observedAdapter=c=>new LiveFactoryAdapter(c,async(url,init)=>{
  const path=new URL(url).pathname;
  if(trackedWorkId&&init?.method==='POST'&&(path.endsWith('/dispatches')||path.endsWith('/dispatch'))){
   const rows=(await pool.query('SELECT d.status,r.dispatch_state FROM engineering_routing_decisions d LEFT JOIN engineering_route_runs r ON r.decision_id=d.id WHERE d.work_id=$1',[trackedWorkId])).rows;
   if(path.endsWith('/dispatch')){assert.equal(rows.length,1);assert.equal(rows[0].status,'ADMITTED');assert.equal(rows[0].dispatch_state,'UNKNOWN');handoff.push('BACKEND_ADMITTED_WRITER_DISPATCH');}
   else {assert.equal(rows[0]?.status,'PROPOSED');assert.equal(rows[0]?.dispatch_state,null);handoff.push('NONPRODUCTIVE_PREPARE');}
  }
  return fetch(url,init);
 });
 const driver=()=>new FactoryWorkDriver(store,new FactoryRouteAuthority(store,async()=>factoryConfig),direct,new DockerProtectedVerifier(),async()=>source,observedAdapter);
 async function fresh(title){let {work}=await store.create({title,objective:config.objective,repository:config.profile.repository,criteria:config.criteria,maxCostUsd:1.35,maxDurationSeconds:600,idempotencyKey:randomUUID()});return store.change(work.id,{operation:'resume',expectedVersion:work.version});}
 const request=(work,stage='admission',key=randomUUID())=>({workId:work.id,sessionId:'alpha',stepKey:key+':0',requestHash:digest(key),modelId:qualification.modelId,microUsd:20000,maxCalls:2,pricing:{input:'0.00000075',output:'0.0000045'},bounds:{inputBytes:1000,maxOutputTokens:1024,alphaFactory:{stage}}});
 const early=await fresh('alpha early explanation');await assert.rejects(budget.reserve(request(early,'explanation')),/fresh Work/);
 const overflow=await fresh('alpha reserve overflow');await assert.rejects(budget.reserve({...request(overflow),microUsd:150001}),/fixed allowance/);
 const uncertain=await fresh('alpha uncertain admission'),reservation=request(uncertain);
 await budget.reserve(reservation);await budget.assertDispatch(reservation);await budget.unknown(reservation);
 await assert.rejects(budget.reserve(request(uncertain)),/unresolved exposure/);
 await assert.rejects(driver().start(uncertain.id,uncertain.version,uncertain.generation));
 const held=(await pool.query('SELECT reserved_microusd FROM engineering_work_model_budget WHERE work_id=$1',[uncertain.id])).rows[0];assert.equal(Number(held.reserved_microusd),20000);
 pass('Alpha UNKNOWN retains common-ledger exposure and prevents another Sofie call or Factory start');
 // Fail closed before any preparation/writer, using actual backend context.
 for(const kind of ['cancelled','budget-unavailable','unsupported-repository']){
  let denied=await fresh('Proposal denied: '+kind);
  if(kind==='cancelled')denied=await store.change(denied.id,{operation:'cancel',expectedVersion:denied.version});
  if(kind==='budget-unavailable'){await budget.reserve(request(denied));await pool.query('UPDATE agents SET max_estimated_cost_usd=0.01 WHERE id=$1',[engineering.agentId]);}
  if(kind==='unsupported-repository')await pool.query("UPDATE engineering_work SET repository='unsupported/repository' WHERE id=$1",[denied.id]);
  try{if(kind==='budget-unavailable'){assert.equal((await driver().start(denied.id,denied.version,denied.generation)).route,'HUMAN');assert.equal((await driver().decision(denied.id)).factory_preparation,null);}else{await assert.rejects(driver().start(denied.id,denied.version,denied.generation));assert.equal(await driver().decision(denied.id),null);}assert.equal((await pool.query('SELECT id FROM engineering_route_runs WHERE work_id=$1',[denied.id])).rowCount,0);}
  finally{await pool.query('UPDATE agents SET max_estimated_cost_usd=GREATEST(max_estimated_cost_usd,1.35) WHERE id=$1',[engineering.agentId]);}
 }
 pass('Cancelled Work, unavailable budget and unsupported repository are denied by trusted backend before preparation/writer');
 const work=await fresh('Sofie canonical selected Work to Factory');trackedWorkId=work.id;
 const beforeExecutions=executionCount();
 const initial=(await new EngineeringWorkerProjectionStore(store,engineering.agentId).get(work.id)).projection;
 assert.equal(initial.routing,null);assert.equal(initial.factoryWriter,undefined);
 const queuePolicy={ownerId:config.ownerId,repository:config.profile.repository,maxCostUsd:1.35,maxDurationSeconds:600};
 let sdkQueued;
 const approvalKeys=['MYEVE_FACTORY_REAL_EXECUTION_APPROVED','MYEVE_FACTORY_APPROVED_WORK_ID','MYEVE_FACTORY_APPROVED_WORK_VERSION','MYEVE_FACTORY_APPROVED_WORK_GENERATION'];
 const previous=approvalKeys.map(k=>process.env[k]);
 Object.assign(process.env,{MYEVE_FACTORY_REAL_EXECUTION_APPROVED:'true',MYEVE_FACTORY_APPROVED_WORK_ID:work.id,MYEVE_FACTORY_APPROVED_WORK_VERSION:String(work.version),MYEVE_FACTORY_APPROVED_WORK_GENERATION:String(work.generation)});
 let modelCalls=0,proposal;
 const options={prompt:[{role:'user',content:[{type:'text',text:'Continue the selected approved Work.'}]}],tools:[{type:'function',name:'engineering_factory',inputSchema:{type:'object'}},{type:'function',name:'engineering_direct',inputSchema:{type:'object'}}]};
 function model(step){return engineeringConversationModel({store,workId:work.id,sessionId:'alpha-journey',stepKey:'alpha-journey:'+step,modelId:qualification.modelId,productive:true},{authority,catalog:async()=>({models:[{id:qualification.modelId,pricing:{input:'0.00000075',output:'0.0000045'}}]}),model:()=>({doGenerate:async scoped=>{
  modelCalls++;assert(scoped.maxOutputTokens===1024);assert.deepEqual(scoped.providerOptions,{gateway:{only:['openai']}});
  if(scoped.tools.length){
   assert.equal(scoped.prompt[0].content,ALPHA_FACTORY_ADMISSION_INSTRUCTIONS);
   assert.equal(scoped.tools[0].description,FACTORY_START_PROPOSAL_CONTRACT);
   assert(JSON.stringify(scoped.prompt).includes('UNROUTED'));
   assert(!JSON.stringify(scoped.prompt).includes('Native execution:'));
  }
  return {content:scoped.tools.length?captured.content:[{type:'text',text:'The retained candidate passed protected checks and remains PARTIAL pending separate publication and acceptance.'}],usage:{inputTokens:{total:10},outputTokens:{total:10}},finishReason:{unified:'stop',raw:'stop'},warnings:[],providerMetadata:{gateway:{cost:'0.001',generationId:'synthetic-sofie-'+modelCalls}}};
 }})});}
 try {
  const first=await generateText({model:model(0),prompt:'Continue the selected approved Work.',tools:{engineering_factory:tool({description:FACTORY_START_PROPOSAL_CONTRACT,inputSchema:jsonSchema(z.toJSONSchema(factoryActionSchema)),execute:async input=>{sdkQueued=await enqueueFactoryCommand(store,work.id,input,queuePolicy);return sdkQueued;}})}});
  assert.equal(first.toolCalls.length,1);assert.equal(first.toolCalls[0].toolName,'engineering_factory');proposal=first.toolCalls[0].input;assert.equal(proposal.expectedWorkVersion,work.version);assert.equal(proposal.expectedWorkGeneration,work.generation);
  const replay=await budget.reserve({...request(work),sessionId:'foreign'});assert.fail('Second admission unexpectedly reserved '+replay);
 } catch(error) {assert.match(error.message,/phase operation already used/);} 
 try {
  assert.equal(modelCalls,1);
  await assert.rejects(pool.query('UPDATE engineering_alpha_work_budget SET factory_microusd=1200000 WHERE work_id=$1',[work.id]),/cannot be reset/);
  await assert.rejects(budget.reserve(request(work,'explanation')),/current Result/);
  assert.equal(sdkQueued.executionGranted,false);
  assert.equal((await pool.query('SELECT id FROM engineering_route_runs WHERE work_id=$1',[work.id])).rowCount,0);
  assert.equal(await driver().decision(work.id),null);assert.equal(handoff.length,0);assert.equal(executionCount(),beforeExecutions);
  for(const claim of [{route:'ADMITTED'},{writer:'ACTIVE'},{dispatch:true},{maxCostUsd:10}])await assert.rejects(enqueueFactoryCommand(store,work.id,{...proposal,...claim},queuePolicy));
  assert.equal((await pool.query('SELECT id FROM engineering_route_runs WHERE work_id=$1',[work.id])).rowCount,0);
  assert.equal(Number((await pool.query('SELECT ceiling_microusd FROM engineering_work_model_budget WHERE work_id=$1',[work.id])).rows[0].ceiling_microusd),300000);
  pass('Model proposal/claims grant zero route authority, writer, dispatch or budget expansion; queued request waits for trusted consumer');
  const queued=await Promise.all([enqueueFactoryCommand(store,work.id,proposal,queuePolicy),enqueueFactoryCommand(store,work.id,proposal,queuePolicy)]);
  assert.equal(queued[0].command.id,sdkQueued.command.id);assert.equal(queued[0].command.id,queued[1].command.id);assert.equal(queued[0].executionGranted,false);
  await assert.rejects(enqueueFactoryCommand(store,work.id,{...proposal,expectedWorkGeneration:1},queuePolicy),/current Work/);
  await assert.rejects(enqueueFactoryCommand(store,work.id,{...proposal,expectedWorkVersion:1},queuePolicy),/current Work/);
  let state,consumed=0;
  const consume=async(id,input)=>{consumed++;state=await driver().start(id,input.expectedWorkVersion,input.expectedWorkGeneration);};
  await consumeFactoryCommands(store,consume);await consumeFactoryCommands(store,consume);assert.equal(consumed,1);
  const rows=(await pool.query('SELECT status FROM engineering_factory_commands WHERE work_id=$1',[work.id])).rows;
  assert.deepEqual(rows,[{status:'done'}]);
  pass('Captured live JSON-text proposal reaches canonical queue/admission exactly once; duplicate and stale proposals do not redispatch');
  const waiting=await model(1).doGenerate(options);assert.equal(modelCalls,1);assert.equal(waiting.content[0].type,'text');
  for(let i=0;i<(stopAtProviderBoundary?400:150)&&!['PARTIAL','FAILED','TERMINAL'].includes(state.state);i++){await new Promise(r=>setTimeout(r,50));state=await driver().step(work.id);}
  if(stopAtProviderBoundary){
   const boundary=stopAtProviderBoundary();assert.equal(boundary.model,qualification.modelId);assert.equal(boundary.forwarded,false);assert.equal(boundary.realModelOperations,0);
   assert(['FAILED','TERMINAL'].includes(state.state));
   const truth=(await new EngineeringWorkerProjectionStore(store,engineering.agentId).get(work.id)).projection;
   assert.equal(truth.routing.status,'ADMITTED');assert.equal(truth.factoryWriter.state,'TERMINAL');
   assert.equal(truth.factoryWriter.observation.snapshot.configuration.model,qualification.modelId);
   assert.equal(truth.factoryWriter.observation.snapshot.factoryVersion,factoryConfig.connection.factoryVersion);
   assert.equal(truth.factoryWriter.observation.spend.operations.length,1);
   assert.equal(truth.factoryWriter.observation.spend.operations[0].model,qualification.modelId);
   assert.equal(truth.factoryWriter.observation.spend.operations[0].state,'unknown');
   assert.equal(truth.readiness.ready,false);assert.equal(truth.nativeResult,null);
   assert.equal(executionCount()-beforeExecutions,1);assert.equal(modelCalls,1);
   assert.deepEqual(handoff,['NONPRODUCTIVE_PREPARE','BACKEND_ADMITTED_WRITER_DISPATCH']);
   pass('Attempt 3: captured Sofie → admitted exact-model snapshot → one START → installed executor → controlled provider boundary; no forwarding/generation, terminal UNKNOWN fenced');
   return 1;
  }
  assert.equal(state.state,'PARTIAL');
  const readback=(await new EngineeringWorkerProjectionStore(store,engineering.agentId).get(work.id)).projection;
  assert.equal(readback.routing.status,'ADMITTED');assert.equal(readback.routing.selectedRoute,'MYFACTORY');
  assert(readback.factoryWriter.remoteRunId);assert(readback.factoryWriter.dispatchIdentity);assert.equal(readback.factoryWriter.state,'TERMINAL');
  assert.deepEqual(handoff,['NONPRODUCTIVE_PREPARE','BACKEND_ADMITTED_WRITER_DISPATCH']);
  assert.equal(executionCount()-beforeExecutions,1);
  pass('Attempt 2 UNROUTED guidance → SDK proposal → canonical queue → nonproductive PREPARE → Gate B admission → one writer/START; exact readback confirmed');
  const decision=await driver().decision(work.id),b=(await pool.query('SELECT * FROM engineering_work_model_budget WHERE work_id=$1',[work.id])).rows[0];
  assert.equal(decision.factory_preparation.request.maxSpendUsd,1.05);assert.equal(Date.parse(decision.factory_preparation.request.deadline),new Date(b.deadline).getTime());
  await model(2).doGenerate(options);assert.equal(modelCalls,2);
  await assert.rejects(model(3).doGenerate(options),/budget denied|phase operation already used/);assert.equal(modelCalls,2);
  const balance=(await pool.query('SELECT * FROM engineering_work_model_budget WHERE work_id=$1',[work.id])).rows[0];assert.equal(Number(balance.spent_microusd),2000);assert.equal(Number(balance.ceiling_microusd),300000);assert.equal(Number(balance.reserved_microusd),0);
  assert.equal(decision.factory_observation.value.spend.ceilingMicrousd,1050000);assert.equal(decision.factory_observation.value.spend.maxPaidOperations,3);assert.equal(decision.factory_observation.value.spend.completionReserveMicrousd,336864);
  assert.equal(state.result.proof.outcome,'PARTIAL');
  assert(state.result.proof.evidence.every(e=>e.state==='PASS'));
  const retainedWorkspace=(await direct.inspect(work.id)).workspace;
  assert.deepEqual(retainedWorkspace.candidates.at(-1).changedPaths,['quantity.mjs']);
  const operationClasses=decision.factory_observation.value.spend.operations.map(o=>o.phase);
  assert(operationClasses.filter(p=>p==='productive').length<=2);assert.equal(operationClasses.filter(p=>p==='completion').length,1);
  recordJourney?.({operationClasses:['sofie',...operationClasses,'sofie-explanation'],workId:work.id,model:qualification.modelId,modelOperations:modelCalls+decision.factory_observation.value.spend.paidOperationsUsed,
   sofieOperations:modelCalls,factoryOperations:decision.factory_observation.value.spend.paidOperationsUsed,
   candidate:retainedWorkspace.candidates.at(-1).sha,candidateCustody:'PASS',protectedVerification:'PASS',
   resultId:state.result.id,proof:state.result.proof,finalExplanation:'PASS_SYNTHETIC',publicationEffects:0,additionalRealModelOperations:0});
  pass('Selected-Work Sofie common ledger → canonical Factory → signed custody → Docker verifier → bounded Sofie explanation; combined ceiling and original deadline preserved');
 } finally {approvalKeys.forEach((k,i)=>previous[i]===undefined?delete process.env[k]:process.env[k]=previous[i]);}
 return 1;
}
