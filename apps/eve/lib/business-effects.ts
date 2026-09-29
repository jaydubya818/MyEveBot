import type { WorkStore } from "./engineering/store.ts";
import { WorkError } from "./engineering/types.ts";
import { businessEffectHash } from "./business-scopes.ts";

/** Shared decision is an additional constraint; all canonical execution and
 * credential checks still run. Revoked partnership/grants cannot restore private
 * effect authority while this Work carries a shared decision history. */
export async function assertBusinessEffect(store:WorkStore,workId:string,effect:unknown) {
 if(!process.env.MYEVE_PARTNER_OWNER_ID)return;
 const work=await store.get(workId);
 const [shared]=await store.database.query(`SELECT 1 FROM business_resource_grants WHERE owner_id=$1 AND kind='WORK' AND resource_id=$2 AND scope='BUSINESS_SHARED' LIMIT 1`,[store.principal.scopeId,workId]);
 if(!shared)return;
 const hash=businessEffectHash(workId,work.version,work.generation,effect);
 const rows=await store.database.query(`SELECT d.id FROM business_effect_decisions d,business_partnership p
 WHERE d.work_owner=$1 AND d.work_id=$2 AND d.work_version=$3 AND d.work_generation=$4 AND d.effect_hash=$5
 AND p.accepted_a AND p.accepted_b AND d.partnership_revision=p.revision AND $6 IN(p.owner_a,p.owner_b)
 AND EXISTS(SELECT 1 FROM business_resource_grants g JOIN business_resource_revision r ON r.owner_id=g.owner_id AND r.kind=g.kind AND r.id=g.resource_id AND r.revision_hash=g.revision_hash WHERE g.owner_id=d.work_owner AND g.kind='WORK' AND g.resource_id=d.work_id::text AND g.scope='BUSINESS_SHARED' AND g.revoked_at IS NULL AND g.partnership_revision=p.revision)
 AND NOT d.denied AND d.expires_at>clock_timestamp()
 AND CASE d.policy WHEN 'OWNER_A' THEN d.approved_a WHEN 'OWNER_B' THEN d.approved_b WHEN 'EITHER_OWNER' THEN d.approved_a OR d.approved_b WHEN 'BOTH_OWNERS' THEN d.approved_a AND d.approved_b ELSE false END`,[store.principal.scopeId,workId,work.version,work.generation,hash,store.principal.actorId]);
 if(rows.length!==1)throw new WorkError('shared_decision_required','This shared Work needs its exact current business decision before this effect.',403);
}
