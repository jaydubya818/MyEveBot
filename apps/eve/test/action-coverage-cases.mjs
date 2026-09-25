import assert from 'node:assert/strict';
import {ActionGateway} from "./admission-fixtures.mjs";
import {consumeActionAuthority} from "../lib/action-gateway.ts";
import {approvalBinding,approvalRequestId} from '../lib/approvals.ts';
import {transitionComputerControl} from '../lib/computer-control.ts';

export async function qualifyCoverage(client,database) {
  let sequence=0;
  const approvalIds=[];
  const approvalStore=async input=>{
    const id=approvalRequestId(input); approvalIds.push(id); sequence++;
    const hash=approvalBinding({taskId:input.taskId,capabilityId:input.capabilityId,resource:input.resource,action:input.action,parameters:input.parameters});
    await client.query(`INSERT INTO task_approval_decisions(id,task_id,owner_id,requested_by,prompt,action,action_class,binding_hash,risk,expires_at,status,agent_id,capability_id) VALUES($1,$2,$3,$4,'Coverage approval',$5,$6,$7,'high',now()+interval '1 hour','pending',$8,$9)`,[id,input.taskId,input.ownerId,input.requestedBy,input.action,input.actionClass,hash,input.requestedBy,input.capabilityId]);
    return {decision:'REQUIRE_APPROVAL',approval:{id},reason:'fixture'};
  };
  const policy=decision=>({evaluate:async()=>({decision,reason:'fixture',source:'fixture'})});
  for(const capability of ['tool.send_email','files.write','browser.click','browser.navigate','computer.session.create','notification.send']) {
    let calls=0,handle;
    const action={ownerId:'sarah',runId:'executor-test',actionKey:`matrix:${capability}`,capabilityId:capability,actionClass:'send',executor:{kind:'persistent-agent',agentId:'ava'},trigger:{kind:'owner_chat',id:'fixture-session'},parameters:{target:'one',content:'original'}};
    const adapter={resolveTarget:async()=>({provider:'local-fixture',account:'sarah',resource:'one'}),execute:async(params,authority)=>{await consumeActionAuthority(authority,params,capability);handle=authority;calls++;return {};},verify:async()=>({verified:true,receipt:{fixture:true}})};
    await assert.rejects(new ActionGateway(database,policy('DENY'),approvalStore).execute({...action,actionKey:`deny:${capability}`},adapter));assert.equal(calls,0);
    const gateway=new ActionGateway(database,policy('REQUIRE_APPROVAL'),approvalStore);
    await assert.rejects(gateway.execute(action,adapter));assert.equal(calls,0);
    const approval=approvalIds.at(-1);await client.query("UPDATE task_approval_decisions SET status='approved',decision='approved' WHERE id=$1",[approval]);
    await assert.rejects(gateway.execute({...action,parameters:{...action.parameters,content:'changed'}},adapter));assert.equal(calls,0);
    await gateway.execute(action,adapter);assert.equal(calls,1);
    await assert.rejects(adapter.execute(action.parameters,handle));assert.equal(calls,1);
    const expired={...action,actionKey:`expired:${capability}`,parameters:{target:'two'}};
    await assert.rejects(gateway.execute(expired,adapter));await client.query("UPDATE task_approval_decisions SET status='approved',decision='approved',expires_at=now()-interval '1 second' WHERE id=$1",[approvalIds.at(-1)]);
    await assert.rejects(gateway.execute(expired,adapter));assert.equal(calls,1);
    const refused={...action,actionKey:`refused:${capability}`,parameters:{target:'refused'}};
    await assert.rejects(gateway.execute(refused,adapter));await client.query("UPDATE task_approval_decisions SET status='denied' WHERE id=$1",[approvalIds.at(-1)]);
    await assert.rejects(gateway.execute(refused,adapter));assert.equal(calls,1);
    assert.equal((await client.query('SELECT status FROM action_requests WHERE action_key=$1',[refused.actionKey])).rows[0].status,'denied');
    await assert.rejects(new ActionGateway(database,{evaluate:async()=>{throw new Error('authority offline');}}).execute({...action,actionKey:`authority-offline:${capability}`},adapter));assert.equal(calls,1);
    await assert.rejects(new ActionGateway(database,policy('ALLOW')).execute({...action,actionKey:`target-offline:${capability}`},{...adapter,resolveTarget:async()=>{throw new Error('unresolved');}}));assert.equal(calls,1);
  }
  let calls=0;
  const browser={ownerId:'sarah',runId:'executor-test',actionKey:'control-agent',capabilityId:'browser.click',actionClass:'write',executor:{kind:'persistent-agent',agentId:'ava'},trigger:{kind:'owner_chat',id:'fixture-session'},parameters:{selector:'#local-fixture'},computer:{sessionId:'computer-fixture',controlVersion:2}};
  const adapter={resolveTarget:async()=>({provider:'browser',account:'computer-fixture',resource:'https://local.invalid'}),execute:async(params,handle)=>{await consumeActionAuthority(handle,params,'browser.click');calls++;return {};},verify:async()=>({verified:true,receipt:{}})};
  const gateway=new ActionGateway(database,policy('ALLOW'));
  await gateway.execute(browser,adapter);assert.equal(calls,1);
  const owner=await transitionComputerControl({ownerId:'sarah',sessionId:'computer-fixture',expectedController:'AGENT',expectedVersion:2,operation:'takeOver',requestedBy:'sarah'},database);
  await assert.rejects(gateway.execute({...browser,actionKey:'control-owner',computer:{sessionId:'computer-fixture',controlVersion:owner.version}},adapter));assert.equal(calls,1);
  const agent=await transitionComputerControl({ownerId:'sarah',sessionId:'computer-fixture',expectedController:'OWNER',expectedVersion:owner.version,operation:'returnControl',requestedBy:'sarah'},database);
  await assert.rejects(gateway.execute({...browser,actionKey:'control-stale'},adapter));assert.equal(calls,1);
  await gateway.execute({...browser,actionKey:'control-returned',computer:{sessionId:'computer-fixture',controlVersion:agent.version}},adapter);assert.equal(calls,2);
  console.log('PASS: six capability contract matrices (deny/pending/approved/expired/changed/replay/authority failure/target failure); local Computer AGENT -> Take Over -> denied under OWNER -> Return Control -> AGENT; stale control rejected');
}
