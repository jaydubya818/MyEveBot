import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {hashOrderedTranscript} from './transcript-value-hash.mjs';
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const limits={dailyTurns:10,perTurnMicrousd:100000,dailyMicrousd:1000000,trialMicrousd:5000000,sharedDailyMicrousd:2000000,sharedTrialMicrousd:10000000};
const count=(rows,n,name)=>{assert(Array.isArray(rows),name+'_ROWS_REQUIRED');assert.equal(rows.length,n,name+'_COUNT');};
const unique=(rows,key,name)=>assert.equal(new Set(rows.map(row=>row[key])).size,rows.length,name+'_DUPLICATE');
export function validateCurrentRuntimeAccounting(publicProof,db,model){
 assert.equal(publicProof.status,'PUBLIC_BEHAVIOR_OBSERVED_BINDING_REQUIRED');
 assert.equal(db.asynchronousErrors,0,'DATABASE_ASYNC_ERRORS');
 assert.equal(model.httpRequests,2,'ACTUAL_MODEL_HTTP_ATTEMPTS');assert.equal(model.failedRequests,0,'MODEL_HTTP_FAILURE');assert.equal(model.unexpectedPaths,0,'MODEL_UNEXPECTED_PATH');
 assert.equal(model.kind,'DETERMINISTIC_CURRENT_RUNTIME_PROBE_ONLY');assert.equal(model.calls,2,'ACTUAL_MODEL_CALL_COUNT');
 count(model.requests,2,'MODEL_REQUEST');unique(model.requests,'promptSha256','MODEL_PROMPT');
 assert.deepEqual(model.requests.map(row=>row.index),[1,2]);
 assert.equal(model.requests[0].replySha256,publicProof.first.replySha256,'FIRST_MODEL_REPLY_BINDING');
 assert.equal(model.requests[1].replySha256,publicProof.second.replySha256,'SECOND_MODEL_REPLY_BINDING');
 assert.equal(publicProof.authoredMessages,2);assert.equal(publicProof.authoredClientInvocations,2);
 assert.equal(db.ownerId,publicProof.ownerId,'OWNER_BINDING');
 count(db.agents,1,'AGENT');assert.deepEqual(db.agents[0],{id:publicProof.agentId,owner_id:publicProof.ownerId,is_primary:true});
 count(db.runs,2,'RUN');unique(db.runs,'id','RUN');
 assert.deepEqual(db.runs.map(row=>row.id).sort(),[publicProof.first.turnId,publicProof.second.turnId].map(turnId=>'agent_run_'+publicProof.sessionId+'_'+turnId).sort(),'RUN_PUBLIC_TURN_BINDING');
 for(const row of db.runs){
  assert.equal(row.owner_id,publicProof.ownerId,'RUN_OWNER_BINDING');assert.equal(row.agent_id,publicProof.agentId,'RUN_AGENT_BINDING');
  assert.equal(row.thread_id,publicProof.threadId,'RUN_THREAD_BINDING');assert.equal(row.session_id,publicProof.sessionId,'RUN_SESSION_BINDING');
  assert.equal(row.status,'completed','RUN_NOT_COMPLETED');assert.equal(Number(row.model_steps),1,'RUN_MODEL_STEPS');
 }
 count(db.threads,1,'THREAD');const thread=db.threads[0];
 assert.equal(thread.id,publicProof.threadId);assert.equal(thread.owner_id,publicProof.ownerId);assert.equal(thread.agent_id,publicProof.agentId);
 assert.deepEqual(thread.chat.session,publicProof.finalState,'DURABLE_SESSION_STATE');
 assert.equal(hashOrderedTranscript(thread.chat.events),publicProof.finalReplay.orderedTranscriptSha256,'DURABLE_REPLAY_BODY');
 count(db.credentials,1,'CREDENTIAL');assert.deepEqual(db.credentials[0],{ownerId:publicProof.ownerId,version:0,hashed:true});
 for(const usage of [publicProof.usage,db.usage]){
  assert.equal(usage.version,1);assert.equal(usage.state,'active');assert.equal(usage.localPaused,false);
  assert.equal(usage.dailyTurnsUsed,2);assert.equal(usage.quotaRemaining,8);
  assert.equal(usage.dailyReservedMicrousd,200000);assert.equal(usage.trialReservedMicrousd,200000);
  assert.deepEqual(usage.limits,limits,'ACTUAL_ACCOUNTING_LIMITS');
  assert.deepEqual(usage.measured,{dailyMicrousd:0,trialMicrousd:0,unsettledOperations:0});
  assert.equal(usage.dayIndex,db.usage.dayIndex,'ACCOUNTING_DAY_CHANGED');
 }
 for(const key of ['activatedAt','expiresAt','resetsAt'])assert.equal(publicProof.usage[key],db.usage[key],'ACCOUNTING_WINDOW_CHANGED:'+key);
 for(const [key,value] of Object.entries(db.effects))assert.equal(value,0,'DISABLED_EFFECT_PRESENT:'+key);
 assert.deepEqual(Object.keys(db.effects).sort(),['engineering_work','external_alpha_work_authority','external_alpha_work_result','external_alpha_tool_effect','engineering_owner_decisions','engineering_candidate_publications'].sort());
 count(db.allowances,2,'ALLOWANCE');unique(db.allowances,'id','ALLOWANCE');
 count(db.operations,2,'OPERATION');unique(db.operations,'id','OPERATION');
 count(db.admissions,2,'ADMISSION');unique(db.admissions,'id','ADMISSION');
 count(db.dispatches,2,'DISPATCH');unique(db.dispatches,'admission_id','DISPATCH');
 for(const allowance of db.allowances){
  assert.equal(allowance.kind,'CHAT');assert.equal(Number(allowance.ceiling_microusd),100000);assert.equal(allowance.day_index,db.usage.dayIndex);
  const operations=db.operations.filter(operation=>operation.allowance_id===allowance.id);count(operations,1,'ALLOWANCE_OPERATION');
  assert.equal(operations[0].state,'SETTLED');assert.equal(operations[0].source,'SOFIE');assert.equal(Number(operations[0].spent_microusd),0);
  const admissions=db.admissions.filter(admission=>admission.local_allowance_id===allowance.id);count(admissions,1,'ALLOWANCE_ADMISSION');
  assert.equal(admissions[0].kind,'CHAT');assert.equal(admissions[0].state,'BOUND');
  assert.equal(Number(admissions[0].ceiling_microusd),100000);assert.equal(admissions[0].day_index,db.usage.dayIndex);
  const dispatches=db.dispatches.filter(dispatch=>dispatch.admission_id===admissions[0].id);count(dispatches,1,'ADMISSION_DISPATCH');
  assert.equal(dispatches[0].state,'SETTLED');
 }
 assert.notEqual(db.unusedOwner.ownerId,publicProof.ownerId);
 assert.deepEqual({...db.unusedOwner,ownerId:undefined},{ownerId:undefined,threads:0,runs:0,admissions:0},'OTHER_OWNER_MODIFIED');
 return {status:'PUBLIC_PROCESS_DATABASE_MODEL_ACCOUNTING_JOIN_OBSERVED',ownerId:db.ownerId,projectId:db.projectId,
  threadId:publicProof.threadId,agentId:publicProof.agentId,sessionId:publicProof.sessionId,
  actualModelDispatches:2,completedRuns:2,settledLocalOperations:2,boundCentralAdmissions:2,settledCentralDispatches:2,
  usage:db.usage,modelSha256:digest(model),databaseObservationSha256:digest(db),publicObservationSha256:digest(publicProof),
  scope:'Synthetic local two-message chat; no provider or Work qualification'};
}

/** Compare live state after resource shutdown, never rely on an earlier counter
 * snapshot while request callbacks or close operations can still complete. */
export function assertFinalModelObservation(expected,actual,failure){
 if(failure)throw failure;
 assert.equal(actual.httpRequests,2,'CURRENT_FINAL_MODEL_HTTP_ATTEMPTS');
 assert.equal(actual.failedRequests,0,'CURRENT_FINAL_MODEL_HTTP_FAILURES');
 assert.equal(actual.unexpectedPaths,0,'CURRENT_FINAL_MODEL_UNEXPECTED_PATH');
 assert.equal(actual.calls,2,'CURRENT_FINAL_MODEL_CALLS');
 assert.deepEqual(actual,expected,'CURRENT_MODEL_CHANGED_DURING_SHUTDOWN');
 return {status:'MODEL_OBSERVATION_FINAL_AND_UNCHANGED'};
}
