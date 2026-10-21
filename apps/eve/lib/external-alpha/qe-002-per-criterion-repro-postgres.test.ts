// QE-002 minimal reproduction (independent verifier, harness-only file; product source unchanged).
// A schema-valid, correctly signed V2 Result whose independent verifier reports per-criterion checks
// (criteria 1-9 PASS, criterion 10 FAIL, outcome FAIL). The owner-facing Proof should say 9 criteria
// passed and 1 failed. Expected to FAIL at 474bd465c277: every criterion is recorded FAIL.
import { afterEach, describe, expect, it } from "vitest";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { proofOfWorkSchema } from "../digital-worker/contracts.ts";
import { ingestExternalAlphaResult, type IngestionContext } from "./result-ingestion.ts";
import { buildSignedResult } from "./result-test-fixture.ts";
import { bindDispatch } from "./dispatch-readback.ts";
import { prepareRequest } from "./work-controller.ts";
import { connection, Env, files } from "./work-test-fixture.ts";

const receiptKey = () => ({
  keyId: "b".repeat(64),
  publicKey: generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" }) as string,
});

describe.skipIf(!connection)("QE-002 per-criterion verifier evidence", () => {
  const envs: Env[] = [];
  afterEach(async () => { await Promise.all(envs.splice(0).map((e) => e.close())); }, 60000);

  it("records each criterion with the verifier's own per-criterion result", async () => {
    const e = await Env.create(); envs.push(e);
    const work = await e.seedWork();
    const issued = await e.svc.issue(work, files);
    await e.svc.claim(issued);
    const config = e.workConfig([receiptKey()]);
    const binding = await bindDispatch(e.db, issued, prepareRequest(issued, work, config));
    const workOrderId = randomUUID();
    const authority = await e.svc.finish(issued.id, "CONSUMED", {
      receipt: { authorityId: issued.id, authoritySha256: issued.documentSha256, requestId: issued.requestId, workOrderId, consumedAt: new Date().toISOString() },
    });
    const checks = Array.from({ length: 10 }, (_, i) => ({ id: `alpha-tasks-criterion-${i + 1}`, result: i === 9 ? "FAIL" : "PASS" }));
    const { signed } = buildSignedResult({ authority, work, workOrderId, keys: e.resultKeys,
      opts: { requestDigest: binding.requestDigest, verification: "FAIL", verifier: { checks } as never } });
    const ctx: IngestionContext = { database: e.db, policy: e.policy, config, authority, work, envelope: signed,
      expectedRequestDigest: binding.requestDigest, expectedRunId: "00000000-0000-4000-8000-0000000000a1" };
    const out = await ingestExternalAlphaResult(ctx);
    expect(out.verdict).toBe("FAIL"); // aggregate verdict is correct
    const { rows: [row] } = await e.pool.query(
      "SELECT proof FROM engineering_native_results WHERE scope_id=$1 AND scope_kind='personal' AND work_id=$2", [e.owner, work.id]);
    const proof = proofOfWorkSchema.parse(row.proof);
    const states = proof.evidence.map((x) => x.state);
    console.log("QE-002 observed per-criterion states:", JSON.stringify(states));
    console.log("QE-002 owner-facing phrase (conversation-readback.ts):",
      `${states.filter((s) => s === "PASS").length} of ${states.length} recorded checks passed.`);
    // Correct behavior: nine criteria established PASS, one FAIL.
    expect(states.filter((s) => s === "PASS")).toHaveLength(9);
    expect(states.filter((s) => s === "FAIL")).toHaveLength(1);
  }, 120000);
});
