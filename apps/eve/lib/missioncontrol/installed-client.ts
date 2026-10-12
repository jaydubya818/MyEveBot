import { createHash } from 'node:crypto';
import { z } from 'zod';
import { signedServiceCommand, type EnterpriseConfig } from './consumer.ts';
import { canonicalPermitJson, ownerEnrollmentSchema, type OwnerEnrollment, type ExecutionPermit } from './execution-permit.ts';
import type { SignedPolicyMessage } from '../../../../packages/capability-enforcement/src/ordering-wire.ts';

const envelope = z.object({message:z.string().min(1).max(16384),keyId:z.string().min(1).max(255),signature:z.string().min(1).max(128)}).strict();
export const capabilityPairSchema = z.object({myeve:envelope,relay:envelope}).strict();
export type CapabilityPair = z.infer<typeof capabilityPairSchema>;
export const capabilityPairDigest = (pair: CapabilityPair) => createHash('sha256').update(canonicalPermitJson(capabilityPairSchema.parse(pair))).digest('hex');

/** Configuration only selects an operator-enrolled owner. It never creates a binding. */
export function installedMissionControlConfig(value: unknown, ownerId: string, env: NodeJS.ProcessEnv = process.env,
  purpose:'admission'|'control'='admission'): EnterpriseConfig & {purpose:'admission'|'control'} {
  const e = ownerEnrollmentSchema.parse(value);
  const secret = env.MYEVE_MISSIONCONTROL_SECRET;
  if (env.MYEVE_MISSIONCONTROL_MODE !== 'APPROVED_NONPRODUCTION' || e.ownerId !== ownerId
    || env.MYEVE_OWNER_ID !== ownerId || env.MYEVE_MISSIONCONTROL_INSTALLATION_ID !== e.installationId
    || env.MYEVE_MISSIONCONTROL_CONNECTION_ID !== e.connectionId || env.MYEVE_MISSIONCONTROL_URL !== e.issuer
    || env.MYEVE_MISSIONCONTROL_AUDIENCE !== e.audience || !secret || secret.length < 32 || secret.length > 4096
    || secret !== secret.trim() || /[\r\n]/.test(secret)
    || (purpose==='admission'&&(e.revokedAt !== null || e.activeFrom > Date.now() || e.expiresAt <= Date.now())))
    throw Error('MISSIONCONTROL_INSTALLATION_UNAVAILABLE');
  return {endpoint:e.issuer,ownerId:e.ownerId,missionControlOwnerId:e.missionControlOwnerId,tenantId:e.tenantId,
    projectId:e.projectId,connectionId:e.connectionId,secret,purpose};
}

/** No automatic retries, redirects or target URLs from request data. */
export class InstalledMissionControlClient {
  constructor(readonly config: EnterpriseConfig & {purpose:'admission'|'control'}, private readonly send: typeof fetch = fetch) {}
  private async command(path: 'readApproved'|'authorizeAdmission'|'readControl'|'acknowledgeControl', capability: string, payload: unknown, commandId: string) {
    if(this.config.purpose==='control'&&!['readControl','acknowledgeControl'].includes(path))throw Error('MISSIONCONTROL_CONTROL_ONLY');
    const packet = signedServiceCommand(this.config, capability, payload, commandId);
    const response = await this.send(this.config.endpoint + '/api/action', {
      method:'POST',redirect:'error',signal:AbortSignal.timeout(5000),headers:{'content-type':'application/json'},
      body:JSON.stringify({path:'sofieExecutionPermits:'+path,args:[packet],format:'convex_encoded_json'}),
    });
    if (!response.ok || !response.body) throw Error('MISSIONCONTROL_RESPONSE_UNAVAILABLE');
    const reader=response.body.getReader(), chunks:Uint8Array[]=[]; let size=0;
    try { for (;;) {
      const next=await reader.read(); if(next.done)break;
      size+=next.value.length;if(size>65536)throw Error('MISSIONCONTROL_RESPONSE_TOO_LARGE');chunks.push(next.value);
    } } finally { await reader.cancel(); }
    let value: unknown;
    try { value=JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw Error('MISSIONCONTROL_RESPONSE_INVALID'); }
    const result=z.object({status:z.literal('success'),value:z.unknown(),logLines:z.array(z.string()).optional()}).strict().safeParse(value);
    if (!result.success) throw Error('MISSIONCONTROL_COMMAND_DENIED');
    return result.data.value;
  }
  async readApproved(work: ExecutionPermit['work'], request: {commandId:string;admissionCommandId:string;challenge:string}) {
    const response=await this.command('readApproved','enterprise.readApprovedPermit',{
      schema:'mc-approved-permit-read/v1',connectionId:this.config.connectionId,work,
      admissionCommandId:request.admissionCommandId,challenge:request.challenge,
    },request.commandId);
    return z.object({permit:z.unknown(),capabilityChallenge:envelope}).strict().parse(response);
  }
  async authorize(permit: ExecutionPermit, permitSha256:string, pair:CapabilityPair, request:{commandId:string;challenge:string}) {
    return this.command('authorizeAdmission','enterprise.authorizeAdmission',{
      schema:'mc-admission-challenge/v1',connectionId:this.config.connectionId,permitId:permit.permitId,permitSha256,
      challenge:request.challenge,work:permit.work,capabilityPermits:capabilityPairSchema.parse(pair),
    },request.commandId);
  }
  async readControl(permitId:string,commandId:string) {
    return this.command('readControl','enterprise.readPermitControl',{
      schema:'mc-permit-control-read/v1',connectionId:this.config.connectionId,permitId,
    },commandId);
  }
  async acknowledgeControl(acknowledgment:{schema:'mc-permit-control-ack/v1';connectionId:string;permitId:string;sequence:number;controlDigest:string;
    authority:'FENCED'|'NEW_ADMISSIONS_DENIED';cleanup:'PENDING_BACKEND'|'CONFIRMED'},commandId:string) {
    if(acknowledgment.connectionId!==this.config.connectionId)throw Error('MISSIONCONTROL_CONTROL_DENIED');
    return this.command('acknowledgeControl','enterprise.acknowledgePermitControl',acknowledgment,commandId);
  }
}

export interface CapabilityPairIssuer {
  /** Issue using existing canonical MyEve policy admission and Relay lease checks. */
  issue(challenge: SignedPolicyMessage, enrollment: OwnerEnrollment): Promise<CapabilityPair>;
}
