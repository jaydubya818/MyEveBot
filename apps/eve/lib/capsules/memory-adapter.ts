import type { OwnerKnowledgeView } from "@/lib/owner-knowledge-types";
import { digest, ownerReference } from "./format";
import type { ExportCandidate, CapsuleItem } from "./schema";

/** Read-only projection of canonical Memory. No writes or copied persistence. */
export function projectOwnerKnowledge(ownerId: string, record: OwnerKnowledgeView): ExportCandidate | null {
  if (!["owner", "agent", "project"].includes(record.scope.type)) return null;
  const ownerRef = ownerReference(ownerId);
  const kind: CapsuleItem["kind"] = record.canonicalType === "memory" ? "memory" : record.canonicalType === "preference" ? "preference" : "knowledge";
  return {
    item: {
      id: record.id, kind,
      key: `${kind}-${digest(record.title ?? record.id).slice(7, 31)}`,
      title: record.title ?? "Selected memory", text: record.content, version: "1.0.0",
      scope: record.projectRef ? { type: "project", id: record.projectRef } : { type: record.scope.type as "owner" | "agent" | "project", id: record.scope.type === "owner" ? ownerRef : record.scope.id },
      privacy: "private",
      provenance: { sourceRef: record.id, sourceType: kind === "memory" ? "owner_statement" : "knowledge", revision: record.updatedAt, observedAt: record.updatedAt, policyRef: "policy-unavailable" },
    },
    // Canonical v1 has no source portability/classification contract. Owner visibility
    // alone is not permission to export corporate or third-party information.
    policy: { ownerRef, classification: "personal", portability: "unknown", sourceCategory: "experience", state: record.status === "active" ? "active" : "candidate" },
  };
}
