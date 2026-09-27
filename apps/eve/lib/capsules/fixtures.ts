import { ownerReference } from "./format";
import type { ExportCandidate, CapsuleItem } from "./schema";
import type { Destination } from "./import";

export const FIXTURE_OWNER = "capsule-design-partner";
export function fixtureCandidates(ownerId = FIXTURE_OWNER): ExportCandidate[] {
  const ownerRef = ownerReference(ownerId);
  const definitions: Array<[CapsuleItem["kind"], string, string, string]> = [
    ["preference", "response-style", "Concise project updates", "Use a short summary, evidence, and one next step."],
    ["memory", "meeting-day", "Planning rhythm", "Planning meetings happen on Tuesdays."],
    ["project", "project-convention", "SellerFi project conventions", "Show loading, empty, error, and success states for buyer and seller flows."],
    ["procedure", "release-review", "Release review checklist", "Check the buyer journey, seller journey, keyboard navigation, and error recovery before release."],
    ["skill", "release-notes", "Release notes Skill", "Describe the customer-visible change and its validation evidence."],
    ["role", "engineering-role", "Engineering Role", "Prefer readable code, focused changes, and explicit state transitions."],
    ["pack", "launch-pack", "Launch Pack", "Use product review and release review procedures for launch preparation."],
    ["learning", "recovery-lesson", "Qualified recovery lesson", "On a retry, check the stored operation result before repeating a write."],
    ["file", "project-note", "Project note.txt", "SellerFi helps buyers evaluate opportunities and sellers manage a safe closing process."],
  ];
  return definitions.map(([kind, key, title, text]) => ({
    item: { id: `fixture-${key}`, kind, key, title, text, version: "1.0.0", privacy: "private",
      scope: kind === "project" ? { type: "project", id: "project-sellerfi" } : { type: "owner", id: ownerRef },
      provenance: { sourceRef: `source-${key}`, sourceType: kind === "learning" ? "qualified_learning" : kind === "skill" || kind === "role" || kind === "pack" || kind === "file" ? kind : "owner_statement", revision: "revision-1", observedAt: "2026-09-20T12:00:00.000Z", policyRef: "fixture-personal-portable", ...(kind === "learning" ? { qualificationRef: "qualification-fixture-1" } : {}) },
      ...(kind === "file" ? { mediaType: "text/plain" as const } : {}),
    },
    policy: { ownerRef, classification: "personal", portability: "allowed", sourceCategory: "experience", state: kind === "learning" ? "promoted" : "active" },
  }));
}
export function freshDestination(ownerId = FIXTURE_OWNER): Destination {
  return { ownerRef: ownerReference(ownerId), eveRef: "sofie-b", projectIds: ["project-sellerfi"], revision: "0", current: [], imported: [], supportedKinds: ["memory", "knowledge", "preference", "project", "procedure", "skill", "role", "pack", "example", "learning", "file"] };
}
