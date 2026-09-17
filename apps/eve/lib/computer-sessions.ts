import { randomUUID } from "node:crypto";

import { db } from "../agent/lib/receipts-db.ts";
import { effectiveCapability, getAgent, type AgentView } from "./agents.ts";
import {
  canTransitionComputerSession,
  clampComputerLimits,
  classifyBrowserFailure,
  normalizeAllowedDomains,
  type ComputerActionStatus,
  type ComputerActionType,
  type ComputerActionView,
  type ComputerArtifactView,
  type ComputerResourceLimits,
  type ComputerSessionStatus,
  type ComputerSessionView,
} from "./computer-types.ts";
import { redactEvidenceText } from "./task-types.ts";

type Row = Record<string, unknown>;

const ACTIVE_STATUSES = ["provisioning", "ready", "running", "paused"] as const;
function text(value: unknown): string { return typeof value === "string" ? value : String(value ?? ""); }
function nullableText(value: unknown): string | null { return value == null ? null : text(value); }
function iso(value: unknown): string { return value instanceof Date ? value.toISOString() : text(value); }
function nullableIso(value: unknown): string | null { return value == null ? null : iso(value); }
function number(value: unknown): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function resourceLimits(value: unknown): ComputerResourceLimits {
  const raw = record(value);
  return {
    maxRuntimeSeconds: number(raw.maxRuntimeSeconds),
    maxBrowserActions: number(raw.maxBrowserActions),
    maxFileBytes: number(raw.maxFileBytes),
    terminalTimeoutSeconds: number(raw.terminalTimeoutSeconds),
  };
}

function artifactView(row: Row): ComputerArtifactView {
  return {
    id: text(row.id),
    actionId: nullableText(row.action_id),
    runId: nullableText(row.run_id),
    kind: text(row.kind) as ComputerArtifactView["kind"],
    filename: text(row.filename),
    contentType: text(row.content_type),
    sizeBytes: number(row.size_bytes),
    sha256: text(row.sha256),
    createdAt: iso(row.created_at),
  };
}

function actionView(row: Row): ComputerActionView {
  return {
    id: text(row.id),
    runId: nullableText(row.run_id),
    agentId: text(row.agent_id),
    type: text(row.type) as ComputerActionType,
    target: nullableText(row.target),
    inputSummary: text(row.input_summary),
    outputSummary: nullableText(row.output_summary),
    status: text(row.status) as ComputerActionStatus,
    startedAt: iso(row.started_at),
    completedAt: nullableIso(row.completed_at),
    evidenceRefs: stringArray(row.evidence_refs),
    failureCode: nullableText(row.failure_code),
    failureSummary: nullableText(row.failure_summary),
  };
}

async function sessionView(row: Row): Promise<ComputerSessionView> {
  const [browserRows, artifactRows] = await Promise.all([
    db().query(`SELECT * FROM browser_sessions WHERE computer_session_id=$1 LIMIT 1`, [row.id]) as Promise<Row[]>,
    db().query(`SELECT * FROM computer_artifacts WHERE computer_session_id=$1 ORDER BY created_at,id`, [row.id]) as Promise<Row[]>,
  ]);
  const browser = browserRows[0];
  return {
    id: text(row.id), ownerId: text(row.owner_id), agentId: text(row.agent_id), agentName: text(row.agent_name),
    goalId: nullableText(row.goal_id), goalTitle: nullableText(row.goal_title),
    taskId: nullableText(row.goal_task_id), taskTitle: nullableText(row.task_title),
    runId: nullableText(row.run_id), runTitle: nullableText(row.run_title),
    runtimeSessionId: text(row.runtime_session_id), sandboxId: nullableText(row.sandbox_id),
    status: text(row.status) as ComputerSessionStatus,
    environmentType: text(row.environment_type) as ComputerSessionView["environmentType"],
    startedAt: iso(row.started_at), lastActivityAt: iso(row.last_activity_at),
    completedAt: nullableIso(row.completed_at), expiresAt: iso(row.expires_at),
    resourceLimits: resourceLimits(row.resource_limits), networkPolicy: record(row.network_policy),
    failureCode: nullableText(row.failure_code), failureSummary: nullableText(row.failure_summary),
    browser: browser ? {
      id: text(browser.id), status: text(browser.status) as NonNullable<ComputerSessionView["browser"]>["status"],
      currentUrl: nullableText(browser.current_url), startedAt: iso(browser.started_at),
      lastActivityAt: iso(browser.last_activity_at), completedAt: nullableIso(browser.completed_at),
    } : null,
    actionCount: number(row.action_count), artifacts: artifactRows.map(artifactView),
  };
}

const SESSION_SELECT = `
  SELECT s.*, a.name AS agent_name, g.title AS goal_title, t.title AS task_title, r.title AS run_title,
         (SELECT count(*)::int FROM computer_actions ca WHERE ca.computer_session_id=s.id) AS action_count
  FROM computer_sessions s
  JOIN agents a ON a.owner_id=s.owner_id AND a.id=s.agent_id
  LEFT JOIN goals g ON g.id=s.goal_id
  LEFT JOIN goal_tasks t ON t.id=s.goal_task_id
  LEFT JOIN task_runs r ON r.owner_id=s.owner_id AND r.id=s.run_id
`;

export async function expireComputerSessions(now = new Date()): Promise<number> {
  const rows = await db().query(
    `UPDATE computer_sessions SET status='expired', completed_at=$1, last_activity_at=$1,
       failure_code=NULL, failure_summary=NULL
     WHERE expires_at <= $1 AND status = ANY($2::text[]) RETURNING id,owner_id,agent_id,goal_id,goal_task_id,run_id`,
    [now.toISOString(), [...ACTIVE_STATUSES]],
  ) as Row[];
  for (const row of rows) {
    await db().transaction((tx) => [
      tx`UPDATE browser_sessions SET status='expired',completed_at=${now.toISOString()},last_activity_at=${now.toISOString()} WHERE computer_session_id=${row.id}`,
      tx`INSERT INTO eve_events (id,owner_id,type,source_type,source_id,goal_id,goal_task_id,run_id,summary,payload)
         VALUES (${`event_${randomUUID()}`},${row.owner_id},'COMPUTER_SESSION_EXPIRED','computer_session',${row.id},${row.goal_id},${row.goal_task_id},${row.run_id},'Computer session expired',${JSON.stringify({ agentId: row.agent_id })}::jsonb)`,
    ]);
  }
  return rows.length;
}

export async function reconcileStaleComputerSessions(now = new Date()): Promise<{
  expired: number;
  failedProvisioning: number;
  failedRunning: number;
}> {
  const expired = await expireComputerSessions(now);
  const rows = await db().query(
    `UPDATE computer_sessions
     SET status='failed',completed_at=$1,last_activity_at=$1,
       failure_code=CASE WHEN status='provisioning' THEN 'provision_timeout' ELSE 'orphaned_runtime' END,
       failure_summary=CASE WHEN status='provisioning'
         THEN 'Computer provisioning did not complete within two minutes.'
         ELSE 'Computer activity stopped without a result and was closed automatically.' END
     WHERE (status='provisioning' AND started_at < $1::timestamptz - interval '2 minutes')
        OR (status='running' AND last_activity_at < $1::timestamptz - interval '5 minutes')
     RETURNING id,owner_id,status,failure_code`,
    [now.toISOString()],
  ) as Row[];
  for (const row of rows) {
    await db().transaction((tx) => [
      tx`UPDATE browser_sessions SET status='failed',completed_at=${now.toISOString()},last_activity_at=${now.toISOString()} WHERE computer_session_id=${row.id}`,
      tx`UPDATE computer_actions SET status='timed_out',completed_at=${now.toISOString()},failure_code='action_timeout',failure_summary='The owning Computer session was closed as stale.' WHERE computer_session_id=${row.id} AND status='running'`,
      tx`INSERT INTO eve_events (id,owner_id,type,source_type,source_id,summary,payload)
         VALUES (${`event_${randomUUID()}`},${row.owner_id},'COMPUTER_SESSION_FAILED','computer_session',${row.id},'Stale Computer session closed',${JSON.stringify({ failureCode: row.failure_code })}::jsonb)`,
    ]);
  }
  return {
    expired,
    failedProvisioning: rows.filter((row) => row.failure_code === "provision_timeout").length,
    failedRunning: rows.filter((row) => row.failure_code === "orphaned_runtime").length,
  };
}

async function validateLinks(input: {
  ownerId: string; agentId: string; goalId?: string; taskId?: string; runId?: string;
}): Promise<AgentView> {
  const agent = await getAgent(input.ownerId, input.agentId);
  if (!agent) throw new Error("Agent not found.");
  if (agent.status !== "active") throw new Error(`${agent.name} is ${agent.status} and cannot create a computer session.`);
  if (input.taskId && !input.goalId) throw new Error("A goal is required when linking a task.");
  if (input.goalId) {
    const rows = await db().query(
      `SELECT g.id,t.id AS task_id FROM goals g
       LEFT JOIN goal_tasks t ON t.goal_id=g.id AND t.id=$3
       WHERE g.owner_id=$1 AND g.id=$2 LIMIT 1`,
      [input.ownerId, input.goalId, input.taskId ?? null],
    ) as Row[];
    if (!rows[0]) throw new Error("Linked goal not found.");
    if (input.taskId && rows[0].task_id == null) throw new Error("Linked task does not belong to this goal.");
  }
  if (input.runId) {
    const rows = await db().query(
      `SELECT id,agent_id,goal_id,goal_task_id FROM task_runs WHERE owner_id=$1 AND id=$2 LIMIT 1`,
      [input.ownerId, input.runId],
    ) as Row[];
    const run = rows[0];
    if (!run) throw new Error("Linked run not found.");
    if (run.agent_id != null && text(run.agent_id) !== input.agentId) throw new Error("Linked run belongs to another Agent.");
    if (input.goalId && nullableText(run.goal_id) !== input.goalId) throw new Error("Linked run belongs to another goal.");
    if (input.taskId && nullableText(run.goal_task_id) !== input.taskId) throw new Error("Linked run belongs to another task.");
  }
  return agent;
}

export async function createComputerSession(input: {
  ownerId: string;
  agentId: string;
  runtimeSessionId: string;
  goalId?: string;
  taskId?: string;
  runId?: string;
  limits?: Partial<ComputerResourceLimits>;
  allowedDomains?: string[];
}): Promise<ComputerSessionView> {
  await expireComputerSessions();
  const active = await getComputerSessionForRuntime(input.ownerId, input.runtimeSessionId);
  if (active && ACTIVE_STATUSES.includes(active.status as (typeof ACTIVE_STATUSES)[number])) {
    if (active.agentId !== input.agentId) throw new Error("This runtime session is already assigned to another Agent.");
    return active;
  }
  const agent = await validateLinks(input);
  const capability = effectiveCapability(agent, "computer.session.create");
  if (!capability.allowed) throw new Error(capability.reason ?? "Computer session creation is not allowed.");
  const limits = clampComputerLimits({ maxRuntimeSeconds: agent.limits.maxRuntimeSeconds }, input.limits);
  const allowedDomains = normalizeAllowedDomains(input.allowedDomains);
  const networkPolicy = {
    mode: "domain-allowlist",
    allowedDomains,
    defaultEgress: "denied",
    privateIpv4Networks: "denied",
    credentials: "not-persisted",
  };
  const id = `computer_${randomUUID()}`;
  const browserId = `browser_${randomUUID()}`;
  const environmentType = process.env.VERCEL ? "vercel-sandbox" : "eve-sandbox";
  const expiresAt = new Date(Date.now() + limits.maxRuntimeSeconds * 1000).toISOString();
  await db().transaction((tx) => [
    tx`INSERT INTO computer_sessions (id,owner_id,agent_id,goal_id,goal_task_id,run_id,runtime_session_id,status,environment_type,expires_at,resource_limits,network_policy)
       VALUES (${id},${input.ownerId},${input.agentId},${input.goalId ?? null},${input.taskId ?? null},${input.runId ?? null},${input.runtimeSessionId},'provisioning',${environmentType},${expiresAt},${JSON.stringify(limits)}::jsonb,${JSON.stringify(networkPolicy)}::jsonb)`,
    tx`INSERT INTO browser_sessions (id,computer_session_id,status) VALUES (${browserId},${id},'ready')`,
    tx`INSERT INTO eve_events (id,owner_id,type,source_type,source_id,goal_id,goal_task_id,run_id,summary,payload)
         VALUES (${`event_${randomUUID()}`},${input.ownerId},'COMPUTER_SESSION_STARTED','computer_session',${id},${input.goalId ?? null},${input.taskId ?? null},${input.runId ?? null},'Computer session started',${JSON.stringify({ agentId: input.agentId, environmentType, limits, allowedDomains })}::jsonb)`,
  ]);
  return (await getComputerSession(input.ownerId, id))!;
}

export async function getComputerSession(ownerId: string, id: string): Promise<ComputerSessionView | null> {
  await expireComputerSessions();
  const rows = await db().query(`${SESSION_SELECT} WHERE s.owner_id=$1 AND s.id=$2 LIMIT 1`, [ownerId, id]) as Row[];
  return rows[0] ? sessionView(rows[0]) : null;
}

export async function getComputerSessionForRuntime(ownerId: string, runtimeSessionId: string): Promise<ComputerSessionView | null> {
  await expireComputerSessions();
  const rows = await db().query(
    `${SESSION_SELECT} WHERE s.owner_id=$1 AND s.runtime_session_id=$2 ORDER BY s.started_at DESC LIMIT 1`,
    [ownerId, runtimeSessionId],
  ) as Row[];
  return rows[0] ? sessionView(rows[0]) : null;
}

export async function activeComputerAgentId(ownerId: string, runtimeSessionId: string): Promise<string | null> {
  const rows = await db().query(
    `SELECT agent_id FROM computer_sessions
     WHERE owner_id=$1 AND runtime_session_id=$2
       AND status IN ('ready','running') AND expires_at > now()
     ORDER BY started_at DESC LIMIT 1`,
    [ownerId, runtimeSessionId],
  ) as Row[];
  return rows[0] ? text(rows[0].agent_id) : null;
}

export async function updateComputerAllowedDomains(
  ownerId: string,
  id: string,
  domains: readonly string[],
): Promise<ComputerSessionView> {
  const session = await getComputerSession(ownerId, id);
  if (!session) throw new Error("Computer session not found.");
  if (!["provisioning", "ready", "running"].includes(session.status)) {
    throw new Error(`Computer session network policy cannot change while ${session.status}.`);
  }
  const existing = Array.isArray(session.networkPolicy.allowedDomains)
    ? session.networkPolicy.allowedDomains.filter((item): item is string => typeof item === "string")
    : [];
  const allowedDomains = normalizeAllowedDomains([...existing, ...domains]);
  const networkPolicy = { ...session.networkPolicy, allowedDomains };
  await db().query(
    `UPDATE computer_sessions SET network_policy=$3::jsonb,last_activity_at=now() WHERE owner_id=$1 AND id=$2`,
    [ownerId, id, JSON.stringify(networkPolicy)],
  );
  return (await getComputerSession(ownerId, id))!;
}

export async function pauseComputerSession(ownerId: string, id: string): Promise<ComputerSessionView> {
  const session = await getComputerSession(ownerId, id);
  if (!session) throw new Error("Computer session not found.");
  if (session.status === "paused") return session;
  return transitionComputerSession({ ownerId, id, to: "paused" });
}

export async function resumeComputerSession(ownerId: string, id: string): Promise<ComputerSessionView> {
  const session = await getComputerSession(ownerId, id);
  if (!session) throw new Error("Computer session not found.");
  if (session.status !== "paused") throw new Error(`Computer session cannot resume from ${session.status}.`);
  if (new Date(session.expiresAt).getTime() <= Date.now()) throw new Error("Computer session has expired.");
  return transitionComputerSession({ ownerId, id, to: "ready" });
}

export async function listComputerSessions(ownerId: string, limit = 30): Promise<ComputerSessionView[]> {
  await expireComputerSessions();
  const rows = await db().query(
    `${SESSION_SELECT} WHERE s.owner_id=$1 ORDER BY s.last_activity_at DESC,s.id DESC LIMIT $2`,
    [ownerId, Math.max(1, Math.min(100, limit))],
  ) as Row[];
  return Promise.all(rows.map(sessionView));
}

export async function transitionComputerSession(input: {
  ownerId: string; id: string; to: ComputerSessionStatus; sandboxId?: string;
  failureCode?: string; failureSummary?: string;
}): Promise<ComputerSessionView> {
  const current = await getComputerSession(input.ownerId, input.id);
  if (!current) throw new Error("Computer session not found.");
  if (current.status === input.to) return current;
  if (!canTransitionComputerSession(current.status, input.to)) {
    throw new Error(`Computer session cannot transition from ${current.status} to ${input.to}.`);
  }
  if (input.to === "failed" && !input.failureCode) throw new Error("A failure code is required for failed sessions.");
  const terminal = ["completed", "failed", "expired", "stopped"].includes(input.to);
  const failureSummary = input.failureSummary ? redactEvidenceText(input.failureSummary).slice(0, 1000) : null;
  await db().transaction((tx) => [
    tx`UPDATE computer_sessions SET status=${input.to},sandbox_id=coalesce(${input.sandboxId ?? null},sandbox_id),last_activity_at=now(),
       completed_at=CASE WHEN ${terminal} THEN now() ELSE NULL END,
       failure_code=${input.to === "failed" ? input.failureCode ?? null : null},failure_summary=${input.to === "failed" ? failureSummary : null}
       WHERE owner_id=${input.ownerId} AND id=${input.id}`,
    tx`UPDATE browser_sessions SET status=${input.to === "provisioning" ? "ready" : input.to},last_activity_at=now(),
       completed_at=CASE WHEN ${terminal} THEN now() ELSE NULL END WHERE computer_session_id=${input.id}`,
    ...(terminal ? [tx`INSERT INTO eve_events (id,owner_id,type,source_type,source_id,goal_id,goal_task_id,run_id,summary,payload)
       VALUES (${`event_${randomUUID()}`},${current.ownerId},${`COMPUTER_SESSION_${input.to.toUpperCase()}`},'computer_session',${current.id},${current.goalId},${current.taskId},${current.runId},${`Computer session ${input.to}`},${JSON.stringify({ agentId: current.agentId, failureCode: input.failureCode ?? null })}::jsonb)`] : []),
  ]);
  return (await getComputerSession(input.ownerId, input.id))!;
}

export async function stopComputerSession(ownerId: string, id: string): Promise<ComputerSessionView> {
  return transitionComputerSession({ ownerId, id, to: "stopped" });
}

export async function assertComputerCapability(input: {
  ownerId: string; runtimeSessionId: string; agentId: string; capabilityId: string;
}): Promise<{ agent: AgentView; session: ComputerSessionView }> {
  const session = await getComputerSessionForRuntime(input.ownerId, input.runtimeSessionId);
  if (!session || !ACTIVE_STATUSES.includes(session.status as (typeof ACTIVE_STATUSES)[number])) {
    throw new Error("Start a computer session before using computer tools.");
  }
  if (session.agentId !== input.agentId) throw new Error("This computer session belongs to another Agent.");
  const agent = await getAgent(input.ownerId, session.agentId);
  if (!agent) throw new Error("Computer session Agent not found.");
  const decision = effectiveCapability(agent, input.capabilityId);
  if (!decision.allowed) throw new Error(decision.reason ?? `Capability ${input.capabilityId} is not allowed.`);
  return { agent, session };
}

export function computerActionTypeForTool(toolName: string): ComputerActionType | null {
  if (toolName === "browser__navigate") return "browser.navigate";
  if (["browser__click", "browser__press_key", "browser__scroll", "browser__select_option"].includes(toolName)) return "browser.click";
  if (toolName === "browser__fill") return "browser.type";
  if (["browser__read", "browser__snapshot", "browser__get", "browser__find", "browser__wait_for"].includes(toolName)) return "browser.read";
  if (["read_file", "glob", "grep"].includes(toolName)) return "file.read";
  if (toolName === "write_file") return "file.write";
  if (toolName === "bash" || toolName === "terminal_execute") return "terminal.command";
  if (toolName === "record_computer_artifact") return "file.upload";
  return null;
}

function summarize(value: unknown): string {
  let serialized: string;
  try { serialized = typeof value === "string" ? value : JSON.stringify(value); }
  catch { serialized = "[unserializable]"; }
  return redactEvidenceText(serialized.replace(/data:[^;,]+;base64,[A-Za-z0-9+/=]+/g, "[inline-data-removed]")).slice(0, 2000);
}

export function summarizeComputerActionInput(toolName: string, input: Record<string, unknown>): string {
  const safeInput = { ...input };
  if (toolName === "browser__fill") safeInput.text = "[typed value omitted]";
  if (toolName === "write_file") safeInput.content = "[file content omitted]";
  return summarize(safeInput);
}

function actionTarget(input: Record<string, unknown>): string | null {
  for (const key of ["url", "selector", "path", "command"]) {
    if (typeof input[key] === "string") return redactEvidenceText(input[key] as string).slice(0, 500);
  }
  return null;
}

export async function recordComputerActionRequested(input: {
  ownerId: string; agentId: string; runtimeSessionId: string; callId: string; toolName: string; toolInput: Record<string, unknown>;
}): Promise<void> {
  const type = computerActionTypeForTool(input.toolName);
  if (!type) return;
  const session = await getComputerSessionForRuntime(input.ownerId, input.runtimeSessionId);
  if (!session || !ACTIVE_STATUSES.includes(session.status as (typeof ACTIVE_STATUSES)[number])) return;
  if (session.agentId !== input.agentId) throw new Error("This computer session belongs to another Agent.");
  const browserActions = type.startsWith("browser.") ? await db().query(
    `SELECT count(*)::int AS count FROM computer_actions WHERE computer_session_id=$1 AND type LIKE 'browser.%'`,
    [session.id],
  ) as Row[] : [];
  if (type.startsWith("browser.") && number(browserActions[0]?.count) >= session.resourceLimits.maxBrowserActions) {
    await transitionComputerSession({ ownerId: session.ownerId, id: session.id, to: "failed", failureCode: "resource_limit", failureSummary: `Browser action limit reached (${session.resourceLimits.maxBrowserActions}).` });
    throw new Error(`Computer session reached its browser action limit (${session.resourceLimits.maxBrowserActions}).`);
  }
  const id = `computer_action_${randomUUID()}`;
  await db().transaction((tx) => [
    tx`INSERT INTO computer_actions (id,computer_session_id,run_id,agent_id,call_id,type,target,input_summary)
       VALUES (${id},${session.id},${session.runId},${session.agentId},${input.callId},${type},${actionTarget(input.toolInput)},${summarizeComputerActionInput(input.toolName, input.toolInput)})
       ON CONFLICT (computer_session_id,call_id) DO NOTHING`,
    tx`UPDATE computer_sessions SET status='running',last_activity_at=now() WHERE id=${session.id} AND status IN ('ready','running')`,
    tx`UPDATE browser_sessions SET status='running',last_activity_at=now() WHERE computer_session_id=${session.id} AND ${type.startsWith("browser.")}`,
  ]);
}

export async function recordComputerActionResult(input: {
  ownerId: string; agentId: string; runtimeSessionId: string; callId: string; toolName: string; status: "completed" | "failed" | "rejected";
  output: unknown; errorCode?: string; errorMessage?: string;
}): Promise<void> {
  if (!computerActionTypeForTool(input.toolName)) return;
  const session = await getComputerSessionForRuntime(input.ownerId, input.runtimeSessionId);
  if (!session || session.agentId !== input.agentId) return;
  const safeError = input.errorMessage ? redactEvidenceText(input.errorMessage).slice(0, 1000) : null;
  const timedOut = /timed?\s*out|timeout/i.test(`${input.errorCode ?? ""} ${safeError ?? ""}`);
  const capabilityDenied = /capabilit|not assigned|belongs to another Agent/i.test(safeError ?? "");
  const status: ComputerActionStatus = input.status === "completed" ? "completed" : input.status === "rejected" || capabilityDenied ? "denied" : timedOut ? "timed_out" : "failed";
  const browserFailure = input.toolName.startsWith("browser__") && status !== "completed"
    ? classifyBrowserFailure(input.errorCode, safeError ?? undefined)
    : null;
  const failureCode = status === "denied" ? "capability_denied" : browserFailure ?? input.errorCode ?? (status === "failed" ? "action_failed" : null);
  await db().transaction((tx) => [
    tx`UPDATE computer_actions SET status=${status},output_summary=${summarize(input.output)},completed_at=now(),
       failure_code=${failureCode},failure_summary=${safeError}
       WHERE computer_session_id=${session.id} AND call_id=${input.callId}`,
    tx`UPDATE computer_sessions SET status=CASE WHEN status='running' THEN 'ready' ELSE status END,last_activity_at=now() WHERE id=${session.id}`,
    tx`UPDATE browser_sessions SET status=CASE WHEN status='running' THEN 'ready' ELSE status END,last_activity_at=now(),
       current_url=CASE WHEN ${input.toolName === "browser__navigate" && status === "completed"}
         THEN coalesce((SELECT target FROM computer_actions WHERE computer_session_id=${session.id} AND call_id=${input.callId}),current_url)
         ELSE current_url END
       WHERE computer_session_id=${session.id}`,
  ]);
}

export async function listComputerActions(ownerId: string, sessionId: string): Promise<ComputerActionView[]> {
  const session = await getComputerSession(ownerId, sessionId);
  if (!session) throw new Error("Computer session not found.");
  const rows = await db().query(`SELECT * FROM computer_actions WHERE computer_session_id=$1 ORDER BY started_at,id`, [sessionId]) as Row[];
  return rows.map(actionView);
}

export async function recordComputerArtifact(input: {
  ownerId: string; sessionId: string; actionId?: string; kind: ComputerArtifactView["kind"];
  filename: string; contentType: string; storageKey: string; sizeBytes: number; sha256: string;
}): Promise<ComputerArtifactView> {
  const session = await getComputerSession(input.ownerId, input.sessionId);
  if (!session) throw new Error("Computer session not found.");
  if (input.sizeBytes > session.resourceLimits.maxFileBytes) throw new Error(`Artifact exceeds the ${session.resourceLimits.maxFileBytes}-byte session limit.`);
  if (input.actionId) {
    const rows = await db().query(`SELECT id FROM computer_actions WHERE computer_session_id=$1 AND id=$2 LIMIT 1`, [session.id, input.actionId]) as Row[];
    if (!rows[0]) throw new Error("Action does not belong to this computer session.");
  }
  const id = `computer_artifact_${randomUUID()}`;
  await db().transaction((tx) => [
    tx`INSERT INTO computer_artifacts (id,owner_id,computer_session_id,action_id,run_id,kind,filename,content_type,storage_key,size_bytes,sha256)
       VALUES (${id},${input.ownerId},${session.id},${input.actionId ?? null},${session.runId},${input.kind},${input.filename.slice(0,240)},${input.contentType.slice(0,160)},${input.storageKey},${input.sizeBytes},${input.sha256})`,
    ...(input.actionId ? [tx`UPDATE computer_actions SET evidence_refs=evidence_refs || ${JSON.stringify([id])}::jsonb WHERE id=${input.actionId}`] : []),
    tx`UPDATE computer_sessions SET last_activity_at=now() WHERE id=${session.id}`,
    tx`INSERT INTO eve_events (id,owner_id,type,source_type,source_id,goal_id,goal_task_id,run_id,summary,payload)
       VALUES (${`event_${randomUUID()}`},${input.ownerId},'COMPUTER_ARTIFACT_CREATED','computer_session',${session.id},${session.goalId},${session.taskId},${session.runId},'Computer artifact created',${JSON.stringify({ artifactId: id, filename: input.filename, kind: input.kind, agentId: session.agentId })}::jsonb)`,
  ]);
  const rows = await db().query(`SELECT * FROM computer_artifacts WHERE id=$1`, [id]) as Row[];
  return artifactView(rows[0]);
}

export async function computerArtifactStorageKey(ownerId: string, sessionId: string, artifactId: string): Promise<{ storageKey: string; contentType: string; filename: string } | null> {
  const rows = await db().query(
    `SELECT a.storage_key,a.content_type,a.filename FROM computer_artifacts a
     JOIN computer_sessions s ON s.id=a.computer_session_id
     WHERE s.owner_id=$1 AND s.id=$2 AND a.id=$3 LIMIT 1`,
    [ownerId, sessionId, artifactId],
  ) as Row[];
  return rows[0] ? { storageKey: text(rows[0].storage_key), contentType: text(rows[0].content_type), filename: text(rows[0].filename) } : null;
}
