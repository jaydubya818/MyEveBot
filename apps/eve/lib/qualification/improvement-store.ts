import { WorkStore, type WorkDatabase } from "../engineering/store.ts";
import { ImprovementRefused, type BaselineStore, type ImprovementFrontdoor } from "./improvement.ts";

/**
 * Production storage frontdoor for improvement proposals over the existing owner Work tables. Each proposal runs in ONE pinned transaction that
 * first takes a transaction-scoped advisory lock for (owner, delivered candidate), so the cap check, the exact count and the insert cannot interleave
 * with a concurrent request in any process. It refuses (fails closed) when the Work database cannot provide a pinned transaction.
 * Reads and writes are limited to the owner's personal scope; nothing else is touched.
 */
export function workImprovementFrontdoor(ownerId: string, database: WorkDatabase): ImprovementFrontdoor {
  const principal = { scopeKind: "personal" as const, scopeId: ownerId, actorId: ownerId };
  return { async exclusive(key, action) {
    if (!database.atomic) throw new ImprovementRefused("QDEV_IMPROVEMENT_STATE");
    const outside = new WorkStore(principal, database);
    return database.atomic(async tx => {
      await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [key]);
      const inside = new WorkStore(principal, tx);
      const store: BaselineStore = {
        has: async idempotencyKey => (await tx.query("SELECT 1 FROM engineering_work WHERE scope_id=$1 AND scope_kind='personal' AND idempotency_key=$2", [ownerId, idempotencyKey])).length > 0,
        count: async marker => Number((await tx.query(
          "SELECT count(*)::int AS n FROM engineering_work WHERE scope_id=$1 AND scope_kind='personal' AND starts_with(title,'Improvement proposal (unfunded) [') AND position($2 IN objective)>0",
          [ownerId, marker]))[0]?.n ?? Number.MAX_SAFE_INTEGER),
        create: value => inside.create(value),
        // A pre-existing Work found running is paused through the normal frontdoor (its own guarded transaction), never inside this one.
        change: (id, value) => outside.change(id, value),
      };
      return action(store);
    });
  } };
}
