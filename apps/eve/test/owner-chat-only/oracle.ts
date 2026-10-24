/** Read-only fixture evidence. This is not an application API or admission path. */
import { createHash } from "node:crypto";
import { digest } from "../../lib/engineering/contract.ts";
import { SharedAlphaAccounting } from "../../lib/external-alpha/shared-accounting.ts";
import type { prepareChatOnlyFixture } from "./setup.ts";
type Fixture = Awaited<ReturnType<typeof prepareChatOnlyFixture>>;

export const messages = (marker: string) => [
  `Keep this private planning marker: ${marker}. Reply in one sentence.`,
  "Use my earlier planning marker in one short sentence.",
  "Book a flight, charge my card, and start paid Work.",
];
export const replies = (marker: string) => [
  `I can plan with your marker ${marker}.`,
  `Your earlier marker is ${marker}.`,
  "I can't book flights, make purchases, or charge cards in this beta. Paid Work is disabled; I can help plan in chat.",
];
export async function observe(fixture: Fixture, index: number, marker: string, modelCalls: number) {
  const { app, credential } = fixture.installations[index];
  const query = async (sql: string, params: unknown[] = []) => (await app.pool.query(sql, params)).rows;
  const policySha = digest(app.policy);
  const usage = await new SharedAlphaAccounting(fixture.central.db, credential).status(app.policy);
  const allowances = await query("SELECT id,kind,day_index,ceiling_microusd FROM external_alpha_allowance WHERE owner_id=$1 AND policy_sha256=$2 ORDER BY id", [app.owner, policySha]);
  const operations = await query("SELECT o.id,o.allowance_id,o.state,o.source,o.spent_microusd FROM external_alpha_operation o JOIN external_alpha_allowance a ON a.id=o.allowance_id WHERE a.owner_id=$1 AND a.policy_sha256=$2 ORDER BY o.id", [app.owner, policySha]);
  const admissions = (await fixture.central.pool.query("SELECT id,kind,day_index,state,local_allowance_id,ceiling_microusd FROM external_alpha_cohort_admission WHERE owner_id=$1 AND policy_sha256=$2 ORDER BY id", [app.owner, policySha])).rows;
  const dispatches = (await fixture.central.pool.query("SELECT d.admission_id,d.state FROM external_alpha_cohort_dispatch d JOIN external_alpha_cohort_admission a ON a.id=d.admission_id WHERE a.owner_id=$1 AND a.policy_sha256=$2 ORDER BY d.admission_id", [app.owner, policySha])).rows;
  const rows = await query("SELECT id,owner_id,agent_id,chat FROM web_chat_threads WHERE owner_id=$1 ORDER BY id", [app.owner]);
  const threads = rows.map((row: any) => ({ id: row.id, ownerId: row.owner_id, agentId: row.agent_id,
    sessionId: row.chat?.session?.sessionId ?? null,
    failedTurns: (row.chat?.events ?? []).filter((event: any) => event.type === "turn.failed").length,
    completedTurns: (row.chat?.events ?? []).filter((event: any) => event.type === "turn.completed").length,
    persistedReplies: replies(marker).filter(text => JSON.stringify(row.chat).includes(text)).length,
    eventsSha256: createHash("sha256").update(JSON.stringify(row.chat?.events ?? [])).digest("hex") }));
  const runs = await query("SELECT DISTINCT owner_id,agent_id,thread_id,session_id FROM agent_runs WHERE owner_id=$1 ORDER BY session_id,thread_id,agent_id", [app.owner]);
  const credentials = await query("SELECT owner_id,version,password_hash FROM web_password_credentials WHERE installation_id=$1 AND owner_id=$2", [app.policy.projectId, app.owner]);
  const password = credentials.map((row: any) => ({ ownerId: row.owner_id, version: row.version,
    hashed: /^scrypt\$131072\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(row.password_hash) }));
  const [local] = await query("SELECT p.activated_at,p.revoked_at,n.owner_id,n.policy_sha256 FROM external_alpha_policy p JOIN external_alpha_chat_only n ON n.owner_id=p.owner_id AND n.policy_sha256=p.policy_sha256 WHERE p.singleton AND n.singleton");
  const effects: Record<string, number> = {};
  for (const table of ["engineering_work", "external_alpha_work_authority", "external_alpha_work_result", "external_alpha_tool_effect", "engineering_owner_decisions", "engineering_candidate_publications"])
    effects[table] = Number((await query(`SELECT count(*)::int AS n FROM ${table}`))[0].n);
  return { slot: app.policy.slot, ownerId: app.owner, projectId: app.policy.projectId,
    policySha256: policySha, database: app.name, modelCalls, usage, local,
    allowances, operations, admissions, dispatches, threads, runs, password, effects };
}
