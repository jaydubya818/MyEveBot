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
 * approval for exactly that digest. The release controller still verifies and consumes it; nothing else is approved (never ROLLBACK).
 */
export function ownerLocalPublishApprover(c: { ctx: ConfirmationContext; approverPem: string; keyId: string; dir: string; appId: string; projectSha256: string;
  installation: InstallationIdentity; windowMs?: number; now?: () => number }) {
  if (c.ctx.profile !== PRIVATE_BETA_PROFILE) return refuse("OWNER_LOCAL_PUBLISH_PROFILE");
  if (createPrivateKey(c.approverPem).asymmetricKeyType !== "ed25519") return refuse("OWNER_LOCAL_PUBLISH_KEY");
  return async (input: { verdict: Verdict; candidate: { commit: string; tree: string }; digest: string }) => {
    const v = input.verdict, hex = input.digest;
    if (!v || v.outcome !== "PASS" || !/^[a-f0-9]{64}$/.test(hex) || v.buildArtifactSha256 !== hex || v.candidateCommit !== input.candidate.commit
      || v.candidateTree !== input.candidate.tree || v.projectSha256 !== c.projectSha256) {
      c.ctx.audit({ kind: "PUBLISH_REFUSED", confirmationDigest: c.ctx.confirmationDigest, outcome: v?.outcome ?? null, digest: hex, verdictDigest: v?.buildArtifactSha256 ?? null });
      return refuse("OWNER_LOCAL_PUBLISH_UNVERIFIED");
    }
    const now = c.now?.() ?? Date.now();
    const approval: ActivationApproval = { schema: "myeve.qdev-activation-approval/v1", operation: "PUBLISH", appId: c.appId, ownerId: c.ctx.ownerId,
      projectSha256: c.projectSha256, environment: c.installation.environment, installationId: c.installation.installationId,
      // The release controller names a release as "sha256:<hex>" in every ActivationRequest; the approval must name it identically.
      digest: "sha256:" + hex, keyId: c.keyId,
      notBefore: new Date(now - 1000).toISOString(), notAfter: new Date(now + (c.windowMs ?? 10 * 60_000)).toISOString(), nonce: randomUUID() + randomUUID() };
    const file = signActivationApproval(approval, c.approverPem), approvals = join(c.dir, "approvals");
    mkdirSync(c.dir, { recursive: true, mode: 0o700 }); mkdirSync(approvals, { recursive: true, mode: 0o700 });
    if ((lstatSync(c.dir).mode & 0o077) !== 0 || (lstatSync(approvals).mode & 0o077) !== 0) return refuse("OWNER_LOCAL_PUBLISH_DIRECTORY");
    const name = `owner-confirm-${sha256(canonical(approval)).slice(0, 32)}.json`;
    const fd = openSync(join(approvals, name), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
    try { writeSync(fd, file); } finally { closeSync(fd); }
    c.ctx.audit({ kind: "PUBLISH_APPROVED", authorizedBy: "OWNER_CONFIRM_AFTER_PASS", confirmationDigest: c.ctx.confirmationDigest, ownerId: c.ctx.ownerId,
      planSha256: c.ctx.planSha256, repository: c.ctx.repository, workIds: c.ctx.workIds, digest: hex, candidate: input.candidate,
      verdict: { outcome: v.outcome, assurance: v.assurance, verifierKeyId: v.verifierKeyId, issuedAt: v.issuedAt }, approvalFile: name, keyId: c.keyId, notAfter: approval.notAfter });
    return { approvalFile: name };
  };
}
