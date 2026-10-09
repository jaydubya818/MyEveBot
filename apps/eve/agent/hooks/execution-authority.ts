import { defineHook } from "eve/hooks";
import { executionIdentityFromAuth,resolveExecution } from "../../lib/execution-auth.ts";
import { ROUTINE_READ_TOOLS } from "../../lib/routine-review.ts";
import { db } from "../lib/receipts-db.ts";
import { getCapability } from "../../lib/capability-registry.ts";
import { effectiveCapability,getAgent } from "../../lib/agents.ts";

// Defense in depth only. Event observation is not a provider-call authorization
// boundary; routine activation remains blocked until executor checks are wired.
export default defineHook({events:{
  async "turn.started"(_event,ctx) {
    const identity=executionIdentityFromAuth(ctx.session.auth);if(!identity)return;
    const claim=await resolveExecution(identity);
    const rows=await db().query(`WITH bound AS (
      UPDATE execution_occurrences SET runtime_session_id=$5
      WHERE owner_id=$1 AND id=$2 AND claim_version=$3 AND claimed_by=$4 AND status='running' AND lease_expires_at>now()
        AND (runtime_session_id IS NULL OR runtime_session_id=$5) RETURNING run_id
    ), session AS (
      INSERT INTO task_run_sessions(task_id,session_id,role) SELECT run_id,$5,'orchestrator' FROM bound
      ON CONFLICT(task_id,session_id) DO NOTHING
    ) SELECT run_id FROM bound`,[claim.ownerId,claim.occurrenceId,claim.version,claim.workerId,ctx.session.id]);
    if(!rows.length)throw new Error("Occurrence already belongs to another runtime session.");
  },
  async "step.started"(_event,ctx) {
    const identity=executionIdentityFromAuth(ctx.session.auth);if(identity)await resolveExecution(identity);
  },
  async "step.completed"(event,ctx) {
    if(!executionIdentityFromAuth(ctx.session.auth))return;
    const cost=event.data.usage?.costUsd;
    if(cost===undefined || !Number.isFinite(cost) || cost<0) {
      throw new Error("Routine stopped because model cost is unavailable. Review before continuing.");
    }
  },
  async "actions.requested"(event,ctx) {
    const identity=executionIdentityFromAuth(ctx.session.auth);if(!identity)return;
    const claim=await resolveExecution(identity);
    const agent=await getAgent(claim.ownerId,claim.agentId);
    for(const action of event.data.actions) {
      const capability=action.kind==="tool-call"?ROUTINE_READ_TOOLS[action.toolName]:undefined;
      if(!capability || !claim.configuration.authority.allowedCapabilities.includes(capability)
        || !agent || !effectiveCapability(agent,capability).allowed || getCapability(capability)?.availability.status!=="available") {
        throw new Error("Routine authority does not permit the requested action. Review its capabilities in Control Center.");
      }
    }
  },
}});
