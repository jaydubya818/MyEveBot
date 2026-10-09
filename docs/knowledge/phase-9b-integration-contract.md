# Phase 9B knowledge integration contract

Phase 9A owns canonical, owner-scoped structured Knowledge in Neon. It does not inject Knowledge into Agent context and does not depend on Supermemory.

Phase 9B may consume `listKnowledge(ownerId, filters)` from `apps/eve/lib/knowledge.ts` as its read seam. Context Assembly should pass the authenticated owner ID and explicit, bounded filters such as `kind`, `status`, `goalId`, `minConfidence`, date range, query, and limit. `getKnowledge(ownerId, id)` is the audit/detail seam when provenance is required.

Context Assembly must not query the Knowledge tables directly, silently promote observations, change preferences, reverse decisions, or treat hypotheses as facts. It should preserve `kind`, `status`, `confidence`, provenance availability, and supersession state in whatever bounded context representation it builds.

Semantic indexing may be added as a derived retrieval aid. Neon remains canonical; an index entry must point back to a Knowledge record ID and may be rebuilt without loss.
