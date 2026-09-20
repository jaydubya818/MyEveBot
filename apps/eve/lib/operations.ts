import {blockExternalWrite} from "./external-write-policy.ts";
import { randomUUID } from "node:crypto";

import { db } from "../agent/lib/receipts-db.ts";
import { expireComputerSessions } from "./computer-sessions.ts";
import { redactEvidenceText } from "./task-types.ts";

type Row = Record<string, unknown>;

export type OperationsState = "healthy" | "warning" | "critical";

export interface OperationsSignal {
  id: "routine_preflight_blocked" | "failed_turns" | "stuck_runs" | "orphaned_computers" | "routine_failures" | "model_limits" | "artifact_failures";
  label: string;
  state: OperationsState;
  count: number;
  detail: string;
}

export interface OperationsReport {
  overall: OperationsState;
  checkedAt: string;
  windowHours: number;
  signals: OperationsSignal[];
}

export interface OperationsCounts {
  routinePreflightBlocks?:number;
  failedTurns: number;
  stuckRuns: number;
  orphanedComputers: number;
  routineFailures: number;
  modelLimits: number;
  artifactFailures: number;
}

function count(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stateFor(value: number, criticalAt: number): OperationsState {
  if (value >= criticalAt) return "critical";
  if (value > 0) return "warning";
  return "healthy";
}

export function operationsReportFromCounts(
  counts: OperationsCounts,
  checkedAt = new Date().toISOString(),
): OperationsReport {
  const signals: OperationsSignal[] = [
    { id: "failed_turns", label: "Failed turns", state: stateFor(counts.failedTurns, 5), count: counts.failedTurns, detail: "Turn and session failures during the last 24 hours." },
    { id: "stuck_runs", label: "Stuck Runs", state: stateFor(counts.stuckRuns, 1), count: counts.stuckRuns, detail: "Work or Agent Runs still active beyond their runtime boundary." },
    { id: "orphaned_computers", label: "Computer cleanup", state: stateFor(counts.orphanedComputers, 1), count: counts.orphanedComputers, detail: "Expired sessions or actions that still appear active." },
    { id: "routine_failures", label: "Routine delivery", state: stateFor(counts.routineFailures, 3), count: counts.routineFailures, detail: "Routine or review-delivery failures during the last 24 hours." },
    { id: "model_limits", label: "Model limits", state: stateFor(counts.modelLimits, 3), count: counts.modelLimits, detail: "Runtime, step, cost, or provider-limit stops during the last 24 hours." },
    { id: "artifact_failures", label: "Artifact delivery", state: stateFor(counts.artifactFailures, 3), count: counts.artifactFailures, detail: "Artifact creation, upload, or delivery failures during the last 24 hours." },
  ];
  if(counts.routinePreflightBlocks!==undefined)signals.push({id:"routine_preflight_blocked",label:"Routine preflight",state:stateFor(counts.routinePreflightBlocks,100),count:counts.routinePreflightBlocks,detail:"Scheduled work blocked before execution in the last 24 hours. Review Routine readiness."});
  const overall = signals.some((signal) => signal.state === "critical")
    ? "critical"
    : signals.some((signal) => signal.state === "warning") ? "warning" : "healthy";
  return { overall, checkedAt, windowHours: 24, signals };
}

export async function getOperationsReport(ownerId: string): Promise<OperationsReport> {
  const rows = await db().query(
    `SELECT
      (SELECT count(*) FROM execution_occurrences WHERE owner_id=$1 AND status='blocked_precheck' AND scheduled_for>=now()-interval '24 hours') AS routine_preflight_blocked,
      (SELECT count(*) FROM eve_events WHERE owner_id=$1 AND type IN ('TURN_FAILED','SESSION_FAILED') AND occurred_at >= now()-interval '24 hours') AS failed_turns,
      ((SELECT count(*) FROM task_runs WHERE owner_id=$1 AND ((status='running' AND (deadline_at < now() OR updated_at < now()-interval '30 minutes')) OR (status IN ('awaiting_approval','waiting_for_owner') AND deadline_at < now()))) +
       (SELECT count(*) FROM agent_runs r JOIN agents a ON a.owner_id=r.owner_id AND a.id=r.agent_id WHERE r.owner_id=$1 AND r.status='running' AND r.started_at+(a.max_runtime_seconds*interval '1 second') < now())) AS stuck_runs,
      ((SELECT count(*) FROM computer_sessions WHERE owner_id=$1 AND status IN ('provisioning','ready','running','paused') AND expires_at <= now()) +
       (SELECT count(*) FROM computer_actions a JOIN computer_sessions s ON s.id=a.computer_session_id WHERE s.owner_id=$1 AND a.status='running' AND a.started_at < now()-interval '10 minutes')) AS orphaned_computers,
      ((SELECT count(*) FROM automation_runs WHERE status='error' AND fired_at >= now()-interval '24 hours') +
       (SELECT count(*) FROM review_deliveries WHERE owner_id=$1 AND status='failed' AND updated_at >= now()-interval '24 hours')) AS routine_failures,
      (SELECT count(*) FROM eve_events WHERE owner_id=$1 AND type='MODEL_LIMIT_HIT' AND occurred_at >= now()-interval '24 hours') AS model_limits,
      (SELECT count(*) FROM eve_events WHERE owner_id=$1 AND type='ARTIFACT_FAILURE' AND occurred_at >= now()-interval '24 hours') AS artifact_failures`,
    [ownerId],
  ) as Row[];
  const row = rows[0] ?? {};
  return operationsReportFromCounts({
    routinePreflightBlocks:count(row.routine_preflight_blocked),
    failedTurns: count(row.failed_turns),
    stuckRuns: count(row.stuck_runs),
    orphanedComputers: count(row.orphaned_computers),
    routineFailures: count(row.routine_failures),
    modelLimits: count(row.model_limits),
    artifactFailures: count(row.artifact_failures),
  });
}

export async function recordOperationsEvent(input: {
  ownerId: string;
  type: "TURN_FAILED" | "SESSION_FAILED" | "MODEL_LIMIT_HIT" | "ARTIFACT_FAILURE";
  sourceType: string;
  sourceId: string;
  summary: string;
  payload?: Record<string, unknown>;
  severity?: "warning" | "critical";
}): Promise<void> {
  await db().query(
    `INSERT INTO eve_events (id,owner_id,type,source_type,source_id,severity,summary,payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
    [
      `event_${randomUUID()}`,
      input.ownerId,
      input.type,
      input.sourceType,
      input.sourceId,
      input.severity ?? "warning",
      redactEvidenceText(input.summary).slice(0, 500),
      JSON.stringify(input.payload ?? {}),
    ],
  );
}

export async function runOperationsCleanup(now = new Date()): Promise<{
  expiredComputers: number;
  timedOutActions: number;
  failedTaskRuns: number;
  failedAgentRuns: number;
}> {
  const expiredComputers = await expireComputerSessions(now);
  const [actionRows, taskRows, agentRows] = await Promise.all([
    db().query(
      `UPDATE computer_actions SET status='timed_out',completed_at=$1,failure_code='action_timeout',failure_summary='The action did not settle within 10 minutes.'
       WHERE status='running' AND started_at < $1::timestamptz-interval '10 minutes' RETURNING id`,
      [now.toISOString()],
    ) as Promise<Row[]>,
    db().query(
      `WITH candidates AS (
         SELECT id,owner_id,status FROM task_runs
         WHERE status IN ('running','awaiting_approval','waiting_for_owner') AND deadline_at < $1 FOR UPDATE
       ), changed AS (
         UPDATE task_runs r SET status='failed',status_reason='Run exceeded its runtime boundary.',completed_at=$1,updated_at=$1
         FROM candidates c WHERE r.id=c.id RETURNING r.id,r.owner_id,c.status AS from_status
       ) SELECT * FROM changed`,
      [now.toISOString()],
    ) as Promise<Row[]>,
    db().query(
      `UPDATE agent_runs r SET status='failed',completed_at=$1,updated_at=$1
       FROM agents a WHERE r.owner_id=a.owner_id AND r.agent_id=a.id AND r.status='running'
       AND r.started_at + (a.max_runtime_seconds*interval '1 second') < $1 RETURNING r.id,r.owner_id`,
      [now.toISOString()],
    ) as Promise<Row[]>,
  ]);
  for (const row of taskRows) {
    await db().transaction((tx) => [
      tx`INSERT INTO task_transitions (task_id,from_status,to_status,actor,reason) VALUES (${row.id},${row.from_status},'failed','system','Run exceeded its runtime boundary.')`,
      tx`INSERT INTO task_milestones (task_id,kind,summary) VALUES (${row.id},'task_failed','Run exceeded its runtime boundary.')`,
      tx`INSERT INTO eve_events (id,owner_id,type,source_type,source_id,run_id,severity,summary) VALUES (${`event_${randomUUID()}`},${row.owner_id},'STALE_RUN_CLEANED','task_run',${row.id},${row.id},'critical','Stale Run was failed automatically')`,
    ]);
  }
  for (const row of agentRows) {
    await db().query(
      `INSERT INTO eve_events (id,owner_id,type,source_type,source_id,severity,summary) VALUES ($1,$2,'STALE_RUN_CLEANED','agent_run',$3,'critical','Stale Agent Run was failed automatically')`,
      [`event_${randomUUID()}`, row.owner_id, row.id],
    );
  }
  return { expiredComputers, timedOutActions: actionRows.length, failedTaskRuns: taskRows.length, failedAgentRuns: agentRows.length };
}

async function sendAlert(ownerId: string, report: OperationsReport): Promise<void> {
  const url = process.env.MYEVE_ALERT_WEBHOOK_URL?.trim();
  if (!url || report.overall === "healthy") return;
  const recent = await db().query(
    `SELECT 1 FROM eve_events WHERE owner_id=$1 AND type='OPERATIONS_ALERT_SENT' AND occurred_at >= now()-interval '1 hour' LIMIT 1`,
    [ownerId],
  ) as Row[];
  if (recent.length > 0) return;
  blockExternalWrite("operations.webhook");
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ product: "MyEve", state: report.overall, checkedAt: report.checkedAt, signals: report.signals.filter((signal) => signal.state !== "healthy") }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Alert webhook returned ${response.status}.`);
  await db().query(
    `INSERT INTO eve_events (id,owner_id,type,source_type,severity,summary,payload) VALUES ($1,$2,'OPERATIONS_ALERT_SENT','operations','warning','Operations alert delivered',$3::jsonb)`,
    [`event_${randomUUID()}`, ownerId, JSON.stringify({ state: report.overall })],
  );
}

export async function runOperationsMonitor(): Promise<void> {
  await runOperationsCleanup();
  const owners = await db().query(`SELECT DISTINCT owner_id FROM agents`) as Row[];
  for (const row of owners) {
    const ownerId = String(row.owner_id);
    const report = await getOperationsReport(ownerId);
    await sendAlert(ownerId, report).catch((error) => {
      console.error("operations_alert_failed", { ownerId, error: error instanceof Error ? error.message : String(error) });
    });
  }
}
