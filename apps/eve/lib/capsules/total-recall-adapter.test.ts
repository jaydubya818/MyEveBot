import { describe, expect, it } from "vitest";
import { inspectTotalRecallRepresentation } from "./total-recall-adapter";
import { digest } from "./format";
function source() { return { contractVersion: 1, type: "MEMORY_REPRESENTATION", identity: "memory-1", kind: "memory", text: "Planning occurs on Tuesdays.", ownerId: "owner-1",
  scope: { kind: "OWNER", workId: null as string | null, repository: null as string | null }, privacy: "PRIVATE",
  provenance: [{ sourceId: "source-1", type: "statement", reference: "source-1", contentHash: null, origin: "OWNER", relation: "supports" }],
  currentTruth: { status: "CURRENT", supersedesId: "memory-0", supersededById: null }, confidence: 1,
  learningVersion: null as { id: string; version: number; hash: string } | null, contentHash: digest("source").slice(7),
  portability: { eligible: false, reason: "Requires separate owner selection, source policy and Capsule qualification" }, authorityGrants: [] }; }
describe("Total Recall draft v1 read-only crosswalk", () => {
  it("preserves provenance and Current Truth but never treats private visibility as export consent", () => {
    const input = source(), before = structuredClone(input), result = inspectTotalRecallRepresentation(input, "owner-1");
    expect(input).toEqual(before); expect(result.provenance).toEqual(input.provenance); expect(result.currentTruth).toEqual(input.currentTruth);
    expect(result.exportAllowed).toBe(false); expect(result.activationAllowed).toBe(false); expect(result.classification).toBe("UNKNOWN");
  });
  it("preserves Work/repository restriction and requires full learning evidence", () => {
    const input = source(); input.scope = { kind: "WORK", workId: "f18afc41-6bd7-4cb6-b276-994521d83a75", repository: "org/repo" }; input.privacy = "WORK_SCOPED";
    input.learningVersion = { id: digest("learning-1").slice(7), version: 3, hash: digest("version-3").slice(7) };
    const result = inspectTotalRecallRepresentation(input, "owner-1");
    expect(result.scope.workId).toBe(input.scope.workId); expect(result.scope.repository).toBe("org/repo"); expect(result.learningVersion).toEqual(input.learningVersion);
    expect(result.blockers.join(" ")).toMatch(/cannot encode Work/); expect(result.blockers.join(" ")).toMatch(/version reference is insufficient/);
  });
  it("fails closed on cross-owner, authority, widened scope, and contract drift", () => {
    expect(() => inspectTotalRecallRepresentation(source(), "other-owner")).toThrow();
    expect(() => inspectTotalRecallRepresentation({ ...source(), authorityGrants: ["write"] }, "owner-1")).toThrow();
    expect(() => inspectTotalRecallRepresentation({ ...source(), contractVersion: 2 }, "owner-1")).toThrow();
    expect(() => inspectTotalRecallRepresentation({ ...source(), scope: { kind: "OWNER", workId: "f18afc41-6bd7-4cb6-b276-994521d83a75", repository: "org/repo" } }, "owner-1")).toThrow();
  });
});
