import { closeSync, constants, lstatSync, mkdirSync, openSync, writeSync } from "node:fs";
import { createHash, createPrivateKey, randomUUID } from "node:crypto";
import { join } from "node:path";
import { canonical } from "../../../../packages/myapps/src/contracts.ts";
import { digest } from "../engineering/contract.ts";
import { journeyBinding, PRIVATE_BETA_PROFILE, type JourneyProjectInput } from "./journey-profile.ts";
import type { JourneyPlan } from "./plan.ts";
import type { QualificationPolicy } from "../external-alpha/qualification-accounting.ts";
import { signActivationApproval, type ActivationApproval } from "./static-activation.ts";
import type { Verdict } from "./verdict.ts";
import type { InstallationIdentity } from "./rollback.ts";
import type { OwnerPublishApproval } from "./static-publish-port.ts";

/**
 * Private-beta OWNER-LOCAL profile only. Jay's authenticated `confirm <plan>` authorizes exactly two further actions for that journey:
 *  1. issuing the accounting cohort for the exact approved plan, Work and execution limits (the owner acting as accounting operator);
 *  2. publishing the verified application to the 127.0.0.1 preview, only after the signed verifier verdict is PASS for the exact release digest.
 * Both are bound to the signed confirmation binding (owner, plan, Works, repository, source, limits) and appended to a durable audit file.
 * Spending/execution controls are untouched: the hash-pinned ledger still gates every reservation, and the release controller still
 * consumes the single-use owner-signed approval. Nothing here can publish a failed, unverified or mismatched artifact.
 */
export class OwnerLocalAuthorizationRefused extends Error { constructor(readonly code: string) { super(code); } }
const refuse = (code: string): never => { throw new OwnerLocalAuthorizationRefused(code); };
const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
type Db = { query(sql: string, params?: unknown[]): Promise<Array<Record<string, unknown>> | { rows: Array<Record<string, unknown>> }> };
const rows = async (db: Db, sql: string, params?: unknown[]) => { const r = await db.query(sql, params); return Array.isArray(r) ? r : r.rows; };

/** Read-only prerequisite on the existing canonical Work event store; no schema or privilege changes. */
export async function assertOwnerLocalCompletionStorage(db: Db) {
  const [table] = await rows(db, "SELECT to_regclass('engineering_work_events') AS events");
  if (!table?.events) return refuse('OWNER_LOCAL_COMPLETION_EVENTS_UNAVAILABLE');
  const [ready] = await rows(db, `SELECT (has_table_privilege(current_user,'engineering_work_events','SELECT')
    AND has_table_privilege(current_user,'engineering_work_events','INSERT')) AS allowed`);
  if (ready?.allowed !== true) return refuse('OWNER_LOCAL_COMPLETION_EVENTS_UNQUALIFIED');
}

/** Append-only durable audit (0600, O_APPEND). Every record carries the confirmation digest it was authorized by. */
export function auditAppender(path: string) {
  return (entry: Record<string, unknown>) => {
    const fd = openSync(path, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT, 0o600);
    try { writeSync(fd, JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n"); } finally { closeSync(fd); }
  };
}

export type ConfirmationContext = { profile: string; confirmationDigest: string; ownerId: string; planSha256: string; repository: string;
  workIds: string[]; audit(entry: Record<string, unknown>): void };

/** The charter the confirmed plan implies: ceilings and Work count come from the plan; the per-Work ceiling is the frozen limit. */
export function cohortCharter(plan: JourneyPlan) {
  return { journeyCeilingMicrousd: plan.stages.reduce((n, s) => n + s.workCeilingMicrousd, 0), maxWorks: plan.stages.length, perWorkCeilingMicrousd: 1_300_000, concurrency: 1 };
}

/** 1. Issues exactly the derived cohort for the confirmed plan (idempotent; an existing cohort must match it exactly). */
export async function issueConfirmedCohort(c: { db: Db; ctx: ConfirmationContext; policy: QualificationPolicy; project: JourneyProjectInput; plan: JourneyPlan; memberCredential: string }) {
  if (c.ctx.profile !== PRIVATE_BETA_PROFILE) return refuse("OWNER_LOCAL_COHORT_PROFILE");
  if (c.policy.ownerId !== c.ctx.ownerId || digest(c.plan) !== c.ctx.planSha256 || !/^[a-f0-9]{64}$/.test(c.memberCredential)) return refuse("OWNER_LOCAL_COHORT_BINDING");
  const charter = cohortCharter(c.plan), binding = journeyBinding(c.project), id = c.policy.cohortId;
  const label = sha256(`owner-local private beta charter ${id} confirmation ${c.ctx.confirmationDigest}`);
  const existing = await rows(c.db, "SELECT journey_ceiling_microusd, max_works, per_work_ceiling_microusd, concurrency FROM qdev_charter WHERE id=$1", [id]);
  if (existing.length) {
    const e = existing[0];
    if (Number(e.journey_ceiling_microusd) !== charter.journeyCeilingMicrousd || Number(e.max_works) !== charter.maxWorks
      || Number(e.per_work_ceiling_microusd) !== charter.perWorkCeilingMicrousd || Number(e.concurrency) !== charter.concurrency) return refuse("OWNER_LOCAL_COHORT_CONFLICT");
    c.ctx.audit({ kind: "COHORT_ALREADY_ISSUED", cohortId: id, confirmationDigest: c.ctx.confirmationDigest });
    return { cohortId: id, issued: false };
  }
  await c.db.query("BEGIN");
  try {
    await c.db.query(`INSERT INTO qdev_charter(id,proposal_id,charter_sha256,funding_sha256,hold_disposition_sha256,price_revision_sha256,journey_ceiling_microusd,max_works,per_work_ceiling_microusd,concurrency,valid_until)
      VALUES($1,'qdev-20261029-01',$2,$2,$2,$2,$3,$4,$5,$6,clock_timestamp()+interval '1 day')`, [id, label, charter.journeyCeilingMicrousd, charter.maxWorks, charter.perWorkCeilingMicrousd, charter.concurrency]);
    await c.db.query("INSERT INTO qdev_member(cohort_id,slot,owner_id,policy_sha256,credential_sha256,paid_works) VALUES($1,$2,$3,$4,$5,$6)",
      [id, c.policy.slot, c.policy.ownerId, digest(c.policy), sha256(c.memberCredential), charter.maxWorks]);
    await c.db.query("INSERT INTO qdev_project(id,cohort_id,owner_id,project_sha256,source_sha256) VALUES($1,$2,$3,$4,$5)", [randomUUID(), id, c.policy.ownerId, binding.projectSha256, binding.sourceSha256]);
    await c.db.query("UPDATE qdev_charter SET activated_at=clock_timestamp() WHERE id=$1", [id]);
    await c.db.query("COMMIT");
  } catch (error) { await c.db.query("ROLLBACK").catch(() => undefined); throw error; }
  c.ctx.audit({ kind: "COHORT_ISSUED", authorizedBy: "OWNER_CONFIRM", cohortId: id, confirmationDigest: c.ctx.confirmationDigest, ownerId: c.ctx.ownerId,
    planSha256: c.ctx.planSha256, repository: c.ctx.repository, workIds: c.ctx.workIds, projectSha256: binding.projectSha256, sourceSha256: binding.sourceSha256, charter });
  return { cohortId: id, issued: true };
}

/**
 * 2. Post-PASS publish approval. Called by the publishing port only after it verified the signed verdict; it re-checks independently and
 * refuses unless the verdict is PASS for exactly this candidate and release digest, then writes ONE owner-signed, short-lived, single-use
 * approval for exactly that digest. Failed observation may compensate only to the captured prior, conditional on the exact publication CAS.
 * There is no general rollback grant, and a later release can never be undone by this confirmation.
 */
export function ownerLocalPublishApprover(c: { ctx: ConfirmationContext; approverPem: string; keyId: string; dir: string; appId: string; projectSha256: string;
  installation: InstallationIdentity; windowMs?: number; now?: () => number }) {
  if (c.ctx.profile !== PRIVATE_BETA_PROFILE) return refuse("OWNER_LOCAL_PUBLISH_PROFILE");
  if (createPrivateKey(c.approverPem).asymmetricKeyType !== "ed25519") return refuse("OWNER_LOCAL_PUBLISH_KEY");
  const compensationPlans = new Map<string, string>();
  const recordApproval = (approval: ActivationApproval) => {
    const file = signActivationApproval(approval, c.approverPem), approvals = join(c.dir, "approvals");
    mkdirSync(c.dir, { recursive: true, mode: 0o700 }); mkdirSync(approvals, { recursive: true, mode: 0o700 });
    if ((lstatSync(c.dir).mode & 0o077) !== 0 || (lstatSync(approvals).mode & 0o077) !== 0) return refuse("OWNER_LOCAL_PUBLISH_DIRECTORY");
    const name = `owner-confirm-${sha256(canonical(approval)).slice(0, 32)}.json`;
    const fd = openSync(join(approvals, name), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
    try { writeSync(fd, file); } finally { closeSync(fd); }
    return name;
  };
  const publish: OwnerPublishApproval = async input => {
    const v = input.verdict, hex = input.digest;
    if (!v || v.outcome !== "PASS" || !/^[a-f0-9]{64}$/.test(hex) || v.buildArtifactSha256 !== hex || v.candidateCommit !== input.candidate.commit
      || v.candidateTree !== input.candidate.tree || v.projectSha256 !== c.projectSha256) {
      c.ctx.audit({ kind: "PUBLISH_REFUSED", confirmationDigest: c.ctx.confirmationDigest, outcome: v?.outcome ?? null, digest: hex, verdictDigest: v?.buildArtifactSha256 ?? null });
      return refuse("OWNER_LOCAL_PUBLISH_UNVERIFIED");
    }
    const now = c.now?.() ?? Date.now();
    const approval: ActivationApproval = { schema: "myeve.qdev-activation-approval/v1", operation: "PUBLISH", appId: c.appId, ownerId: c.ctx.ownerId,
      projectSha256: c.projectSha256, environment: c.installation.environment, installationId: c.installation.installationId, digest: `sha256:${hex}`, keyId: c.keyId,
      notBefore: new Date(now - 1000).toISOString(), notAfter: new Date(now + (c.windowMs ?? 10 * 60_000)).toISOString(), nonce: randomUUID() + randomUUID() };
    const name = recordApproval(approval);
    if (input.compensationPlan) compensationPlans.set(`sha256:${hex}`, canonical(input.compensationPlan));
    c.ctx.audit({ kind: "PUBLISH_APPROVED", authorizedBy: "OWNER_CONFIRM_AFTER_PASS", confirmationDigest: c.ctx.confirmationDigest, ownerId: c.ctx.ownerId,
      planSha256: c.ctx.planSha256, repository: c.ctx.repository, workIds: c.ctx.workIds, digest: hex, candidate: input.candidate,
      verdict: { outcome: v.outcome, assurance: v.assurance, verifierKeyId: v.verifierKeyId, issuedAt: v.issuedAt }, approvalFile: name, keyId: c.keyId, notAfter: approval.notAfter });
    return { approvalFile: name };
  };
  publish.compensate = async ({ plan, expectedPublication }) => {
    if (!Number.isSafeInteger(expectedPublication.seq) || expectedPublication.seq < 1 || !Number.isSafeInteger(expectedPublication.version) || expectedPublication.version < 1 ||
      compensationPlans.get(expectedPublication.digest) !== canonical(plan) || plan.installation.environment !== c.installation.environment ||
      plan.installation.installationId !== c.installation.installationId) return refuse("OWNER_LOCAL_COMPENSATION_SCOPE");
    const revision = plan.kind === "RESTORE_REVISION" ? /^(.+)@([1-9][0-9]*)$/.exec(plan.revisionId) : null;
    if (plan.kind === "RESTORE_REVISION" && (!revision || revision[1] !== c.appId)) return refuse("OWNER_LOCAL_COMPENSATION_SCOPE");
    const now = c.now?.() ?? Date.now();
    const approval: ActivationApproval = { schema: "myeve.qdev-activation-approval/v1", operation: "ROLLBACK", appId: c.appId, ownerId: c.ctx.ownerId,
      projectSha256: c.projectSha256, environment: c.installation.environment, installationId: c.installation.installationId,
      digest: `sha256:${plan.kind === "RESTORE_REVISION" ? plan.revisionSha256 : plan.absenceAuthenticationSha256}`,
      ...(revision ? { version: Number(revision[2]) } : {}), expectedPublication: { ...expectedPublication }, keyId: c.keyId,
      notBefore: new Date(now - 1000).toISOString(), notAfter: new Date(now + (c.windowMs ?? 10 * 60_000)).toISOString(), nonce: randomUUID() + randomUUID() };
    const name = recordApproval(approval);
    compensationPlans.delete(expectedPublication.digest);
    c.ctx.audit({ kind: "PUBLISH_COMPENSATION_APPROVED", authorizedBy: "OWNER_CONFIRM_EXACT_FAILED_DELIVERY", confirmationDigest: c.ctx.confirmationDigest,
      ownerId: c.ctx.ownerId, planSha256: c.ctx.planSha256, expectedPublication, compensationPlan: plan, approvalFile: name });
    return { approvalFile: name };
  };
  return publish;
}

/**
 * 3. After the journey ACCEPTED its verified delivery (signed PASS verdict + observed served bytes), the confirmed stage Works land as completed
 * (lifecycle `accepted`, control paused, generation advanced so no writer of the old generation can act). Only the exact confirmed revisions,
 * only while still active, all three or none; recorded as a Work event and in the durable audit. It changes no spend, permit or publication state.
 */
export async function completeDeliveredStageWorks(c: { db: { atomic<T>(fn: (db: Db) => Promise<T>): Promise<T> }; ctx: ConfirmationContext;
  works: Array<{ id: string; version: number; generation: number }>; delivery: { verdictSha256: string; deliverySha256: string; assurance: string };
  /** Records each Work's Factory writer as terminal from the exact authenticated quiescence readback (MyEve's writer reconcile); refuses otherwise. */
  reconcile(workId: string): Promise<void> }) {
  const hex = /^[a-f0-9]{64}$/, d = c.delivery;
  if (c.ctx.profile !== PRIVATE_BETA_PROFILE) return refuse("OWNER_LOCAL_COMPLETION_PROFILE");
  if (!hex.test(d.verdictSha256) || !hex.test(d.deliverySha256) || d.assurance !== "PRIVATE_BETA_LOCAL") return refuse("OWNER_LOCAL_COMPLETION_EVIDENCE");
  if (c.works.length !== 3 || c.works.some((w, i) => w.id !== c.ctx.workIds[i] || !Number.isSafeInteger(w.version) || !Number.isSafeInteger(w.generation)))
    return refuse("OWNER_LOCAL_COMPLETION_WORKS");
  const uuid = (seed: string) => { const h = sha256(seed); return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`; };
  const receipt = { kind: "WORKS_COMPLETED", authorizedBy: "OWNER_CONFIRM_DELIVERY_ACCEPTED", confirmationDigest: c.ctx.confirmationDigest, ownerId: c.ctx.ownerId,
    planSha256: c.ctx.planSha256, works: c.works, verdictSha256: d.verdictSha256, deliverySha256: d.deliverySha256, assurance: d.assurance };
  const receiptSha256 = sha256(canonical(receipt));
  const eventKind = `owner_local_delivery_accepted:${receiptSha256}`;
  const eventId = (workId: string) => uuid(`OWNER_LOCAL_DELIVERY_ACCEPTED_V2:${receiptSha256}:${workId}`);
  // The Work guard refuses a lifecycle change while a Factory writer is not proven terminal: reconcile first (exact remote quiescence only).
  for (const w of c.works) await c.reconcile(w.id);
  await c.db.atomic(async db => {
    const retained = await rows(db, "SELECT id,work_id,version,kind,actor_id FROM engineering_work_events WHERE scope_id=$1 AND scope_kind='personal' AND id=ANY($2::uuid[])", [c.ctx.ownerId, c.works.map(w => eventId(w.id))]);
    if (retained.length) {
      if (retained.length !== 3 || c.works.some(w => !retained.some(r => r.id === eventId(w.id) && r.work_id === w.id && Number(r.version) === w.version + 1 && r.kind === eventKind && r.actor_id === c.ctx.ownerId))) return refuse("OWNER_LOCAL_COMPLETION_CONFLICT");
      return;
    }
    for (const w of c.works) {
      const done = await rows(db, `UPDATE engineering_work SET lifecycle='accepted',control='paused',version=version+1,generation=generation+1,updated_at=clock_timestamp()
        WHERE scope_id=$1 AND scope_kind='personal' AND id=$2 AND version=$3 AND generation=$4 AND lifecycle='active' AND control<>'stopping'
          AND business_assert_effect(scope_id,id,version,generation,$1,$5::jsonb)
          AND NOT EXISTS(SELECT 1 FROM engineering_execution e WHERE e.scope_id=$1 AND e.scope_kind='personal' AND e.work_id=$2
            AND EXISTS(SELECT 1 FROM jsonb_array_elements(e.state->'effects') effect WHERE effect->>'status' IN ('PREPARED','UNKNOWN')))
        RETURNING version`,
        [c.ctx.ownerId, w.id, w.version, w.generation, JSON.stringify({ operation: "accept", expectedVersion: w.version })]);
      if (done.length !== 1) return refuse("OWNER_LOCAL_COMPLETION_STALE");
      await rows(db, `INSERT INTO engineering_work_events(id,scope_id,scope_kind,work_id,version,actor_id,kind) VALUES($1,$2,'personal',$3,$4,$2,$5)`,
        [eventId(w.id), c.ctx.ownerId, w.id, Number(done[0].version), eventKind]);
    }
    // Every existing Work event carries the full receipt digest; transitions and cryptographic provenance commit together.

  });
  try { c.ctx.audit(receipt); return { completed: true, auditPending: false }; }
  catch { return { completed: true, auditPending: true }; } // Canonical Work events are authoritative; retry repairs only this secondary audit.
}
