import { createHash } from 'node:crypto';
import { z } from 'zod';
import { WorkError } from './types.ts';
import { canonicalPermitJson } from '../missioncontrol/execution-permit.ts';
import { capabilityPairSchema } from '../missioncontrol/installed-client.ts';
import { parsePolicyMessage, policyMessageHash, verifyPolicyMessage,
  type SignedPolicyMessage } from '../../../../packages/capability-enforcement/src/ordering-wire.ts';

const id = (prefix: string) => z.string().regex(new RegExp(`^${prefix}_[a-zA-Z0-9]{8,}$`)).max(200);
const text = z.string().min(1).max(255);
const origin = z.string().url().refine(value => {
  const url = new URL(value);
  return url.origin === value && url.protocol === 'https:' && !url.port && !url.username && !url.password
    && url.hostname.includes('.') && !url.hostname.endsWith('.') && !url.hostname.endsWith('.localhost') && !/^\d+\.\d+\.\d+\.\d+$/.test(url.hostname);
});
const resource = z.object({ type: z.string().min(1).max(128), ids: z.array(z.string().min(1).max(512)).max(1000).optional(),
  attributes: z.record(z.string(), z.union([z.string(), z.number().finite(), z.boolean(), z.array(z.string())])).optional() }).strict();

/** Operator metadata selects existing Relay authority. It grants no capability, approval or budget. */
export const factoryRelayLeaseEnrollmentSchema = z.object({
  schema: z.literal('factory-relay-lease-enrollment/v1'), ownerId: text, installationId: text, connectionId: text,
  enrollmentRevision: z.number().int().positive(), origin,
  activeFrom: z.number().int().nonnegative(), expiresAt: z.number().int().positive(),
  accountId: id('acct'), agentId: id('agt'), runtimeClientId: id('rtc'), taskId: id('tsk'), workloadId: id('wkl'), audience: text,
  capability: z.object({ name: z.string().regex(/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9_]*)+$/), version: z.string().regex(/^\d+\.\d+$/) }).strict(),
  resource, parameters: z.record(z.string(), z.unknown()),
  approvalRequestId: text.optional(), budgetReservationId: text.optional(),
  relayKey: z.object({ keyId: text, jwk: z.object({kty:z.literal('EC'),crv:z.literal('P-256'),x:text,y:text}).strict() }).strict(),
}).strict();
export type FactoryRelayLeaseEnrollment = z.infer<typeof factoryRelayLeaseEnrollmentSchema>;
const hash = (value: unknown) => createHash('sha256').update(canonicalPermitJson(value)).digest('hex');
// Relay's canonical no-limit response is {limits:{}}. Empty metadata carries
// no obligations; populated limits and unknown obligation kinds still deny.
// Inspect raw parsed JSON before any record/object schema can drop reserved keys.
const noAdditionalObligations = z.custom(value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys=Object.keys(value);
  if(keys.length===0)return true;
  if(keys.length!==1||keys[0]!=='limits')return false;
  const limits=(value as {limits:unknown}).limits;
  return Boolean(limits && typeof limits==='object' && !Array.isArray(limits) && Object.keys(limits).length===0);
});
export const factoryRelayLeaseEnrollmentDigest = (value:unknown) => hash(factoryRelayLeaseEnrollmentSchema.parse(value));
const secret = (value: string | undefined) => {
  if (!value || value.length > 16384 || value !== value.trim() || /[\u0000-\u0020\u007f]/.test(value))
    throw Error('FACTORY_RELAY_CREDENTIAL_UNAVAILABLE');
  return value;
};

export function factoryRelayLeaseConfig(value:unknown,expected:{ownerId:string;installationId:string;connectionId:string;revision:number;digest:string},credentials:{credential:string;workloadIdentityToken:string}) {
  const config=factoryRelayLeaseEnrollmentSchema.parse(value);
  if(config.ownerId!==expected.ownerId||config.installationId!==expected.installationId||config.connectionId!==expected.connectionId
    ||config.enrollmentRevision!==expected.revision||factoryRelayLeaseEnrollmentDigest(config)!==expected.digest
    ||config.activeFrom>Date.now()||config.expiresAt<=Date.now()||Object.hasOwn(config.parameters,'capabilityAdmissionDigest'))
    throw Error('FACTORY_RELAY_ENROLLMENT_CHANGED');
  return {enrollment:config,credential:secret(credentials.credential),workloadIdentityToken:secret(credentials.workloadIdentityToken)};
}

/** A bounded policy-reference transport. It never invokes a Relay resource executor. */
export class FactoryRelayLeaseClient {
  constructor(private readonly config: ReturnType<typeof factoryRelayLeaseConfig>, private readonly send: typeof fetch = fetch) {}
  private async post(path:''|'/prepare',body:string) {
    const c=this.config.enrollment;
    const response = await this.send(c.origin+'/api/v2/runtime/capability-leases'+path, {method:'POST',redirect:'error',
      signal:AbortSignal.timeout(5000),headers:{'content-type':'application/json',authorization:'Bearer '+this.config.credential,
        'x-relay-account-id':c.accountId},body});
    if (!response.ok || !response.body) throw Error('FACTORY_RELAY_LEASE_DENIED');
    const reader=response.body.getReader(),chunks:Uint8Array[]=[];let bytes=0;
    try {for (;;) {const next=await reader.read();if(next.done)break;bytes+=next.value.length;
      if(bytes>65536)throw Error('FACTORY_RELAY_RESPONSE_TOO_LARGE');chunks.push(next.value);}}
    finally {await reader.cancel();}
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  }
  async issue(sourceEnvelope: SignedPolicyMessage) {
    const source = parsePolicyMessage(JSON.parse(sourceEnvelope.message)), c = this.config.enrollment;
    if (source.kind !== 'PERMIT' || source.authority !== 'myeve' || source.capabilityId !== 'myfactory'
      || source.ownerId !== c.ownerId || source.installationId !== c.installationId || source.agentId !== c.agentId
      || source.issuedAt > Date.now() || source.expiresAt <= Date.now() || c.expiresAt <= Date.now())
      throw Error('FACTORY_RELAY_SOURCE_DENIED');
    const sourceHash = await policyMessageHash(source);
    const material = {capability:c.capability,resource:c.resource,parameters:{...c.parameters,capabilityAdmissionDigest:sourceHash}};
    // Stable for identical source delivery, including a lost response. No retry changes action identity.
    const action = {schemaVersion:'relay.action-intent.v2',id:'act_'+hash([c.accountId,sourceHash]),accountId:c.accountId,
      agentId:c.agentId,runtimeClientId:c.runtimeClientId,taskId:c.taskId,workloadId:c.workloadId,
      ...material,idempotencyKey:'factory-source-'+sourceHash,createdAt:new Date(source.issuedAt).toISOString(),canonicalHash:'sha256:'+hash(material)};
    const body = JSON.stringify({action,workloadId:c.workloadId,workloadIdentityToken:this.config.workloadIdentityToken,
      audience:c.audience,ttlSeconds:30,maxCalls:1,remoteAdmission:sourceEnvelope,
      ...(c.approvalRequestId?{approvalRequestId:c.approvalRequestId}:{}),
      ...(c.budgetReservationId?{budgetReservationId:c.budgetReservationId}:{})});
    if (Buffer.byteLength(body) > 65536) throw Error('FACTORY_RELAY_REQUEST_TOO_LARGE');
    const prepared=z.object({decision:z.object({decisionId:id('dec'),expiresAt:z.string().datetime({offset:true}),
      outcome:z.enum(['ALLOW','DENY','REQUIRE_APPROVAL','LIMIT','ESCALATE']),reasonCodes:z.array(z.string()),
      obligations:z.unknown(),matchedRuleIds:z.array(z.string())}).strict(),
      approvalRequest:z.object({requestId:text,allowedScopes:z.array(z.unknown()),expiresAt:z.string().datetime({offset:true})}).strict().nullable()}).strict()
      .parse(await this.post('/prepare',body));
    if(Date.parse(prepared.decision.expiresAt)<=Date.now()||source.expiresAt<=Date.now()
      ||['DENY','ESCALATE','LIMIT'].includes(prepared.decision.outcome)
      ||!noAdditionalObligations.safeParse(prepared.decision.obligations).success)throw Error('FACTORY_RELAY_POLICY_DENIED');
    if(prepared.decision.outcome==='REQUIRE_APPROVAL'&&(!prepared.approvalRequest||prepared.approvalRequest.requestId!==c.approvalRequestId
      ||Date.parse(prepared.approvalRequest.expiresAt)<=Date.now()))
      throw new WorkError('FACTORY_RELAY_APPROVAL_REQUIRED','Relay requires its current owner approval. Factory dispatch is blocked until that approval is current.',409);
    const result=z.object({leaseId:id('lse'),token:z.string().min(1).max(16384),expiresAt:z.string().datetime({offset:true}),
      maxCalls:z.literal(1),onlineRequired:z.literal(true),remotePermit:capabilityPairSchema.shape.relay}).strict()
      .parse(await this.post('',body));
    const relay=await verifyPolicyMessage(result.remotePermit,c.relayKey);
    if(relay.kind!=='PERMIT'||relay.authority!=='relay'||relay.referenceId!==result.leaseId||relay.sourcePermitHash!==sourceHash
      ||relay.expiresAt<=Date.now()||relay.expiresAt>source.expiresAt||relay.expiresAt>Date.parse(result.expiresAt)
      ||relay.issuedAt>Date.now()||Date.parse(result.expiresAt)<=Date.now())throw Error('FACTORY_RELAY_PROOF_DENIED');
    for(const key of ['ownerId','organizationId','installationId','backendId','incarnation','enrollmentVersion','capabilityId',
      'registryVersion','agentId','workId','missionId','workGeneration','actionDigest','budgetMicros','requiredCapabilities'] as const)
      if(canonicalPermitJson(relay[key])!==canonicalPermitJson(source[key]))throw Error('FACTORY_RELAY_PROOF_DENIED');
    // The caller retains the signed policy pair via canonical MissionControl admission.
    // A returned reference is not a consumed Relay call or a Factory dispatch receipt.
    return result.remotePermit;
  }
}
