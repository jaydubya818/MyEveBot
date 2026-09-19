import { randomUUID } from "node:crypto";
import { CronExpressionParser } from "cron-parser";
import { db } from "../agent/lib/receipts-db.ts";
import { ExecutionStore } from "./execution-store.ts";
import { routineConfigurationSchema,type ExecutionDatabase } from "./execution-types.ts";
import { nextCronOccurrence } from "../agent/lib/reminders-db.ts";
import { deploymentOwnerId } from "./routine-review.ts";

/** A scheduler tick only creates durable occurrences and advances schedules. */
export async function enqueueReviewedReminders(ownerId=deploymentOwnerId(),database:ExecutionDatabase=db() as ExecutionDatabase,now=new Date()):Promise<number> {
  const rows=await database.query(`SELECT m.*,r.configuration FROM reminders m JOIN execution_routines r
    ON r.owner_id=m.owner_id AND r.id=m.execution_routine_id WHERE m.owner_id=$1 AND m.status='active'
    AND m.reviewed_version=m.configuration_version AND r.status='active' AND m.next_fire_at<=$2
    ORDER BY m.next_fire_at,m.id LIMIT 20`,[ownerId,now.toISOString()]);
  const store=new ExecutionStore(database);
  let enqueued=0;
  for(const row of rows) {
    const configuration=routineConfigurationSchema.parse(row.configuration);
    const due=row.next_fire_at instanceof Date?row.next_fire_at:new Date(String(row.next_fire_at));
    const cron=row.cron?String(row.cron):null;
    const next=cron?nextCronOccurrence(cron,String(row.timezone),now):null;
    const stale=now.getTime()-due.getTime()>60_000;
    if(!(cron && stale && configuration.missedPolicy==="skip")) {
      const period=cron && stale?CronExpressionParser.parse(cron,{tz:String(row.timezone),currentDate:now}).prev().toDate():due;
      const id=await store.enqueue({ownerId,routineId:String(row.execution_routine_id),key:period.toISOString(),scheduledFor:period.toISOString()});
      if(!id)continue;
      enqueued++;
    }
    await database.query(`UPDATE reminders SET next_fire_at=coalesce($4::timestamptz,next_fire_at),
      status=CASE WHEN $4::timestamptz IS NULL THEN 'done' ELSE status END,last_fired_at=$5
      WHERE owner_id=$1 AND id=$2 AND date_trunc('milliseconds',next_fire_at)=$3::timestamptz
        AND configuration_version=$6 AND reviewed_version=configuration_version`,
    [ownerId,row.id,due.toISOString(),next?.toISOString()??null,now.toISOString(),row.configuration_version]);
  }
  return enqueued;
}
export function executionWorkerId():string {return `worker_${randomUUID()}`;}
