import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { digest } from "../engineering/contract.ts";
import type { Work } from "../engineering/types.ts";
import type { ExecutionDatabase } from "../execution-types.ts";
import { ExternalAlphaAllowance } from "./allowance.ts";
import { buildWorkAuthority, canonicalJson, ExternalAlphaWorkAuthority } from "./work-authority.ts";
import { canonicalAlphaTasksWork, sha256Hex } from "./work-tuple.ts";
import { connection, Env, files, mutate } from "./work-test-fixture.ts";

describe.skipIf(!connection)("external alpha exact Work authority (real PostgreSQL)", () => {
  const envs: Env[] = [];
  const fresh = async (activate = true) => {
    const e = await Env.create(activate);
    envs.push(e);
    return e;
  };
  afterEach(async () => {
    await Promise.all(envs.splice(0).map((e) => e.close()));
  }, 60000);

  it("denies admission when the policy is not activated and when the policy row is absent", async () => {
    const e = await fresh(false);
    const work = await e.seedWork();
    await expect(e.svc.issue(work, files)).rejects.toThrow(/policy inactive/);
    expect(await e.count("external_alpha_work_authority")).toBe(0);
    expect(await e.count("external_alpha_allowance")).toBe(0);
    await e.pool.query("UPDATE external_alpha_policy SET revoked_at=NULL"); // unchanged
    // A deployment without MYEVE_EXTERNAL_ALPHA_POLICY fails closed in policy parsing (see policy tests); the database has no singleton either.
    await e.pool.query("ALTER TABLE external_alpha_policy DISABLE TRIGGER external_alpha_policy_guard");
    await e.pool.query("DELETE FROM external_alpha_work_authority; DELETE FROM external_alpha_operation; DELETE FROM external_alpha_allowance; DELETE FROM external_alpha_policy");
    await expect(e.svc.issue(work, files)).rejects.toThrow();
  });

  it("issues one exact signed single-use authority bound to every field and charges the whole Work allowance", async () => {
    const e = await fresh();
    const work = await e.seedWork();
    const a = await e.svc.issue(work, files);
    const d = a.envelope.document;
    expect(a.state).toBe("ISSUED");
    expect(d.ownerId).toBe(e.owner);
    expect(d.work).toMatchObject({ id: work.id, version: 1, generation: 1, criteriaCount: 10 });
    expect(d.source.allowedFiles).toEqual(files);
    expect(d.limits.work).toEqual({ operations: 5, microusd: 1300000 });
    expect(d.singleUse).toBe(true);
    const [al] = (await e.pool.query("SELECT * FROM external_alpha_allowance WHERE id=$1", [a.allowanceId])).rows;
    expect(al).toMatchObject({ kind: "WORK", ceiling_microusd: "1300000", max_operations: 5, state: "OPEN" });
    expect(Date.parse(d.expiresAt)).toBeLessThanOrEqual(new Date(al.deadline).getTime());
  });

  it("is idempotent: parallel and later duplicate admissions resolve to one authority, allowance and writer identity", async () => {
    const e = await fresh();
    const work = await e.seedWork();
    const results = await Promise.allSettled(
      Array.from({ length: 16 }, () => e.svc.issue(work, files)),
    );
    const ok = results.filter((r) => r.status === "fulfilled").map((r: any) => r.value);
    expect(ok.length).toBeGreaterThan(0);
    expect(new Set(ok.map((r: any) => r.id)).size).toBe(1);
    expect(new Set(ok.map((r: any) => r.requestId)).size).toBe(1);
    // Non-winning callers may only have been denied by a concurrent admission, never produce a second record.
    expect(await e.count("external_alpha_work_authority")).toBe(1);
    expect(await e.count("external_alpha_allowance", "kind='WORK'")).toBe(1);
    const later = await e.svc.issue(work, files, { now: new Date(Date.now() + 1500) });
    expect(later.id).toBe(ok[0].id);
    expect(later.envelope.signature).toBe(ok[0].envelope.signature);
    expect(later.envelope.document.issuedAt).toBe(ok[0].envelope.document.issuedAt);
    expect(await e.count("external_alpha_work_authority")).toBe(1);
  });

  it("denies the TypeScript builder for any non-canonical Work, owner, repository, limit or control", async () => {
    const e = await fresh();
    const base = await e.seedWork();
    const bad: Array<[string, Partial<Work>]> = [
      ["owner", { scopeId: randomUUID() }],
      ["repository", { repository: "someone/else" }],
      ["paused", { control: "paused" }],
      ["cancelled", { lifecycle: "cancelled" }],
      ["cost", { maxCostUsd: 5 }],
      ["duration", { maxDurationSeconds: 600 }],
      ["title", { title: "Something else" }],
      ["objective", { objective: "Do anything" }],
      ["criteria", { criteria: base.criteria.slice(1) }],
      ["criterion wording", { criteria: base.criteria.map((c, i) => (i === 4 ? { ...c, statement: "Invalid priority accepted" } : c)) }],
      ["human method", { criteria: base.criteria.map((c, i) => (i === 9 ? { ...c, method: "human" as const } : c)) }],
    ];
    for (const [name, patch] of bad)
      expect(() => buildWorkAuthority({ policy: e.policy, work: { ...base, ...patch }, allowedFiles: files }), name).toThrow();
    expect(() => buildWorkAuthority({ policy: e.policy, work: base, allowedFiles: [] })).toThrow();
    expect(() => buildWorkAuthority({ policy: e.policy, work: base, allowedFiles: ["../escape.ts"] })).toThrow();
    expect(() => buildWorkAuthority({ policy: e.policy, work: base, allowedFiles: ["a.ts", "a.ts"] })).toThrow();
  });

  it("denies in the database every tampered bound field (independent of the TypeScript builder)", async () => {
    const e = await fresh();
    const work = await e.seedWork();
    const good = buildWorkAuthority({ policy: e.policy, work, allowedFiles: files });
    const tampers: Array<[string, (d: any) => void]> = [
      ["ownerId", (d) => (d.ownerId = randomUUID())],
      ["policySha256", (d) => (d.policySha256 = "9".repeat(64))],
      ["cohortId", (d) => (d.cohortId = randomUUID())],
      ["slot", (d) => (d.slot = "2")],
      ["application.clientId", (d) => (d.application.clientId = "external-alpha-" + "b".repeat(32))],
      ["application.projectId", (d) => (d.application.projectId = "prj_other")],
      ["source.repository", (d) => (d.source.repository = "x/myeve-alpha-workspace-02")],
      ["source.baseSha", (d) => (d.source.baseSha = "9".repeat(40))],
      ["source.treeSha", (d) => (d.source.treeSha = "9".repeat(40))],
      ["source.sourceDigest", (d) => (d.source.sourceDigest = "9".repeat(64))],
      ["source.allowedFiles", (d) => d.source.allowedFiles.push("src/extra.ts")],
      ["source.allowedFilesSha256", (d) => (d.source.allowedFilesSha256 = "9".repeat(64))],
      ["source.allowedFiles unsorted", (d) => d.source.allowedFiles.reverse()],
      ["work.id", (d) => (d.work.id = randomUUID())],
      ["work.version", (d) => (d.work.version = 2)],
      ["work.generation", (d) => (d.work.generation = 2)],
      ["work.title", (d) => (d.work.title = "Other")],
      ["work.objectiveSha256", (d) => (d.work.objectiveSha256 = "9".repeat(64))],
      ["work.criteriaSha256", (d) => (d.work.criteriaSha256 = "9".repeat(64))],
      ["work.criteriaCount", (d) => (d.work.criteriaCount = 9)],
      ["project.name", (d) => (d.project.name = "Beta Tasks")],
      ["project.task", (d) => (d.project.task = "add Severity")],
      ["project.tupleSha256", (d) => (d.project.tupleSha256 = "9".repeat(64))],
      ["environment", (d) => (d.environment = "LOCAL")],
      ["executionProvider", (d) => (d.executionProvider = "OTHER")],
      ["harness.id", (d) => (d.harness.id = "other")],
      ["harness.version", (d) => (d.harness.version = "2")],
      ["factoryVersion", (d) => (d.factoryVersion = "9".repeat(64))],
      ["model.id", (d) => (d.model.id = "openai/gpt-5.5")],
      ["model.provider", (d) => (d.model.provider = "other")],
      ["limits.work.microusd", (d) => (d.limits.work.microusd = 9000000)],
      ["limits.factory.operations", (d) => (d.limits.factory.operations = 9)],
      ["limits.productiveSeconds", (d) => (d.limits.productiveSeconds = 600)],
      ["limits.writers", (d) => (d.limits.writers = 2)],
      ["candidateWriter.writerId", (d) => (d.candidateWriter.writerId = randomUUID())],
      ["candidateWriter.requestId", (d) => (d.candidateWriter.requestId = randomUUID())],
      ["candidateWriter.candidateSlot", (d) => (d.candidateWriter.candidateSlot = 2)],
      ["verifier.trustProducer", (d) => (d.verifier.trustProducer = true)],
      ["verifier.verifiesExactArtifact", (d) => (d.verifier.verifiesExactArtifact = false)],
      ["verifier.criteriaSha256", (d) => (d.verifier.criteriaSha256 = "9".repeat(64))],
      ["allowedEffects", (d) => d.allowedEffects.push("deploy")],
      ["forbiddenEffects", (d) => d.forbiddenEffects.pop()],
      ["singleUse", (d) => (d.singleUse = false)],
      ["schema", (d) => (d.schema = "OTHER")],
      ["authorityId", (d) => (d.authorityId = randomUUID())],
      ["idempotencyKey", (d) => (d.idempotencyKey = "9".repeat(64))],
      ["notBefore", (d) => (d.notBefore = "2000-01-01T00:00:00.000Z")],
      ["expiresAt window", (d) => (d.expiresAt = new Date(Date.parse(d.issuedAt) + 3600_000).toISOString())],
      ["issuedAt backdated", (d) => ((d.issuedAt = d.notBefore = "2000-01-01T00:00:00.000Z"), (d.expiresAt = "2000-01-01T00:04:00.000Z"))],
    ];
    for (const [name, f] of tampers)
      await expect(e.rawAdmit(mutate(good, f)), name).rejects.toThrow(/EXTERNAL_ALPHA|NOT_ELIGIBLE|ADMISSION/);
    // A stored digest that is not the digest of the stored document is denied.
    await expect(e.rawAdmit(good, { documentSha256: "9".repeat(64) })).rejects.toThrow(/document digest/);
    await expect(e.rawAdmit(good, { ownerId: randomUUID() })).rejects.toThrow(/policy inactive or wrong owner/);
    expect(await e.count("external_alpha_work_authority")).toBe(0);
    expect(await e.count("external_alpha_allowance")).toBe(0);
    // The untampered document is accepted by the same path.
    expect((await e.rawAdmit(good)).state).toBe("ISSUED");
  });

  it("denies in the database when the Work row itself is not the canonical eligible Work", async () => {
    const e = await fresh();
    const cases: Array<[string, Record<string, unknown>, RegExp?]> = [
      ["paused control", { control: "paused" }],
      ["cancelled", { lifecycle: "cancelled" }],
      ["wrong repository", { repository: "o/other" }],
      ["wrong cost", { max_cost_usd: 2 }],
      ["wrong duration", { max_duration_seconds: 120 }],
      ["wrong title", { title: "Nope" }],
      ["wrong objective", { objective: "Nope" }],
      ["fewer criteria", { criteria: canonicalAlphaTasksWork("x/y", "z").criteria.slice(0, 9) }],
      ["human criterion", { criteria: canonicalAlphaTasksWork("x/y", "z").criteria.map((c, i) => (i === 3 ? { ...c, method: "human" } : c)) }],
    ];
    for (const [name, over] of cases) {
      const work = await e.seedWork();
      // Build from the canonical Work, then drift the stored row so the database sees a different Work.
      const doc = buildWorkAuthority({ policy: e.policy, work, allowedFiles: files });
      const set = Object.entries(over).filter(([k]) => k !== "criteria");
      for (const [k, v] of set)
        await e.pool.query(`UPDATE engineering_work SET ${k}=$1 WHERE id=$2`, [v, work.id]);
      if (over.criteria)
        await e.pool.query("UPDATE engineering_work_criteria SET items=$1::jsonb WHERE work_id=$2", [JSON.stringify(over.criteria), work.id]);
      await expect(e.rawAdmit(doc), name).rejects.toThrow(/NOT_ELIGIBLE|exact current owner Work|ADMISSION/);
    }
    // Another owner's Work cannot be bound to this owner's policy.
    const foreign = await e.seedWork({}, randomUUID());
    expect(() => buildWorkAuthority({ policy: e.policy, work: foreign, allowedFiles: files })).toThrow();
    const doc = buildWorkAuthority({ policy: e.policy, work: { ...foreign, scopeId: e.owner }, allowedFiles: files });
    await expect(e.rawAdmit(doc)).rejects.toThrow(/NOT_ELIGIBLE/);
    expect(await e.count("external_alpha_work_authority")).toBe(0);
    expect(await e.count("external_alpha_allowance")).toBe(0);
  });

  it("denies a stale Work version/generation after the Work changes and never admits against the old revision", async () => {
    const e = await fresh();
    const work = await e.seedWork();
    const doc = buildWorkAuthority({ policy: e.policy, work, allowedFiles: files });
    await e.pool.query("UPDATE engineering_work SET version=version+1 WHERE id=$1", [work.id]);
    await expect(e.rawAdmit(doc)).rejects.toThrow(/NOT_ELIGIBLE/);
    const fresher = await e.store.get(work.id);
    const a = await e.svc.issue(fresher, files);
    expect(a.workVersion).toBe(2);
    // Revision race: claim fails once the Work moved on.
    await e.pool.query("UPDATE engineering_work SET version=version+1 WHERE id=$1", [work.id]);
    await expect(e.svc.claim(a)).rejects.toThrow(/NOT_DISPATCHABLE/);
  });

  it("lets exactly one concurrent caller claim dispatch; duplicates and refreshes never send again", async () => {
    const e = await fresh();
    const a = await e.svc.issue(await e.seedWork(), files);
    const claims = await Promise.all(Array.from({ length: 24 }, () => e.svc.claim(a)));
    expect(claims.filter((c) => c.claimed)).toHaveLength(1);
    expect(new Set(claims.map((c) => c.authority.state))).toEqual(new Set(["DISPATCHING"]));
    const again = await e.svc.claim(a);
    expect(again.claimed).toBe(false);
  });

  it("consumes once with a bound receipt and refuses reuse in every later state", async () => {
    const e = await fresh();
    const work = await e.seedWork();
    const a = await e.svc.issue(work, files);
    await e.svc.claim(a);
    const good = { authorityId: a.id, authoritySha256: a.documentSha256, requestId: a.requestId, workOrderId: randomUUID(), consumedAt: new Date().toISOString() };
    for (const bad of [{ ...good, authorityId: randomUUID() }, { ...good, requestId: randomUUID() }, { ...good, authoritySha256: "9".repeat(64) }])
      await expect(e.svc.finish(a.id, "CONSUMED", { receipt: bad })).rejects.toThrow(/RECEIPT_INVALID/);
    const consumed = await e.svc.finish(a.id, "CONSUMED", { receipt: good });
    expect(consumed.state).toBe("CONSUMED");
    // Idempotent, never a second receipt.
    expect((await e.svc.finish(a.id, "CONSUMED", { receipt: { ...good, workOrderId: randomUUID() } })).receipt).toEqual(consumed.receipt);
    expect((await e.svc.claim(a)).claimed).toBe(false);
    // Re-issuing the same Work yields the same consumed authority, not a fresh one.
    const again = await e.svc.issue(work, files);
    expect(again.id).toBe(a.id);
    expect(again.state).toBe("CONSUMED");
    expect((await e.svc.claim(again)).claimed).toBe(false);
    // Direct SQL cannot resurrect or re-arm it.
    await expect(e.pool.query("UPDATE external_alpha_work_authority SET state='ISSUED' WHERE id=$1", [a.id])).rejects.toThrow(/transition denied/);
    await expect(e.pool.query("UPDATE external_alpha_work_authority SET document='{}' WHERE id=$1", [a.id])).rejects.toThrow(/immutable/);
    await expect(e.pool.query("DELETE FROM external_alpha_work_authority WHERE id=$1", [a.id])).rejects.toThrow(/cannot be deleted/);
    // A later generation of the same Work is not admitted: one allowance per Work and one Work per UTC day.
    await e.pool.query("UPDATE engineering_work SET version=version+1,generation=generation+1 WHERE id=$1", [work.id]);
    await expect(e.svc.issue(await e.store.get(work.id), files)).rejects.toThrow(/exhausted|One active Work|duplicate key/);
    await e.svc.finish(a.id, "COMPLETED");
    await expect(e.svc.finish(a.id, "CANCELLED")).rejects.toThrow(/transition denied/);
    expect((await e.pool.query("SELECT state FROM external_alpha_allowance WHERE id=$1", [a.allowanceId])).rows[0].state).toBe("COMPLETED");
  });

  it("cancels before dispatch, refuses to send afterwards, and keeps the whole allowance charged", async () => {
    const e = await fresh();
    const work = await e.seedWork();
    const a = await e.svc.issue(work, files);
    expect((await e.svc.finish(a.id, "CANCELLED", { reason: "OWNER_CANCEL" })).state).toBe("CANCELLED");
    await expect(e.svc.claim(a)).rejects.toThrow(/NOT_DISPATCHABLE/);
    // Cancelling does not refund: a second Work the same UTC day is refused.
    const second = await e.seedWork();
    await expect(e.svc.issue(second, files)).rejects.toThrow(/exhausted/);
    expect((await e.pool.query("SELECT sum(ceiling_microusd)::bigint s FROM external_alpha_allowance")).rows[0].s).toBe("1300000");
  });

  it("expires unsent authority and turns an unresolved dispatch into an UNKNOWN fence", async () => {
    const e = await fresh();
    const a = await e.svc.issue(await e.seedWork(), files);
    // Disposable database only: age the immutable window to exercise expiry.
    const age = async (id: string, seconds: number) => {
      await e.pool.query("ALTER TABLE external_alpha_work_authority DISABLE TRIGGER external_alpha_work_authority_guard");
      await e.pool.query("UPDATE external_alpha_work_authority SET issued_at=issued_at-($2||' seconds')::interval,expires_at=expires_at-($2||' seconds')::interval WHERE id=$1", [id, seconds]);
      await e.pool.query("ALTER TABLE external_alpha_work_authority ENABLE TRIGGER external_alpha_work_authority_guard");
    };
    await age(a.id, 295);
    await expect(e.svc.claim(a)).rejects.toThrow(/NOT_DISPATCHABLE/);
    expect(await e.svc.sweep()).toMatchObject({ expired: 1, unknown: 0 });
    expect((await e.pool.query("SELECT state FROM external_alpha_work_authority WHERE id=$1", [a.id])).rows[0].state).toBe("EXPIRED");
    expect(await e.count("external_alpha_allowance", "state='HALTED'")).toBe(1);
  });

  it("fences all further paid dispatch for the owner/cohort once any authority is UNKNOWN", async () => {
    const e = await fresh();
    const a = await e.svc.issue(await e.seedWork(), files);
    await e.svc.claim(a);
    await e.svc.finish(a.id, "UNKNOWN", { reason: "TRANSPORT" });
    const chat = new ExternalAlphaAllowance(e.db, e.policy);
    await expect(chat.admit({ kind: "CHAT", bindingId: "s:1", requestSha256: "c".repeat(64) })).rejects.toThrow(/fences/);
    await expect(e.svc.finish(a.id, "COMPLETED")).rejects.toThrow(/transition denied/);
    const other = await e.seedWork();
    await expect(e.svc.issue(other, files)).rejects.toThrow(/fences|exhausted/);
    await expect(e.svc.claim(a)).rejects.toThrow(/NOT_DISPATCHABLE/);
  });

  it("sweeps a DISPATCHING authority that never resolved into UNKNOWN", async () => {
    const e = await fresh();
    const a = await e.svc.issue(await e.seedWork(), files);
    await e.svc.claim(a);
    await e.pool.query("ALTER TABLE external_alpha_work_authority DISABLE TRIGGER external_alpha_work_authority_guard");
    await e.pool.query("UPDATE external_alpha_work_authority SET issued_at=issued_at-interval '400 seconds',expires_at=expires_at-interval '400 seconds' WHERE id=$1", [a.id]);
    await e.pool.query("ALTER TABLE external_alpha_work_authority ENABLE TRIGGER external_alpha_work_authority_guard");
    expect(await e.svc.sweep()).toMatchObject({ unknown: 1 });
    expect(await e.count("external_alpha_allowance", "state='UNKNOWN'")).toBe(1);
  });

  for (let i = 0; i < 3; i++)
    it(`linearizes revocation against dispatch claim (race ${i + 1}): a claim after committed revocation never succeeds`, async () => {
      const e = await fresh();
      const a = await e.svc.issue(await e.seedWork(), files);
      const [c, r] = await Promise.allSettled([
        e.svc.claim(a),
        e.pool.query("UPDATE external_alpha_policy SET revoked_at=clock_timestamp()"),
      ]);
      expect(r.status).toBe("fulfilled");
      const [row] = (await e.pool.query("SELECT a.state,a.dispatching_at,p.revoked_at FROM external_alpha_work_authority a,external_alpha_policy p")).rows;
      if (c.status === "fulfilled" && c.value.claimed) {
        // The claim linearized strictly before the revocation.
        expect(row.state).toBe("DISPATCHING");
        expect(new Date(row.dispatching_at).getTime()).toBeLessThanOrEqual(new Date(row.revoked_at).getTime());
      } else expect(row.state).toBe("ISSUED");
      // Whatever the interleaving, nothing can be claimed after revocation.
      const fresh2 = await e.svc.claim(a).catch((x) => x);
      if (row.state === "ISSUED") expect(String(fresh2)).toMatch(/NOT_DISPATCHABLE/);
      expect(await e.svc.sweep().then((s) => s.revoked + s.unknown + s.expired >= 0)).toBe(true);
      await expect(new ExternalAlphaWorkAuthority(e.db, e.policy, e.signer).issue(await e.seedWork(), files)).rejects.toThrow();
    });

  it("rolls back the allowance when authority insertion fails after reservation (fault injection)", async () => {
    const e = await fresh();
    const work = await e.seedWork();
    const doc = buildWorkAuthority({ policy: e.policy, work, allowedFiles: files });
    // Pre-existing foreign row owning the deterministic request id forces the INSERT to fail late.
    await e.pool.query("ALTER TABLE external_alpha_work_authority DISABLE TRIGGER external_alpha_work_authority_guard");
    await e.pool.query("ALTER TABLE external_alpha_allowance DISABLE TRIGGER ALL").catch(() => {});
    const bait = randomUUID();
    await e.pool.query(
      "INSERT INTO external_alpha_allowance(id,owner_id,policy_sha256,kind,binding_id,request_sha256,work_id,work_version,work_generation,day_index,ceiling_microusd,max_operations,state,deadline) VALUES($1,$2,$3,'WORK','bait',$4,$5,1,1,0,1300000,5,'COMPLETED',now())",
      [bait, e.owner, digest(e.policy), "a".repeat(64), randomUUID()],
    );
    await e.pool.query(
      "INSERT INTO external_alpha_work_authority(id,idempotency_key,owner_id,policy_sha256,allowance_id,work_id,work_version,work_generation,request_id,writer_id,document,document_sha256,signature,key_id,issued_at,expires_at,state) VALUES($1,$2,$3,$4,$5,$6,1,1,$7,$8,'{}',$9,$10,$11,now()-interval '1 hour',now()-interval '59 minutes','EXPIRED')",
      [randomUUID(), "e".repeat(64), e.owner, digest(e.policy), bait, randomUUID(), doc.candidateWriter.requestId, randomUUID(), "f".repeat(64), "A".repeat(86), "b".repeat(64)],
    );
    const before = await e.count("external_alpha_allowance");
    await expect(e.svc.issue(work, files)).rejects.toThrow(/duplicate key|unique/i);
    expect(await e.count("external_alpha_allowance")).toBe(before);
    expect(await e.count("external_alpha_allowance", "kind='WORK' AND state='OPEN'")).toBe(0);
  });

  it("recovers from a lost response: the retry returns the same record and does not mint another", async () => {
    const e = await fresh();
    const work = await e.seedWork();
    let drop = true;
    const lossy: ExecutionDatabase = {
      query: async (q, p) => {
        const rows = await e.db.query(q, p);
        if (drop && /work_admit/.test(q)) {
          drop = false;
          throw Error("socket hang up");
        }
        return rows;
      },
    };
    const svc = new ExternalAlphaWorkAuthority(lossy, e.policy, e.signer);
    await expect(svc.issue(work, files)).rejects.toThrow(/socket/);
    const a = await svc.issue(work, files);
    expect(await e.count("external_alpha_work_authority")).toBe(1);
    expect(a.state).toBe("ISSUED");
  });

  it("rejects a returned record whose signature does not verify (database tampering is detected)", async () => {
    const e = await fresh();
    const work = await e.seedWork();
    await e.svc.issue(work, files);
    await e.pool.query("ALTER TABLE external_alpha_work_authority DISABLE TRIGGER external_alpha_work_authority_guard");
    await e.pool.query("UPDATE external_alpha_work_authority SET signature=$1", ["B".repeat(86)]);
    await expect(e.svc.issue(work, files)).rejects.toThrow(/AUTHORITY_SIGNATURE/);
  });
});
