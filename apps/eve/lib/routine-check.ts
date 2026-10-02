import {z} from 'zod';
import {LostExecutionClaim,type ExecutionClaim,type ExecutionDatabase} from './execution-types.ts';
export const routineCheckSchema=z.object({
 condition:z.enum(['met','not_met','unknown']),
 summary:z.string().trim().min(1).max(1000),
 evidenceReferences:z.array(z.string().trim().min(1).max(500)).min(1).max(20),
}).strict();
export type RoutineCheck=z.infer<typeof routineCheckSchema>;
/** Bounded observations in the existing Run history, never a purchase, send or
 * publication grant. A check is valid only for the exact live claim. */
export async function retainRoutineCheck(db:ExecutionDatabase,claim:ExecutionClaim,value:unknown) {
 const check=routineCheckSchema.parse(value);
 if(!claim.configuration.responsibility)throw Error('This Routine has no reviewed condition.');
 const rows=await db.query(`INSERT INTO task_milestones(task_id,kind,summary,metadata)
 SELECT o.run_id,'routine_check',$5,$6::jsonb FROM execution_occurrences o
 JOIN execution_routines r ON r.owner_id=o.owner_id AND r.id=o.routine_id
 WHERE o.owner_id=$1 AND o.id=$2 AND o.claim_version=$3 AND o.claimed_by=$4 AND o.status='running'
 AND o.lease_expires_at>now() AND r.status='active' AND r.version=o.routine_version
 RETURNING id`,[claim.ownerId,claim.occurrenceId,claim.version,claim.workerId,check.summary,JSON.stringify({...check,occurrenceId:claim.occurrenceId,claimVersion:claim.version,conditionStatement:claim.configuration.responsibility.condition})]);
 if(!rows[0])throw new LostExecutionClaim();
 return {retained:true,checkId:String(rows[0].id),condition:check.condition};
}
export async function readRoutineCheck(db:ExecutionDatabase,claim:ExecutionClaim):Promise<RoutineCheck|null> {
 if(!claim.configuration.responsibility)return null;
 const [row]=await db.query(`SELECT m.metadata FROM task_milestones m JOIN task_runs t ON t.id=m.task_id
 WHERE t.owner_id=$1 AND t.id=$2 AND m.kind='routine_check' AND m.metadata->>'occurrenceId'=$3
 AND m.metadata->>'claimVersion'=$4 AND m.metadata->>'conditionStatement'=$5 ORDER BY m.id DESC LIMIT 1`,
 [claim.ownerId,claim.runId,claim.occurrenceId,String(claim.version),claim.configuration.responsibility.condition]);
 if(!row)throw Error('A retained check is required before this conditional Routine can complete.');
 const metadata = row.metadata as Record<string, unknown>;
 return routineCheckSchema.parse({condition:metadata.condition,summary:metadata.summary,evidenceReferences:metadata.evidenceReferences});
}
