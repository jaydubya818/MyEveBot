import type { WorkStore } from "./engineering/store.ts";
/** Preflight improves errors. Durable mutations additionally call this SQL
 * guard in their own statement/trigger, holding authority through commit. */
export async function assertBusinessEffect(store:WorkStore,workId:string,effect:unknown) {
 const work=await store.get(workId);
 await store.database.query(`SELECT business_assert_effect($1,$2,$3,$4,$5,$6::jsonb)`,[store.principal.scopeId,workId,work.version,work.generation,store.principal.actorId,JSON.stringify(effect)]);
}
