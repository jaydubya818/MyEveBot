import { db } from "../agent/lib/receipts-db.ts";
import { CONTROL_VIEWS, type ControlCenterSummary, type ControlRunView, type ControlView } from "./control-center-types.ts";
import type { TaskStatus } from "./task-types.ts";

type Row = Record<string, unknown>;

function text(value: unknown): string { return typeof value === "string" ? value : String(value ?? ""); }
function nullableText(value: unknown): string | null { return value == null ? null : text(value); }
function iso(value: unknown): string { return value instanceof Date ? value.toISOString() : text(value); }
function nullableIso(value: unknown): string | null { return value == null ? null : iso(value); }
function number(value: unknown): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }

export const ACTIONABLE_APPROVAL_PREDICATE = `
  ad.owner_id = r.owner_id
  AND ad.task_id = r.id
  AND ad.status = 'pending'
  AND ad.expires_at > now()
  AND ad.binding_hash ~ '^[0-9a-f]{64}$'
  AND ad.goal_id IS NOT DISTINCT FROM r.goal_id
  AND ad.goal_task_id IS NOT DISTINCT FROM r.goal_task_id
  AND ad.agent_id IS NOT DISTINCT FROM r.agent_id
  AND ad.role_id IS NOT DISTINCT FROM r.role_id
`;

interface ApprovalProjection {
  ownerId: string;
  taskId: string;
  status: string;
  expiresAt: string;
  bindingHash: string | null;
  goalId: string | null;
  goalTaskId: string | null;
  agentId: string | null;
  roleId: string | null;
}

interface RunProjection {
  ownerId: string;
  id: string;
  goalId: string | null;
  goalTaskId: string | null;
  agentId: string | null;
  roleId: string | null;
}

export function isActionableApprovalProjection(
  approval: ApprovalProjection,
  run: RunProjection,
  now = Date.now(),
): boolean {
  return approval.ownerId === run.ownerId
    && approval.taskId === run.id
    && approval.status === "pending"
    && Date.parse(approval.expiresAt) > now
    && /^[0-9a-f]{64}$/.test(approval.bindingHash ?? "")
    && approval.goalId === run.goalId
    && approval.goalTaskId === run.goalTaskId
    && approval.agentId === run.agentId
    && approval.roleId === run.roleId;
}

export function controlViewForStatus(status: TaskStatus): Exclude<ControlView, "all"> {
  if (status === "running") return "working";
  if (status === "awaiting_approval") return "approval";
  if (status === "waiting_for_owner") return "needs_owner";
  if (status === "failed") return "failed";
  if (status === "completed" || status === "cancelled") return "completed";
  return "waiting";
}

export function controlViewForRun(status: TaskStatus, approvalsPending: number): Exclude<ControlView, "all"> {
  return status === "awaiting_approval" && approvalsPending < 1
    ? "waiting"
    : controlViewForStatus(status);
}

export function actionsForStatus(status: TaskStatus): ControlRunView["availableActions"] {
  if (status === "running" || status === "awaiting_approval") return ["view", "pause", "cancel"];
  if (status === "paused") return ["view", "resume", "cancel"];
  if (status === "waiting_for_owner") return ["view", "cancel"];
  if (status === "failed") return ["view", "retry"];
  return ["view"];
}

function waitingReason(row: Row, status: TaskStatus, approvalsPending: number): string | null {
  const explicit = nullableText(row.status_reason);
  if (status === "awaiting_approval" && approvalsPending < 1) return "The previous approval is no longer actionable. Retry or cancel this Run.";
  if ((status === "queued" || status === "paused" || status === "awaiting_approval" || status === "waiting_for_owner") && explicit) return explicit;
  if (status === "queued") return "Queued for execution.";
  if (status === "paused") return "Paused by the owner at a durable checkpoint.";
  if (status === "awaiting_approval") return "Waiting for an owner approval.";
  if (status === "waiting_for_owner") return "Sofie needs you to take over.";
  return null;
}

export async function getControlCenter(input: {
  ownerId: string;
  view?: ControlView;
  query?: string;
  agentId?: string;
  roleId?: string;
  goalId?: string;
  capabilityId?: string;
  provider?: string;
  from?: string;
  limit?: number;
}): Promise<ControlCenterSummary> {
  const view = input.view && CONTROL_VIEWS.includes(input.view) ? input.view : "all";
  const query = input.query?.trim().slice(0, 160) || null;
  const params: unknown[] = [input.ownerId];
  const where = ["r.owner_id = $1"];
  const add = (condition: string, value: unknown) => { params.push(value); where.push(condition.replace("?", `$${params.length}`)); };
  if (query) {
    params.push(query);
    const search = `$${params.length}`;
    where.push(`(r.id ILIKE '%' || ${search} || '%' OR r.title ILIKE '%' || ${search} || '%' OR coalesce(r.objective,'') ILIKE '%' || ${search} || '%')`);
  }
  if (input.agentId) add("r.agent_id = ?", input.agentId);
  if (input.roleId) add("r.role_id = ?", input.roleId);
  if (input.goalId) add("r.goal_id = ?", input.goalId);
  if (input.capabilityId) add("EXISTS (SELECT 1 FROM agent_capabilities ac WHERE ac.owner_id=r.owner_id AND ac.agent_id=r.agent_id AND ac.capability_id=? AND ac.enabled)", input.capabilityId);
  if (input.provider) add("coalesce(cs.environment_type, 'none') = ?", input.provider);
  if (input.from) add("r.updated_at >= ?::timestamptz", input.from);
  const countWhere = [...where];
  const countParams = [...params];
  const statusByView: Partial<Record<ControlView, string[]>> = {
    working: ["running"], needs_owner:["waiting_for_owner"],
    failed: ["failed"], completed: ["completed", "cancelled"],
  };
  if (view === "approval") {
    where.push(`r.status = 'awaiting_approval' AND EXISTS (SELECT 1 FROM task_approval_decisions ad WHERE ${ACTIONABLE_APPROVAL_PREDICATE})`);
  } else if (view === "waiting") {
    where.push(`(r.status = ANY(ARRAY['queued','paused']::text[]) OR (r.status = 'awaiting_approval' AND NOT EXISTS (SELECT 1 FROM task_approval_decisions ad WHERE ${ACTIONABLE_APPROVAL_PREDICATE})))`);
  } else if (view !== "all") {
    add("r.status = ANY(?::text[])", statusByView[view]);
  }
  const limit = Math.max(1, Math.min(100, input.limit ?? 50));
  params.push(limit);

  const rows = await db().query(
    `SELECT r.*, a.name AS agent_name, a.is_primary, g.title AS goal_title, gt.title AS goal_task_title,
       root.session_id AS runtime_session_id,
       cs.id AS computer_id, cs.status AS computer_status, cs.environment_type,cs.controller AS computer_controller,cs.control_version,
       milestone.summary AS current_action,
       (SELECT count(*)::int FROM task_approval_decisions ad WHERE ${ACTIONABLE_APPROVAL_PREDICATE}) AS approvals_pending,
       (SELECT count(*)::int FROM task_acceptance_checks tc WHERE tc.task_id=r.id) AS progress_total,
       (SELECT count(*)::int FROM task_acceptance_checks tc WHERE tc.task_id=r.id AND tc.status='passed') AS progress_completed
     FROM task_runs r
     LEFT JOIN agents a ON a.owner_id=r.owner_id AND a.id=r.agent_id
     LEFT JOIN goals g ON g.id=r.goal_id
     LEFT JOIN goal_tasks gt ON gt.id=r.goal_task_id
     LEFT JOIN LATERAL (SELECT session_id FROM task_run_sessions trs WHERE trs.task_id=r.id AND trs.role='orchestrator' LIMIT 1) root ON true
     LEFT JOIN LATERAL (SELECT x.id,x.status,x.environment_type,l.controller,l.version AS control_version FROM computer_sessions x JOIN computer_control_leases l ON l.computer_session_id=x.id WHERE x.owner_id=r.owner_id AND x.run_id=r.id ORDER BY x.last_activity_at DESC LIMIT 1) cs ON true
     LEFT JOIN LATERAL (SELECT summary FROM task_milestones tm WHERE tm.task_id=r.id ORDER BY tm.created_at DESC,tm.id DESC LIMIT 1) milestone ON true
     WHERE ${where.join(" AND ")}
     ORDER BY r.updated_at DESC,r.id DESC LIMIT $${params.length}`,
    params,
  ) as Row[];

  const countRows = await db().query(
    `SELECT r.status,count(*)::int AS count,
       count(*) FILTER (WHERE r.status <> 'awaiting_approval' OR EXISTS (SELECT 1 FROM task_approval_decisions ad WHERE ${ACTIONABLE_APPROVAL_PREDICATE}))::int AS actionable_count
     FROM task_runs r
     LEFT JOIN LATERAL (SELECT environment_type FROM computer_sessions x WHERE x.owner_id=r.owner_id AND x.run_id=r.id ORDER BY x.last_activity_at DESC LIMIT 1) cs ON true
     WHERE ${countWhere.join(" AND ")}
     GROUP BY r.status`,
    countParams,
  ) as Row[];

  const runs = rows.map((row): ControlRunView => {
    const status = text(row.status) as TaskStatus;
    const progressTotal = number(row.progress_total);
    const approvalsPending = number(row.approvals_pending);
    return {
      id: text(row.id), title: text(row.title), objective: nullableText(row.objective),
      expectedOutput: nullableText(row.expected_output), taskStatus: status, view: controlViewForRun(status, number(row.approvals_pending)),
      currentAction: nullableText(row.current_action), waitingReason: waitingReason(row, status, approvalsPending), statusReason: nullableText(row.status_reason),
      agent: {
        id: nullableText(row.agent_id), name: nullableText(row.agent_name) ?? "MyEve",
        executorKind: row.is_primary === true ? "primary-agent" : nullableText(row.agent_id) ? "persistent-agent" : nullableText(row.role_id) ? "on-demand-role" : "unattributed",
        roleId: nullableText(row.role_id),
      },
      goal: row.goal_id == null ? null : { id: text(row.goal_id), title: nullableText(row.goal_title) ?? "Untitled goal" },
      goalTask: row.goal_task_id == null ? null : { id: text(row.goal_task_id), title: nullableText(row.goal_task_title) ?? "Untitled task" },
      threadId: nullableText(row.thread_id), runtimeSessionId: nullableText(row.runtime_session_id),
      provider: { execution: "eve", computer: nullableText(row.environment_type) },
      computer: row.computer_id == null ? null : { id: text(row.computer_id), status: text(row.computer_status), controller:text(row.computer_controller),controlVersion:number(row.control_version) },
      progress: progressTotal > 0
        ? { completed: number(row.progress_completed), total: progressTotal, label: "acceptance checks" }
        : number(row.max_model_steps) > 0
          ? { completed: number(row.model_steps), total: number(row.max_model_steps), label: "model steps" }
          : null,
      cost: { estimatedUsd: row.estimated_cost_usd == null ? null : number(row.estimated_cost_usd), actualUsd: null },
      approvalsPending, startedAt: nullableIso(row.started_at), completedAt: nullableIso(row.completed_at),
      updatedAt: iso(row.updated_at), availableActions: actionsForStatus(status),
    };
  });
  const counts = Object.fromEntries(CONTROL_VIEWS.map((item) => [item, 0])) as Record<ControlView, number>;
  for (const row of countRows) {
    const count = number(row.count);
    counts.all += count;
    const status = text(row.status) as TaskStatus;
    if (status === "awaiting_approval") {
      const actionable = number(row.actionable_count);
      counts.approval += actionable;
      counts.waiting += count - actionable;
    } else {
      counts[controlViewForStatus(status)] += count;
    }
  }
  return { runs, counts, applied: { view, query } };
}
