import { describe, expect, it } from "vitest";
import { createHash, generateKeyPairSync } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cohortCharter, completeDeliveredStageWorks, issueConfirmedCohort, ownerLocalPublishApprover, auditAppender, type ConfirmationContext } from "./owner-local-authorizations.ts";
import { FileActivationPermits } from "./static-activation.ts";
import { StaticReleaseController } from "./static-publish.ts";
import { StaticArtifactCandidate } from "../../../../packages/myapps/src/static-artifact.ts";
import { digest } from "../engineering/contract.ts";

const OWNER = "bd78f31f-b369-443a-a1d4-6d7d2ecc0118", P = "myeve.private-beta.owner/v1";
const plan: any = { slot: "Q1", stages: [1, 2, 3, 4].map(stage => ({ stage, workCeilingMicrousd: 1300000, operations: [{ key: `s${stage}`, purpose: "CODING", reserveMicrousd: 650000 }] })) };
const dir = () => { const d = mkdtempSync(join(tmpdir(), "owner-local-auth-")); chmodSync(d, 0o700); return d; };
const ctx = (d: string, over: Partial<ConfirmationContext> = {}): ConfirmationContext => ({ profile: P, confirmationDigest: "c".repeat(64), ownerId: OWNER,
  planSha256: digest(plan), repository: "local/dashboard", workIds: ["w1", "w2", "w3"], audit: auditAppender(join(d, "audit.jsonl")), ...over });
const audit = (d: string) => readFileSync(join(d, "audit.jsonl"), "utf8").trim().split("\n").map(l => JSON.parse(l));

describe("confirm-bound accounting cohort", () => {
  const project: any = { profile: P, repository: "local/dashboard" };
  const policy: any = { cohortId: "d97a39cd-ef8a-5fcc-b581-ab20ac5a7155", ownerId: OWNER, slot: "Q1" };
  it("refuses another profile, a foreign owner or a plan other than the confirmed one", async () => {
    const d = dir(), db = { query: async () => [] };
    await expect(issueConfirmedCohort({ db, ctx: ctx(d, { profile: "myeve.qdev/v1" }), policy, project, plan, memberCredential: "a".repeat(64) })).rejects.toThrow("OWNER_LOCAL_COHORT_PROFILE");
    await expect(issueConfirmedCohort({ db, ctx: ctx(d), policy: { ...policy, ownerId: "other" }, project, plan, memberCredential: "a".repeat(64) })).rejects.toThrow("OWNER_LOCAL_COHORT_BINDING");
    await expect(issueConfirmedCohort({ db, ctx: ctx(d, { planSha256: "f".repeat(64) }), policy, project, plan, memberCredential: "a".repeat(64) })).rejects.toThrow("OWNER_LOCAL_COHORT_BINDING");
  });
  it("an existing cohort with different limits is refused, never widened", async () => {
    const d = dir(), db = { query: async (sql: string) => sql.startsWith("SELECT") ? [{ journey_ceiling_microusd: 9_999_999, max_works: 4, per_work_ceiling_microusd: 1300000, concurrency: 1 }] : [] };
    await expect(issueConfirmedCohort({ db, ctx: ctx(d), policy, project: { ...project, inputCommit: "a".repeat(40) }, plan, memberCredential: "a".repeat(64) })).rejects.toThrow();
    expect(cohortCharter(plan)).toEqual({ journeyCeilingMicrousd: 5_200_000, maxWorks: 4, perWorkCeilingMicrousd: 1_300_000, concurrency: 1 });
  });
});

describe("post-PASS owner publish approval", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString(), pub = publicKey.export({ type: "spki", format: "pem" }).toString();
  const installation = { environment: "myeve-pb-owner-local", installationId: "install-owner-local" }, projectSha256 = "a".repeat(64), hex = "b".repeat(64);
  const candidate = { commit: "1".repeat(40), tree: "2".repeat(40) };
  const verdict = (over: Record<string, unknown> = {}): any => ({ outcome: "PASS", buildArtifactSha256: hex, candidateCommit: candidate.commit, candidateTree: candidate.tree,
    projectSha256, assurance: "PRIVATE_BETA_LOCAL", verifierKeyId: "v", issuedAt: new Date().toISOString(), ...over });
  const setup = () => { const d = dir(); return { d, approve: ownerLocalPublishApprover({ ctx: ctx(d), approverPem: pem, keyId: "owner-approver", dir: join(d, "activation"), appId: "app", projectSha256, installation }),
    permits: new FileActivationPermits({ dir: join(d, "activation"), keys: [{ keyId: "owner-approver", publicKeyPem: pub, activeFrom: "2026-01-01T00:00:00.000Z", notAfter: "2027-01-01T00:00:00.000Z" }],
      ownerId: OWNER, appId: "app", projectSha256, ...installation }) }; };
  const request = (digestHex = hex) => ({ operation: "PUBLISH" as const, appId: "app", ownerId: OWNER, projectSha256, ...installation, digest: `sha256:${digestHex}` });
  it("approves exactly the verified PASS digest once; the controller consumes it once", async () => {
    const { d, approve, permits } = setup();
    await approve({ verdict: verdict(), candidate, digest: hex });
    expect(await permits.permit(request("c".repeat(64)))).toBe(false);
    expect(await permits.permit({ ...request(), operation: "ROLLBACK" } as never)).toBe(false);
    expect(await permits.permit(request())).toBe(true);
    expect(await permits.permit(request())).toBe(false);
    expect(audit(d).map(e => e.kind)).toEqual(["PUBLISH_APPROVED"]);
    expect(audit(d)[0].confirmationDigest).toBe("c".repeat(64));
  });
  it("never approves a failed, unverified or mismatched artifact", async () => {
    for (const bad of [{ outcome: "FAIL" }, { outcome: "NOT_RUN" }, { buildArtifactSha256: "c".repeat(64) }, { candidateCommit: "3".repeat(40) }, { candidateTree: "4".repeat(40) }, { projectSha256: "d".repeat(64) }]) {
      const { d, approve } = setup();
      await expect(approve({ verdict: verdict(bad), candidate, digest: hex })).rejects.toThrow("OWNER_LOCAL_PUBLISH_UNVERIFIED");
      expect(readdirSync(d).includes("activation")).toBe(false);
      expect(audit(d)[0].kind).toBe("PUBLISH_REFUSED");
    }
  });
  it("the real static controller consumes the exact post-PASS approval and publishes the retained bytes", async () => {
    const d = dir(), body = Buffer.from("<html>Verified owner-local dashboard</html>");
    const source = { sourceCommit: candidate.commit, sourceTree: candidate.tree, lockSha256: "e".repeat(64) };
    const artifact = await StaticArtifactCandidate.retain({ schema: "myeve.dashboard.build-inventory/v1", scope: "BROWSER_BUILD_ONLY", ...source, node: "v24.18.1",
      files: [{ path: "dist/index.html", bytes: body.length, sha256: createHash("sha256").update(body).digest("hex") }],
      independentVerification: "NOT_ESTABLISHED", signedResult: false, releaseQualified: false }, source, async () => body);
    const activation = new FileActivationPermits({ dir: join(d, "activation"), keys: [{ keyId: "owner-approver", publicKeyPem: pub,
      activeFrom: "2026-01-01T00:00:00.000Z", notAfter: "2027-01-01T00:00:00.000Z" }], ownerId: OWNER, appId: "app", projectSha256, ...installation });
    const approve = ownerLocalPublishApprover({ ctx: ctx(d), approverPem: pem, keyId: "owner-approver", dir: join(d, "activation"), appId: "app", projectSha256, installation });
    const controller = new StaticReleaseController({ root: join(d, "release"), activation, ownerId: OWNER, appId: "app", projectSha256, ...installation });
    await expect(controller.publish(artifact)).rejects.toThrow("QDEV_PUBLISH_NOT_AUTHORIZED");
    const artifactHex = artifact.artifactDigest.replace(/^sha256:/, "");
    await approve({ verdict: verdict({ buildArtifactSha256: artifactHex }), candidate, digest: artifactHex });
    expect(await activation.check(request("f".repeat(64)))).toBe(false);
    expect((await controller.publish(artifact)).digest).toBe(artifact.artifactDigest);
    expect((await controller.stateSource().read("app")).installedDigest).toBe(artifact.artifactDigest);
    expect(await activation.permit(request(artifactHex))).toBe(false);
  });
  it("is unavailable to any other profile", () => {
    const d = dir();
    expect(() => ownerLocalPublishApprover({ ctx: ctx(d, { profile: "myeve.private-beta.tester/v1" }), approverPem: pem, keyId: "k", dir: d, appId: "app", projectSha256, installation })).toThrow("OWNER_LOCAL_PUBLISH_PROFILE");
  });
});

describe("delivered stage Works land as completed", () => {
  const works = [{ id: "w1", version: 2, generation: 2 }, { id: "w2", version: 2, generation: 2 }, { id: "w3", version: 2, generation: 2 }];
  const delivery = { verdictSha256: "a".repeat(64), deliverySha256: "b".repeat(64), assurance: "PRIVATE_BETA_LOCAL" };
  // In-memory engineering_work: an UPDATE matches only the exact active revision; the transaction is all-or-nothing.
  const fakeDb = (state: Record<string, { lifecycle: string; version: number; generation: number }>) => {
    const events: unknown[][] = [];
    return { events, state, atomic: async <T>(fn: (db: any) => Promise<T>) => {
      const draft = structuredClone(state), ev: unknown[][] = [];
      const db = { query: async (sql: string, p: any[]) => {
        if (sql.startsWith("UPDATE engineering_work")) { const w = draft[p[1]];
          if (!w || p[0] !== OWNER || w.version !== p[2] || w.generation !== p[3] || w.lifecycle !== "active") return [];
          Object.assign(w, { lifecycle: "accepted", version: w.version + 1, generation: w.generation + 1 }); return [{ version: w.version }]; }
        ev.push(p); return []; } };
      const out = await fn(db); Object.assign(state, draft); events.push(...ev); return out; } };
  };
  const fresh = () => Object.fromEntries(works.map(w => [w.id, { lifecycle: "active", version: 2, generation: 2 }]));
  it("completes exactly the confirmed active revisions after an accepted PRIVATE_BETA_LOCAL delivery, audited", async () => {
    const d = dir(), db = fakeDb(fresh());
    const reconciled: string[] = [];
    await completeDeliveredStageWorks({ db, ctx: ctx(d), works, delivery, reconcile: async id => { reconciled.push(id); } });
    expect(reconciled).toEqual(["w1", "w2", "w3"]);
    expect(Object.values(db.state).map(w => [w.lifecycle, w.version, w.generation])).toEqual([["accepted", 3, 3], ["accepted", 3, 3], ["accepted", 3, 3]]);
    expect(db.events).toHaveLength(3);
    expect(audit(d).map(e => e.kind)).toEqual(["WORKS_COMPLETED"]);
  });
  it("completes nothing for a stale revision, foreign Works, missing evidence or another profile", async () => {
    const stale = fresh(); stale.w3.version = 3;
    const cases: Array<[Parameters<typeof completeDeliveredStageWorks>[0] extends infer C ? Partial<C> : never, Record<string, any>, string]> = [
      [{}, stale, "OWNER_LOCAL_COMPLETION_STALE"],
      [{ works: [works[0], works[1], { id: "other", version: 2, generation: 2 }] }, fresh(), "OWNER_LOCAL_COMPLETION_WORKS"],
      [{ delivery: { ...delivery, assurance: "INDEPENDENT" } }, fresh(), "OWNER_LOCAL_COMPLETION_EVIDENCE"],
      [{ delivery: { ...delivery, deliverySha256: "" } }, fresh(), "OWNER_LOCAL_COMPLETION_EVIDENCE"],
    ];
    for (const [over, state, code] of cases) {
      const d = dir(), db = fakeDb(state);
      await expect(completeDeliveredStageWorks({ db, ctx: ctx(d), works, delivery, reconcile: async () => undefined, ...over } as never)).rejects.toThrow(code);
      expect(Object.values(db.state).every(w => w.lifecycle === "active")).toBe(true);
      expect(db.events).toHaveLength(0);
    }
    // A writer that cannot be proven terminal (no exact quiescence) completes nothing.
    const db = fakeDb(fresh());
    await expect(completeDeliveredStageWorks({ db, ctx: ctx(dir()), works, delivery, reconcile: async () => { throw Error("Exact trusted remote quiescence evidence required"); } })).rejects.toThrow("quiescence");
    expect(Object.values(db.state).every(w => w.lifecycle === "active")).toBe(true);
    const d = dir();
    await expect(completeDeliveredStageWorks({ db: fakeDb(fresh()), ctx: ctx(d, { profile: "myeve.private-beta.tester/v1" }), works, delivery, reconcile: async () => undefined })).rejects.toThrow("OWNER_LOCAL_COMPLETION_PROFILE");
  });
});
