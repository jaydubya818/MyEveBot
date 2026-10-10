import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {APPLICATION,enterpriseConfig,enterpriseInput,contentDigest,signedCommand,validateResponse} from '../lib/missioncontrol/consumer.ts';
import {executeEnterpriseTool,enterpriseAdapter} from '../agent/lib/missioncontrol.ts';
import {getCapability} from '../lib/capability-registry.ts';
const env={EVE_ENABLED_FEATURES:'missioncontrol-readiness',MYEVE_MISSIONCONTROL_MODE:'ISOLATED_DETERMINISTIC',MYEVE_MISSIONCONTROL_URL:'http://127.0.0.1:3398',
  MYEVE_MISSIONCONTROL_OWNER_ID:'synthetic-owner',MYEVE_MISSIONCONTROL_OPERATOR_ID:'operator',MYEVE_MISSIONCONTROL_TENANT_ID:'tenant',
  MYEVE_MISSIONCONTROL_PROJECT_ID:'project',MYEVE_MISSIONCONTROL_CONNECTION_ID:'connection',MYEVE_MISSIONCONTROL_SECRET:'deterministic-fixture-secret-0000000000'};
const config=enterpriseConfig(env);
const input={operation:'enterprise.propose',intentKey:'hr-platform',proposal:{title:'Agentic HR platform',objective:'Govern recruiting and onboarding.',workstreams:['Recruiting','Onboarding'],milestones:['Approve scope'],stopCondition:'Draft only.',budgetMicrousd:0}};
const body={proposalId:'proposal',digest:contentDigest({connectionId:'connection',tenantId:'tenant',projectId:'project',ownerId:'operator',intentKey:input.intentKey,proposal:input.proposal}),proposal:input.proposal,needsYou:'Authorize exact proposal in MissionControl.',executionAuthority:'NONE'};
function response(response=body){return {schema:'sofie-enterprise-response/v1',applicationId:APPLICATION,connectionId:'connection',projectId:'project',ownerId:'operator',observedAt:Date.now(),responseDigest:contentDigest(response),response};}
test('disabled by default, never routable to production',()=>{
  assert.throws(()=>enterpriseConfig({}));assert.equal(getCapability('tool.mission_control',{}).availability.status,'disabled');
  for(const url of ['https://example.com','http://localhost:3398','http://127.0.0.1:3398/path','http://user@127.0.0.1:3398','http://127.0.0.1:3398/?x=1'])assert.throws(()=>enterpriseConfig({...env,MYEVE_MISSIONCONTROL_URL:url}));
});
test('only bounded proposal, submit, read and inspect operations, zero budget, no identity or approval inputs',()=>{
  assert.deepEqual(enterpriseInput.parse(input),input);
  for(const patch of [{ownerId:'other'},{connectionId:'other'},{operation:'enterprise.approve'},{proposal:{...input.proposal,budgetMicrousd:1}}])assert.throws(()=>enterpriseInput.parse({...input,...patch}));
});
test('canonical service signature binds exact command bytes',()=>{
  const p=signedCommand(config,input,'command',1000),e=p.envelope;
  const canonical=['mc-service-command-v1',APPLICATION,input.operation,'project','connection:connection','command','1000','61000',e.payloadDigest].join('\n');
  assert.equal(e.signature,'sha256='+createHmac('sha256',config.secret).update(canonical).digest('hex'));
  assert.equal(JSON.parse(p.payloadJson).connectionId,'connection');
});
test('proposal response requires exact owner, project, connection, digest, content and freshness',()=>{
  assert.equal(validateResponse(config,input,response()).response.proposalId,'proposal');
  for(const patch of [{ownerId:'other'},{projectId:'other'},{connectionId:'other'},{applicationId:'other'},{observedAt:1},{responseDigest:'sha256:'+'0'.repeat(64)},{response:{...body,executionAuthority:'PRODUCTION'}}])assert.throws(()=>validateResponse(config,input,{...response(),...patch}));
  assert.throws(()=>validateResponse(config,input,response({...body,proposal:{...input.proposal,title:'Other'}})));
  assert.throws(()=>validateResponse({...config,tenantId:'other'},input,response()));
});
test('submit response binds authorized proposal digest',()=>{
  const submit={operation:'enterprise.submit',proposalId:'proposal',proposalDigest:body.digest};
  assert.throws(()=>validateResponse(config,submit,response({missionId:'mission',proposalDigest:'sha256:'+'0'.repeat(64),created:true,executionAuthority:'NONE'})));
});
test('forged adapter authority cannot reach a provider',async()=>{
  await assert.rejects(()=>enterpriseAdapter(config,input).execute(input,undefined),e=>e.status==='denied');
});
test('cross-owner, guest, child, non-web and changed initiator deny before database or provider',async()=>{
  Object.assign(process.env,env);
  const p={authenticator:'myeve-web-session',principalId:'synthetic-owner',principalType:'user',attributes:{owner:'true'}};
  for(const patch of [{principalId:'other'},{authenticator:'other'},{principalType:'runtime'},{attributes:{owner:'true',role:'guest'}},{attributes:{owner:'true',myeveRoleId:'role'}}]){
    for(const side of ['current','initiator'])await assert.rejects(()=>executeEnterpriseTool(input,{callId:'call',session:{id:'session',auth:{current:p,initiator:p,[side]:{...p,...patch}}}}),e=>e.status==='denied');
  }
  await assert.rejects(()=>executeEnterpriseTool(input,{callId:'call',session:{id:'session',parent:{sessionId:'parent'},auth:{current:p,initiator:p}}}),e=>e.status==='denied');
  for(const key of Object.keys(env))delete process.env[key];
});
test('Result protocol requires keyed response authentication and exact request, owner, Plan, tenant and freshness',()=>{
  const d='sha256:'+'1'.repeat(64),now=Date.now();
  const input={operation:'enterprise.result',missionId:'mission',expectedPlanDigest:d};
  const payload={schema:'enterprise-result-projection/v1',scope:'ISOLATED_DETERMINISTIC',missionId:'mission',ownerId:'operator',tenantId:'tenant',projectId:'project',
    plan:{missionId:'mission',planId:'plan',planRevision:1,planDigest:d},qualityContract:{revision:1,digest:d},status:'NOT_AVAILABLE',enterpriseQualityGate:'NOT_ESTABLISHED',
    ownerAcceptance:'PENDING',observedAt:now,freshUntil:now+60000,reasons:['CURRENT_INDEPENDENT_VERIFICATION_REQUIRED'],assertions:[],workOrders:[],executionAuthority:'NONE',explanation:'Not established.'};
  function sign(body=payload){const r=response(body);r.observedAt=now;const p=signedCommand(config,input,'result-command',now);
    const authentication={commandId:p.envelope.commandId,requestDigest:p.envelope.payloadDigest,expiresAt:now+60000};
    return {...r,authentication:{...authentication,signature:'sha256:'+createHmac('sha256',config.secret).update(contentDigest({...r,authentication})).digest('hex')}};}
  assert.equal(validateResponse(config,input,sign(),now).response.status,'NOT_AVAILABLE');
  assert.throws(()=>validateResponse(config,input,response(payload),now));
  for(const patch of [{ownerId:'foreign'},{tenantId:'foreign'},{projectId:'foreign'},{missionId:'foreign'},
    {status:'AVAILABLE',enterpriseQualityGate:'PASS',reasons:[]},{enterpriseQualityGate:'PASS'},{freshUntil:now-1},{qualityContract:{revision:2,digest:d}}])
    assert.throws(()=>validateResponse(config,input,sign({...payload,...patch}),now));
  const forged=sign();forged.response.explanation='Narrative PASS';forged.responseDigest=contentDigest(forged.response);
  assert.throws(()=>validateResponse(config,input,forged,now),/AUTHENTICATION/);
  assert.throws(()=>validateResponse({...config,secret:'other-secret'},input,sign(),now),/AUTHENTICATION/);
  assert.throws(()=>validateResponse(config,{...input,expectedPlanDigest:'sha256:'+'2'.repeat(64)},sign(),now));
  assert.throws(()=>validateResponse(config,input,sign(),now+60001));
});
