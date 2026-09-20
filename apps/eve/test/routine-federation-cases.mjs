import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {ActionGateway} from "./admission-fixtures.mjs";
import {consumeActionAuthority} from "../lib/action-gateway.ts";
import {approvalBinding} from '../lib/approvals.ts';
import {verifyEnvelope} from '../lib/relay/transport.ts';
import {FederationStore} from '../lib/relay/store.ts';

/** Real signed-delivery validator, Gateway SQL, one-use handles and projection SQL.
 * Relay issuance and local policy decisions are deterministic fixture inputs.
 * This does not add email/browser tools to the bounded Federation executor.
 */
export async function qualifyRoutineFederation(client,database) {
  const keys=generateKeyPairSync('ed25519');
  const identity={issuer:'https://relay.example.test',address:'relay://sarah/ava',ownerId:'sarah',agentId:'ava',keyId:'fixture',publicKey:keys.publicKey.export({type:'spki',format:'pem'}).toString()};
  const now=Math.floor(Date.now()/1000);
  const envelope={id:'federation-matrix',protocol:'relay.federation',version:'1.0',caller:{ownerId:'external-owner',agentId:'external-agent'},target:{ownerId:'sarah',agentId:'ava',address:identity.address},capability:'work.request',resource:'analysis',createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+600000).toISOString(),idempotencyKey:'fixture-request',payload:{category:'analysis',task:'Analyze published context',expectedOutput:'Summary',context:['published'],deadline:new Date(Date.now()+600000).toISOString(),budget:{delegatedWorkers:0,runtimeSeconds:60,modelSteps:1,cost:'0.1'}},publication:null,authorizationContext:{grantId:'fixture-grant',policyDecisionId:'fixture-policy',localAuthorizationRequired:true}};
  const header=Buffer.from(JSON.stringify({alg:'EdDSA',typ:'relay-federation+jwt',kid:'fixture'})).toString('base64url');
  const payload=Buffer.from(JSON.stringify({iss:identity.issuer,aud:identity.address,jti:envelope.id,iat:now,exp:now+50,envelope})).toString('base64url');
  const material=`${header}.${payload}`;
  const token=`${material}.${sign(null,Buffer.from(material),keys.privateKey).toString('base64url')}`;
  let sequence=0;
  const approvals=async input=>{
    const id=`federation-approval-${++sequence}`;
    const hash=approvalBinding({taskId:input.taskId,capabilityId:input.capabilityId,resource:input.resource,action:input.action,parameters:input.parameters});
    await client.query(`INSERT INTO task_approval_decisions(id,task_id,owner_id,requested_by,prompt,action,action_class,binding_hash,risk,expires_at,status) VALUES($1,$2,$3,$4,'Fixture approval',$5,$6,$7,'high',now()+interval '1 hour','pending')`,[id,input.taskId,input.ownerId,input.requestedBy,input.action,input.actionClass,hash]);
    return {decision:'REQUIRE_APPROVAL',approval:{id},reason:'fixture'};
  };
  for(const [relay,local,expected] of [['ALLOW','ALLOW','ALLOW'],['ALLOW','REQUIRE_APPROVAL','REQUIRE_APPROVAL'],['ALLOW','DENY','DENY'],['DENY','ALLOW','DENY'],['DENY','REQUIRE_APPROVAL','DENY']]) {
    let calls=0,decision='DENY';
    const action={ownerId:'sarah',runId:'executor-test',actionKey:`federation:${relay}:${local}`,capabilityId:'tool.send_email',actionClass:'send',executor:{kind:'persistent-agent',agentId:'ava'},trigger:{kind:'relay_request',id:envelope.id},parameters:{to:['owner@example.test'],subject:'Local fixture',text:'No external send'}};
    try {
      // A denied grant has no valid issued delivery. It must fail before local execution.
      verifyEnvelope(relay==='ALLOW'?token:`${material}.invalid`,identity);
      await new ActionGateway(database,{evaluate:async()=>({decision:local,source:'fixture-local',reason:'Fixture local policy'})},approvals).execute(action,{
        resolveTarget:async()=>({provider:'fake',account:'sarah',resource:'owner@example.test'}),
        execute:async(p,h)=>{await consumeActionAuthority(h,p,'tool.send_email');calls++;return {};},
        verify:async()=>({verified:true,receipt:{fixture:true}}),
      });decision='ALLOW';
    }catch(error){if(error.status==='awaiting_approval')decision='REQUIRE_APPROVAL';else assert.ok(error.status==='denied'||/signature/.test(error.message),error.message);}
    assert.equal(decision,expected);assert.equal(calls,expected==='ALLOW'?1:0);
  }
  // A Relay trigger cannot attach to a Routine Run and bypass its occurrence fence.
  const [routine]=await client.query("SELECT run_id FROM execution_occurrences WHERE routine_id='followup'").then(r=>r.rows);
  let effects=0;
  await assert.rejects(new ActionGateway(database,{evaluate:async()=>({decision:'ALLOW',source:'fixture',reason:'Relay cannot elevate Routine'})}).execute({ownerId:'sarah',runId:routine.run_id,actionKey:'relay-cannot-expand-routine',capabilityId:'browser.click',actionClass:'write',executor:{kind:'persistent-agent',agentId:'ava'},trigger:{kind:'relay_request',id:envelope.id},parameters:{}},{resolveTarget:async()=>({provider:'browser',account:'sarah',resource:'example.test'}),execute:async()=>{effects++;},verify:async()=>({verified:true,receipt:{}})}),error=>error.status==='denied');
  assert.equal(effects,0);
  const triggers=(await client.query("SELECT DISTINCT trigger->>'kind' AS kind FROM action_requests WHERE action_key LIKE 'federation:%' OR action_key='terminal-send'")).rows.map(r=>r.kind);
  assert.ok(triggers.includes('relay_request'));assert.ok(triggers.includes('scheduled_occurrence'));

  await client.query(`INSERT INTO myeve_relay_connections(owner_id,local_agent_id,relay_owner_id,relay_agent_id,address,issuer,signing_key_id,signing_public_key,agent_credential_encrypted,owner_session_encrypted) VALUES('sarah','ava','sarah','ava','relay://sarah/ava','fixture','fixture','fixture','unused-fixture','unused-fixture')`);
  await client.query(`INSERT INTO myeve_relay_publications(id,owner_id,relay_view_id,version,name,visibility,status,audience,preview_hash,preview_expires_at,expires_at,document) VALUES('pub','sarah','view',1,'Fixture','SHARED','active','[{"ownerId":"external-owner","agentId":"external-agent"}]','hash',now()+interval '1 hour',now()+interval '1 hour','{}')`);
  await client.query(`INSERT INTO myeve_relay_projection(owner_id,publication_id,reference,revision,record) VALUES('sarah','pub','published','1','{"statement":"Only shared content"}')`);
  const reader=new FederationStore('sarah',database).publishedReader();
  const input={viewId:'view',version:1,reference:'published',revision:'1',callerOwnerId:'external-owner',callerAgentId:'external-agent'};
  assert.deepEqual(await reader.read(input),{statement:'Only shared content'});
  for(const reference of ['private-memory','private-knowledge','private-goal','private-chat','credential','unshared-file'])assert.equal(await reader.read({...input,reference}),null);
  assert.equal(await reader.read({...input,callerOwnerId:'ungranted'}),null);
  assert.equal(await reader.read({...input,callerAgentId:'ungranted'}),null);
  assert.equal(await reader.read({...input,version:2}),null);
  await client.query("UPDATE myeve_relay_publications SET visibility='PRIVATE' WHERE id='pub'");assert.equal(await reader.read(input),null);
  await client.query("UPDATE myeve_relay_publications SET visibility='SHARED',status='revoked' WHERE id='pub'");assert.equal(await reader.read(input),null);
  console.log('PASS: signed Relay delivery + Gateway five-case policy matrix; email approval invokes zero effects; Relay cannot attach to Routine Run; distinct trigger audit; exact published projection only, private/ungranted/revoked access denied');
}
