import { searchOwnerKnowledge } from "@/lib/owner-knowledge";
import { digest, exclusionReason, ownerReference } from "./format";
import { projectOwnerKnowledge } from "./memory-adapter";
import { fixtureCandidates, freshDestination } from "./fixtures";
import { CapsuleStagingStore } from "./staging-store";
import type { CapsuleDestinationAdapter, Destination, PreparedImport } from "./import";
import { CapsuleError, type ExportCandidate } from "./schema";

export function fixtureEnabled() { return process.env.NODE_ENV !== "production" && Boolean(process.env.MYEVE_CAPSULE_FIXTURE_DB?.startsWith("/tmp/")); }
export async function capsuleService(ownerId: string) {
  if (fixtureEnabled()) {
    const { FixtureDestination } = await import("./fixture-store");
    const adapter = new FixtureDestination(process.env.MYEVE_CAPSULE_FIXTURE_DB!, ownerId);
    return { mode: "qualification" as const, candidates: fixtureCandidates(ownerId), adapter, close: () => adapter.close(), reviews: [], remove: async (_id: string) => false };
  }
  if (!process.env.DATABASE_URL) throw new CapsuleError("database", "Capsule review needs the existing MyEve database. No experience has been changed.");
  // Source policy is deliberately unknown until Total Recall supplies it. Never
  // infer portability from owner visibility or the item text.
  const candidates: ExportCandidate[] = [];
  for (let page = 1; page <= 20; page++) {
    const found = await searchOwnerKnowledge(ownerId, { page, limit: 50, status: "active" });
    for (const item of found.items) { const candidate = projectOwnerKnowledge(ownerId, item); if (candidate) candidates.push(candidate); }
    if (!found.hasMore) break;
  }
  const store = new CapsuleStagingStore(ownerId);
  const reviews = await store.list();
  const snapshot = (): Destination => ({
    ...freshDestination(ownerId), eveRef: "destination-eve", projectIds: [],
    // Existing canonical records are visible for conflict review. Source policy
    // and exhaustive semantic conflict detection remain canonical integration work.
    current: candidates.map(c => c.item), imported: reviews.flatMap(r => r.records),
    revision: digest({ current: candidates.map(c => c.item), reviews }),
  });
  const adapter: CapsuleDestinationAdapter = {
    snapshot: async () => snapshot(),
    commit: async (batch: PreparedImport) => {
      if (batch.expectedRevision !== snapshot().revision) throw new CapsuleError("stale_preview", "Destination changed. Review the Capsule again.");
      return store.commit(batch);
    },
  };
  return { mode: "staging" as const, candidates, adapter, close: () => {}, reviews: reviews.map(({ id, count, createdAt }) => ({ id, count, createdAt })), remove: (id: string) => store.remove(id) };
}
export function candidateSummaries(candidates: ExportCandidate[], ownerId: string) {
  return candidates.map(candidate => {
    const reason = exclusionReason(candidate, ownerReference(ownerId));
    // Excluded private/unknown-policy source content is never sent to the builder.
    return reason ? { id: candidate.item.id, title: "Source awaiting portability policy", kind: candidate.item.kind, scope: candidate.item.scope.type, reason, eligible: false as const } : { id: candidate.item.id, title: candidate.item.title, kind: candidate.item.kind, scope: candidate.item.scope.type, reason: "Explicit selection of policy-approved personal experience.", eligible: true as const };
  });
}
