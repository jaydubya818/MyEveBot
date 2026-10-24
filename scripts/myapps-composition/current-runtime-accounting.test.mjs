import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateCurrentRuntimeAccounting} from './current-runtime-accounting.mjs';
import {hashOrderedTranscript} from './transcript-value-hash.mjs';
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function fixture(){
 const usage={version:1,state:'active',dayIndex:0,localPaused:false,dailyTurnsUsed:2,quotaRemaining:8,dailyReservedMicrousd:200000,trialReservedMicrousd:200000,
  activatedAt:'2026-10-24T00:00:00Z',expiresAt:'2026-10-29T00:00:00Z',resetsAt:'2026-10-25T00:00:00Z',
  limits:{dailyTurns:10,perTurnMicrousd:100000,dailyMicrousd:1000000,trialMicrousd:5000000,sharedDailyMicrousd:2000000,sharedTrialMicrousd:10000000},
  measured:{dailyMicrousd:0,trialMicrousd:0,unsettledOperations:0}};
 const events=[{meta:{id:'event1'},type:'message.completed',data:{message:'first'}},{meta:{id:'event2'},type:'message.completed',data:{message:'second'}}];
 const publicProof={status:'PUBLIC_BEHAVIOR_OBSERVED_BINDING_REQUIRED',ownerId:'owner-a',agentId:'agent-a',threadId:'thread-a',sessionId:'session-a',
  authoredMessages:2,authoredClientInvocations:2,first:{turnId:'turn-a',replySha256:digest('first')},second:{turnId:'turn-b',replySha256:digest('second')},
  finalState:{sessionId:'session-a',streamIndex:2},finalReplay:{orderedTranscriptSha256:hashOrderedTranscript(events)},usage:structuredClone(usage)};
 const db={ownerId:'owner-a',projectId:'prj_synthetic',asynchronousErrors:0,usage,
  agents:[{id:'agent-a',owner_id:'owner-a',is_primary:true}],
  runs:['a','b'].map(x=>({id:'agent_run_session-a_turn-'+x,owner_id:'owner-a',agent_id:'agent-a',thread_id:'thread-a',session_id:'session-a',status:'completed',model_steps:1})),
  threads:[{id:'thread-a',owner_id:'owner-a',agent_id:'agent-a',chat:{session:publicProof.finalState,events}}],
  credentials:[{ownerId:'owner-a',version:0,hashed:true}],
  allowances:[1,2].map(x=>({id:'allowance-'+x,kind:'CHAT',day_index:0,ceiling_microusd:'100000'})),
  operations:[1,2].map(x=>({id:'operation-'+x,allowance_id:'allowance-'+x,state:'SETTLED',source:'SOFIE',spent_microusd:'0'})),
  admissions:[1,2].map(x=>({id:'admission-'+x,local_allowance_id:'allowance-'+x,kind:'CHAT',state:'BOUND',day_index:0,ceiling_microusd:'100000'})),
  dispatches:[1,2].map(x=>({admission_id:'admission-'+x,state:'SETTLED'})),
  effects:Object.fromEntries(['engineering_work','external_alpha_work_authority','external_alpha_work_result','external_alpha_tool_effect','engineering_owner_decisions','engineering_candidate_publications'].map(x=>[x,0])),
  unusedOwner:{ownerId:'owner-b',threads:0,runs:0,admissions:0}};
 const model={kind:'DETERMINISTIC_CURRENT_RUNTIME_PROBE_ONLY',calls:2,httpRequests:2,failedRequests:0,unexpectedPaths:0,
  requests:[{index:1,promptSha256:'first-prompt',replySha256:digest('first')},{index:2,promptSha256:'second-context-prompt',replySha256:digest('second')}]};
 return {publicProof,db,model};
}
test('contemporaneous public/model/DB identities and exact nonrefundable accounting join',()=>{
 const {publicProof,db,model}=fixture();const value=validateCurrentRuntimeAccounting(publicProof,db,model);
 assert.equal(value.actualModelDispatches,2);assert.equal(value.usage.quotaRemaining,8);assert.equal(value.status,'PUBLIC_PROCESS_DATABASE_MODEL_ACCOUNTING_JOIN_OBSERVED');
});
test('JSONB object-key ordering preserves the complete durable accounting join',()=>{
 const value=fixture();
 value.db.threads[0].chat.events=value.db.threads[0].chat.events.map(event=>({
  data:{...event.data},type:event.type,meta:{...event.meta}}));
 assert.equal(validateCurrentRuntimeAccounting(value.publicProof,value.db,value.model).actualModelDispatches,2);
});
for(const [name,mutate] of [
 ['same-session different turn',({db})=>db.runs[0].id='agent_run_session-a_foreign-turn'],
 ['foreign owner',({db})=>db.runs[0].owner_id='owner-b'],
 ['foreign agent',({db})=>db.threads[0].agent_id='agent-b'],
 ['foreign session',({db})=>db.runs[0].session_id='session-b'],
 ['unknown operation',({db})=>db.operations[0].state='UNKNOWN'],
 ['unbound central admission',({db})=>db.admissions[0].state='PREPARED'],
 ['unknown central dispatch',({db})=>db.dispatches[0].state='UNKNOWN'],
 ['missing ledger edge',({db})=>db.admissions[0].local_allowance_id='nonexistent'],
 ['duplicate operation',({db})=>db.operations[1].id=db.operations[0].id],
 ['wrong trial cap',({db})=>db.usage.limits.trialMicrousd=10000000],
 ['refunded reservation',({db})=>db.usage.trialReservedMicrousd=0],
 ['unsettled measured usage',({publicProof})=>publicProof.usage.measured.unsettledOperations=1],
 ['changed durable message body',({db})=>db.threads[0].chat.events[0].data.message='modified'],
 ['modified unused owner',({db})=>db.unusedOwner.admissions=1],
 ['unexpected Work',({db})=>db.effects.engineering_work=1],
 ['model retry hidden by authored count',({model})=>model.httpRequests=3],
 ['two failed and retried HTTP requests',({model})=>model.failedRequests=1],
 ['wrong model reply',({model})=>model.requests[1].replySha256=digest('wrong')],
 ['extra model operation',({db})=>db.runs[1].model_steps=2],
 ['password stored un-hashed',({db})=>db.credentials[0].hashed=false],
 ['asynchronous PG error',({db})=>db.asynchronousErrors=1],
])test('reject '+name,()=>{const value=fixture();mutate(value);assert.throws(()=>validateCurrentRuntimeAccounting(value.publicProof,value.db,value.model));});
