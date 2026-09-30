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
export async function qualifyAlphaConversation({store,pool,engineering,connection,direct,source,commands,pass}) {
 await pool.query('UPDATE agents SET max_estimated_cost_usd=GREATEST(max_estimated_cost_usd,1.35),max_steps=GREATEST(max_steps,5) WHERE id=$1 AND owner_id=$2',[engineering.agentId,engineering.ownerId]);
 const qualification={mode:'FACTORY_CONVERSATION_V1',modelId:'openai/gpt-5.4-mini',expiresAt:new Date(Date.now()+3600000).toISOString(),evidenceRef:'synthetic connected fixture only',ceilingMicrousd:300000,perCallMicrousd:150000,maxCalls:2,maxOutputTokens:1024,factoryCeilingMicrousd:1050000};
 const config={...engineering,conversationQualification:qualification};
 const authority=new NativeRouteAuthority(store,async()=>config),budget=new EngineeringConversationBudget(store,authority);
 const factoryConfig={engineering:config,connection:{...connection,spendPlan:{...connection.spendPlan,plannedProductiveOperations:2,plannedCompletionOperations:1,maxPaidOperations:3,completionReserveMicrousd:336864}},commands,routing:{intent:'PRODUCE',boundedOperationQualified:false}};
 const driver=()=>new FactoryWorkDriver(store,new FactoryRouteAuthority(store,async()=>factoryConfig),direct,new DockerProtectedVerifier(),async()=>source);
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
 const work=await fresh('Sofie canonical selected Work to Factory');
 const approvalKeys=['MYEVE_FACTORY_REAL_EXECUTION_APPROVED','MYEVE_FACTORY_APPROVED_WORK_ID','MYEVE_FACTORY_APPROVED_WORK_VERSION','MYEVE_FACTORY_APPROVED_WORK_GENERATION'];
 const previous=approvalKeys.map(k=>process.env[k]);
 Object.assign(process.env,{MYEVE_FACTORY_REAL_EXECUTION_APPROVED:'true',MYEVE_FACTORY_APPROVED_WORK_ID:work.id,MYEVE_FACTORY_APPROVED_WORK_VERSION:String(work.version),MYEVE_FACTORY_APPROVED_WORK_GENERATION:String(work.generation)});
 let modelCalls=0,proposal;
 const options={prompt:[{role:'user',content:[{type:'text',text:'Continue the selected approved Work.'}]}],tools:[{type:'function',name:'engineering_factory',inputSchema:{type:'object'}},{type:'function',name:'engineering_direct',inputSchema:{type:'object'}}]};
 function model(step){return engineeringConversationModel({store,workId:work.id,sessionId:'alpha-journey',stepKey:'alpha-journey:'+step,modelId:qualification.modelId,productive:true},{authority,catalog:async()=>({models:[{id:qualification.modelId,pricing:{input:'0.00000075',output:'0.0000045'}}]}),model:()=>({doGenerate:async scoped=>{
  modelCalls++;assert(scoped.maxOutputTokens===1024);assert.deepEqual(scoped.providerOptions,{gateway:{only:['openai']}});
  return {content:scoped.tools.length?captured.content:[{type:'text',text:'The retained candidate passed protected checks and remains PARTIAL pending separate publication and acceptance.'}],usage:{inputTokens:{total:10},outputTokens:{total:10}},finishReason:{unified:'stop',raw:'stop'},warnings:[],providerMetadata:{gateway:{cost:'0.001',generationId:'synthetic-sofie-'+modelCalls}}};
 }})});}
 try {
  const first=await model(0).doGenerate(options);assert.equal(first.content[0].toolName,'engineering_factory');proposal=JSON.parse(first.content[0].input);assert.equal(proposal.expectedWorkVersion,work.version);assert.equal(proposal.expectedWorkGeneration,work.generation);
  const replay=await budget.reserve({...request(work),sessionId:'foreign'});assert.fail('Second admission unexpectedly reserved '+replay);
 } catch(error) {assert.match(error.message,/phase operation already used/);} 
 try {
  assert.equal(modelCalls,1);
  await assert.rejects(pool.query('UPDATE engineering_alpha_work_budget SET factory_microusd=1200000 WHERE work_id=$1',[work.id]),/cannot be reset/);
  await assert.rejects(budget.reserve(request(work,'explanation')),/current Result/);
  const queuePolicy={ownerId:config.ownerId,repository:config.profile.repository,maxCostUsd:1.35,maxDurationSeconds:600};
  const queued=await Promise.all([enqueueFactoryCommand(store,work.id,proposal,queuePolicy),enqueueFactoryCommand(store,work.id,proposal,queuePolicy)]);
  assert.equal(queued[0].command.id,queued[1].command.id);assert.equal(queued[0].executionGranted,false);
  await assert.rejects(enqueueFactoryCommand(store,work.id,{...proposal,expectedWorkGeneration:1},queuePolicy),/current Work/);
  await assert.rejects(enqueueFactoryCommand(store,work.id,{...proposal,expectedWorkVersion:1},queuePolicy),/current Work/);
  let state,consumed=0;
  const consume=async(id,input)=>{consumed++;state=await driver().start(id,input.expectedWorkVersion,input.expectedWorkGeneration);};
  await consumeFactoryCommands(store,consume);await consumeFactoryCommands(store,consume);assert.equal(consumed,1);
  const rows=(await pool.query('SELECT status FROM engineering_factory_commands WHERE work_id=$1',[work.id])).rows;
  assert.deepEqual(rows,[{status:'done'}]);
  pass('Captured live JSON-text proposal reaches canonical queue/admission exactly once; duplicate and stale proposals do not redispatch');
  const waiting=await model(1).doGenerate(options);assert.equal(modelCalls,1);assert.equal(waiting.content[0].type,'text');
  for(let i=0;i<150&&!['PARTIAL','FAILED','TERMINAL'].includes(state.state);i++){await new Promise(r=>setTimeout(r,50));state=await driver().step(work.id);}
  assert.equal(state.state,'PARTIAL');
  const decision=await driver().decision(work.id),b=(await pool.query('SELECT * FROM engineering_work_model_budget WHERE work_id=$1',[work.id])).rows[0];
  assert.equal(decision.factory_preparation.request.maxSpendUsd,1.05);assert.equal(Date.parse(decision.factory_preparation.request.deadline),new Date(b.deadline).getTime());
  await model(2).doGenerate(options);assert.equal(modelCalls,2);
  await assert.rejects(model(3).doGenerate(options),/budget denied|phase operation already used/);assert.equal(modelCalls,2);
  const balance=(await pool.query('SELECT * FROM engineering_work_model_budget WHERE work_id=$1',[work.id])).rows[0];assert.equal(Number(balance.spent_microusd),2000);assert.equal(Number(balance.ceiling_microusd),300000);assert.equal(Number(balance.reserved_microusd),0);
  assert.equal(decision.factory_observation.value.spend.ceilingMicrousd,1050000);assert.equal(decision.factory_observation.value.spend.maxPaidOperations,3);assert.equal(decision.factory_observation.value.spend.completionReserveMicrousd,336864);
  pass('Selected-Work Sofie common ledger → canonical Factory → signed custody → Docker verifier → bounded Sofie explanation; combined ceiling and original deadline preserved');
 } finally {approvalKeys.forEach((k,i)=>previous[i]===undefined?delete process.env[k]:process.env[k]=previous[i]);}
 return 1;
}
