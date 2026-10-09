import { describe, expect, it } from "vitest";
import type { OwnerKnowledgeView } from "@/lib/owner-knowledge-types";
import { projectOwnerKnowledge } from "./memory-adapter";
import { candidateSummaries } from "./service";
import { exportPreview, ownerReference } from "./format";

describe("Canonical read-only compatibility adapter", () => {
  it("does not infer export permission from owner visibility or emit private content", () => {
    const record = { id: "memory-private", canonicalType: "memory", title: "Private organization plan", content: "Unapproved corporate data", updatedAt: "2026-09-20T12:00:00.000Z", status: "active", scope: { type: "owner", id: "owner" }, projectRef: null } as OwnerKnowledgeView;
    const candidate = projectOwnerKnowledge("owner", record)!;
    expect(candidate.policy.portability).toBe("unknown");
    expect(() => exportPreview([candidate], [candidate.item.id], ownerReference("owner"))).toThrow(/policy/);
    expect(JSON.stringify(candidateSummaries([candidate], "owner"))).not.toContain("corporate data");
    expect(JSON.stringify(candidateSummaries([candidate], "owner"))).not.toContain("Private organization plan");
    expect(record.content).toBe("Unapproved corporate data");
  });
  it("keeps project scope and declines unsupported Work/task scopes", () => {
    const record = { id: "knowledge-project", canonicalType: "fact", title: "Convention", content: "Project-only content", updatedAt: "2026-09-20T12:00:00.000Z", status: "active", scope: { type: "owner", id: "owner" }, projectRef: "project-one" } as OwnerKnowledgeView;
    expect(projectOwnerKnowledge("owner", record)?.item.scope).toEqual({ type: "project", id: "project-one" });
    record.scope.type = "task"; expect(projectOwnerKnowledge("owner", record)).toBeNull();
  });
});
