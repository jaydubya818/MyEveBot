import { afterEach, describe, expect, it } from "vitest";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { digest } from "../engineering/contract.ts";
import { canonical } from "../engineering/factory-producer-protocol.ts";
import { digitalWorkContractSchema, proofOfWorkSchema } from "../digital-worker/contracts.ts";
import {
  ExternalAlphaResultRejected,
  ingestExternalAlphaResult,
  patchScope,
  settleExternalAlphaResult,
  worstVerdict,
  type IngestionContext,
} from "./result-ingestion.ts";
import { buildSignedResult, fixtureResultKeys, type BuildOptions } from "./result-test-fixture.ts";
import { bindDispatch } from "./dispatch-readback.ts";
import { prepareRequest } from "./work-controller.ts";
import { connection, Env, files } from "./work-test-fixture.ts";
import type { FactoryOperationReport } from "./work-authority.ts";

const ops: FactoryOperationReport[] = [
  { operationId: "op-1", phase: "productive", state: "settled", actualMicrousd: 100000, reservedMicrousd: 200000, model: "openai/gpt-5.4-mini", pricingRevision: "rev-1" },
  { operationId: "op-2", phase: "completion", state: "settled", actualMicrousd: 50000, reservedMicrousd: 300000, model: "openai/gpt-5.4-mini", pricingRevision: "rev-1" },
];
const receiptKey = () => ({
  keyId: "b".repeat(64),
  publicKey: generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" }) as string,
});

async function setup() {
  const e = await Env.create();
  const work = await e.seedWork();
  const issued = await e.svc.issue(work, files);
  await e.svc.claim(issued);
  const config = e.workConfig([receiptKey()]);
  const binding = await bindDispatch(e.db, issued, prepareRequest(issued, work, config));
  const workOrderId = randomUUID();
  const authority = await e.svc.finish(issued.id, "CONSUMED", {
    receipt: { authorityId: issued.id, authoritySha256: issued.documentSha256, requestId: issued.requestId, workOrderId, consumedAt: new Date().toISOString() },
  });
  const result = (opts?: BuildOptions) => buildSignedResult({ authority, work, workOrderId, keys: e.resultKeys, opts: { ...opts, requestDigest: binding.requestDigest } });
  const ctx = (envelope: unknown, over: Partial<IngestionContext> = {}): IngestionContext => ({
    database: e.db, policy: e.policy, config, authority, work, envelope, expectedRequestDigest: binding.requestDigest, expectedRunId: "00000000-0000-4000-8000-0000000000a1", ...over,
  });
  const rows = async (table: string, where?: string) => e.count(table, where);
  /** The same join the owner readback surface uses. */
  const readback = async () =>
    (
      await e.pool.query(
        `SELECT r.id,r.proof,r.content_hash,r.candidate_sha,COALESCE(p.source,'CANONICAL') AS source,p.contract
         FROM engineering_native_results r LEFT JOIN beta_result_provenance p ON p.owner_id=r.scope_id AND p.result_id=r.id
         WHERE r.scope_id=$1 AND r.scope_kind='personal' AND r.work_id=$2 AND p.result_id IS NOT NULL ORDER BY r.created_at DESC,r.id`,
        [e.owner, work.id],
      )
    ).rows;
  return { e, work, authority, workOrderId, config, result, ctx, rows, readback };
}

describe.skipIf(!connection)("external alpha Result/Proof ingestion (real PostgreSQL, synthetic fixtures only)", () => {
  const envs: Env[] = [];
  const make = async () => {
    const s = await setup();
    envs.push(s.e);
    return s;
  };
  afterEach(async () => {
    await Promise.all(envs.splice(0).map((e) => e.close()));
  }, 60000);

  it("retains an independently verified Result for the owner, readable through the owner readback tables, never as COMPLETED", async () => {
    const s = await make();
    const out = await ingestExternalAlphaResult(s.ctx(s.result().signed));
    expect(out).toMatchObject({ verdict: "PASS", replay: false, cleanupConfirmed: true, settlementState: "PENDING" });
    const [row] = await s.readback();
    expect(row.source).toBe("CANONICAL");
    const proof = proofOfWorkSchema.parse(row.proof);
    const contract = digitalWorkContractSchema.parse(row.contract);
    expect(digest(proof)).toBe(row.content_hash);
    expect(proof.outcome).toBe("PARTIAL"); // never COMPLETED: acceptance and publication are not established
    expect(proof.evidence).toHaveLength(10);
    expect(proof.evidence.every((x) => x.state === "PASS" && x.producer === "trusted-verifier")).toBe(true);
    expect(proof.resultRevision).toBe(row.candidate_sha);
    expect(proof.workId).toBe(s.work.id);
    expect(contract.scope).toEqual({ kind: "personal", id: s.e.owner });
    expect(contract.allowedRoutes).toEqual(["MYFACTORY"]);
    expect(proof.artifactRefs).toContain(`external-alpha-authority:${s.authority.documentSha256}`);
    expect(proof.artifactRefs.filter((r) => r.startsWith("changed-source:")).sort()).toEqual(["changed-source:src/app.ts", "changed-source:src/tasks.ts"]);
    expect(proof.limitations.join(" ")).toMatch(/never final completion/);
  });

  it.each([
    ["UNKNOWN", "PARTIAL"],
    ["none", "PARTIAL"],
    ["FAIL", "FAIL"],
  ] as const)("shows verifier %s as %s and never promotes it to PASS", async (verification, verdict) => {
    const s = await make();
    const out = await ingestExternalAlphaResult(s.ctx(s.result({ verification }).signed));
    expect(out.verdict).toBe(verdict);
    const proof = proofOfWorkSchema.parse((await s.readback())[0].proof);
    expect(proof.evidence.some((x) => x.state === "PASS")).toBe(false);
    expect(proof.outcome).toBe(verdict === "FAIL" ? "FAILED" : "PARTIAL");
    expect(proof.evidence.every((x) => x.state === (verdict === "FAIL" ? "FAIL" : "UNKNOWN"))).toBe(true);
    expect(proof.limitations[0]).toContain(`Independent verifier verdict: ${verdict}`);
    expect(proof.artifactRefs).toContain(`external-alpha-verdict:${verdict}`);
    expect(proof.artifactRefs).not.toContain("external-alpha-verdict:PASS");
  });

  it.each(["missing", "legacy", "wrong-id"])("does not accept aggregate PASS with %s criterion evidence", async kind => {
    const s = await make();
    const built = s.result({mutate: m => {
      const checks=m.verification!.checks;
      if(kind==="missing") checks.pop();
      else if(kind==="legacy") m.verification!.checks=[{id:"alpha-tasks-priority-behavior",result:"PASS"}];
      else checks[0].id="unbound-criterion";
    }});
    const out=await ingestExternalAlphaResult(s.ctx(built.signed));
    expect(out.verdict).toBe("PARTIAL");
    const proof=proofOfWorkSchema.parse((await s.readback())[0].proof);
    expect(proof.evidence.some(e=>e.state==="UNKNOWN")).toBe(true);
    expect(proof.evidence.map(e=>e.criterionId)).toEqual(s.work.criteria.map(c=>c.id));
  });

  it("an unsigned readback hint can only lower trust", async () => {
    expect(worstVerdict("PASS", "PARTIAL")).toBe("PARTIAL");
    expect(worstVerdict("PARTIAL", "PASS")).toBe("PARTIAL");
    expect(worstVerdict("PASS", "FAIL")).toBe("FAIL");
    expect(worstVerdict("PASS", "garbage")).toBe("PARTIAL");
    expect(worstVerdict("PASS", undefined)).toBe("PASS");
    const s = await make();
    const out = await ingestExternalAlphaResult(s.ctx(s.result().signed, { verdictHint: "PARTIAL" }));
    expect(out.verdict).toBe("PARTIAL");
    const fresh = await make();
    expect((await ingestExternalAlphaResult(fresh.ctx(fresh.result({ verification: "UNKNOWN" }).signed, { verdictHint: "PASS" }))).verdict).toBe("PARTIAL");
  });

  it("a candidate that touches files outside the authorized set is retained as FAIL", async () => {
    const s = await make();
    const out = await ingestExternalAlphaResult(s.ctx(s.result({ patchFiles: ["src/app.ts", "src/secret.ts"] }).signed));
    expect(out.verdict).toBe("FAIL");
    const proof = proofOfWorkSchema.parse((await s.readback())[0].proof);
    expect(proof.outcome).toBe("FAILED");
    expect(proof.limitations[0]).toMatch(/outside the authorized set/);
    expect(patchScope("diff --git a/a b/b\n", ["a"]).violations.length).toBeGreaterThan(0);
    expect(patchScope("diff --git a/src/app.ts b/src/app.ts\nrename from x\n", ["src/app.ts"]).violations).toContain("rename");
    expect(patchScope("", ["src/app.ts"]).violations).toContain("empty");
  });

  it("is idempotent: a replay returns the original; different bytes conflict; one row each", async () => {
    const s = await make();
    const built = s.result();
    const first = await ingestExternalAlphaResult(s.ctx(built.signed));
    const again = await ingestExternalAlphaResult(s.ctx(structuredClone(built.signed)));
    expect(again).toMatchObject({ replay: true, resultId: first.resultId, verdict: first.verdict });
    expect(await s.rows("engineering_native_results")).toBe(1);
    expect(await s.rows("beta_result_provenance")).toBe(1);
    expect(await s.rows("external_alpha_work_result")).toBe(1);
    const other = s.result({ runId: "00000000-0000-4000-8000-0000000000b2" });
    await expect(ingestExternalAlphaResult(s.ctx(other.signed))).rejects.toThrow(/EXTERNAL_ALPHA_RESULT_CONFLICT/);
    // A later hint cannot change the stored verdict either.
    expect((await ingestExternalAlphaResult(s.ctx(built.signed, { verdictHint: "FAIL" }))).verdict).toBe("PASS");
    expect(await s.rows("engineering_native_results")).toBe(1);
  });

  it("serializes 16 concurrent deliveries into exactly one retained Result", async () => {
    const s = await make();
    const built = s.result();
    const outs = await Promise.all(Array.from({ length: 16 }, () => ingestExternalAlphaResult(s.ctx(structuredClone(built.signed)))));
    expect(new Set(outs.map((o) => o.resultId)).size).toBe(1);
    expect(outs.filter((o) => !o.replay)).toHaveLength(1);
    expect(await s.rows("engineering_native_results")).toBe(1);
    expect(await s.rows("external_alpha_work_result")).toBe(1);
  });

  it("refuses another owner, another Work, a foreign policy and a non-consumed authority", async () => {
    const s = await make();
    const built = s.result().signed;
    const foreignOwner = randomUUID();
    await expect(ingestExternalAlphaResult(s.ctx(built, { work: { ...s.work, scopeId: foreignOwner } }))).rejects.toThrow(/RESULT_OWNER/);
    await expect(ingestExternalAlphaResult(s.ctx(built, { policy: { ...s.e.policy, ownerId: foreignOwner } }))).rejects.toThrow(/RESULT_OWNER/);
    const otherWork = await s.e.seedWork({}, s.e.owner);
    await expect(ingestExternalAlphaResult(s.ctx(built, { work: otherWork }))).rejects.toThrow(/RESULT_OWNER/);
    await expect(ingestExternalAlphaResult(s.ctx(built, { authority: { ...s.authority, state: "ISSUED" } }))).rejects.toThrow(/AUTHORITY_STATE/);
    // The database independently refuses the same operations (defence in depth).
    const direct = (p: Record<string, unknown>) => s.e.pool.query("SELECT external_alpha_result_retain($1::jsonb)", [JSON.stringify({ policySha256: digest(s.e.policy), ...p })]);
    await expect(direct({ ownerId: foreignOwner, authorityId: s.authority.id })).rejects.toThrow(/RESULT_OWNER/);
    await expect(direct({ ownerId: s.e.owner, authorityId: randomUUID(), documentSha256: s.authority.documentSha256, requestId: s.authority.requestId, workId: s.work.id, workVersion: 1, workGeneration: 1 })).rejects.toThrow(/RESULT_AUTHORITY/);
    await expect(direct({ ownerId: s.e.owner, authorityId: s.authority.id, documentSha256: "0".repeat(64), requestId: s.authority.requestId, workId: s.work.id, workVersion: 1, workGeneration: 1 })).rejects.toThrow(/RESULT_AUTHORITY/);
    expect(await s.rows("engineering_native_results")).toBe(0);
    expect(await s.rows("external_alpha_work_result")).toBe(0);
  });

  it("rejects tampered, substituted, mis-keyed and mis-bound evidence without retaining anything", async () => {
    const s = await make();
    const good = s.result().signed;
    const clone = () => structuredClone(good);
    const flip = (b64: string) => {
      const buf = Buffer.from(b64, "base64");
      buf[0] ^= 1;
      return buf.toString("base64");
    };
    const cases: Array<[string, unknown]> = [];
    const artifact = clone();
    artifact.artifacts[2].base64 = flip(artifact.artifacts[2].base64);
    cases.push(["artifact byte", artifact]);
    const signature = clone();
    signature.signature = "A".repeat(86);
    cases.push(["signature", signature]);
    const digestSwap = clone();
    digestSwap.manifestDigest = "0".repeat(64);
    cases.push(["manifest digest", digestSwap]);
    const reencoded = clone();
    const m = JSON.parse(Buffer.from(reencoded.encoded, "base64url").toString());
    m.status = "FAILED";
    reencoded.encoded = Buffer.from(canonical(m)).toString("base64url");
    cases.push(["edited manifest under the old signature", reencoded]);
    cases.push(["extra top-level field", { ...clone(), authorityGranted: true }]);
    cases.push(["not an object", "x"]);
    cases.push(["null", null]);
    for (const [name, envelope] of cases) {
      await expect(ingestExternalAlphaResult(s.ctx(envelope)), name).rejects.toBeInstanceOf(ExternalAlphaResultRejected);
    }
    // Valid signature by an unpinned key.
    const stranger = { ...s.e.resultKeys, privateKey: fixtureResultKeys().privateKey };
    const wrongKey = buildSignedResult({ authority: s.authority, work: s.work, workOrderId: s.workOrderId, keys: stranger }).signed;
    await expect(ingestExternalAlphaResult(s.ctx(wrongKey))).rejects.toThrow(/UNVERIFIED/);
    // Bound to a different Factory work order than the signed receipt names.
    const otherOrder = buildSignedResult({ authority: s.authority, work: s.work, workOrderId: randomUUID(), keys: s.e.resultKeys }).signed;
    await expect(ingestExternalAlphaResult(s.ctx(otherOrder))).rejects.toThrow(/UNVERIFIED/);
    // Revoked or expired producer key.
    const revoked = s.e.workConfig([receiptKey()]);
    revoked.factory.resultVerification.resultKeys[0].revokedAt = new Date(Date.now() - 1000).toISOString();
    await expect(ingestExternalAlphaResult(s.ctx(good, { config: revoked }))).rejects.toThrow(/UNVERIFIED/);
    // Pinned build / verifier policy / commands differ from the reviewed configuration.
    const wrongPolicy = s.e.workConfig([receiptKey()]);
    wrongPolicy.factory.resultVerification.verifierPolicySha256 = "1".repeat(64);
    await expect(ingestExternalAlphaResult(s.ctx(good, { config: wrongPolicy }))).rejects.toThrow(/RESULT_BINDING|UNVERIFIED/);
    const wrongCommands = { ...s.config, checkCommands: ["npm run other"] };
    await expect(ingestExternalAlphaResult(s.ctx(good, { config: wrongCommands }))).rejects.toThrow(/RESULT_BINDING/);
    // Verifier attests a different Work generation / candidate.
    const wrongVerifier = s.result({ verifier: { workGeneration: 7 } }).signed;
    await expect(ingestExternalAlphaResult(s.ctx(wrongVerifier))).rejects.toThrow(/RESULT_VERIFIER/);
    // A FAILED Factory outcome is not a retainable Result.
    expect(await s.rows("engineering_native_results")).toBe(0);
    expect(await s.rows("beta_result_provenance")).toBe(0);
    expect(await s.rows("external_alpha_work_result")).toBe(0);
    // And the untampered Result is still accepted afterwards.
    expect((await ingestExternalAlphaResult(s.ctx(good))).verdict).toBe("PASS");
  });

  it("settles accounting and cleanup exactly once under concurrency, then closes the authority", async () => {
    const s = await make();
    await expect(settleExternalAlphaResult(s.e.db, s.e.policy, s.authority, { quiescent: true, operations: ops })).rejects.toThrow(/RESULT_REQUIRED/);
    const built = s.result().signed;
    await ingestExternalAlphaResult(s.ctx(built));
    const pending = await settleExternalAlphaResult(s.e.db, s.e.policy, s.authority, { quiescent: false, operations: ops });
    expect(pending).toMatchObject({ settled: false, pending: true, authorityState: "CONSUMED" });
    expect(await s.rows("external_alpha_operation", "source LIKE 'FACTORY%'")).toBe(0);
    const outs = await Promise.all(Array.from({ length: 12 }, () => settleExternalAlphaResult(s.e.db, s.e.policy, s.authority, { quiescent: true, operations: ops })));
    expect(outs.filter((o) => o.settled)).toHaveLength(1);
    expect(outs.filter((o) => o.replay)).toHaveLength(11);
    expect(outs.find((o) => o.settled)).toMatchObject({ authorityState: "COMPLETED", exposureUnknown: false });
    expect(await s.rows("external_alpha_operation", "source LIKE 'FACTORY%'")).toBe(2);
    const [{ spent }] = (await s.e.pool.query("SELECT COALESCE(sum(spent_microusd),0)::int AS spent FROM external_alpha_operation WHERE source LIKE 'FACTORY%'")).rows;
    expect(spent).toBe(150000);
    // A later call with different numbers changes nothing.
    const again = await settleExternalAlphaResult(s.e.db, s.e.policy, s.authority, { quiescent: true, operations: [{ ...ops[0], actualMicrousd: 1 }] });
    expect(again).toMatchObject({ settled: false, replay: true, authorityState: "COMPLETED" });
    expect((await s.e.pool.query("SELECT sum(spent_microusd)::int AS spent FROM external_alpha_operation WHERE source LIKE 'FACTORY%'")).rows[0].spent).toBe(150000);
    // Replayed ingestion after settlement still resolves to the original.
    expect((await ingestExternalAlphaResult({ ...s.ctx(built), authority: { ...s.authority, state: "COMPLETED" } })).settlementState).toBe("SETTLED");
  });

  it("unconfirmed verifier cleanup and UNKNOWN Factory exposure settle as a fenced UNKNOWN, never as clean completion", async () => {
    const noCleanup = await make();
    await ingestExternalAlphaResult(noCleanup.ctx(noCleanup.result({ verification: "none" }).signed));
    const a = await settleExternalAlphaResult(noCleanup.e.db, noCleanup.e.policy, noCleanup.authority, { quiescent: true, operations: ops });
    expect(a).toMatchObject({ settled: true, exposureUnknown: true, authorityState: "UNKNOWN" });
    const unknownOp = await make();
    await ingestExternalAlphaResult(unknownOp.ctx(unknownOp.result().signed));
    const b = await settleExternalAlphaResult(unknownOp.e.db, unknownOp.e.policy, unknownOp.authority, {
      quiescent: true,
      operations: [{ ...ops[0], state: "unknown", actualMicrousd: null }],
    });
    expect(b).toMatchObject({ settled: true, exposureUnknown: true, authorityState: "UNKNOWN" });
    expect((await unknownOp.e.pool.query("SELECT state FROM external_alpha_allowance WHERE kind='WORK'")).rows[0].state).toBe("UNKNOWN");
  });

  it("retained history is immutable and a settled Result cannot be resettled or deleted", async () => {
    const s = await make();
    await ingestExternalAlphaResult(s.ctx(s.result({ verification: "UNKNOWN" }).signed));
    await expect(s.e.pool.query("UPDATE external_alpha_work_result SET verdict='PASS'")).rejects.toThrow(/immutable/);
    await expect(s.e.pool.query("DELETE FROM external_alpha_work_result")).rejects.toThrow(/cannot be deleted/);
    await expect(s.e.pool.query("UPDATE engineering_native_results SET proof='{}'::jsonb")).rejects.toThrow();
    await settleExternalAlphaResult(s.e.db, s.e.policy, s.authority, { quiescent: true, operations: [] });
    await expect(s.e.pool.query("UPDATE external_alpha_work_result SET settlement_state='PENDING',settled_at=NULL")).rejects.toThrow(/exactly once/);
  });

  it("does not let a changed Work version retain a Result for stale authority", async () => {
    const s = await make();
    await s.e.pool.query("UPDATE engineering_work SET version=version+1 WHERE id=$1", [s.work.id]);
    await expect(ingestExternalAlphaResult(s.ctx(s.result().signed))).rejects.toThrow(/WORK_CHANGED/);
    expect(await s.rows("engineering_native_results")).toBe(0);
  });
});
