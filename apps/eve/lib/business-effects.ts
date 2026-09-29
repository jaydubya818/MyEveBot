import type { WorkStore } from "./engineering/store.ts";
import { WorkError } from "./engineering/types.ts";
/** Read-only preflight works with the existing restricted worker role. It is
 * never the mutation authorization: SQL claim guards repeat this check and
 * lock authority through commit, including when this preflight races revoke. */
export async function assertBusinessEffect(store:WorkStore,workId:string,effect:unknown) {
 const work=await store.get(workId);
 const [result]=await store.database.query(`SELECT NOT EXISTS(
  SELECT 1 FROM business_resource_grants g WHERE g.owner_id=$1 AND g.kind='WORK' AND g.resource_id=$2::text AND g.scope='BUSINESS_SHARED'
 ) OR EXISTS(SELECT 1 FROM business_effect_decisions d,business_partnership p,engineering_work w
  WHERE d.work_owner=$1 AND d.work_id=$2::uuid AND d.work_version=$3 AND d.work_generation=$4
  AND w.scope_id=d.work_owner AND w.scope_kind='personal' AND w.id=d.work_id AND w.version=$3 AND w.generation=$4
  AND d.effect=$6::jsonb AND p.accepted_a AND p.accepted_b AND $5 IN(p.owner_a,p.owner_b)
  AND d.partnership_revision=p.revision AND d.superseded_at IS NULL AND NOT d.denied AND d.expires_at>clock_timestamp()
  AND (w.lifecycle='active' OR (d.effect->>'operation'='reopen' AND w.lifecycle IN('cancelled','accepted','failed')))
  AND EXISTS(SELECT 1 FROM business_resource_grants g JOIN business_resource_revision r
   ON r.owner_id=g.owner_id AND r.kind=g.kind AND r.id=g.resource_id AND r.revision_hash=g.revision_hash
   WHERE g.owner_id=$1 AND g.kind='WORK' AND g.resource_id=$2::text AND g.scope='BUSINESS_SHARED' AND g.revoked_at IS NULL AND g.partnership_revision=p.revision)
  AND CASE d.policy WHEN 'OWNER_A' THEN d.approved_a WHEN 'OWNER_B' THEN d.approved_b WHEN 'EITHER_OWNER' THEN d.approved_a OR d.approved_b WHEN 'BOTH_OWNERS' THEN d.approved_a AND d.approved_b ELSE false END
 ) AS allowed`,[store.principal.scopeId,workId,work.version,work.generation,store.principal.actorId,JSON.stringify(effect)]);
 if(result?.allowed!==true)throw new WorkError('shared_decision_required','shared_decision_required: This Work needs its exact current business decision.',403);
}
