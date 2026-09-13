import { randomUUID } from "node:crypto";

import { db } from "../agent/lib/receipts-db.ts";
import {
  BALANCED_GUARDRAILS,
  PRODUCT_QA_CHECKS,
  QA_SPECIALISTS,
  canTransitionTask,
  redactEvidenceText,
  type QaSpecialistRole,
  type TaskRunView,
  type TaskStatus,
} from "./task-types.ts";
import { AGENT_NAME } from "./identity.ts";

type Row = Record<string, unknown>;

function textValue(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function nullableText(value: unknown): string | null {
  return value === null || value === undefined ? null : textValue(value);
}

function numberValue(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isoValue(value: unknown): string {
  return value instanceof Date ? value.toISOString() : textValue(value);
}

function nullableIso(value: unknown): string | null {
  return value === null || value === undefined ? null : isoValue(value);
}

export function taskOwnerFromAuth(
  auth: { current: { principalId?: string } | null },
  env: NodeJS.ProcessEnv = process.env,
): string {
  return (
    auth.current?.principalId?.trim() ||
    env.MYEVE_OWNER_ID?.trim() ||
    env.SOFIE_OWNER_ID?.trim() ||
    "owner"
  );
}

export interface CreateProductQaTaskInput {
  ownerId: string;
  sessionId: string;
  threadId?: string;
  localUrl: string;
  previewUrl: string;
  goalId?: string;
  goalTaskId?: string;
  agentId?: string;
}

export async function createProductQaTask(
  input: CreateProductQaTaskInput,
): Promise<TaskRunView> {
  const taskId = `task_${randomUUID()}`;
  const title = `${AGENT_NAME} self-test: local + isolated preview`;
  const target = JSON.stringify({ localUrl: input.localUrl, previewUrl: input.previewUrl });
  const sql = db();

  if (input.goalTaskId && !input.goalId) throw new Error("A goalId is required when linking a goal task.");
  if (input.goalId) {
    const linkRows = (await sql.query(
      `SELECT g.id AS goal_id, t.id AS task_id
       FROM goals g
       LEFT JOIN goal_tasks t ON t.goal_id = g.id AND t.id = $3
       WHERE g.owner_id = $1 AND g.id = $2 LIMIT 1`,
      [input.ownerId, input.goalId, input.goalTaskId ?? null],
    )) as Row[];
    if (linkRows.length === 0) throw new Error("Linked goal not found.");
    if (input.goalTaskId && linkRows[0]?.task_id === null) throw new Error("Linked task does not belong to this goal.");
  }

  await sql.transaction((tx) => [
    tx`INSERT INTO task_runs (
      id, owner_id, kind, title, thread_id, goal_id, goal_task_id, agent_id, status, target,
      max_duration_seconds, max_specialists, max_model_steps,
      max_retries_per_specialist, max_estimated_cost_usd,
      started_at, deadline_at
    ) VALUES (
      ${taskId}, ${input.ownerId}, 'product_qa', ${title}, ${input.threadId ?? null},
      ${input.goalId ?? null}, ${input.goalTaskId ?? null}, ${input.agentId ?? null}, 'running', ${target}::jsonb,
      ${BALANCED_GUARDRAILS.maxDurationSeconds}, ${BALANCED_GUARDRAILS.maxSpecialists},
      ${BALANCED_GUARDRAILS.maxModelSteps}, ${BALANCED_GUARDRAILS.maxRetriesPerSpecialist},
      ${BALANCED_GUARDRAILS.maxEstimatedCostUsd}, now(),
      now() + (${BALANCED_GUARDRAILS.maxDurationSeconds} * interval '1 second')
    )`,
    tx`INSERT INTO task_run_sessions (task_id, session_id, role)
       VALUES (${taskId}, ${input.sessionId}, 'orchestrator')`,
    ...QA_SPECIALISTS.map(
      (specialist) => tx`INSERT INTO task_specialists (task_id, role, label)
        VALUES (${taskId}, ${specialist.role}, ${specialist.label})`,
    ),
    ...PRODUCT_QA_CHECKS.map(
      (check) => tx`INSERT INTO task_acceptance_checks (
        id, task_id, slug, label, specialist_role, environment
      ) VALUES (
        ${`check_${randomUUID()}`}, ${taskId}, ${check.slug}, ${check.label},
        ${check.role}, ${check.environment}
      )`,
    ),
    tx`INSERT INTO task_transitions (task_id, from_status, to_status, actor, reason)
       VALUES (${taskId}, NULL, 'queued', 'system', 'Task contract created')`,
    tx`INSERT INTO task_transitions (task_id, from_status, to_status, actor, reason)
       VALUES (${taskId}, 'queued', 'running', 'agent', 'QA execution started')`,
    tx`INSERT INTO task_milestones (task_id, kind, summary, metadata)
       VALUES (${taskId}, 'task_started', 'Balanced QA run started',
         ${JSON.stringify(BALANCED_GUARDRAILS)}::jsonb)`,
    ...(input.goalId
      ? [tx`INSERT INTO eve_events (
            id, owner_id, type, source_type, source_id, goal_id, goal_task_id, run_id, summary, payload
          ) VALUES (
            ${`event_${randomUUID()}`}, ${input.ownerId}, 'RUN_STARTED', 'product_qa', ${taskId},
            ${input.goalId}, ${input.goalTaskId ?? null}, ${taskId}, 'Started linked product QA run',
            ${JSON.stringify({ guardrails: BALANCED_GUARDRAILS })}::jsonb
          )`]
      : []),
  ]);

  return (await getTaskRun(input.ownerId, taskId))!;
}

async function taskRows(ownerId: string, taskId: string): Promise<Row[]> {
  return (await db().query(
    `SELECT * FROM task_runs WHERE owner_id = $1 AND id = $2 LIMIT 1`,
    [ownerId, taskId],
  )) as Row[];
}

export async function getTaskRun(ownerId: string, taskId: string): Promise<TaskRunView | null> {
  const runRows = await taskRows(ownerId, taskId);
  const run = runRows[0];
  if (run === undefined) return null;

  const [specialists, checks, artifacts, milestones] = await Promise.all([
    db().query(
      `SELECT s.role, s.label, s.status, s.attempts, s.summary, s.error
       FROM task_specialists s
       JOIN task_runs r ON r.id = s.task_id
       WHERE r.owner_id = $1 AND s.task_id = $2 ORDER BY s.role`,
      [ownerId, taskId],
    ) as Promise<Row[]>,
    db().query(
      `SELECT c.id, c.slug, c.label, c.specialist_role, c.environment, c.required,
              c.status, c.result_summary, c.checked_at,
              count(a.id)::int AS artifact_count
       FROM task_acceptance_checks c
       JOIN task_runs r ON r.id = c.task_id
       LEFT JOIN task_artifacts a ON a.check_id = c.id
       WHERE r.owner_id = $1 AND c.task_id = $2
       GROUP BY c.id
       ORDER BY c.specialist_role, c.slug`,
      [ownerId, taskId],
    ) as Promise<Row[]>,
    db().query(
      `SELECT a.id, a.check_id, a.specialist_role, a.kind, a.filename, a.content_type,
              a.size_bytes, a.sha256, a.created_at
       FROM task_artifacts a
       JOIN task_runs r ON r.id = a.task_id
       WHERE r.owner_id = $1 AND a.task_id = $2 ORDER BY a.created_at, a.id`,
      [ownerId, taskId],
    ) as Promise<Row[]>,
    db().query(
      `SELECT m.id, m.kind, m.summary, m.created_at
       FROM task_milestones m
       JOIN task_runs r ON r.id = m.task_id
       WHERE r.owner_id = $1 AND m.task_id = $2 ORDER BY m.created_at, m.id`,
      [ownerId, taskId],
    ) as Promise<Row[]>,
  ]);
  const rawTarget = run.target;
  const target =
    rawTarget !== null && typeof rawTarget === "object" && !Array.isArray(rawTarget)
      ? (rawTarget as Record<string, unknown>)
      : {};

  return {
    id: textValue(run.id),
    agentId: nullableText(run.agent_id),
    kind: "product_qa",
    title: textValue(run.title),
    threadId: nullableText(run.thread_id),
    goalId: nullableText(run.goal_id),
    goalTaskId: nullableText(run.goal_task_id),
    status: textValue(run.status) as TaskStatus,
    statusReason: nullableText(run.status_reason),
    target: {
      localUrl: textValue(target.localUrl),
      previewUrl: textValue(target.previewUrl),
    },
    guardrails: {
      maxDurationSeconds: numberValue(run.max_duration_seconds),
      maxSpecialists: numberValue(run.max_specialists),
      maxModelSteps: numberValue(run.max_model_steps),
      maxRetriesPerSpecialist: numberValue(run.max_retries_per_specialist),
      maxEstimatedCostUsd: numberValue(run.max_estimated_cost_usd),
    },
    usage: {
      modelSteps: numberValue(run.model_steps),
      estimatedCostUsd: numberValue(run.estimated_cost_usd),
    },
    createdAt: isoValue(run.created_at),
    startedAt: nullableIso(run.started_at),
    deadlineAt: nullableIso(run.deadline_at),
    completedAt: nullableIso(run.completed_at),
    updatedAt: isoValue(run.updated_at),
    specialists: specialists.map((row) => ({
      role: textValue(row.role) as QaSpecialistRole,
      label: textValue(row.label),
      status: textValue(row.status) as TaskRunView["specialists"][number]["status"],
      attempts: numberValue(row.attempts),
      summary: nullableText(row.summary),
      error: nullableText(row.error),
    })),
    checks: checks.map((row) => ({
      id: textValue(row.id),
      slug: textValue(row.slug),
      label: textValue(row.label),
      specialistRole: textValue(row.specialist_role) as QaSpecialistRole,
      environment: textValue(row.environment) as TaskRunView["checks"][number]["environment"],
      required: row.required === true,
      status: textValue(row.status) as TaskRunView["checks"][number]["status"],
      resultSummary: nullableText(row.result_summary),
      checkedAt: nullableIso(row.checked_at),
      artifactCount: numberValue(row.artifact_count),
    })),
    artifacts: artifacts.map((row) => ({
      id: textValue(row.id),
      checkId: nullableText(row.check_id),
      specialistRole: nullableText(row.specialist_role) as QaSpecialistRole | null,
      kind: textValue(row.kind) as TaskRunView["artifacts"][number]["kind"],
      filename: textValue(row.filename),
      contentType: textValue(row.content_type),
      sizeBytes: numberValue(row.size_bytes),
      sha256: textValue(row.sha256),
      createdAt: isoValue(row.created_at),
    })),
    milestones: milestones.map((row) => ({
      id: numberValue(row.id),
      kind: textValue(row.kind),
      summary: textValue(row.summary),
      createdAt: isoValue(row.created_at),
    })),
  };
}

export async function listTaskRuns(ownerId: string, threadId?: string): Promise<TaskRunView[]> {
  const params: unknown[] = [ownerId];
  let filter = "";
  if (threadId !== undefined) {
    params.push(threadId);
    filter = " AND thread_id = $2";
  }
  const rows = (await db().query(
    `SELECT id FROM task_runs WHERE owner_id = $1${filter}
     ORDER BY updated_at DESC, id DESC LIMIT 20`,
    params,
  )) as Row[];
  return (
    await Promise.all(rows.map((row) => getTaskRun(ownerId, textValue(row.id))))
  ).filter((run): run is TaskRunView => run !== null);
}

async function taskIdForSession(sessionId: string): Promise<string | null> {
  const rows = (await db().query(
    `SELECT task_id FROM task_run_sessions WHERE session_id = $1 LIMIT 1`,
    [sessionId],
  )) as Row[];
  return rows[0] === undefined ? null : textValue(rows[0].task_id);
}

async function failTaskById(taskId: string, reason: string, actor = "system"): Promise<void> {
  const safeReason = redactEvidenceText(reason).slice(0, 1000);
  const rows = (await db().query(
    `WITH current AS (
       SELECT id, status FROM task_runs
       WHERE id = $1 AND status IN ('running', 'awaiting_approval')
       FOR UPDATE
     ), changed AS (
       UPDATE task_runs r
       SET status = 'failed', status_reason = $2, completed_at = now(), updated_at = now()
       FROM current c WHERE r.id = c.id
       RETURNING r.id, c.status AS from_status
     )
     SELECT id, from_status FROM changed`,
    [taskId, safeReason],
  )) as Row[];
  const changed = rows[0];
  if (changed === undefined) return;
  await Promise.all([
    db().query(
      `INSERT INTO task_transitions (task_id, from_status, to_status, actor, reason)
       VALUES ($1, $2, 'failed', $3, $4)`,
      [taskId, textValue(changed.from_status), actor, safeReason],
    ),
    db().query(
      `INSERT INTO task_milestones (task_id, kind, summary)
       VALUES ($1, 'task_failed', $2)`,
      [taskId, safeReason],
    ),
  ]);
}

export async function recordTaskModelStep(sessionId: string, costUsd = 0): Promise<void> {
  const rows = (await db().query(
    `UPDATE task_runs
     SET model_steps = model_steps + 1,
         estimated_cost_usd = estimated_cost_usd + $2,
         updated_at = now()
     WHERE id = (SELECT task_id FROM task_run_sessions WHERE session_id = $1)
       AND status = 'running'
     RETURNING id, model_steps, max_model_steps, estimated_cost_usd,
               max_estimated_cost_usd, deadline_at`,
    [sessionId, Math.max(0, costUsd)],
  )) as Row[];
  const row = rows[0];
  if (row === undefined) return;

  let reason: string | null = null;
  if (numberValue(row.model_steps) > numberValue(row.max_model_steps)) {
    reason = `Model-step hard stop reached (${numberValue(row.model_steps)}/${numberValue(row.max_model_steps)}).`;
  } else if (numberValue(row.estimated_cost_usd) >= numberValue(row.max_estimated_cost_usd)) {
    reason = `Estimated-cost hard stop reached ($${numberValue(row.estimated_cost_usd).toFixed(2)}/$${numberValue(row.max_estimated_cost_usd).toFixed(2)}).`;
  } else if (row.deadline_at !== null && new Date(isoValue(row.deadline_at)).getTime() < Date.now()) {
    reason = "15-minute runtime hard stop reached.";
  }
  if (reason !== null) {
    await failTaskById(textValue(row.id), reason);
    throw new Error(reason);
  }
}

export async function assertTaskBudget(sessionId: string): Promise<void> {
  const rows = (await db().query(
    `SELECT r.id, r.model_steps, r.max_model_steps, r.estimated_cost_usd,
            r.max_estimated_cost_usd, r.deadline_at
     FROM task_runs r
     JOIN task_run_sessions s ON s.task_id = r.id
     WHERE s.session_id = $1 AND r.status = 'running' LIMIT 1`,
    [sessionId],
  )) as Row[];
  const row = rows[0];
  if (row === undefined) return;
  let reason: string | null = null;
  if (numberValue(row.model_steps) >= numberValue(row.max_model_steps)) {
    reason = `Model-step hard stop reached (${numberValue(row.model_steps)}/${numberValue(row.max_model_steps)}).`;
  } else if (numberValue(row.estimated_cost_usd) >= numberValue(row.max_estimated_cost_usd)) {
    reason = `Estimated-cost hard stop reached ($${numberValue(row.estimated_cost_usd).toFixed(2)}/$${numberValue(row.max_estimated_cost_usd).toFixed(2)}).`;
  } else if (row.deadline_at !== null && new Date(isoValue(row.deadline_at)).getTime() < Date.now()) {
    reason = "15-minute runtime hard stop reached.";
  }
  if (reason !== null) {
    await failTaskById(textValue(row.id), reason);
    throw new Error(reason);
  }
}

function specialistRole(value: string): QaSpecialistRole | null {
  return QA_SPECIALISTS.some((specialist) => specialist.role === value)
    ? (value as QaSpecialistRole)
    : null;
}

export async function registerTaskSubagent(input: {
  parentSessionId: string;
  childSessionId: string;
  callId: string;
  name: string;
}): Promise<void> {
  const taskId = await taskIdForSession(input.parentSessionId);
  if (taskId === null) return;
  const role = specialistRole(input.name);
  if (role === null) {
    const reason = `Unapproved specialist attempted: ${input.name}`;
    await failTaskById(taskId, reason);
    throw new Error(reason);
  }

  const rows = (await db().query(
    `WITH assigned AS (
       UPDATE task_specialists s
       SET status = 'running', attempts = attempts + 1, active_session_id = $3,
           started_at = COALESCE(started_at, now()), error = NULL, updated_at = now()
       FROM task_runs r
       WHERE s.task_id = $1 AND s.role = $2 AND r.id = s.task_id
         AND r.status = 'running'
         AND s.status <> 'completed'
         AND s.attempts < (1 + r.max_retries_per_specialist)
       RETURNING s.task_id
     )
     INSERT INTO task_run_sessions (task_id, session_id, role, call_id)
     SELECT task_id, $3, $2, $4 FROM assigned
     RETURNING task_id`,
    [taskId, role, input.childSessionId, input.callId],
  )) as Row[];
  if (rows.length === 0) {
    const reason = `${role} exceeded its one-retry allowance or is already complete.`;
    await failTaskById(taskId, reason);
    throw new Error(reason);
  }

  await db().query(
    `INSERT INTO task_milestones (task_id, kind, summary, metadata)
     VALUES ($1, 'specialist_started', $2, $3::jsonb)`,
    [
      taskId,
      `${QA_SPECIALISTS.find((item) => item.role === role)!.label} started`,
      JSON.stringify({ role, callId: input.callId }),
    ],
  );
}

/**
 * Authoritatively binds a specialist session to an active task. Specialists
 * call this before browser work so their first completed step and every later
 * step count toward the shared 40-step and $5 budgets. The operation is
 * idempotent for a session and enforces the one-retry allowance atomically.
 */
export async function claimTaskSpecialist(input: {
  ownerId: string;
  taskId: string;
  sessionId: string;
  callId: string;
  role: QaSpecialistRole;
}): Promise<{ role: QaSpecialistRole; attempts: number; claimed: boolean }> {
  const existing = (await db().query(
    `SELECT role FROM task_run_sessions
     WHERE task_id = $1 AND session_id = $2 LIMIT 1`,
    [input.taskId, input.sessionId],
  )) as Row[];
  if (existing[0] !== undefined) {
    const existingRole = textValue(existing[0].role);
    if (existingRole !== input.role) throw new Error("This session is assigned to another task role.");
    const attempts = (await db().query(
      `SELECT attempts FROM task_specialists WHERE task_id = $1 AND role = $2 LIMIT 1`,
      [input.taskId, input.role],
    )) as Row[];
    return { role: input.role, attempts: numberValue(attempts[0]?.attempts), claimed: false };
  }

  const rows = (await db().query(
    `WITH assigned AS (
       UPDATE task_specialists s
       SET status = 'running', attempts = s.attempts + 1, active_session_id = $4,
           started_at = COALESCE(s.started_at, now()), error = NULL, updated_at = now()
       FROM task_runs r
       WHERE s.task_id = $1 AND s.role = $2 AND r.id = s.task_id
         AND r.owner_id = $3 AND r.status = 'running'
         AND s.status <> 'completed'
         AND s.attempts < (1 + r.max_retries_per_specialist)
       RETURNING s.task_id, s.attempts
     ), linked AS (
       INSERT INTO task_run_sessions (task_id, session_id, role, call_id)
       SELECT task_id, $4, $2, $5 FROM assigned
       RETURNING task_id
     )
     SELECT assigned.attempts FROM assigned JOIN linked USING (task_id)`,
    [input.taskId, input.role, input.ownerId, input.sessionId, input.callId],
  )) as Row[];
  const row = rows[0];
  if (row === undefined) {
    const reason = `${input.role} exceeded its one-retry allowance, is already complete, or the task is not active.`;
    await failTaskById(input.taskId, reason);
    throw new Error(reason);
  }

  await db().query(
    `INSERT INTO task_milestones (task_id, kind, summary, metadata)
     VALUES ($1, 'specialist_started', $2, $3::jsonb)`,
    [
      input.taskId,
      `${QA_SPECIALISTS.find((item) => item.role === input.role)!.label} started`,
      JSON.stringify({ role: input.role, callId: input.callId }),
    ],
  );
  return { role: input.role, attempts: numberValue(row.attempts), claimed: true };
}

export async function completeTaskSubagent(input: {
  parentSessionId: string;
  callId: string;
  name: string;
  summary: string;
}): Promise<void> {
  const taskId = await taskIdForSession(input.parentSessionId);
  if (taskId === null) return;
  const role = specialistRole(input.name);
  if (role === null) return;
  const safeSummary = redactEvidenceText(input.summary).slice(0, 4000);
  await db().transaction((tx) => [
    tx`UPDATE task_specialists
       SET status = 'completed', summary = ${safeSummary}, completed_at = now(), updated_at = now()
       WHERE task_id = ${taskId} AND role = ${role} AND status = 'running'`,
    tx`INSERT INTO task_milestones (task_id, kind, summary, metadata)
       VALUES (${taskId}, 'specialist_completed', ${`${QA_SPECIALISTS.find((item) => item.role === role)!.label} completed`},
         ${JSON.stringify({ role, callId: input.callId })}::jsonb)`,
  ]);
}

export async function failTaskSubagent(input: {
  parentSessionId: string;
  name: string;
  error: string;
}): Promise<void> {
  const taskId = await taskIdForSession(input.parentSessionId);
  const role = specialistRole(input.name);
  if (taskId === null || role === null) return;
  const safeError = redactEvidenceText(input.error).slice(0, 1000);
  await db().query(
    `UPDATE task_specialists SET status = 'failed', error = $3, updated_at = now()
     WHERE task_id = $1 AND role = $2 AND status = 'running'`,
    [taskId, role, safeError],
  );
}

export async function recordTaskArtifact(input: {
  taskId: string;
  sessionId: string;
  role?: QaSpecialistRole;
  checkSlug?: string;
  kind: "screenshot" | "report" | "log" | "json";
  filename: string;
  contentType: string;
  storageKey: string;
  sizeBytes: number;
  sha256: string;
  status?: "passed" | "failed" | "blocked";
  summary?: string;
}): Promise<{ artifactId: string; checkId: string | null }> {
  const authorizedRows = (await db().query(
    `SELECT s.role FROM task_run_sessions s
     JOIN task_runs r ON r.id = s.task_id
     WHERE s.task_id = $1 AND s.session_id = $2 AND r.status = 'running' LIMIT 1`,
    [input.taskId, input.sessionId],
  )) as Row[];
  if (authorizedRows[0] === undefined) throw new Error("This session is not assigned to the task.");
  const assignedRole = textValue(authorizedRows[0].role);
  if (input.role !== undefined && assignedRole !== input.role && assignedRole !== "orchestrator") {
    throw new Error("This specialist cannot record evidence for another role.");
  }
  const artifactId = `artifact_${randomUUID()}`;
  let checkId: string | null = null;
  if (input.checkSlug !== undefined) {
    const rows = (await db().query(
      `SELECT id FROM task_acceptance_checks
       WHERE task_id = $1 AND slug = $2
         AND ($3::text IS NULL OR specialist_role = $3)
       LIMIT 1`,
      [input.taskId, input.checkSlug, input.role ?? null],
    )) as Row[];
    if (rows[0] === undefined) throw new Error("Acceptance check does not belong to this task and specialist.");
    checkId = textValue(rows[0].id);
  }
  const safeSummary = input.summary ? redactEvidenceText(input.summary).slice(0, 2000) : null;
  await db().transaction((tx) => [
    tx`INSERT INTO task_artifacts (
      id, task_id, check_id, specialist_role, kind, filename, content_type,
      storage_key, size_bytes, sha256, redacted
    ) VALUES (
      ${artifactId}, ${input.taskId}, ${checkId}, ${input.role ?? null}, ${input.kind},
      ${input.filename.slice(0, 240)}, ${input.contentType.slice(0, 160)}, ${input.storageKey},
      ${input.sizeBytes}, ${input.sha256}, true
    )`,
    ...(checkId !== null && input.status !== undefined
      ? [tx`UPDATE task_acceptance_checks
           SET status = ${input.status}, result_summary = ${safeSummary}, checked_at = now(), updated_at = now()
           WHERE id = ${checkId}`]
      : []),
    tx`INSERT INTO task_milestones (task_id, kind, summary, metadata)
       VALUES (${input.taskId}, 'evidence_recorded', ${safeSummary ?? `Stored ${input.kind} evidence`},
         ${JSON.stringify({ artifactId, checkSlug: input.checkSlug ?? null, role: input.role ?? null })}::jsonb)`,
  ]);
  if (input.role !== undefined) {
    const completed = (await db().query(
      `UPDATE task_specialists s
       SET status = 'completed', completed_at = now(), updated_at = now()
       WHERE s.task_id = $1 AND s.role = $2 AND s.status = 'running'
         AND NOT EXISTS (
           SELECT 1 FROM task_acceptance_checks c
           WHERE c.task_id = s.task_id AND c.specialist_role = s.role AND c.required
             AND (
               c.status <> 'passed'
               OR NOT EXISTS (SELECT 1 FROM task_artifacts a WHERE a.check_id = c.id)
             )
         )
       RETURNING s.task_id`,
      [input.taskId, input.role],
    )) as Row[];
    if (completed.length > 0) {
      await db().query(
        `INSERT INTO task_milestones (task_id, kind, summary, metadata)
         VALUES ($1, 'specialist_completed', $2, $3::jsonb)`,
        [
          input.taskId,
          `${QA_SPECIALISTS.find((item) => item.role === input.role)!.label} completed`,
          JSON.stringify({ role: input.role, source: "required-evidence" }),
        ],
      );
    }
  }
  return { artifactId, checkId };
}

export async function completeTask(ownerId: string, taskId: string): Promise<TaskRunView> {
  const run = await getTaskRun(ownerId, taskId);
  if (run === null) throw new Error("Task not found.");
  if (run.status !== "running") throw new Error(`Task cannot complete from ${run.status}.`);
  const incompleteSpecialists = run.specialists.filter((item) => item.status !== "completed");
  const incompleteChecks = run.checks.filter(
    (check) => check.required && (check.status !== "passed" || check.artifactCount < 1),
  );
  if (run.specialists.length !== run.guardrails.maxSpecialists || incompleteSpecialists.length > 0) {
    throw new Error("All three approved specialists must complete before the task can complete.");
  }
  if (incompleteChecks.length > 0) {
    throw new Error("Every required acceptance check must pass with stored evidence.");
  }
  if (
    run.usage.modelSteps > run.guardrails.maxModelSteps ||
    run.usage.estimatedCostUsd >= run.guardrails.maxEstimatedCostUsd ||
    (run.deadlineAt !== null && new Date(run.deadlineAt).getTime() < Date.now())
  ) {
    await failTaskById(taskId, "A Balanced guardrail was exceeded before completion.");
    throw new Error("A Balanced guardrail was exceeded before completion.");
  }

  const completed = (await db().query(
    `WITH changed AS (
       UPDATE task_runs
       SET status = 'completed', status_reason = NULL, completed_at = now(), updated_at = now()
       WHERE id = $1 AND owner_id = $2 AND status = 'running'
       RETURNING id
     )
     INSERT INTO task_transitions (task_id, from_status, to_status, actor, reason)
     SELECT id, 'running', 'completed', 'agent', 'All required checks passed with stored evidence'
     FROM changed RETURNING task_id`,
    [taskId, ownerId],
  )) as Row[];
  if (completed.length === 0) throw new Error("Task state changed before completion could be recorded.");
  await db().query(
    `INSERT INTO task_milestones (task_id, kind, summary)
     VALUES ($1, 'task_completed', 'All critical-path checks passed with stored evidence')`,
    [taskId],
  );
  return (await getTaskRun(ownerId, taskId))!;
}

export async function transitionTask(
  ownerId: string,
  taskId: string,
  to: TaskStatus,
  actor: "owner" | "agent",
  reason?: string,
): Promise<TaskRunView> {
  const current = await getTaskRun(ownerId, taskId);
  if (current === null) throw new Error("Task not found.");
  if (!canTransitionTask(current.status, to)) {
    throw new Error(`Task cannot transition from ${current.status} to ${to}.`);
  }
  const safeReason = reason ? redactEvidenceText(reason).slice(0, 1000) : null;
  const changed = (await db().query(
    `WITH updated AS (
       UPDATE task_runs SET status = $3, status_reason = $5,
         started_at = CASE WHEN $3 = 'running' THEN COALESCE(started_at, now()) ELSE started_at END,
         deadline_at = CASE WHEN $3 = 'running' THEN now() + (max_duration_seconds * interval '1 second') ELSE deadline_at END,
         completed_at = CASE
           WHEN $3 = 'failed' THEN now()
           WHEN $3 IN ('queued', 'running') THEN NULL
           ELSE completed_at
         END,
         cancelled_at = CASE WHEN $3 = 'cancelled' THEN now() ELSE cancelled_at END,
         updated_at = now()
       WHERE id = $1 AND owner_id = $2 AND status = $4
       RETURNING id
     )
     INSERT INTO task_transitions (task_id, from_status, to_status, actor, reason)
     SELECT id, $4, $3, $6, $5 FROM updated RETURNING task_id`,
    [taskId, ownerId, to, current.status, safeReason, actor],
  )) as Row[];
  if (changed.length === 0) throw new Error("Task state changed before this transition could be recorded.");
  await db().query(
    `INSERT INTO task_milestones (task_id, kind, summary)
     VALUES ($1, 'status_changed', $2)`,
    [taskId, `Task ${to}${safeReason ? `: ${safeReason}` : ""}`],
  );
  return (await getTaskRun(ownerId, taskId))!;
}

export async function taskRootSession(ownerId: string, taskId: string): Promise<string | null> {
  const rows = (await db().query(
    `SELECT s.session_id FROM task_run_sessions s
     JOIN task_runs r ON r.id = s.task_id
     WHERE r.owner_id = $1 AND r.id = $2 AND s.role = 'orchestrator' LIMIT 1`,
    [ownerId, taskId],
  )) as Row[];
  return rows[0] === undefined ? null : textValue(rows[0].session_id);
}

export async function artifactStorageKey(
  ownerId: string,
  taskId: string,
  artifactId: string,
): Promise<{ storageKey: string; contentType: string; filename: string } | null> {
  const rows = (await db().query(
    `SELECT a.storage_key, a.content_type, a.filename
     FROM task_artifacts a JOIN task_runs r ON r.id = a.task_id
     WHERE r.owner_id = $1 AND r.id = $2 AND a.id = $3 LIMIT 1`,
    [ownerId, taskId, artifactId],
  )) as Row[];
  const row = rows[0];
  return row === undefined
    ? null
    : {
        storageKey: textValue(row.storage_key),
        contentType: textValue(row.content_type),
        filename: textValue(row.filename),
      };
}
