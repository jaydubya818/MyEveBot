import { createHmac, createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { InstalledMissionControlClient, installedMissionControlConfig } from './installed-client.ts';
import { permitFixture } from './permit-test-fixture.ts';

function fixture() {
  const f=permitFixture({ownerId:'fixture-owner',workId:'fixture-work',workVersion:1,workGeneration:1,
    tupleSha256:'a'.repeat(64),maxCostMicrousd:1300000,maxDurationSeconds:180});
  const env={NODE_ENV:'test' as const,MYEVE_MISSIONCONTROL_MODE:'APPROVED_NONPRODUCTION',MYEVE_OWNER_ID:f.enrollment.ownerId,
    MYEVE_MISSIONCONTROL_INSTALLATION_ID:f.enrollment.installationId,MYEVE_MISSIONCONTROL_CONNECTION_ID:f.enrollment.connectionId,
    MYEVE_MISSIONCONTROL_URL:f.enrollment.issuer,MYEVE_MISSIONCONTROL_AUDIENCE:f.enrollment.audience,
    MYEVE_MISSIONCONTROL_SECRET:'fixture-connection-secret-32-characters'};
  return {...f,env};
}
describe('installed MissionControl client',()=>{
  it('uses only exact enrolled deployment bindings and no fixture fallback',()=>{
    const f=fixture();expect(installedMissionControlConfig(f.enrollment,'fixture-owner',f.env).endpoint).toBe(f.enrollment.issuer);
    for(const field of Object.keys(f.env).filter(key=>key!=='NODE_ENV')){
      expect(()=>installedMissionControlConfig(f.enrollment,'fixture-owner',{...f.env,[field]:'foreign'})).toThrow();
    }
    expect(()=>installedMissionControlConfig(f.enrollment,'foreign',f.env)).toThrow();
    expect(()=>installedMissionControlConfig({...f.enrollment,revokedAt:Date.now()},'fixture-owner',f.env)).toThrow();
  });
  it('sends the documented HMAC read challenge, ignores bounded logs and retains exact command identity',async()=>{
    const f=fixture(),result={permit:f.signPermit(),capabilityChallenge:{message:'{}',keyId:'fixture',signature:'fixture'}};
    const send=vi.fn(async()=>Response.json({status:'success',value:result,logLines:['synthetic diagnostic']}));
    const client=new InstalledMissionControlClient(installedMissionControlConfig(f.enrollment,'fixture-owner',f.env),send);
    expect(await client.readApproved(f.document.work,{commandId:'read-1',admissionCommandId:'admission-1',challenge:'b'.repeat(64)})).toEqual(result);
    const [url,request]=send.mock.calls[0] as unknown as [string,RequestInit];
    expect(url).toBe('https://mc.example.test/api/action');expect(request.redirect).toBe('error');
    const body=JSON.parse(String(request.body)),packet=body.args[0],e=packet.envelope;
    expect(body.path).toBe('sofieExecutionPermits:readApproved');expect(e.commandId).toBe('read-1');
    expect(e.payloadDigest).toBe('sha256='+createHash('sha256').update(packet.payloadJson).digest('hex'));
    const bytes=['mc-service-command-v1',e.serviceId,e.capability,e.projectId,e.repositoryId,e.commandId,String(e.issuedAt),String(e.expiresAt),e.payloadDigest].join('\n');
    expect(e.signature).toBe('sha256='+createHmac('sha256',f.env.MYEVE_MISSIONCONTROL_SECRET).update(bytes).digest('hex'));
    expect(JSON.parse(packet.payloadJson)).toMatchObject({connectionId:f.enrollment.connectionId,admissionCommandId:'admission-1',work:f.document.work});
  });
  it('denies oversized, malformed or refused responses without retrying',async()=>{
    const f=fixture();
    for(const response of [new Response('x'.repeat(65537)),new Response('not json'),Response.json({status:'error'}),new Response('denied',{status:403})]){
      const send=vi.fn(async()=>response),client=new InstalledMissionControlClient(installedMissionControlConfig(f.enrollment,'fixture-owner',f.env),send);
      await expect(client.readApproved(f.document.work,{commandId:'r',admissionCommandId:'a',challenge:'b'.repeat(64)})).rejects.toThrow();
      expect(send).toHaveBeenCalledTimes(1);
    }
  });
});
