import type { ToolContext } from "eve/tools";
import { db } from "../../agent/lib/receipts-db.ts";
import { resolveSessionAgent } from "../../agent/lib/session-settings.ts";
import { digest } from "../engineering/contract.ts";
import { externalAlphaPolicy, externalAlphaInstallation } from "./policy.ts";
import { ExternalAlphaAllowance } from "./allowance.ts";
import type { ExecutionDatabase } from "../execution-types.ts";

/** Re-evaluated by the executable tool, including resumed human approvals.
 * A model proposal or an earlier approval is never standing tool authority. */
export async function assertExternalAlphaTool(
  ctx: Pick<ToolContext, "session" | "callId">,
  toolName: string,
) {
  if (!externalAlphaInstallation()) return;
  const policy = externalAlphaPolicy();
  const { current, initiator } = ctx.session.auth;
  if (
    !policy ||
    ctx.session.parent ||
    !ctx.callId ||
    [current, initiator].some(
      (p) =>
        p?.authenticator !== "myeve-web-session" ||
        p.principalType !== "user" ||
        p.principalId !== policy.ownerId ||
        p.attributes.owner !== "true" ||
        p.attributes.myeveRoleId,
    )
  ) {
    throw Error("EXTERNAL_ALPHA_TOOL_OWNER_REQUIRED");
  }
  const agent = await resolveSessionAgent({
    ownerId: policy.ownerId,
    sessionId: ctx.session.id,
    auth: ctx.session.auth,
    primaryFallback: true,
  });
  if (!agent || agent.ownerId !== policy.ownerId || agent.status !== "active") {
    throw Error("EXTERNAL_ALPHA_AGENT_REVOKED");
  }
  const database = db() as ExecutionDatabase;
  // Resolve the original model operation by the exact durable tool call. Do not
  // attach an old parked call to a new turn's unspent allowance.
  const rows = await database.query(
    `
    SELECT a.id, a.binding_id, a.request_sha256, o.step_key
    FROM external_alpha_allowance a JOIN external_alpha_operation o ON o.allowance_id=a.id
    WHERE a.owner_id=$1 AND a.policy_sha256=$2 AND o.state='SETTLED'
      AND left(a.binding_id,length($3)+1)=$3||':'
      AND EXISTS(SELECT 1 FROM jsonb_array_elements(o.result->'content') c
        WHERE c->>'type'='tool-call' AND c->>'toolCallId'=$4 AND c->>'toolName'=$5)
  `,
    [policy.ownerId, digest(policy), ctx.session.id, ctx.callId, toolName],
  );
  if (rows.length !== 1) throw Error("EXTERNAL_ALPHA_TOOL_PROPOSAL_REQUIRED");
  const row = rows[0],
    step = String(row.step_key);
  const turn = step.slice(0, step.lastIndexOf(":"));
  if (
    !/^.+:\d+$/.test(step) ||
    row.binding_id !== ctx.session.id + ":" + turn ||
    row.request_sha256 !==
      digest({
        ownerId: policy.ownerId,
        agentId: agent.id,
        sessionId: ctx.session.id,
        turn,
      })
  ) {
    throw Error("EXTERNAL_ALPHA_TOOL_BINDING");
  }
  await new ExternalAlphaAllowance(database, policy).assertActive(
    String(row.id),
  );
  return {
    database,
    policy,
    agentId: agent.id,
    allowanceId: String(row.id),
    turnId: turn,
  };
}

/** Exact-once admission, not an observer hook. Revocation wins if committed
 * before this claim. A previously accepted local effect may settle afterward;
 * ambiguous effects remain fenced and are never automatically retried. */
export async function runExternalAlphaTool<T>(
  ctx: Pick<ToolContext, "session" | "callId">,
  toolName: string,
  input: unknown,
  execute: () => Promise<T>,
): Promise<T> {
  const bound = await assertExternalAlphaTool(ctx, toolName);
  if (!bound) return execute();
  const { database, policy } = bound;
  const binding = {
    ownerId: policy.ownerId,
    policySha256: digest(policy),
    sessionId: ctx.session.id,
    callId: ctx.callId,
    toolName,
    inputSha256: digest(input),
    agentId: bound.agentId,
    allowanceId: bound.allowanceId,
    turnId: bound.turnId,
  };
  const [claim] = await database.query(
    "SELECT external_alpha_tool_claim($1::jsonb) AS receipt",
    [JSON.stringify(binding)],
  );
  const receipt = claim?.receipt as { state?: string; result?: T } | undefined;
  if (receipt?.state === "COMPLETED") return receipt.result as T;
  if (receipt?.state !== "ACCEPTED")
    throw Error("EXTERNAL_ALPHA_EFFECT_NOT_ACCEPTED");
  try {
    const result = await execute();
    const [finished] = await database.query(
      "SELECT external_alpha_tool_finish($1::jsonb) AS state",
      [JSON.stringify({ ...binding, state: "COMPLETED", result })],
    );
    if (finished?.state !== "COMPLETED")
      throw Error("EXTERNAL_ALPHA_EFFECT_OUTCOME_UNKNOWN");
    return result;
  } catch (error) {
    // Failure to record UNKNOWN still leaves ACCEPTED, which blocks replay.
    await database
      .query("SELECT external_alpha_tool_finish($1::jsonb)", [
        JSON.stringify({ ...binding, state: "UNKNOWN" }),
      ])
      .catch(() => {});
    throw error;
  }
}
