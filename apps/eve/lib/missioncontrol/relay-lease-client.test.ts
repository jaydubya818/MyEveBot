import { generateKeyPairSync, randomUUID, createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { InstalledRelayLeaseClient, installedRelayLeaseConfig, relayLeaseEnrollmentDigest } from './relay-lease-client.ts';
import { permitFixture } from './permit-test-fixture.ts';
import { canonicalPermitJson } from './execution-permit.ts';
import { signPolicyMessage, policyMessageHash, type AdmissionPermit } from '../../../../packages/capability-enforcement/src/ordering-wire.ts';

async function fixture() {
  const f=permitFixture({ownerId:'owner',workId:randomUUID(),workVersion:1,workGeneration:1,tupleSha256:'a'.repeat(64),maxCostMicrousd:1300000,maxDurationSeconds:180});
  const keys=generateKeyPairSync('ec',{namedCurve:'P-256'});
  const c={schema:'mc-relay-lease-enrollment/v1',ownerId:f.enrollment.ownerId,installationId:f.enrollment.installationId,
    connectionId:f.enrollment.connectionId,enrollmentRevision:1,origin:'https://relay.example.test',activeFrom:Date.now()-1000,expiresAt:Date.now()+60000,
    accountId:'acct_fixtureaccount',agentId:'agt_fixtureagent',runtimeClientId:'rtc_fixtureruntime',taskId:'tsk_fixturetask',workloadId:'wkl_fixtureworkload',
    audience:'fixture-audience',capability:{name:'resource.lease.execute',version:'1.0'},resource:{type:'target',ids:['synthetic']},parameters:{},
    relayKey:{keyId:'relay-test-key',jwk:((({kty,crv,x,y})=>({kty,crv,x,y}))(keys.publicKey.export({format:'jwk'})))}};
  const env={NODE_ENV:'test' as const,MYEVE_MISSIONCONTROL_MODE:'APPROVED_NONPRODUCTION',MYEVE_OWNER_ID:'owner',
    MYEVE_MISSIONCONTROL_RELAY_LEASE_JSON:JSON.stringify(c),MYEVE_MISSIONCONTROL_RELAY_RUNTIME_CREDENTIAL:'synthetic-runtime-credential',
    MYEVE_MISSIONCONTROL_RELAY_WORKLOAD_TOKEN:'synthetic-workload-token'};
  f.enrollment.relayLeaseEnrollmentSha256=relayLeaseEnrollmentDigest(c);
  const config=installedRelayLeaseConfig(f.enrollment,env);
  const source:AdmissionPermit={kind:'PERMIT',authority:'myeve',ownerId:'owner',organizationId:'org',installationId:c.installationId,
    backendId:'mc',incarnation:'incarnation',enrollmentVersion:1,version:1,policyId:'source-policy',referenceId:randomUUID(),
    capabilityId:'enterprise.fleet',requiredCapabilities:['work','missioncontrol','enterprise.fleet'],registryVersion:'registry',agentId:c.agentId,
    agentRevision:1,workId:f.document.work.id,missionId:f.document.missionId,workGeneration:1,actionDigest:'b'.repeat(64),budgetMicros:1300000,
    issuedAt:Date.now(),expiresAt:Date.now()+28000,sourcePermitHash:'SELF'};
  const sourceEnvelope=await signPolicyMessage(source,{keyId:'source-key',jwk:keys.privateKey.export({format:'jwk'})});
  const relay={...source,authority:'relay' as const,referenceId:'lse_fixturelease',version:8,policyId:'relay-policy',agentRevision:9,
    sourcePermitHash:await policyMessageHash(source)};
  const response=async(changes:Partial<AdmissionPermit>={})=>({leaseId:relay.referenceId,token:'synthetic-lease-token',expiresAt:new Date(source.expiresAt).toISOString(),maxCalls:1,onlineRequired:true,
    remotePermit:await signPolicyMessage({...relay,...changes},{keyId:c.relayKey.keyId,jwk:keys.privateKey.export({format:'jwk'})})});
  return {f,c,env,config,source,sourceEnvelope,response};
}
const prepared=()=>Response.json({decision:{decisionId:'dec_fixturedecision',expiresAt:new Date(Date.now()+60000).toISOString(),outcome:'ALLOW',reasonCodes:[],obligations:{limits:{}},matchedRuleIds:[]},approvalRequest:null});
describe('installed Relay lease transport',()=>{
  it('sends a stable exact ActionIntent and accepts independently versioned Relay policy evidence',async()=>{
    const f=await fixture(),send=vi.fn(async(url:URL|RequestInfo)=>String(url).endsWith('/prepare')?prepared():Response.json(await f.response())),client=new InstalledRelayLeaseClient(f.config,send);
    await client.issue(f.sourceEnvelope);await client.issue(f.sourceEnvelope);
    const [url,options]=send.mock.calls[0] as unknown as [string,RequestInit];
    const body=JSON.parse(String(options.body));
    expect(url).toBe('https://relay.example.test/api/v2/runtime/capability-leases/prepare');expect(options.redirect).toBe('error');
    expect(body.action.parameters.capabilityAdmissionDigest).toBe(await policyMessageHash(f.source));
    expect(body.action.canonicalHash).toBe('sha256:'+createHash('sha256').update(canonicalPermitJson({capability:body.action.capability,resource:body.action.resource,parameters:body.action.parameters})).digest('hex'));
    expect(body.maxCalls).toBe(1);expect(body.ttlSeconds).toBe(30);
    expect((send.mock.calls[1] as unknown as [string,RequestInit])[1].body).toBe(options.body);
    expect(String(options.body)).not.toContain(f.config.credential);
  });
  it('denies wrong installation, enrollment revision, target, credentials and caller-chosen source digest',async()=>{
    const f=await fixture();
    for(const changes of [{ownerId:'foreign'},{installationId:'foreign'},{connectionId:'foreign'},{enrollmentRevision:2},
      {expiresAt:Date.now()-1},{origin:'http://127.0.0.1'},{parameters:{capabilityAdmissionDigest:'forged'}}])
      expect(()=>installedRelayLeaseConfig(f.f.enrollment,{...f.env,MYEVE_MISSIONCONTROL_RELAY_LEASE_JSON:JSON.stringify({...f.c,...changes})})).toThrow();
    expect(()=>installedRelayLeaseConfig(f.f.enrollment,{...f.env,MYEVE_MISSIONCONTROL_RELAY_RUNTIME_CREDENTIAL:'secret\ninjected'})).toThrow();
  });
  it.each(['DENY','ESCALATE','LIMIT','REQUIRE_APPROVAL'])('does not request a lease after %s preparation',async outcome=>{
    const f=await fixture(),send=vi.fn(async()=>Response.json({decision:{decisionId:'dec_fixturedecision',expiresAt:new Date(Date.now()+60000).toISOString(),
      outcome,reasonCodes:[],obligations:{},matchedRuleIds:[]},approvalRequest:null}));
    await expect(new InstalledRelayLeaseClient(f.config,send).issue(f.sourceEnvelope)).rejects.toThrow(/MISSIONCONTROL|Relay requires/);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('rejects environment key or selection replacement without the operator-held enrollment pin',async()=>{
    const f=await fixture();
    for(const changes of [{relayKey:{...f.c.relayKey,keyId:'replaced-key'}},{taskId:'tsk_replacedtask'},
      {parameters:{target:'different'}},{origin:'https://localhost.'}])
      expect(()=>installedRelayLeaseConfig(f.f.enrollment,{...f.env,MYEVE_MISSIONCONTROL_RELAY_LEASE_JSON:JSON.stringify({...f.c,...changes})})).toThrow();
    expect(()=>installedRelayLeaseConfig({...f.f.enrollment,relayLeaseEnrollmentSha256:undefined},f.env)).toThrow('MISSIONCONTROL_RELAY_ENROLLMENT_CHANGED');
  });
  it.each([{limits:{maxCalls:1}},{limits:{costMicrousd:1}},{limits:{},unknown:true},
    JSON.parse('{"__proto__":{"unknown":true}}'),JSON.parse('{"limits":{"__proto__":{"unknown":true}}}')])('denies substantive or unknown obligations %j',async obligations=>{
    const f=await fixture(),send=vi.fn(async()=>Response.json({decision:{decisionId:'dec_fixturedecision',expiresAt:new Date(Date.now()+60000).toISOString(),
      outcome:'ALLOW',reasonCodes:[],obligations,matchedRuleIds:[]},approvalRequest:null}));
    await expect(new InstalledRelayLeaseClient(f.config,send).issue(f.sourceEnvelope)).rejects.toThrow('MISSIONCONTROL_RELAY_POLICY_DENIED');
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('passes the exact current approval to canonical issuance, while expired approval and unsupported obligations deny',async()=>{
    const f=await fixture(),selected={...f.c,approvalRequestId:'approval-existing'};
    const env={...f.env,MYEVE_MISSIONCONTROL_RELAY_LEASE_JSON:JSON.stringify(selected)};
    const config=installedRelayLeaseConfig({...f.f.enrollment,relayLeaseEnrollmentSha256:relayLeaseEnrollmentDigest(selected)},env);
    for(const scenario of ['current','expired','obligation'] as const){
      const send=vi.fn(async(url:URL|RequestInfo)=>String(url).endsWith('/prepare')?Response.json({
        decision:{decisionId:'dec_fixturedecision',expiresAt:new Date(Date.now()+60000).toISOString(),outcome:'REQUIRE_APPROVAL',reasonCodes:[],
          obligations:scenario==='obligation'?{unimplemented:true}:{},matchedRuleIds:[]},
        approvalRequest:{requestId:selected.approvalRequestId,allowedScopes:[],expiresAt:new Date(Date.now()+(scenario==='expired'?-1:60000)).toISOString()}
      }):Response.json(await f.response()));
      const operation=new InstalledRelayLeaseClient(config,send).issue(f.sourceEnvelope);
      if(scenario==='current'){
        await operation;expect(send).toHaveBeenCalledTimes(2);
        expect(JSON.parse(String((send.mock.calls[1] as unknown as [string,RequestInit])[1].body)).approvalRequestId).toBe(selected.approvalRequestId);
      }else{await expect(operation).rejects.toThrow();expect(send).toHaveBeenCalledTimes(1);}
    }
  });
  it('rejects correctly signed foreign, changed or stale proofs before MC admission',async()=>{
    const f=await fixture();
    for(const changes of [{ownerId:'other'},{installationId:'other'},{workId:randomUUID()},{missionId:'other'},{budgetMicros:0},
      {referenceId:'lse_otherlease'},{sourcePermitHash:'c'.repeat(64)},{expiresAt:f.source.expiresAt+1}]){
      const send=vi.fn(async(url:URL|RequestInfo)=>String(url).endsWith('/prepare')?prepared():Response.json(await f.response(changes)));
      await expect(new InstalledRelayLeaseClient(f.config,send).issue(f.sourceEnvelope)).rejects.toThrow('MISSIONCONTROL_RELAY_PROOF_DENIED');
      expect(send).toHaveBeenCalledTimes(2);
    }
  });
  it('does not retry refusal, oversized or malformed responses or expose a returned lease token',async()=>{
    const f=await fixture();
    for(const response of [new Response('private-diagnostic',{status:403}),new Response('x'.repeat(65537)),Response.json({token:'secret'})]){
      const send=vi.fn(async()=>response);
      await expect(new InstalledRelayLeaseClient(f.config,send).issue(f.sourceEnvelope)).rejects.toThrow();
      expect(send).toHaveBeenCalledTimes(1);
    }
    const send=vi.fn(async(url:URL|RequestInfo)=>String(url).endsWith('/prepare')?prepared():Response.json(await f.response()));
    expect(await new InstalledRelayLeaseClient(f.config,send).issue(f.sourceEnvelope)).not.toHaveProperty('token');
  });
});
