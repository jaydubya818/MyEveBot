import { snapshotRoutineConfiguration } from "./routine-admission.ts";
import {evaluateRoutineReachability,ROUTINE_RELEASE} from "./routine-release.ts";
import { db } from "../agent/lib/receipts-db.ts";
import { createHash } from "node:crypto";
import { canonicalActionValue } from "./approvals.ts";
import { nextCronOccurrence } from "../agent/lib/reminders-db.ts";
import { getAgent, effectiveCapability } from "./agents.ts";
import { getCapability } from "./capability-registry.ts";
import { routineConfigurationSchema, type RoutineConfiguration, type ExecutionDatabase } from "./execution-types.ts";
import { ROUTINE_TOOLS } from "./routine-capabilities.ts";

// Review can be recorded now. Activation must wait for checks inside tool
// executors: actions.requested events alone are not an execution boundary.
// Deliberately not an environment flag that could bypass qualification.
export const ROUTINE_EXECUTION_READY = ROUTINE_RELEASE.enabled;

// Read capabilities proposed for the first qualified unattended adapters.
export const ROUTINE_READ_TOOLS: Readonly<Record<string,string>> = {
  web_fetch:"web.read", web_search:"web.search", list_goals:"tool.list_goals",
  search_knowledge:"tool.search_knowledge", search_owner_knowledge:"tool.search_owner_knowledge",
};
export const ROUTINE_CAPABILITIES = [...new Set(Object.values(ROUTINE_TOOLS).filter(t=>t.classification!=="BLOCKED").map(t=>t.capability))];

export function deploymentOwnerId(): string {
  return process.env.MYEVE_OWNER_ID?.trim() || process.env.SOFIE_OWNER_ID?.trim() || "owner";
}

export async function validateRoutineAgent(ownerId: string, agentId: string, config: RoutineConfiguration): Promise<void> {
  // Only gateway executors can enforce a per-target or per-action approval rule.
  const governed=new Set(["files.write","tool.send_email"]);
  if(config.authority.allowedTargets.some(t=>!governed.has(t.capabilityId)) || config.authority.requiresApprovalFor.some(id=>!governed.has(id))) {
    throw new Error("This capability cannot enforce the selected target or approval restriction.");
  }
  const graph=evaluateRoutineReachability({tools:Object.keys(ROUTINE_TOOLS),classifications:Object.fromEntries(Object.entries(ROUTINE_TOOLS).map(([tool,entry])=>[tool,entry.classification])),delegation:false,opaqueConnections:false});
  if(!graph.qualified)throw new Error("Routine tool graph is not qualified.");
  const agent=await getAgent(ownerId,agentId);
  if(!agent || agent.status!=="active") throw new Error("Choose an active Agent owned by you.");
  for(const id of config.authority.allowedCapabilities) {
    if(!ROUTINE_CAPABILITIES.includes(id)) throw new Error("This capability is not yet available for unattended execution.");
    if(!effectiveCapability(agent,id,{checkAvailability:false}).allowed) throw new Error("A selected capability is unavailable to this Agent.");
    const rank={low:0,medium:1,high:2,critical:3};
    if(rank[getCapability(id)!.risk.level]>rank[config.authority.maximumRisk])throw new Error("A selected capability exceeds the Routine risk limit.");
  }
  if(config.limits.maxSteps>agent.limits.maxSteps || config.limits.maxRuntimeSeconds>agent.limits.maxRuntimeSeconds
    || config.limits.maxCostUsd>agent.limits.maxEstimatedCostUsd) throw new Error("Routine limits cannot exceed the Agent's limits.");
}

export class RoutineReviewStore {
  private database:ExecutionDatabase;
  private legacyOwner:string;
  constructor(database:ExecutionDatabase=db() as ExecutionDatabase,legacyOwner=deploymentOwnerId()) {this.database=database;this.legacyOwner=legacyOwner;}

  async list(ownerId:string) {
    return this.database.query(`SELECT m.id,m.routine_name,m.prompt,m.cron,m.timezone,m.status,m.next_fire_at,
      m.configuration_version,m.reviewed_version,m.reviewed_at,m.execution_routine_id,
      r.version AS routine_version,r.status AS execution_status,r.consecutive_failures,r.last_failure,r.last_success_at,r.agent_id,r.configuration,
      (SELECT jsonb_build_object('status',o.status,'scheduledFor',o.scheduled_for,'admission',o.admission,'preflight',o.preflight,'runId',o.run_id,'attempts',o.attempt_count) FROM execution_occurrences o WHERE o.owner_id=r.owner_id AND o.routine_id=r.id ORDER BY o.scheduled_for DESC LIMIT 1) AS last_occurrence
      FROM reminders m LEFT JOIN execution_routines r ON r.owner_id=$1 AND r.id=m.execution_routine_id
      WHERE (m.owner_id=$1 OR (m.owner_id IS NULL AND $1=$2)) AND m.status IN ('active','paused')
      ORDER BY m.created_at DESC,m.id DESC LIMIT 100`,[ownerId,this.legacyOwner]);
  }

  async review(input:{ownerId:string;reminderId:number;expectedVersion:number;expectedRoutineVersion?:number;agentId:string;configuration:RoutineConfiguration}) {
    const config=snapshotRoutineConfiguration(input.configuration);
    const rows=await this.database.query(`SELECT * FROM reminders WHERE id=$1 AND (owner_id=$2 OR (owner_id IS NULL AND $2=$3))`,[input.reminderId,input.ownerId,this.legacyOwner]);
    const reminder=rows[0];
    if(!reminder || Number(reminder.configuration_version)!==input.expectedVersion || reminder.prompt!==config.instructions) throw new Error("Reminder changed. Review its current instructions again.");
    const next=reminder.cron ? nextCronOccurrence(String(reminder.cron),String(reminder.timezone)) : new Date(Math.max(Date.now(),Date.parse(String(reminder.next_fire_at))));
    const id=`routine_reminder_${input.reminderId}`;
    const hash=(value:unknown)=>createHash("sha256").update(JSON.stringify(canonicalActionValue(value))).digest("hex");
    const reviewBinding={ownerId:input.ownerId,reminderVersion:input.expectedVersion,
      instructionsHash:hash(config.instructions),scheduleHash:hash({cron:reminder.cron,timezone:reminder.timezone,...(!reminder.cron?{nextFireAt:next.toISOString()}: {})}),
      authorityHash:hash({agentId:input.agentId,authority:config.authority,manifest:config.manifest}),budgetHash:hash(config.limits),policyHash:hash({retry:config.retry,missedPolicy:config.missedPolicy,deliveryChannel:config.deliveryChannel})};
    const result=await this.database.query(`WITH reviewed AS (
      UPDATE reminders SET owner_id=$2,reviewed_version=configuration_version,reviewed_at=now(),status='active',
        next_fire_at=$5::timestamptz,claimed_until=NULL,execution_routine_id=$7
      WHERE id=$1 AND (owner_id=$2 OR (owner_id IS NULL AND $2=$3)) AND configuration_version=$4
        AND prompt=$6 AND status IN ('active','paused')
        AND (($11::int IS NULL AND execution_routine_id IS NULL) OR EXISTS(SELECT 1 FROM execution_routines WHERE owner_id=$2 AND id=execution_routine_id AND version=$11))
        AND (reviewed_version IS DISTINCT FROM configuration_version
          OR EXISTS(SELECT 1 FROM execution_routines WHERE id=execution_routine_id AND owner_id=$2 AND (status IN ('paused','auto_paused') OR configuration<>$9::jsonb OR agent_id<>$8))) RETURNING *
    ), routine AS (
      INSERT INTO execution_routines(id,owner_id,source_kind,source_id,name,agent_id,configuration)
      SELECT $7,$2,'reminder',id::text,coalesce(routine_name,'Reminder'),$8,$9::jsonb FROM reviewed
      ON CONFLICT(owner_id,source_kind,source_id) DO UPDATE SET configuration=EXCLUDED.configuration,
        agent_id=EXCLUDED.agent_id,version=execution_routines.version+1,status='active',paused_at=NULL,consecutive_failures=0,updated_at=now()
      WHERE execution_routines.version=$11
      RETURNING *
    ), revision AS (
      INSERT INTO execution_routine_versions(owner_id,routine_id,version,configuration,changed_by,review_binding)
      SELECT owner_id,id,version,configuration,$2,$10::jsonb||jsonb_build_object('approvedAt',now()) FROM routine RETURNING routine_id
    ) SELECT id FROM routine`,[input.reminderId,input.ownerId,this.legacyOwner,input.expectedVersion,next.toISOString(),config.instructions,id,input.agentId,JSON.stringify(config),JSON.stringify(reviewBinding),input.expectedRoutineVersion??null]);
    if(!result[0]) throw new Error("Reminder changed. Review it again.");
    return result[0];
  }
}
