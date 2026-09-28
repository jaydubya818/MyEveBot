import { defineHook, type HookContext } from "eve/hooks";

import { db } from "../lib/receipts-db.ts";
import { ENGINEERING_WORK_ID_PATTERN } from "../lib/engineering-work-binding.ts";

type ContextDatabase = {
  query(sql: string, params: unknown[]): Promise<Record<string, unknown>[]>;
};

/** Dynamic instruction failures are skipped by Eve, so verify their durable
 * assembly receipt before any model step for a selected Work. */
export async function requireSelectedWorkContext(
  ctx: Pick<HookContext, "session" | "channel">,
  database?: ContextDatabase,
): Promise<void> {
  const current = ctx.session.auth.current;
  const attributes = current?.attributes;
  if (!attributes || !Object.hasOwn(attributes, "myeveEngineeringWorkId")) return;

  const workId = attributes.myeveEngineeringWorkId;
  const threadId = attributes.webThreadId;
  const initiator = ctx.session.auth.initiator;
  if (typeof workId !== "string" || !ENGINEERING_WORK_ID_PATTERN.test(workId) ||
      typeof threadId !== "string" || threadId.length === 0 ||
      ctx.channel.kind !== "http" || current?.authenticator !== "myeve-web-session" ||
      current.principalType !== "user" || attributes.owner !== "true" ||
      initiator?.authenticator !== "myeve-web-session" ||
      initiator.principalType !== "user" || initiator.principalId !== current.principalId ||
      initiator.attributes.owner !== "true" || initiator.attributes.webThreadId !== threadId) {
    throw new Error("Selected Work requires this owner's direct Sofie web chat.");
  }

  const runId = `agent_run_${ctx.session.id}_${ctx.session.turn.id}`;
  const [assembled] = await (database ?? db()).query(
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
    [current.principalId, ctx.session.id, runId, threadId, workId, `engineering-work:${workId}`],
  );
  if (!assembled) {
    throw new Error("Selected Work context could not be verified for this turn. Retry from Work before asking Sofie to act.");
  }
}

export default defineHook({
  events: {
    async "step.started"(_event, ctx) {
      await requireSelectedWorkContext(ctx);
    },
  },
});
