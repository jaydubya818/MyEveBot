import { db } from "../agent/lib/receipts-db.ts";
import { nextCronOccurrence } from "../agent/lib/reminders-db.ts";
import { getAgent, effectiveCapability } from "./agents.ts";
import { getCapability } from "./capability-registry.ts";
import { routineConfigurationSchema, type RoutineConfiguration, type ExecutionDatabase } from "./execution-types.ts";

// Review can be recorded now. Activation must wait for checks inside tool
// executors: actions.requested events alone are not an execution boundary.
// Deliberately not an environment flag that could bypass qualification.
export const ROUTINE_EXECUTION_READY = false;

// Read capabilities proposed for the first qualified unattended adapters.
export const ROUTINE_READ_TOOLS: Readonly<Record<string,string>> = {
  web_fetch:"web.read", web_search:"web.search", list_goals:"tool.list_goals",
  search_knowledge:"tool.search_knowledge", search_owner_knowledge:"tool.search_owner_knowledge",
};
export const ROUTINE_CAPABILITIES = [...new Set(Object.values(ROUTINE_READ_TOOLS))];

export function deploymentOwnerId(): string {
  return process.env.MYEVE_OWNER_ID?.trim() || process.env.SOFIE_OWNER_ID?.trim() || "owner";
}

export async function validateRoutineAgent(ownerId: string, agentId: string, config: RoutineConfiguration): Promise<void> {
  if(config.authority.allowedTargets.length || config.authority.requiresApprovalFor.length) {
    throw new Error("Target restrictions and per-action approvals are not yet supported by unattended read adapters.");
  }
  const agent=await getAgent(ownerId,agentId);
  if(!agent || agent.status!=="active") throw new Error("Choose an active Agent owned by you.");
  for(const id of config.authority.allowedCapabilities) {
    if(!ROUTINE_CAPABILITIES.includes(id)) throw new Error("This capability is not yet available for unattended execution.");
    if(!effectiveCapability(agent,id).allowed || getCapability(id)?.availability.status!=="available") throw new Error("A selected capability is unavailable to this Agent.");
  }
  if(config.limits.maxSteps>agent.limits.maxSteps || config.limits.maxRuntimeSeconds>agent.limits.maxRuntimeSeconds
    || config.limits.maxCostUsd>agent.limits.maxEstimatedCostUsd) throw new Error("Routine limits cannot exceed the Agent's limits.");
}

export class RoutineReviewStore {
  constructor(private database:ExecutionDatabase=db() as ExecutionDatabase,private legacyOwner=deploymentOwnerId()) {}

  async list(ownerId:string) {
    return this.database.query(`SELECT m.id,m.routine_name,m.prompt,m.cron,m.timezone,m.status,m.next_fire_at,
      m.configuration_version,m.reviewed_version,m.reviewed_at,m.execution_routine_id,
      r.status AS execution_status,r.consecutive_failures,r.last_failure,r.last_success_at,r.agent_id,r.configuration
      FROM reminders m LEFT JOIN execution_routines r ON r.owner_id=$1 AND r.id=m.execution_routine_id
      WHERE (m.owner_id=$1 OR (m.owner_id IS NULL AND $1=$2)) AND m.status IN ('active','paused')
      ORDER BY m.created_at DESC,m.id DESC LIMIT 100`,[ownerId,this.legacyOwner]);
  }

  async review(input:{ownerId:string;reminderId:number;expectedVersion:number;agentId:string;configuration:RoutineConfiguration}) {
    const config=routineConfigurationSchema.parse(input.configuration);
    const rows=await this.database.query(`SELECT * FROM reminders WHERE id=$1 AND (owner_id=$2 OR (owner_id IS NULL AND $2=$3))`,[input.reminderId,input.ownerId,this.legacyOwner]);
    const reminder=rows[0];
    if(!reminder || Number(reminder.configuration_version)!==input.expectedVersion || reminder.prompt!==config.instructions) throw new Error("Reminder changed. Review its current instructions again.");
    const next=reminder.cron ? nextCronOccurrence(String(reminder.cron),String(reminder.timezone)) : new Date(Math.max(Date.now(),Date.parse(String(reminder.next_fire_at))));
    const id=`routine_reminder_${input.reminderId}`;
    const result=await this.database.query(`WITH reviewed AS (
      UPDATE reminders SET owner_id=$2,reviewed_version=configuration_version,reviewed_at=now(),status='active',
        next_fire_at=$5::timestamptz,claimed_until=NULL,execution_routine_id=$7
      WHERE id=$1 AND (owner_id=$2 OR (owner_id IS NULL AND $2=$3)) AND configuration_version=$4
        AND prompt=$6 AND status IN ('active','paused') AND (reviewed_version IS DISTINCT FROM configuration_version
          OR EXISTS(SELECT 1 FROM execution_routines WHERE id=execution_routine_id AND owner_id=$2 AND status IN ('paused','auto_paused'))) RETURNING *
    ), routine AS (
      INSERT INTO execution_routines(id,owner_id,source_kind,source_id,name,agent_id,configuration)
      SELECT $7,$2,'reminder',id::text,coalesce(routine_name,'Reminder'),$8,$9::jsonb FROM reviewed
      ON CONFLICT(owner_id,source_kind,source_id) DO UPDATE SET configuration=EXCLUDED.configuration,
        agent_id=EXCLUDED.agent_id,version=execution_routines.version+1,status='active',paused_at=NULL,consecutive_failures=0,updated_at=now()
      RETURNING *
    ), revision AS (
      INSERT INTO execution_routine_versions(owner_id,routine_id,version,configuration,changed_by)
      SELECT owner_id,id,version,configuration,$2 FROM routine RETURNING routine_id
    ) SELECT id FROM routine`,[input.reminderId,input.ownerId,this.legacyOwner,input.expectedVersion,next.toISOString(),config.instructions,id,input.agentId,JSON.stringify(config)]);
    if(!result[0]) throw new Error("Reminder changed. Review it again.");
    return result[0];
  }
}
