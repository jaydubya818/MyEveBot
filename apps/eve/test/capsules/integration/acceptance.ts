/** Reusable suite. A canonical driver must use an isolated disposable tenant/database,
 * exercise real policy/activation hooks, and implement these observation/seed helpers.
 * It must never point to a live owner. The fixture driver is explicitly separate. */
import { describe, expect, it } from "vitest";
import { checkCanonicalExport, portableDigest, type CanonicalActivation, type CanonicalExportPolicy, type ActivationSnapshot, type PortableExperience, type PortableScope, type QualificationEvidence } from "../../../lib/capsules/integration-contract";
import { digest } from "../../../lib/capsules/format";
import { records, request, scope } from "./fixture";
export interface AcceptanceDriver extends CanonicalActivation {
  snapshot(): Promise<ActivationSnapshot>;
  retrieve(target: PortableScope): Promise<PortableExperience[]>;
  seedCurrent(records: PortableExperience[]): Promise<void>;
  qualify(record: PortableExperience, scope?: PortableScope, overrides?: Partial<QualificationEvidence>): Promise<void>;
  restart(): Promise<void>; close(): Promise<void>;
}
export interface AcceptanceFactory {
  mode: "fixture" | "canonical";
  disposable: true;
  open(): Promise<{ driver: AcceptanceDriver; policy: CanonicalExportPolicy; cleanup(): Promise<void> }>;
}
export function integrationAcceptance(factory: AcceptanceFactory) {
  describe(`Capsule ${factory.mode} integration acceptance`, () => {
    async function run(test: (driver: AcceptanceDriver, policy: CanonicalExportPolicy) => Promise<void>) {
      if (factory.disposable !== true) throw new Error("Disposable acceptance target required");
      const { driver, policy, cleanup } = await factory.open();
      try { await test(driver, policy); } finally { await driver.close(); await cleanup(); }
    }
    it("requires explicit selection and bound canonical source policy", () => run(async (_, policy) => {
      const record = records()[0];
      const context = { authenticatedOwnerRef: scope().ownerRef, destinationEveRef: "sofie-b", targetScope: scope(), selectedIds: [record.item.id], purpose: "capsule_export" as const };
      expect((await checkCanonicalExport(policy, record, context)).allowed).toBe(true);
      expect((await checkCanonicalExport(policy, record, { ...context, selectedIds: [] })).allowed).toBe(false);
      for (const classification of ["PRIVATE_NONPORTABLE", "CORPORATE_RESTRICTED", "UNKNOWN"] as const) expect((await checkCanonicalExport(policy, { ...record, classification }, context)).allowed).toBe(false);
      const unbound = { canExport: async () => ({ allowed: true, reason: "bad", policyRevision: "1", itemDigest: digest("other"), contextDigest: digest(context) }) };
      expect((await checkCanonicalExport(unbound, record, context)).allowed).toBe(false);
      expect((await checkCanonicalExport({ canExport: async () => ({ ...(await policy.canExport(record, context)), allowed: false }) }, record, context)).allowed).toBe(false);
    }));
    it("stages inertly; activates all-or-none; restarts; recovers; rolls back idempotently", () => run(async driver => {
      const batch = request(); await driver.stage(batch); await driver.validate(batch.id);
      expect((await driver.snapshot()).current).toHaveLength(0);
      const preview = await driver.preview(batch.id);
      expect(preview.rows.every(r => r.state === "eligible")).toBe(true);
      const receipt = await driver.activate(batch.id, preview.reviewDigest);
      await driver.restart(); expect((await driver.retrieve(scope())).map(r => r.item.key).sort()).toEqual(batch.records.map(r => r.item.key).sort());
      expect(await driver.recover(batch.id)).toEqual(receipt);
      expect(await driver.activate(batch.id, preview.reviewDigest)).toEqual(receipt);
      const rollback = await driver.rollback(batch.id); await driver.restart();
      expect((await driver.snapshot()).current).toHaveLength(0);
      expect(await driver.rollback(batch.id)).toEqual(rollback);
      expect((await driver.activate(batch.id, preview.reviewDigest)).result).toBe("rolled_back");
    }));
    it("rejects stale previews and preserves later Current Truth during rollback", () => run(async driver => {
      const batch = request(); await driver.stage(batch); const preview = await driver.preview(batch.id);
      const local = records()[8]; await driver.seedCurrent([local]);
      await expect(driver.activate(batch.id, preview.reviewDigest)).rejects.toThrow();
      expect((await driver.snapshot()).current).toEqual([local]);
      const second = { ...batch, id: "fresh", expectedRevision: (await driver.snapshot()).revision };
      await driver.stage(second); await driver.activate(second.id, (await driver.preview(second.id)).reviewDigest);
      const changed = structuredClone(local); changed.item.text = "A later local correction."; await driver.seedCurrent([changed]);
      await expect(driver.rollback(second.id)).rejects.toThrow();
      expect((await driver.snapshot()).current.some(r => r.item.text === changed.item.text)).toBe(true);
    }));
    it.each(["CURRENT", "HISTORICAL", "SUPERSEDED"] as const)("keeps destination Current Truth against incoming %s", truth => run(async driver => {
      const incoming = records()[0]; incoming.truth = truth;
      const local = records()[0]; local.item.version = "2.0.0"; local.item.text = "New destination preference";
      await driver.seedCurrent([local]);
      const batch = { ...request([incoming]), expectedRevision: (await driver.snapshot()).revision }; await driver.stage(batch);
      const preview = await driver.preview(batch.id);
      expect(preview.rows[0].state).toBe(truth === "CURRENT" ? "conflict" : "inactive");
      await expect(driver.activate(batch.id, preview.reviewDigest)).rejects.toThrow(); expect((await driver.snapshot()).current).toEqual([local]);
    }));
    it("rejects multiple incoming corrections and conflicting provenance", () => run(async driver => {
      const first = records()[0], correction = structuredClone(first); correction.item.id = "correction-2"; correction.supersedesId = first.item.id;
      await driver.stage(request([first, correction])); await expect(driver.preview("acceptance-batch")).rejects.toThrow();
      await driver.seedCurrent([first]); const incoming = structuredClone(first); incoming.provenance[0].sourceId = "different-source";
      const batch = { ...request([incoming]), id: "provenance-conflict", expectedRevision: (await driver.snapshot()).revision }; await driver.stage(batch);
      expect((await driver.preview(batch.id)).rows[0].state).toBe("conflict");
    }));
    it("preserves project, repository, Work type and Work identity; allows only narrower targets", () => run(async driver => {
      const record = records()[0]; record.scope = { ...scope(), projectId: "project-sellerfi", repository: "org/repo", workType: "review", workId: "work-1" };
      for (const [index, facet] of ["projectId", "repository", "workType", "workId"].entries()) {
        const target = { ...record.scope, [facet]: null }; const batch = { ...request([record]), id: `widen-${index}`, targetScope: target }; await driver.stage(batch);
        const preview = await driver.preview(batch.id); expect(preview.rows[0].state).toBe("unsupported"); await expect(driver.activate(batch.id, preview.reviewDigest)).rejects.toThrow();
      }
      const batch = { ...request([record]), id: "preserved", targetScope: record.scope }; await driver.stage(batch);
      await driver.activate(batch.id, (await driver.preview(batch.id)).reviewDigest); await driver.restart(); expect((await driver.snapshot()).current[0].scope).toEqual(record.scope);
    }));
    it("narrows owner experience to a project without replacing broader Current Truth", () => run(async driver => {
      const record = records()[0]; const target = { ...scope(), projectId: "project-sellerfi" };
      const batch = { ...request([record]), targetScope: target }; await driver.stage(batch); await driver.activate(batch.id, (await driver.preview(batch.id)).reviewDigest);
      expect((await driver.snapshot()).current[0].scope).toEqual(target);
      expect(await driver.retrieve({ ...target, projectId: "another-project" })).toEqual([]);
      expect(await driver.retrieve(scope())).toEqual([]);
      expect(await driver.retrieve(target)).toHaveLength(1);
    }));
    it.each(["CANDIDATE", "EVALUATING", "REJECTED", "SUPERSEDED", "ROLLED_BACK"] as const)("keeps %s learning inactive even with qualification", status => run(async driver => {
      const record = records().find(r => r.learning)!; record.learning!.status = status;
      await driver.qualify(record); const batch = request([record]); await driver.stage(batch); const preview = await driver.preview(batch.id);
      expect(preview.rows[0].state).toBe("inactive"); await expect(driver.activate(batch.id, preview.reviewDigest)).rejects.toThrow();
      expect((await driver.snapshot()).current).toHaveLength(0);
    }));
    it("binds promoted learning version, evidence, hash and narrow scope", () => run(async driver => {
      const record = records().find(r => r.learning)!;
      record.scope = { ...scope(), repository: "org/repo", workType: "review", workId: "work-1" }; record.learning!.scope = record.scope;
      record.learning!.version = 3; await driver.qualify(record, record.scope);
      const batch = { ...request([record]), targetScope: record.scope }; await driver.stage(batch);
      await driver.activate(batch.id, (await driver.preview(batch.id)).reviewDigest); await driver.restart();
      expect((await driver.snapshot()).current[0].learning).toEqual(record.learning);
    }));
    it("rejects mismatched learning evidence and broadened learning metadata", () => run(async driver => {
      const record = records().find(r => r.learning)!; record.learning!.evaluation.candidateHash = digest("other-version");
      await driver.qualify(record); await driver.stage(request([record])); expect((await driver.preview("acceptance-batch")).rows[0].state).toBe("inactive");
      record.learning!.scope = { ...record.scope, workId: "work-1" };
      await expect(driver.stage({ ...request(), id: "bad-scope", records: [record] })).rejects.toThrow();
    }));
    it.each(["skill", "role", "pack", "procedure"])("keeps %s inactive until exact destination qualification; carries no authority", kind => run(async driver => {
      const record = records().find(r => r.item.kind === kind)!; const batch = request([record]); await driver.stage(batch);
      let preview = await driver.preview(batch.id); expect(preview.rows[0].state).toBe("qualification_required");
      await expect(driver.activate(batch.id, preview.reviewDigest)).rejects.toThrow();
      await driver.qualify(record, scope(), { destinationEveRef: "source-eve" }); expect((await driver.preview(batch.id)).rows[0].state).toBe("qualification_required");
      await driver.qualify(record); preview = await driver.preview(batch.id); await driver.activate(batch.id, preview.reviewDigest);
      const active = (await driver.snapshot()).current[0]; expect(active).toEqual(record);
      for (const field of ["credentials", "sessions", "grants", "repositoryAccess", "relayGrants", "providerAuthority", "writerAuthority", "approvals"]) {
        expect(JSON.stringify(active)).not.toMatch(new RegExp(`"${field}"\\s*:`));
      }
      const duplicate = { ...batch, id: "duplicate", expectedRevision: (await driver.snapshot()).revision }; await driver.stage(duplicate);
      expect((await driver.preview(duplicate.id)).rows[0].state).toBe("duplicate");
      const v2 = structuredClone(record); v2.item.version = "1.1.0";
      const conflict = { ...request([v2]), id: "version-conflict", expectedRevision: duplicate.expectedRevision }; await driver.stage(conflict);
      expect((await driver.preview(conflict.id)).rows[0].state).toBe("conflict");
      const future = structuredClone(record); future.item.version = "2.0.0";
      const unsupported = { ...request([future]), id: "future", expectedRevision: duplicate.expectedRevision }; await driver.stage(unsupported);
      expect((await driver.preview(unsupported.id)).rows[0].state).toBe("unsupported");
    }));
    it("rejects credential-bearing provenance and grant fields before staging", () => run(async driver => {
      const record = records()[5]; record.provenance[0].reference = "api_key=synthetic-sensitive";
      await expect(driver.stage({ ...request(), records: [record] })).rejects.toThrow();
      const payload = { ...request(), grants: ["repository-write"] };
      await expect(driver.stage(payload)).rejects.toThrow();
      expect((await driver.snapshot()).current).toHaveLength(0);
    }));
    it("aborts the whole mixed batch when one Skill is unqualified", () => run(async driver => {
      const batch = request([records()[0], records()[4]]); await driver.stage(batch); const preview = await driver.preview(batch.id);
      await expect(driver.activate(batch.id, preview.reviewDigest)).rejects.toThrow(); expect((await driver.snapshot()).current).toHaveLength(0); expect(await driver.recover(batch.id)).toBeNull();
    }));
    it("rechecks destination qualification at activation", () => run(async driver => {
      const record = records()[4]; await driver.qualify(record); const batch = request([record]); await driver.stage(batch); const preview = await driver.preview(batch.id);
      await driver.qualify(record, scope(), { result: "FAIL" }); await expect(driver.activate(batch.id, preview.reviewDigest)).rejects.toThrow(); expect((await driver.snapshot()).current).toHaveLength(0);
    }));
  });
}
