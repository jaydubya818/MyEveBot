import { createHash, createPublicKey, verify } from 'node:crypto';
import { z } from 'zod';

const id = z.string().min(1).max(200).refine(value => value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value));
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const timestamp = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const origin = z.string().max(500).refine(value => {
  try {
    const url = new URL(value);
    return url.origin === value && url.protocol === 'https:' && !url.username && !url.password && !url.port
      && url.hostname.includes('.') && !url.hostname.endsWith('.') && !url.hostname.endsWith('.localhost') && !/^\d+\.\d+\.\d+\.\d+$/.test(url.hostname);
  } catch { return false; }
});

export const executionPermitSchema = z.object({
  schema: z.literal('mc-execution-permit/v1'), permitId: id, issuer: origin, audience: origin,
  issuedAt: timestamp, expiresAt: timestamp, installationId: id, connectionId: id,
  enrollmentRevision: positive, ownerId: id, ownerSubject: id, missionControlOwnerId: id,
  tenantId: id, projectId: id, missionId: id, planId: id, planDigest: digest,
  workOrderId: id, workOrderRevisionId: id, approvalId: id, approvalDigest: digest,
  work: z.object({ id, version: positive, generation: positive, tupleSha256: sha }).strict(),
  admission: z.object({ factoryVersion: sha, executionContractSha256: sha, capabilityPolicySha256: sha,
    maxCostMicrousd: positive, maxDurationSeconds: positive }).strict(),
}).strict();
export type ExecutionPermit = z.infer<typeof executionPermitSchema>;
export const executionPermitEnvelopeSchema = z.object({ document: executionPermitSchema, keyId: sha,
  signature: z.string().regex(/^[A-Za-z0-9_-]{86}$/) }).strict();
export type ExecutionPermitEnvelope = z.infer<typeof executionPermitEnvelopeSchema>;

export const ownerFactoryAdapterSchema = z.object({
  factoryId: id, sourceDigest: sha, configurationDigest: sha, configurationHash: sha,
  profileHash: sha, repository: id, agentId: id,
}).strict();

export const ownerEnrollmentSchema = z.object({
  schema: z.literal('mc-owner-enrollment/v1'), environment: z.literal('APPROVED_NONPRODUCTION'),
  installationId: id, revision: positive, ownerId: id, ownerSubject: id, missionControlOwnerId: id,
  tenantId: id, projectId: id, connectionId: id, issuer: origin, audience: origin,
  clerkIssuer: origin, clerkAudience: id, clerkAuthorizedParty: origin,
  activeFrom: timestamp, expiresAt: timestamp, revokedAt: timestamp.nullable(),
  factoryVersion: sha, executionContractSha256: sha, capabilityPolicySha256: sha,
  // Older evidence remains readable; installed Relay admission requires this pin.
  relayLeaseEnrollmentSha256: sha.optional(),
  // MyEve-only qualification pins; never an execution grant or an alpha slot.
  ownerFactoryAdapter: ownerFactoryAdapterSchema.optional(),
  maxCostMicrousd: positive, maxDurationSeconds: positive,
  permitKeys: z.array(z.object({ keyId: sha, publicKey: z.string().min(1).max(2000), activeFrom: timestamp,
    notAfter: timestamp, revokedAt: timestamp.nullable() }).strict()).min(1).max(4),
}).strict();
export type OwnerEnrollment = z.infer<typeof ownerEnrollmentSchema>;

export function canonicalPermitJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalPermitJson).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalPermitJson(item)}`).join(',')}}`;
  return JSON.stringify(value);
}
export const permitSigningBytes = (document: ExecutionPermit) => Buffer.from(`mc-execution-permit/v1\n${canonicalPermitJson(document)}`, 'utf8');
export const permitDigest = (document: ExecutionPermit) => createHash('sha256').update(permitSigningBytes(document)).digest('hex');

export const admissionReceiptSchema = executionPermitSchema.omit({ schema: true, admission: true }).extend({
  schema: z.literal('mc-admission-receipt/v1'), commandId: id,
  challenge: z.string().regex(/^[a-f0-9]{32,128}$/), permitSha256: sha, policyPairSha256: sha,
}).strict();
export type AdmissionReceipt = z.infer<typeof admissionReceiptSchema>;
export const admissionEnvelopeSchema = z.object({ document: admissionReceiptSchema, keyId: sha,
  signature: z.string().regex(/^[A-Za-z0-9_-]{86}$/) }).strict();
export const admissionSigningBytes = (document: AdmissionReceipt) => Buffer.from(`mc-admission-receipt/v1\n${canonicalPermitJson(document)}`, 'utf8');

export const permitControlSchema = executionPermitSchema.omit({schema:true,admission:true,planDigest:true,approvalId:true,approvalDigest:true}).extend({
  schema:z.literal('mc-permit-control/v1'),permitSha256:sha,sequence:positive,
  operation:z.enum(['revoke','disable_new']),reason:id,requestedAt:timestamp,
}).strict();
export type PermitControl = z.infer<typeof permitControlSchema>;
export const permitControlEnvelopeSchema = z.object({document:permitControlSchema,keyId:sha,
  signature:z.string().regex(/^[A-Za-z0-9_-]{86}$/)}).strict();
export const controlSigningBytes = (document:PermitControl) => Buffer.from(`mc-permit-control/v1\n${canonicalPermitJson(document)}`,'utf8');
export function controlDigest(document:PermitControl) {
  const {issuedAt:_issuedAt,expiresAt:_expiresAt,...stable}=document;
  return createHash('sha256').update(`mc-permit-control/v1\n${canonicalPermitJson(stable)}`).digest('hex');
}

/** Expired execution approval may still be fenced. This verifies only a denying control. */
export function verifyPermitControl(value:unknown,permitValue:unknown,enrollmentValue:unknown,now=Date.now()) {
  const parsed=permitControlEnvelopeSchema.safeParse(value),permit=executionPermitEnvelopeSchema.safeParse(permitValue),
    enrolled=ownerEnrollmentSchema.safeParse(enrollmentValue);
  const deny=():never=>{throw Error('MISSIONCONTROL_CONTROL_DENIED');};
  if(!parsed.success||!permit.success||!enrolled.success||!Number.isSafeInteger(now))return deny();
  const envelope=parsed.data,c=envelope.document,e=enrolled.data;
  if(c.issuedAt>now||c.expiresAt<=now||c.expiresAt<=c.issuedAt||c.expiresAt-c.issuedAt>30000||c.requestedAt>c.issuedAt
    ||c.permitSha256!==permitDigest(permit.data.document))return deny();
  for(const field of ['ownerId','installationId','connectionId','issuer','audience','ownerSubject','missionControlOwnerId','tenantId','projectId'] as const)
    if(c[field]!==e[field])return deny();
  const excluded=new Set(['schema','admission','planDigest','approvalId','approvalDigest','issuedAt','expiresAt']);
  const fields:Record<string,unknown>=c;
  for(const [field,expected] of Object.entries(permit.data.document))
    if(!excluded.has(field)&&canonicalPermitJson(fields[field])!==canonicalPermitJson(expected))return deny();
  if(!authenticSignature(e,envelope.keyId,envelope.signature,controlSigningBytes(c),c.issuedAt,c.expiresAt))return deny();
  return {envelope,controlDigest:controlDigest(c)};
}

function authenticSignature(enrollment: OwnerEnrollment, keyId: string, signatureText: string, bytes: Buffer, issuedAt: number, expiresAt: number): boolean {
  const keys = enrollment.permitKeys.filter(key => key.keyId === keyId);
  if (keys.length !== 1) return false;
  const key = keys[0];
  if (key.revokedAt !== null || key.activeFrom > issuedAt || key.notAfter < expiresAt) return false;
  try {
    const publicKey = createPublicKey(key.publicKey), signature = Buffer.from(signatureText, 'base64url');
    return publicKey.asymmetricKeyType === 'ed25519' && signature.length === 64 && signature.toString('base64url') === signatureText
      && createHash('sha256').update(publicKey.export({ type: 'spki', format: 'der' })).digest('hex') === key.keyId
      && verify(null, bytes, publicKey, signature);
  } catch { return false; }
}

export interface PermitWorkBinding {
  ownerId: string;
  workId: string;
  workVersion: number;
  workGeneration: number;
  tupleSha256: string;
  maxCostMicrousd: number;
  maxDurationSeconds: number;
}

/** The enrollment comes from the owner-scoped server store, never the request. */
export function verifyExecutionPermit(value: unknown, enrollmentValue: unknown, work: PermitWorkBinding, now = Date.now()) {
  const deny = (): never => { throw Error('MISSIONCONTROL_PERMIT_DENIED'); };
  const parsed = executionPermitEnvelopeSchema.safeParse(value), enrolled = ownerEnrollmentSchema.safeParse(enrollmentValue);
  if (!parsed.success || !enrolled.success || !Number.isSafeInteger(now)) return deny();
  const envelope = parsed.data, document = envelope.document, enrollment = enrolled.data;
  if (enrollment.revokedAt !== null || enrollment.activeFrom > now || enrollment.expiresAt <= now
    || document.issuedAt > now || document.expiresAt <= now || document.expiresAt <= document.issuedAt
    || document.expiresAt - document.issuedAt > 300000 || document.expiresAt > enrollment.expiresAt
    || document.enrollmentRevision !== enrollment.revision || document.ownerId !== work.ownerId) return deny();
  const fields = ['ownerId', 'ownerSubject', 'missionControlOwnerId', 'installationId', 'connectionId', 'tenantId', 'projectId', 'issuer', 'audience'] as const;
  if (fields.some(field => document[field] !== enrollment[field])
    || document.work.id !== work.workId || document.work.version !== work.workVersion || document.work.generation !== work.workGeneration
    || document.work.tupleSha256 !== work.tupleSha256
    || document.admission.maxCostMicrousd !== work.maxCostMicrousd || document.admission.maxDurationSeconds !== work.maxDurationSeconds
    || document.admission.maxCostMicrousd > enrollment.maxCostMicrousd || document.admission.maxDurationSeconds > enrollment.maxDurationSeconds
    || (['factoryVersion', 'executionContractSha256', 'capabilityPolicySha256'] as const).some(field => document.admission[field] !== enrollment[field])) return deny();
  if (!authenticSignature(enrollment, envelope.keyId, envelope.signature, permitSigningBytes(document), document.issuedAt, document.expiresAt)) return deny();
  return { envelope, enrollment, document, permitSha256: permitDigest(document) };
}

export function verifyAdmissionReceipt(value: unknown, permit: ReturnType<typeof verifyExecutionPermit>,
  request: { commandId: string; challenge: string; policyPairSha256: string }, now = Date.now()) {
  const parsed = admissionEnvelopeSchema.safeParse(value);
  const deny = (): never => { throw Error('MISSIONCONTROL_ADMISSION_DENIED'); };
  if (!parsed.success || !Number.isSafeInteger(now)) return deny();
  const envelope = parsed.data, receipt = envelope.document;
  if (receipt.commandId !== request.commandId || receipt.challenge !== request.challenge || receipt.permitSha256 !== permit.permitSha256
    || receipt.policyPairSha256 !== request.policyPairSha256
    || envelope.keyId !== permit.envelope.keyId || receipt.issuedAt > now || receipt.issuedAt < permit.document.issuedAt
    || receipt.expiresAt <= now || receipt.expiresAt <= receipt.issuedAt || receipt.expiresAt - receipt.issuedAt > 10000
    || receipt.expiresAt > permit.document.expiresAt || receipt.expiresAt > permit.enrollment.expiresAt) return deny();
  const excluded = new Set(['schema', 'admission', 'issuedAt', 'expiresAt']);
  const values: Record<string, unknown> = receipt;
  for (const [field, expected] of Object.entries(permit.document))
    if (!excluded.has(field) && canonicalPermitJson(values[field]) !== canonicalPermitJson(expected)) return deny();
  if (!authenticSignature(permit.enrollment, envelope.keyId, envelope.signature, admissionSigningBytes(receipt), receipt.issuedAt, receipt.expiresAt)) return deny();
  return envelope;
}
