import { z } from 'zod';
const APPLICATION = 'myeve-sofie-readiness-v1';
export const text = (max: number) => z.string().min(1).max(max).refine(s => s === s.trim() && !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(s));
export const id = text(200), digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const proposal = z.object({ title:text(160), objective:text(4000), workstreams:z.array(text(160)).min(2).max(12),
  milestones:z.array(text(160)).min(1).max(20), stopCondition:text(500), budgetMicrousd:z.literal(0) }).strict();
export const enterpriseInput = z.discriminatedUnion('operation', [
  z.object({operation:z.literal('enterprise.result'),missionId:id,expectedPlanDigest:digest}).strict(),
  z.object({operation:z.literal('enterprise.inspect'),intentKey:id.nullable(),proposalId:id.nullable()}).strict().refine(r=>(r.intentKey===null)!==(r.proposalId===null)),
  z.object({operation:z.literal('enterprise.propose'),intentKey:id,proposal}).strict(),
  z.object({operation:z.literal('enterprise.submit'),proposalId:id,proposalDigest:digest}).strict(),
  z.object({operation:z.literal('enterprise.read'),proposalId:id,missionId:id,expectedPlanDigest:digest.nullable()}).strict(),
]);
export type EnterpriseInput = z.infer<typeof enterpriseInput>;
const qualityGate=z.object({eligible:z.boolean(),reasons:z.array(text(500)).max(100),identity:z.record(z.string(),z.unknown()).nullable().optional()}).strict();
const plan=z.object({id,revision:z.number().int().positive(),status:text(60),digest,
  milestones:z.array(z.object({id,title:text(500),dependsOn:z.array(id).max(100)}).strict()).max(100)}).strict();
export const readResponse=z.object({
  mission:z.object({id,title:text(500),state:text(60),budgetUsd:z.number().nonnegative().nullable(),spentUsd:z.number().nonnegative()}).strict(),
  plan:plan.nullable(),plans:z.array(z.object({id,revision:z.number().int().positive(),status:text(60),digest,isCurrent:z.boolean()}).strict()).max(20),
  workOrders:z.array(z.object({id,title:text(500),state:text(60),revisionId:id.nullable(),planId:id.nullable(),blockingIssue:z.string().max(4000).nullable(),qualityGate}).strict()).max(100),
  blockers:z.array(z.string().max(4000)).max(101),needsYou:z.string().max(4000).nullable(),
  resultProof:z.object({status:z.literal('NOT_AVAILABLE'),reason:z.literal('COMPLETED_RESULT_REQUIRES_SCOPED_READ'),
    references:z.array(z.object({handoffId:id,workOrderId:id,outcome:text(60)}).strict()).max(100)}).strict(),
  truncated:z.boolean(),executionAuthority:z.literal('NONE'),explanation:z.string().max(4000),
}).strict();
export const proposeResponse=z.object({proposalId:id,digest,proposal,needsYou:text(4000),executionAuthority:z.literal('NONE')}).strict();
export const submitResponse=z.object({missionId:id,proposalDigest:digest,created:z.boolean(),executionAuthority:z.literal('NONE')}).strict();
const resultWorkOrder=z.object({workOrderId:id,revisionId:id,revision:z.number().int().positive(),sourceAttemptId:id,verificationAttemptId:id,
  candidate:text(200),producerInvocationId:id,provider:z.enum(['isolated-container','local-docker']),factoryVersion:text(200),factoryDefinitionVersionId:id,verifierFactoryDefinitionVersionId:id.nullable(),verifierFactoryVersion:text(200),verifierInvocationId:id,runtimeImage:digest.nullable(),
  qualityContractDigest:digest,verificationContractDigest:digest,verificationRunId:id,verificationReceiptId:id,verificationPlanDigest:digest,
  evidenceSetDigest:digest,evidenceIds:z.array(id).min(1).max(100),reservationDigest:text(200),settlementDigest:text(200),proofDigest:digest,
  verifierSettlementDigest:text(200).nullable(),handoffId:id,artifactIds:z.array(id).max(100),gate:z.literal('PASS'),independentlyVerified:z.literal(true)}).strict();
export const enterpriseResult=z.object({schema:z.literal('enterprise-result-projection/v1'),scope:z.literal('ISOLATED_DETERMINISTIC'),
  missionId:id,ownerId:id,tenantId:id,projectId:id,plan:z.object({missionId:id,planId:id,planRevision:z.number().int().positive(),planDigest:digest}).strict(),
  qualityContract:z.object({revision:z.number().int().positive(),digest}).strict(),status:z.enum(['AVAILABLE','NOT_AVAILABLE']),
  enterpriseQualityGate:z.enum(['PASS','NOT_ESTABLISHED']),ownerAcceptance:z.enum(['ACCEPTED','PENDING']),observedAt:z.number().int(),freshUntil:z.number().int(),
  assertions:z.array(z.object({assertionId:id,workOrderId:id,verificationReceiptId:id,verificationAttemptId:id}).strict()).max(100),reasons:z.array(text(500)).max(200),workOrders:z.array(resultWorkOrder).max(100),executionAuthority:z.literal('NONE'),explanation:text(500)}).strict();
export const authenticationSchema=z.object({commandId:id,requestDigest:z.string().regex(/^sha256=[a-f0-9]{64}$/),expiresAt:z.number().int(),signature:digest}).strict();
/** Structural consistency only. Authenticity and current owner authority remain server checks. */
export function hasConsistentEnterpriseResult(result: z.infer<typeof enterpriseResult>): boolean {
  if (result.plan.missionId !== result.missionId || result.qualityContract.revision !== result.plan.planRevision
    || result.freshUntil <= result.observedAt) return false;
  const orders = new Map(result.workOrders.map(order => [order.workOrderId, order]));
  if (orders.size !== result.workOrders.length || new Set(result.assertions.map(assertion => assertion.assertionId)).size !== result.assertions.length) return false;
  if (result.workOrders.some(order => order.sourceAttemptId === order.verificationAttemptId
    || order.producerInvocationId === order.verifierInvocationId || order.qualityContractDigest !== result.qualityContract.digest
    || (order.provider === 'isolated-container'
      ? !order.runtimeImage || !order.verifierFactoryDefinitionVersionId || !order.verifierSettlementDigest
      : order.runtimeImage !== null || order.verifierFactoryDefinitionVersionId !== null || order.verifierSettlementDigest !== null || order.verifierFactoryVersion !== order.factoryVersion))) return false;
  if (result.assertions.some(assertion => {
    const order = orders.get(assertion.workOrderId);
    // Assertion receipts can differ from the WorkOrder gate receipt. The canonical
    // backend verifies their candidate, evidence and execution binding before signing.
    return !order || order.verificationAttemptId !== assertion.verificationAttemptId;
  })) return false;
  return result.status === 'AVAILABLE'
    ? result.enterpriseQualityGate === 'PASS' && orders.size > 0 && result.assertions.length > 0 && result.reasons.length === 0
    : result.enterpriseQualityGate === 'NOT_ESTABLISHED' && orders.size === 0 && result.assertions.length === 0 && result.reasons.length > 0;
}
export const envelopeSchema=z.object({schema:z.literal('sofie-enterprise-response/v1'),applicationId:z.literal(APPLICATION),connectionId:id,
  projectId:id,ownerId:id,observedAt:z.number().int().positive(),responseDigest:digest,response:z.unknown(),authentication:authenticationSchema.optional()}).strict();
