import assert from 'node:assert/strict';
import {ActionGateway} from "./admission-fixtures.mjs";
import {ActionBlocked,consumeActionAuthority} from "../lib/action-gateway.ts";
import {ActionRecovery} from '../lib/action-recovery.ts';
import {approvalBinding,approvalRequestId} from '../lib/approvals.ts';

export async function qualifyRecovery(client,database) {
  const base={ownerId:'sarah',runId:'executor-test',actionKey:'recovery',capabilityId:'tool.send_email',actionClass:'send',executor:{kind:'persistent-agent',agentId:'ava'},trigger:{kind:'owner_chat',id:'fixture-session'},parameters:{to:['sarah@example.test'],text:'report'}};
  const authority={evaluate:async()=>({decision:'ALLOW',source:'fixture',reason:'fixture'})};
  const gateway=new ActionGateway(database,authority);
  const recovery=new ActionRecovery(database);
  let writes=0,reads=0;
  const target={provider:'fake',account:'sarah',resource:'recipient'};
  const adapter={resolveTarget:async()=>target,execute:async(params,handle)=>{await consumeActionAuthority(handle,params,base.capabilityId);writes++;return {messageId:'receipt'};},verify:async()=>({verified:false,receipt:{}})};
  const uncertain=async key=>{
    await assert.rejects(gateway.execute({...base,actionKey:key,parameters:{...base.parameters,scenario:key}},adapter),ActionBlocked);
    return (await client.query('SELECT id FROM action_requests WHERE action_key=$1',[key])).rows[0].id;
  };
  const id=await uncertain('receipt-lost');
  const before=writes;
  await assert.rejects(gateway.execute({...base,actionKey:'new-call-cannot-resend',parameters:{...base.parameters,scenario:'receipt-lost'}},adapter));assert.equal(writes,before,'new tool-call ID cannot resend unresolved binding');
  assert.equal(await recovery.recover('other-owner',id,()=>{throw new Error('must not inspect');}),null);
  const inspections=[];
  const inspect={id:'fake.sent-history',inspect:async()=>{reads++;inspections.push('inspect');return {outcome:'succeeded',evidence:{providerMessageId:'receipt'}};}};
  const race=await Promise.all([recovery.recover('sarah',id,()=>inspect),recovery.recover('sarah',id,()=>inspect)]);
  assert.equal(race.filter(v=>v==='completed').length,1);assert.equal(reads,1);assert.equal(writes,before);
  const receipt=(await client.query('SELECT recovery_result FROM action_requests WHERE id=$1',[id])).rows[0].recovery_result;
  assert.equal(receipt.anotherExecutionOccurred,false);assert.equal(receipt.originalAttempt,1);assert.equal(receipt.strategy,'fake.sent-history');
  await gateway.execute({...base,actionKey:'receipt-lost',parameters:{...base.parameters,scenario:'receipt-lost'}},adapter);assert.equal(writes,before);

  const no=await uncertain('definitely-not-executed');
  assert.equal(await recovery.recover('sarah',no,()=>({id:'fake.provider-proof',inspect:async()=>({outcome:'not_executed',evidence:{authoritativeAttemptState:'not_dispatched'}})})),'retryable');
  let approvals=0;
  const approvalIds=[];
  const approvalStore=async input=>{
    const id=approvalRequestId(input); approvalIds.push(id); approvals++;
    const binding=approvalBinding({taskId:input.taskId,capabilityId:input.capabilityId,resource:input.resource,action:input.action,parameters:input.parameters});
    await client.query(`INSERT INTO task_approval_decisions(id,task_id,owner_id,requested_by,prompt,action,action_class,binding_hash,risk,expires_at,status,agent_id,capability_id) VALUES($1,$2,$3,$4,'Retry approval',$5,$6,$7,'high',now()+interval '1 hour','pending','ava','tool.send_email')`,[id,input.taskId,input.ownerId,input.requestedBy,input.action,input.actionClass,binding]);
    return {decision:'REQUIRE_APPROVAL',approval:{id},reason:'fixture'};
  };
  const gated=new ActionGateway(database,{evaluate:async()=>({decision:'REQUIRE_APPROVAL',source:'fixture',reason:'current policy'})},approvalStore);
  const prior=writes;
  await assert.rejects(gated.execute({...base,actionKey:'definitely-not-executed',parameters:{...base.parameters,scenario:'definitely-not-executed'}},adapter));assert.equal(writes,prior);
  await client.query("UPDATE task_approval_decisions SET status='approved',decision='approved' WHERE id=$1",[approvalIds[0]]);
  await assert.rejects(gated.execute({...base,actionKey:'definitely-not-executed',parameters:{...base.parameters,scenario:'definitely-not-executed'}},adapter));assert.equal(writes,prior+1);

  const unknown=await uncertain('indeterminate');
  assert.equal(await recovery.recover('sarah',unknown,()=>({id:'fake.unavailable',inspect:async()=>{throw new Error('timeout');}})),'needs_you');
  const paused=writes;await assert.rejects(gateway.execute({...base,actionKey:'indeterminate',parameters:{...base.parameters,scenario:'indeterminate'}},adapter));assert.equal(writes,paused);

  // Revocation happens after the gateway claim, inside the adapter before handle consumption.
  const revoked={...adapter,execute:async(params,handle)=>{
    await client.query("UPDATE agents SET status='paused',updated_at=now() WHERE id='ava'");
    await consumeActionAuthority(handle,params,base.capabilityId);writes++;return {};
  }};
  await assert.rejects(gateway.execute({...base,actionKey:'handle-revoked',parameters:{...base.parameters,scenario:'revoked'}},revoked));assert.equal(writes,paused);
  await client.query("UPDATE agents SET status='active',updated_at=now() WHERE id='ava'");

  const concurrent={...adapter,execute:async(params,handle)=>{
    const results=await Promise.allSettled([consumeActionAuthority(handle,params,base.capabilityId),consumeActionAuthority(handle,params,base.capabilityId)]);
    assert.equal(results.filter(v=>v.status==='fulfilled').length,1);assert.equal(results.filter(v=>v.status==='rejected').length,1);writes++;return {};
  },verify:async()=>({verified:true,receipt:{}})};
  await gateway.execute({...base,actionKey:'handle-race'},concurrent);assert.equal(writes,paused+1);
  const expired={...adapter,execute:async(params,handle)=>{
    const real=Date.now;Date.now=()=>handle.expiresAt+1;
    try{await consumeActionAuthority(handle,params,base.capabilityId);writes++;return {};}finally{Date.now=real;}
  }};
  await assert.rejects(gateway.execute({...base,actionKey:'handle-expired',parameters:{...base.parameters,scenario:'expired'}},expired));assert.equal(writes,paused+1);

  let entered,release;
  const began=new Promise(resolve=>{entered=resolve;});const held=new Promise(resolve=>{release=resolve;});
  const racingAdapter={...adapter,execute:async(params,handle)=>{await consumeActionAuthority(handle,params,base.capabilityId);writes++;entered();await held;return {};},verify:async()=>({verified:true,receipt:{}})};
  const distinct={...base,parameters:{...base.parameters,scenario:'distinct-call-race'}};
  const first=gateway.execute({...distinct,actionKey:'distinct-one'},racingAdapter);
  const second=gateway.execute({...distinct,actionKey:'distinct-two'},racingAdapter);
  const observed=[first.then(()=>true,()=>false),second.then(()=>true,()=>false)];
  await began;assert.equal(await Promise.race(observed),false);release();
  assert.equal((await Promise.all(observed)).filter(Boolean).length,1,'two fresh call IDs for the same binding execute once');
  const running=await uncertain('stale-worker');
  await client.query("UPDATE action_requests SET status='executing',updated_at=now() WHERE id=$1",[running]);
  assert.equal(await recovery.recover('sarah',running,()=>inspect),null,'live execution cannot be recovered concurrently');
  await client.query("UPDATE action_requests SET updated_at=now()-interval '3 minutes' WHERE id=$1",[running]);
  assert.equal(await recovery.recover('sarah',running,()=>inspect),'completed');
  console.log('PASS: recovery owner isolation, receipt loss, provider inspection before retry, success without resend, definite failure with fresh approval, indeterminate Needs You, recovery race, live/stale worker fence, concurrent one-use handle, expiration and post-claim revocation');
}
