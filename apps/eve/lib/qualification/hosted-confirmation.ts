import { createHash, createHmac, createPrivateKey, createPublicKey, randomUUID, sign as edSign } from "node:crypto";
import { z } from "zod";
import type { FactoryRuntime } from "../engineering/factory-routing.ts";
import type { WorkStore } from "../engineering/store.ts";
import type { Work } from "../engineering/types.ts";
import { canonicalPermitJson, type OwnerEnrollment } from "../missioncontrol/execution-permit.ts";
import { contentDigest, signedServiceCommand } from "../missioncontrol/consumer.ts";
import { installedMissionControlConfig } from "../missioncontrol/installed-client.ts";
import { ownerFactoryWorkTuple } from "../missioncontrol/owner-factory-binding.ts";
import { MissionControlBindings } from "../missioncontrol/permit-store.ts";
import { prepareMissionControlExecution } from "../missioncontrol/prepare-execution.ts";
import { requestOwnerFactoryAdmission } from "../missioncontrol/admit-execution.ts";
import { HOSTED_PROFILE } from "../engineering/factory-mailbox.ts";
import { ensureRequestStageWorks, ownerLocalRequestRuntime } from "./owner-local-confirmation.ts";

/**
 * HOSTED private beta (myeve.private-beta.hosted/v1): Sofie -> Plan -> Confirm -> Build -> Verify -> Results.
 *
 * After the person's authenticated `confirm <plan>` in hosted Sofie (root-verified plan digest), MyEve:
 *  1. claims the confirmed request's stage Works (idempotent per plan digest; a second claim refuses);
 *  2. proposes the Mission over the person's OWN operator-enrolled MissionControl connection (Sofie application service command, no authority);
 *  3. signs ONE confirmation binding (subject, installation, connection/enrollment, proposal, exact Plan specification and its digest,
 *     repository, Work tuples, limits, <= 10 minute window, nonce) with this installation's Ed25519 confirmation key, and submits it
 *     server-to-server with the per-installation submitter credential, which can only submit confirmations;
 *  4. MissionControl verifies, consumes it once and makes the owner decisions through its own checks (convex/sofieConfirmations.ts);
 *  5. before each stage, MyEve prepares that Work's permit request and asks MissionControl to approve exactly it under the same confirmation.
 * No user password, owner token or stored session is used; MyEve itself creates no approval. Progress and Results are unchanged.
 */
export class HostedConfirmationRefused extends Error { constructor(readonly code: string) { super(code); } }
const refuse = (code: string): never => { throw new HostedConfirmationRefused(code); };
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
import { hostedConfirmationSchema, type HostedConfirmationProfile } from "./hosted-confirmation-profile.ts";
export { hostedConfirmationSchema, type HostedConfirmationProfile };

export const CONFIRMATION_SCHEMA = "myeve-hosted-confirmation/v1" as const;
export const confirmationSigningBytes = (binding: unknown) => Buffer.from(`${CONFIRMATION_SCHEMA}\n${canonicalPermitJson(binding)}`);
export const confirmationDigest = (binding: unknown) => sha256(confirmationSigningBytes(binding));
export const planContentDigest = (plan: unknown) => sha256(`mc-sofie-confirmed-plan/v1\n${canonicalPermitJson(plan)}`);

/** The exact MissionControl Plan specification the person confirms: one WorkOrder blueprint per stage Work, in order. */
export function hostedPlanSpecification(input: { request: string; title: string; planSha256: string; repository: string; workflowId: string; workIds: string[] }) {
  const n = input.workIds.length;
  const blueprintFor = (stage: number) => ({ id: `stage-${stage}`, title: `Stage ${stage}/${n}: ${input.title}`.slice(0, 160), desiredOutcome: input.request,
    workflowId: input.workflowId, sequence: stage, role: "WORKER", isMutating: true, priority: 2, riskLevel: "MEDIUM",
    constraints: [`Repository ${input.repository} only`, "MyFactory is the only execution engine", "Hosted private beta; no production"],
    requiredApprovals: [], assertionIds: ["build-and-tests"], dependsOnBlueprintIds: stage === 1 ? [] : [`stage-${stage - 1}`], branchStrategy: "sofie/owner-requests",
    implementationPolicy: { allowedCommands: ["npm run build", "npx playwright test"], maxAttempts: 2, maxFilesChanged: 40, maxLinesChanged: 4000, timeoutMinutes: 10,
      stopCondition: "Stop at the MyFactory 10-minute Work cap or on any refusal; no automatic retry.",
      independentVerification: { executable: "npx", args: ["playwright", "test"], category: "INTEGRATION_TEST", commandClass: "TEST", evidenceCategory: "BROWSER_RESULT", timeoutMs: 600000 } } });
  return { summary: `Sofie-confirmed plan ${input.planSha256}`, rollbackApproach: "Candidate commits only; the baseline is unchanged until the owner publishes.",
    workOrderBlueprints: input.workIds.map((_, i) => blueprintFor(i + 1)),
    assertions: [{ assertionId: "build-and-tests", title: "Factory build and Playwright tests pass", outcome: input.request, verificationMethod: "TEST",
      passCondition: "npm run build && npx playwright test exits 0 in MyFactory", requiredEvidence: "Signed MyFactory Result and private-beta verifier verdict",
      requiresIndependentValidation: true, waiverAllowed: false }],
    metadata: { myevePlanSha256: input.planSha256, works: input.workIds } };
}

export function hostedConfirmationBinding(input: { enrollment: OwnerEnrollment; proposalId: string; proposalDigest: string; plan: ReturnType<typeof hostedPlanSpecification>;
  planSha256: string; repository: string; works: Work[]; maxCostMicrousd: number; maxDurationSeconds: number; now: number; nonce?: string }) {
  const e = input.enrollment;
  return { schema: CONFIRMATION_SCHEMA, installationId: e.installationId, subject: e.ownerSubject, myeveOwnerId: e.ownerId, connectionId: e.connectionId,
    enrollmentRevision: e.revision, proposalId: input.proposalId, proposalDigest: input.proposalDigest, planSha256: input.planSha256,
    planContentSha256: planContentDigest(input.plan), plan: input.plan, repository: input.repository,
    works: input.works.map((w, i) => ({ stage: i + 1, id: w.id, version: w.version, generation: w.generation, tupleSha256: ownerFactoryWorkTuple(w, e) })),
    limits: { factoryVersion: e.factoryVersion, maxCostMicrousd: input.maxCostMicrousd, maxDurationSeconds: input.maxDurationSeconds },
    issuedAt: input.now, expiresAt: input.now + 5 * 60_000, nonce: input.nonce ?? randomUUID() };
}

export function signHostedConfirmation(binding: unknown, privateKeyPem: string, keyId: string) {
  const privateKey = createPrivateKey(privateKeyPem);
  if (privateKey.asymmetricKeyType !== "ed25519" || sha256(createPublicKey(privateKey).export({ type: "spki", format: "der" })) !== keyId) return refuse("HOSTED_CONFIRMATION_KEY");
  return { binding, keyId, signature: edSign(null, confirmationSigningBytes(binding), privateKey).toString("base64url") };
}

/** The submitter credential's envelope: it names only the installation and the confirmation action. */
export function confirmationSubmission(capability: "sofie.confirmPlan" | "sofie.approveConfirmedPermit", payload: Record<string, unknown> & { installationId: string },
  projectId: string, submitterSecret: string, now = Date.now()) {
  const payloadJson = JSON.stringify({ schema: "mc-sofie-confirmation-submission/v1", ...payload });
  const envelope = { serviceId: "myeve-hosted-confirmation", capability, projectId, repositoryId: `installation:${payload.installationId}`, commandId: randomUUID(),
    issuedAt: now, expiresAt: now + 60_000, payloadDigest: "sha256=" + sha256(payloadJson) };
  const bytes = ["mc-service-command-v1", envelope.serviceId, envelope.capability, envelope.projectId, envelope.repositoryId, envelope.commandId,
    String(envelope.issuedAt), String(envelope.expiresAt), envelope.payloadDigest].join("\n");
  return { envelope: { ...envelope, signature: "sha256=" + createHmac("sha256", submitterSecret).update(bytes).digest("hex") }, payloadJson };
}

async function action(origin: string, path: string, packet: unknown, send: typeof fetch, code: string) {
  const response = await send(origin + "/api/action", { method: "POST", redirect: "error", signal: AbortSignal.timeout(60_000), headers: { "content-type": "application/json" },
    body: JSON.stringify({ path, args: [packet], format: "convex_encoded_json" }) });
  const value = await response.json().catch(() => null) as { status?: string; value?: unknown; errorMessage?: string } | null;
  if (!response.ok || value?.status !== "success") return refuse(`${code}:${String(value?.errorMessage ?? response.status).slice(0, 160)}`);
  return value.value as Record<string, any>;
}

const planResult = z.object({ confirmationDigest: z.string(), connectionId: z.string(), proposalId: z.string(), missionId: z.string(), planId: z.string(),
  planDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/), verifiedPlanDigest: z.string(),
  workOrders: z.array(z.object({ stage: z.number().int(), workId: z.string(), workOrderId: z.string(), expectedWorkOrderRevisionId: z.string() }).strict()) }).strict();

export type HostedConfirmed = { workIds: { stage1: string; stage2: string; stage3: string }; runtime: FactoryRuntime; missionId: string; confirmationDigest: string;
  works: Array<{ id: string; version: number; generation: number }>;
  admission: (store: WorkStore, work: Work, config: FactoryRuntime) => ReturnType<typeof requestOwnerFactoryAdmission> };

export async function confirmHostedRequest(c: {
  profile: string; installationId: string; missionControlOrigin: string; confirmation: HostedConfirmationProfile; store: WorkStore; base: FactoryRuntime;
  request: string; planSha256: string; credential(name: string): string | undefined; env?: NodeJS.ProcessEnv; send?: typeof fetch; now?: () => number;
}): Promise<HostedConfirmed> {
  if (c.profile !== HOSTED_PROFILE) return refuse("HOSTED_CONFIRMATION_PROFILE");
  const p = hostedConfirmationSchema.parse(c.confirmation), now = c.now ?? Date.now, send = c.send ?? fetch, ownerId = c.store.principal.scopeId;
  if (c.store.principal.scopeKind !== "personal" || c.store.principal.actorId !== ownerId || !c.store.database.atomic) return refuse("HOSTED_CONFIRMATION_OWNER_STORE");
  const secret = (name: string) => c.credential(name) ?? refuse(`HOSTED_CONFIRMATION_CREDENTIAL:${name}`);
  // Every credential is resolved before any Work is claimed, so a missing one can never leave claimed Works behind.
  const signerPem = secret(p.signerEnv), submitter = secret(p.submitterEnv), connectionSecret = secret(p.connectionSecretEnv);
  // The person's own operator-installed MissionControl enrollment (never created here).
  const enrollment = await new MissionControlBindings(c.store.database, ownerId).enrollment() as OwnerEnrollment;
  if (enrollment.ownerId !== ownerId || enrollment.installationId !== c.installationId || enrollment.issuer !== c.missionControlOrigin) return refuse("HOSTED_CONFIRMATION_ENROLLMENT");
  const env: NodeJS.ProcessEnv = { ...(c.env ?? process.env), MYEVE_MISSIONCONTROL_MODE: "APPROVED_NONPRODUCTION", MYEVE_OWNER_ID: ownerId,
    MYEVE_MISSIONCONTROL_INSTALLATION_ID: enrollment.installationId, MYEVE_MISSIONCONTROL_CONNECTION_ID: enrollment.connectionId,
    MYEVE_MISSIONCONTROL_URL: enrollment.issuer, MYEVE_MISSIONCONTROL_AUDIENCE: enrollment.audience, MYEVE_MISSIONCONTROL_SECRET: connectionSecret };
  const mc = installedMissionControlConfig(enrollment, ownerId, env);
  const runtime = ownerLocalRequestRuntime(c.base, c.request && /^[a-f0-9]{64}$/.test(c.planSha256) ? { request: c.request, planSha256: c.planSha256 } : refuse("HOSTED_CONFIRMATION_REQUEST"));
  const repository = runtime.engineering.profile.repository;
  const claimed = await ensureRequestStageWorks(c.store, runtime, { planSha256: c.planSha256, stage: p.stage });
  const works = [claimed[1], claimed[2], claimed[3]];
  // Sofie application proposes the Mission draft over the person's own connection (no authority; the owner decision is MissionControl's, below).
  const title = c.request.slice(0, 160);
  const proposal = { title, objective: c.request, workstreams: ["MyFactory build and tests", "Private-beta verification and preview"],
    milestones: works.map((_, i) => `Stage ${i + 1}`), stopCondition: "Stop after the verified preview or on any refusal; no automatic retry.", budgetMicrousd: 0 as const };
  const intentKey = `sofie-confirm:${c.planSha256}`;
  const proposed = await action(mc.endpoint, "sofieEnterprise:command", signedServiceCommand(mc, "enterprise.propose",
    { operation: "enterprise.propose", connectionId: mc.connectionId, intentKey, proposal }), send, "HOSTED_CONFIRMATION_PROPOSE");
  const proposalId = String(proposed?.response?.proposalId ?? ""), proposalDigest = String(proposed?.response?.digest ?? "");
  if (!proposalId || proposalDigest !== contentDigest({ connectionId: mc.connectionId, tenantId: mc.tenantId, projectId: mc.projectId,
    ownerId: mc.missionControlOwnerId, intentKey, proposal })) return refuse("HOSTED_CONFIRMATION_PROPOSAL_BINDING");
  const plan = hostedPlanSpecification({ request: c.request, title, planSha256: c.planSha256, repository, workflowId: p.workflowId, workIds: works.map(w => w.id) });
  const binding = hostedConfirmationBinding({ enrollment, proposalId, proposalDigest, plan, planSha256: c.planSha256, repository, works,
    maxCostMicrousd: Math.round(p.stage.maxCostUsd * 1e6), maxDurationSeconds: p.stage.maxDurationSeconds, now: now() });
  const confirmation = signHostedConfirmation(binding, signerPem, p.keyId), digest = confirmationDigest(binding);
  const submit = signedServiceCommand(mc, "enterprise.submit", { operation: "enterprise.submit", connectionId: mc.connectionId, proposalId, proposalDigest });
  const accepted = planResult.parse(await action(mc.endpoint, "sofieConfirmations:confirmPlan",
    confirmationSubmission("sofie.confirmPlan", { installationId: enrollment.installationId, confirmation, submit }, mc.projectId, submitter), send, "HOSTED_CONFIRMATION_PLAN"));
  if (accepted.confirmationDigest !== digest || accepted.connectionId !== mc.connectionId || accepted.proposalId !== proposalId || accepted.workOrders.length !== works.length
    || accepted.workOrders.some((w, i) => w.stage !== i + 1 || w.workId !== works[i].id)) return refuse("HOSTED_CONFIRMATION_RESULT_BINDING");
  // One permit request per confirmed Work (persisting each owner Work origin first); each is approved just in time under this confirmation.
  const requestIds = new Map<string, string>();
  for (const [i, work] of works.entries()) {
    const wo = accepted.workOrders[i];
    const prepared = await prepareMissionControlExecution(c.store, { operation: "enterprise.prepare_execution", proposalId, workOrderId: wo.workOrderId,
      expectedWorkOrderRevisionId: wo.expectedWorkOrderRevisionId, expectedPlanDigest: accepted.planDigest, idempotencyKey: `hosted:${c.planSha256.slice(0, 16)}:stage-${i + 1}`,
      workId: work.id, expectedWorkVersion: work.version, expectedWorkGeneration: work.generation }, randomUUID(), env, send, runtime);
    requestIds.set(work.id, prepared.requestId);
  }
  const approved = new Set<string>();
  return { workIds: { stage1: works[0].id, stage2: works[1].id, stage3: works[2].id }, runtime, missionId: accepted.missionId, confirmationDigest: digest,
    works: works.map(w => ({ id: w.id, version: w.version, generation: w.generation })),
    admission: async (store, work, config) => {
      const requestId = requestIds.get(work.id) ?? refuse("HOSTED_CONFIRMATION_WORK_NOT_CONFIRMED");
      if (!approved.has(work.id)) {
        await action(mc.endpoint, "sofieConfirmations:approveConfirmedPermit", confirmationSubmission("sofie.approveConfirmedPermit",
          { installationId: enrollment.installationId, confirmation, requestId, workId: work.id }, mc.projectId, submitter), send, "HOSTED_CONFIRMATION_PERMIT");
        approved.add(work.id);
      }
      return requestOwnerFactoryAdmission(store, work, config, env, send);
    } };
}
