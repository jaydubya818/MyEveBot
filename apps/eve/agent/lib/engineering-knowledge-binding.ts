import {selectedEngineeringWorkEnabled} from "../../lib/engineering/alpha-selected-work.ts";
import { engineeringWorkEnabled } from "../../lib/engineering/deployment-mode.ts";
import type { ToolContext } from "eve/tools";

import { db } from "./receipts-db.ts";
import { ENGINEERING_WORK_ID_PATTERN } from "./engineering-work-binding.ts";

type ContextDatabase = {
  query(sql: string, params: unknown[]): Promise<Record<string, unknown>[]>;
};

/** A model-supplied Work ID does not select Work. The authenticated current
 * turn must have selected it, and its primary-Agent context must have been
 * assembled durably before a tool can read or write Work-scoped Knowledge. */
export async function assertEngineeringKnowledgeWorkBinding(
  ctx: Pick<ToolContext, "session">,
  ownerId: string,
  workId: string,
  database: ContextDatabase = db(),
): Promise<void> {
  const current = ctx.session.auth.current;
  const initiator = ctx.session.auth.initiator;
  const threadId = current?.attributes.webThreadId;
  if (!selectedEngineeringWorkEnabled(workId,engineeringWorkEnabled()) ||
      !ENGINEERING_WORK_ID_PATTERN.test(workId) ||
      current?.attributes.myeveEngineeringWorkId !== workId ||
      current.authenticator !== "myeve-web-session" ||
      current.principalType !== "user" || current.principalId !== ownerId ||
      current.attributes.owner !== "true" || current.attributes.myeveRoleId ||
      initiator?.authenticator !== "myeve-web-session" ||
      initiator.principalType !== "user" || initiator.principalId !== ownerId ||
      initiator.attributes.owner !== "true" || initiator.attributes.myeveRoleId ||
      typeof threadId !== "string" || !threadId ||
      initiator.attributes.webThreadId !== threadId || ctx.session.parent) {
    throw new Error("Selected Engineering Work requires this owner's direct primary Agent web chat.");
  }

  const [receipt] = await database.query(
    `SELECT 1 FROM context_assemblies AS assembly
     JOIN agent_runs AS run ON run.id=assembly.agent_run_id
       AND run.owner_id=assembly.owner_id AND run.agent_id=assembly.agent_id
       AND run.session_id=assembly.session_id AND run.thread_id=assembly.thread_id
     JOIN agents AS agent ON agent.owner_id=run.owner_id AND agent.id=run.agent_id
     JOIN engineering_work AS work ON work.scope_id=assembly.owner_id
       AND work.scope_kind='personal' AND work.id=$5
     WHERE assembly.owner_id=$1 AND assembly.session_id=$2
       AND assembly.agent_run_id=$3 AND assembly.thread_id=$4
       AND run.executor_kind='primary-agent' AND run.status='running'
       AND agent.is_primary AND agent.status='active'
       AND assembly.source_refs @> jsonb_build_array($6::text)
       AND assembly.source_refs @> jsonb_build_array($6::text || ':v' || work.version::text)
     LIMIT 1`,
    [ownerId, ctx.session.id, `agent_run_${ctx.session.id}_${ctx.session.turn.id}`,
      threadId, workId, `engineering-work:${workId}`],
  );
  if (!receipt)
    throw new Error("Selected Engineering Work context is unavailable for this turn. Retry from Work.");
}
