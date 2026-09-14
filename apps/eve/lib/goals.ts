import { randomUUID } from "node:crypto";

import { db } from "../agent/lib/receipts-db.ts";
import { getCapability } from "./capability-registry.ts";
import { rankFocusCandidates } from "./goal-focus.ts";
import {
  calculateProgress,
  canTransitionGoal,
  canTransitionGoalTask,
  type GoalDetailView,
  type GoalEventView,
  type GoalFocusItem,
  type GoalMilestoneView,
  type GoalPlanView,
  type GoalPriority,
  type GoalStatus,
  type GoalSummaryView,
  type GoalTaskStatus,
  type GoalTaskView,
  type MilestoneStatus,
  type PlanningMode,
} from "./goal-types.ts";

type Row = Record<string, unknown>;

function text(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function nullableText(value: unknown): string | null {
  return value === null || value === undefined ? null : text(value);
}

function number(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : number(value);
}

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : text(value);
}

function nullableIso(value: unknown): string | null {
  return value === null || value === undefined ? null : iso(value);
}

function nullableDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return text(value).slice(0, 10);
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function cleanText(value: string, max: number): string {
  return value.replaceAll("\0", "").trim().slice(0, max);
}

function eventSummary(value: string): string {
  return cleanText(value, 500);
}

function eventId(): string {
  return `event_${randomUUID()}`;
}

function assertGoalMutable(goal: Pick<GoalSummaryView, "status">): void {
  if (["completed", "abandoned", "archived"].includes(goal.status)) {
    throw new Error(`A ${goal.status} goal cannot be structurally changed.`);
  }
}

function goalId(): string {
  return `goal_${randomUUID()}`;
}

function planId(): string {
  return `plan_${randomUUID()}`;
}

function milestoneId(): string {
  return `milestone_${randomUUID()}`;
}

function taskId(): string {
  return `gtask_${randomUUID()}`;
}

function goalSummary(row: Row): GoalSummaryView {
  return {
    id: text(row.id),
    title: text(row.title),
    description: text(row.description),
    motivation: text(row.motivation),
    status: text(row.status) as GoalStatus,
    priority: text(row.priority) as GoalPriority,
    planningMode: text(row.planning_mode) as PlanningMode,
    successCriteria: stringArray(row.success_criteria),
    targetDate: nullableDate(row.target_date),
    source: text(row.source),
    sourceReference: nullableText(row.source_reference),
    startedAt: nullableIso(row.started_at),
    completedAt: nullableIso(row.completed_at),
    archivedAt: nullableIso(row.archived_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    progress: number(row.progress),
    taskCount: number(row.task_count),
    completedTaskCount: number(row.completed_task_count),
  };
}

function planView(row: Row): GoalPlanView {
  return {
    id: text(row.id),
    version: number(row.version),
    status: text(row.status) as GoalPlanView["status"],
    summary: text(row.summary),
    strategy: text(row.strategy),
    createdAt: iso(row.created_at),
    supersededAt: nullableIso(row.superseded_at),
  };
}

function milestoneView(row: Row, tasks: readonly GoalTaskView[]): GoalMilestoneView {
  return {
    id: text(row.id),
    title: text(row.title),
    description: text(row.description),
    status: text(row.status) as MilestoneStatus,
    targetDate: nullableDate(row.target_date),
    completedAt: nullableIso(row.completed_at),
    position: number(row.position),
    successCriteria: stringArray(row.success_criteria),
    progress: calculateProgress(tasks.filter((task) => task.milestoneId === text(row.id))).progress,
  };
}

function eventView(row: Row): GoalEventView {
  return {
    id: text(row.id),
    type: text(row.type),
    severity: text(row.severity) as GoalEventView["severity"],
    summary: text(row.summary),
    rationale: stringArray(row.rationale),
    occurredAt: iso(row.occurred_at),
  };
}

function unavailableCapabilities(ids: readonly string[], env: NodeJS.ProcessEnv): string[] {
  return ids.filter((id) => getCapability(id, env)?.availability.status !== "available");
}

function taskView(
  row: Row,
  dependencies: ReadonlyMap<string, string[]>,
  completedIds: ReadonlySet<string>,
  env: NodeJS.ProcessEnv,
): GoalTaskView {
  const id = text(row.id);
  const dependencyIds = dependencies.get(id) ?? [];
  const requiredCapabilities = stringArray(row.required_capabilities);
  return {
    id,
    goalId: text(row.goal_id),
    milestoneId: nullableText(row.milestone_id),
    parentTaskId: nullableText(row.parent_task_id),
    title: text(row.title),
    description: text(row.description),
    status: text(row.status) as GoalTaskStatus,
    priority: text(row.priority) as GoalPriority,
    dueAt: nullableIso(row.due_at),
    assignedTo: nullableText(row.assigned_to),
    requiredCapabilities,
    successCriteria: stringArray(row.success_criteria),
    estimatedEffortMinutes: nullableNumber(row.estimated_effort_minutes),
    estimatedCostUsd: nullableNumber(row.estimated_cost_usd),
    position: number(row.position),
    startedAt: nullableIso(row.started_at),
    completedAt: nullableIso(row.completed_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    dependencyIds,
    blockedByDependencies: dependencyIds.some((dependencyId) => !completedIds.has(dependencyId)),
    unavailableCapabilities: unavailableCapabilities(requiredCapabilities, env),
  };
}

function nextActionForGoal(
  goal: Pick<GoalSummaryView, "id" | "title" | "status" | "priority" | "targetDate">,
  tasks: readonly GoalTaskView[],
): GoalFocusItem | null {
  return rankFocusCandidates(
    tasks.map((task) => ({ goal, task })),
  )[0] ?? null;
}

function groupByGoal<T>(
  rows: readonly Row[],
  project: (row: Row) => T,
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const goalIdValue = text(row.goal_id);
    grouped.set(goalIdValue, [...(grouped.get(goalIdValue) ?? []), project(row)]);
  }
  return grouped;
}

const GOAL_SUMMARY_SELECT = `
  SELECT g.*,
    count(t.id) FILTER (WHERE t.status <> 'cancelled')::int AS task_count,
    count(t.id) FILTER (WHERE t.status = 'completed')::int AS completed_task_count,
    CASE
      WHEN count(t.id) FILTER (WHERE t.status <> 'cancelled') = 0
        THEN CASE WHEN g.status = 'completed' THEN 100 ELSE 0 END
      ELSE round(
        100.0 * count(t.id) FILTER (WHERE t.status = 'completed') /
        count(t.id) FILTER (WHERE t.status <> 'cancelled')
      )::int
    END AS progress
  FROM goals g
  LEFT JOIN goal_tasks t ON t.goal_id = g.id
`;

export interface GoalListFilters {
  status?: GoalStatus;
  query?: string;
  limit?: number;
}

export async function listGoals(
  ownerId: string,
  filters: GoalListFilters = {},
): Promise<GoalSummaryView[]> {
  const query = cleanText(filters.query ?? "", 120);
  const limit = Math.max(1, Math.min(filters.limit ?? 100, 200));
  const rows = (await db().query(
    `${GOAL_SUMMARY_SELECT}
     WHERE g.owner_id = $1
       AND ($2::text IS NULL OR g.status = $2)
       AND ($3::text = '' OR g.title ILIKE '%' || $3 || '%' OR g.description ILIKE '%' || $3 || '%')
     GROUP BY g.id
     ORDER BY
       CASE g.priority WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'normal' THEN 2 ELSE 1 END DESC,
       g.target_date ASC NULLS LAST, g.updated_at DESC, g.id
     LIMIT $4`,
    [ownerId, filters.status ?? null, query, limit],
  )) as Row[];
  return rows.map(goalSummary);
}

async function loadGoalTasks(
  goalIdValue: string,
  env: NodeJS.ProcessEnv,
): Promise<GoalTaskView[]> {
  const [taskRows, dependencyRows] = (await Promise.all([
    db().query(
      `SELECT * FROM goal_tasks WHERE goal_id = $1 ORDER BY position, created_at, id`,
      [goalIdValue],
    ),
    db().query(
      `SELECT task_id, depends_on_task_id FROM goal_task_dependencies
       WHERE task_id IN (SELECT id FROM goal_tasks WHERE goal_id = $1)
       ORDER BY task_id, depends_on_task_id`,
      [goalIdValue],
    ),
  ])) as [Row[], Row[]];
  const dependencies = new Map<string, string[]>();
  for (const row of dependencyRows) {
    const id = text(row.task_id);
    dependencies.set(id, [...(dependencies.get(id) ?? []), text(row.depends_on_task_id)]);
  }
  const completedIds = new Set(
    taskRows.filter((row) => row.status === "completed").map((row) => text(row.id)),
  );
  return taskRows.map((row) => taskView(row, dependencies, completedIds, env));
}

export async function getGoal(
  ownerId: string,
  id: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<GoalDetailView | null> {
  const rows = (await db().query(
    `${GOAL_SUMMARY_SELECT} WHERE g.owner_id = $1 AND g.id = $2 GROUP BY g.id LIMIT 1`,
    [ownerId, id],
  )) as Row[];
  const row = rows[0];
  if (row === undefined) return null;
  const tasks = await loadGoalTasks(id, env);
  const [planRows, milestoneRows, threadRows, eventRows, runRows] = (await Promise.all([
    db().query(`SELECT * FROM goal_plans WHERE goal_id = $1 ORDER BY version DESC`, [id]),
    db().query(`SELECT * FROM goal_milestones WHERE goal_id = $1 ORDER BY position, created_at, id`, [id]),
    db().query(`SELECT thread_id FROM goal_thread_links WHERE owner_id = $1 AND goal_id = $2 ORDER BY created_at`, [ownerId, id]),
    db().query(`SELECT id, type, severity, summary, rationale, occurred_at FROM eve_events WHERE owner_id = $1 AND goal_id = $2 ORDER BY occurred_at DESC, id DESC LIMIT 100`, [ownerId, id]),
    db().query(`SELECT id FROM task_runs WHERE owner_id = $1 AND goal_id = $2 ORDER BY updated_at DESC`, [ownerId, id]),
  ])) as [Row[], Row[], Row[], Row[], Row[]];
  const summary = goalSummary(row);
  return {
    ...summary,
    plans: planRows.map(planView),
    milestones: milestoneRows.map((milestone) => milestoneView(milestone, tasks)),
    tasks,
    threadIds: threadRows.map((item) => text(item.thread_id)),
    events: eventRows.map(eventView),
    linkedRunIds: runRows.map((item) => text(item.id)),
    nextAction: nextActionForGoal(summary, tasks),
  };
}

export async function listGoalDetails(
  ownerId: string,
  filters: GoalListFilters = {},
  env: NodeJS.ProcessEnv = process.env,
): Promise<GoalDetailView[]> {
  const summaries = await listGoals(ownerId, filters);
  const goalIds = summaries.map((goal) => goal.id);
  if (goalIds.length === 0) return [];

  const [taskRows, dependencyRows, planRows, milestoneRows, threadRows, eventRows, runRows] =
    (await Promise.all([
      db().query(
        `SELECT * FROM goal_tasks
         WHERE goal_id = ANY($1::text[]) ORDER BY goal_id, position, created_at, id`,
        [goalIds],
      ),
      db().query(
        `SELECT d.task_id, d.depends_on_task_id
         FROM goal_task_dependencies d
         JOIN goal_tasks t ON t.id = d.task_id
         WHERE t.goal_id = ANY($1::text[])
         ORDER BY d.task_id, d.depends_on_task_id`,
        [goalIds],
      ),
      db().query(
        `SELECT * FROM goal_plans
         WHERE goal_id = ANY($1::text[]) ORDER BY goal_id, version DESC`,
        [goalIds],
      ),
      db().query(
        `SELECT * FROM goal_milestones
         WHERE goal_id = ANY($1::text[]) ORDER BY goal_id, position, created_at, id`,
        [goalIds],
      ),
      db().query(
        `SELECT goal_id, thread_id FROM goal_thread_links
         WHERE owner_id = $1 AND goal_id = ANY($2::text[])
         ORDER BY goal_id, created_at`,
        [ownerId, goalIds],
      ),
      db().query(
        `SELECT id, goal_id, type, severity, summary, rationale, occurred_at
         FROM (
           SELECT id, goal_id, type, severity, summary, rationale, occurred_at,
                  row_number() OVER (
                    PARTITION BY goal_id ORDER BY occurred_at DESC, id DESC
                  ) AS position
           FROM eve_events
           WHERE owner_id = $1 AND goal_id = ANY($2::text[])
         ) ranked
         WHERE position <= 100
         ORDER BY goal_id, occurred_at DESC, id DESC`,
        [ownerId, goalIds],
      ),
      db().query(
        `SELECT goal_id, id FROM task_runs
         WHERE owner_id = $1 AND goal_id = ANY($2::text[])
         ORDER BY goal_id, updated_at DESC`,
        [ownerId, goalIds],
      ),
    ])) as [Row[], Row[], Row[], Row[], Row[], Row[], Row[]];

  const dependencies = new Map<string, string[]>();
  for (const row of dependencyRows) {
    const taskIdValue = text(row.task_id);
    dependencies.set(taskIdValue, [
      ...(dependencies.get(taskIdValue) ?? []),
      text(row.depends_on_task_id),
    ]);
  }
  const completedTaskIds = new Set(
    taskRows.filter((row) => row.status === "completed").map((row) => text(row.id)),
  );
  const tasksByGoal = groupByGoal(taskRows, (row) =>
    taskView(row, dependencies, completedTaskIds, env),
  );
  const plansByGoal = groupByGoal(planRows, planView);
  const milestonesByGoal = groupByGoal(milestoneRows, (row) => row);
  const threadsByGoal = groupByGoal(threadRows, (row) => text(row.thread_id));
  const eventsByGoal = groupByGoal(eventRows, eventView);
  const runsByGoal = groupByGoal(runRows, (row) => text(row.id));

  return summaries.map((summary) => {
    const tasks = tasksByGoal.get(summary.id) ?? [];
    return {
      ...summary,
      plans: plansByGoal.get(summary.id) ?? [],
      milestones: (milestonesByGoal.get(summary.id) ?? []).map((row) =>
        milestoneView(row, tasks),
      ),
      tasks,
      threadIds: threadsByGoal.get(summary.id) ?? [],
      events: eventsByGoal.get(summary.id) ?? [],
      linkedRunIds: runsByGoal.get(summary.id) ?? [],
      nextAction: nextActionForGoal(summary, tasks),
    };
  });
}

export interface CreateGoalInput {
  ownerId: string;
  title: string;
  description?: string;
  motivation?: string;
  status?: GoalStatus;
  priority?: GoalPriority;
  planningMode?: PlanningMode;
  successCriteria?: string[];
  targetDate?: string | null;
  source?: string;
  sourceReference?: string | null;
  threadId?: string | null;
  idempotencyKey?: string;
}

export async function createGoal(input: CreateGoalInput): Promise<GoalDetailView> {
  const title = cleanText(input.title, 200);
  if (title.length === 0) throw new Error("Goal title is required.");
  const idempotencyKey = input.idempotencyKey ? cleanText(input.idempotencyKey, 200) : null;
  if (idempotencyKey !== null) {
    const existing = (await db().query(
      `SELECT id FROM goals WHERE owner_id = $1 AND idempotency_key = $2 LIMIT 1`,
      [input.ownerId, idempotencyKey],
    )) as Row[];
    if (existing[0]) return (await getGoal(input.ownerId, text(existing[0].id)))!;
  }
  const id = goalId();
  const status = input.status ?? "active";
  const source = cleanText(input.source ?? "chat", 80) || "chat";
  const sourceReference = input.sourceReference ? cleanText(input.sourceReference, 240) : null;
  const threadId = input.threadId ? cleanText(input.threadId, 240) : null;
  await db().transaction((tx) => [
    tx`INSERT INTO goals (
      id, owner_id, title, description, motivation, status, priority, planning_mode,
      success_criteria, target_date, source, source_reference, idempotency_key, started_at
    ) VALUES (
      ${id}, ${input.ownerId}, ${title}, ${cleanText(input.description ?? "", 10_000)},
      ${cleanText(input.motivation ?? "", 4_000)}, ${status}, ${input.priority ?? "normal"},
      ${input.planningMode ?? "simple"}, ${JSON.stringify(input.successCriteria ?? [])}::jsonb,
      ${input.targetDate ?? null}, ${source}, ${sourceReference}, ${idempotencyKey},
      ${status === "active" ? new Date().toISOString() : null}
    )`,
    ...(threadId
      ? [tx`INSERT INTO goal_thread_links (goal_id, owner_id, thread_id)
             VALUES (${id}, ${input.ownerId}, ${threadId}) ON CONFLICT DO NOTHING`]
      : []),
    tx`INSERT INTO eve_events (
      id, owner_id, type, source_type, source_id, goal_id, summary, rationale, payload, idempotency_key
    ) VALUES (
      ${eventId()}, ${input.ownerId}, 'GOAL_CREATED', ${source}, ${sourceReference}, ${id},
      ${eventSummary(`Created goal: ${title}`)}, ${JSON.stringify(["Owner intent became a persistent goal"])}::jsonb,
      ${JSON.stringify({ status, priority: input.priority ?? "normal", planningMode: input.planningMode ?? "simple" })}::jsonb,
      ${idempotencyKey ? `goal-event:${idempotencyKey}` : null}
    )`,
  ]);
  return (await getGoal(input.ownerId, id))!;
}

export interface UpdateGoalInput {
  title?: string;
  description?: string;
  motivation?: string;
  priority?: GoalPriority;
  planningMode?: PlanningMode;
  successCriteria?: string[];
  targetDate?: string | null;
}

export async function updateGoal(
  ownerId: string,
  id: string,
  patch: UpdateGoalInput,
): Promise<GoalDetailView> {
  const current = await getGoal(ownerId, id);
  if (current === null) throw new Error("Goal not found.");
  const title = patch.title === undefined ? current.title : cleanText(patch.title, 200);
  if (title.length === 0) throw new Error("Goal title is required.");
  await db().transaction((tx) => [
    tx`UPDATE goals SET
      title = ${title},
      description = ${patch.description === undefined ? current.description : cleanText(patch.description, 10_000)},
      motivation = ${patch.motivation === undefined ? current.motivation : cleanText(patch.motivation, 4_000)},
      priority = ${patch.priority ?? current.priority},
      planning_mode = ${patch.planningMode ?? current.planningMode},
      success_criteria = ${JSON.stringify(patch.successCriteria ?? current.successCriteria)}::jsonb,
      target_date = ${patch.targetDate === undefined ? current.targetDate : patch.targetDate},
      updated_at = now()
      WHERE owner_id = ${ownerId} AND id = ${id}`,
    tx`INSERT INTO eve_events (id, owner_id, type, source_type, source_id, goal_id, summary, payload)
      VALUES (${eventId()}, ${ownerId}, 'GOAL_UPDATED', 'owner_or_agent', ${id}, ${id},
        ${eventSummary(`Updated goal: ${title}`)}, ${JSON.stringify({ fields: Object.keys(patch) })}::jsonb)`,
  ]);
  return (await getGoal(ownerId, id))!;
}

export async function transitionGoal(
  ownerId: string,
  id: string,
  to: GoalStatus,
  actor: "owner" | "agent",
  reason?: string,
): Promise<GoalDetailView> {
  const current = await getGoal(ownerId, id);
  if (current === null) throw new Error("Goal not found.");
  if (!canTransitionGoal(current.status, to)) {
    throw new Error(`Goal cannot transition from ${current.status} to ${to}.`);
  }
  if (to === "completed" && current.taskCount > 0 && current.progress < 100) {
    throw new Error("Complete or cancel every remaining task before completing this goal.");
  }
  const safeReason = reason ? cleanText(reason, 1_000) : null;
  const changed = (await db().transaction((tx) => [
    tx`UPDATE goals SET
      status = ${to},
      started_at = CASE WHEN ${to} = 'active' THEN COALESCE(started_at, now()) ELSE started_at END,
      completed_at = CASE WHEN ${to} = 'completed' THEN now() ELSE completed_at END,
      archived_at = CASE WHEN ${to} = 'archived' THEN now() ELSE archived_at END,
      updated_at = now()
      WHERE owner_id = ${ownerId} AND id = ${id} AND status = ${current.status}
      RETURNING id`,
    tx`INSERT INTO eve_events (id, owner_id, type, source_type, source_id, goal_id, severity, summary, rationale, payload)
      SELECT ${eventId()}, ${ownerId}, 'GOAL_STATUS_CHANGED', ${actor}, ${id}, ${id},
        ${to === "blocked" ? "warning" : "info"},
        ${eventSummary(`Goal moved from ${current.status} to ${to}`)},
        ${JSON.stringify(safeReason ? [safeReason] : [])}::jsonb,
        ${JSON.stringify({ from: current.status, to })}::jsonb
      WHERE EXISTS (SELECT 1 FROM goals WHERE owner_id = ${ownerId} AND id = ${id} AND status = ${to})`,
  ])) as Row[][];
  if (changed[0]?.length === 0) throw new Error("Goal state changed before this update could be recorded.");
  return (await getGoal(ownerId, id))!;
}

export async function createGoalPlan(
  ownerId: string,
  goalIdValue: string,
  input: { summary: string; strategy?: string },
): Promise<GoalPlanView> {
  const goal = await getGoal(ownerId, goalIdValue);
  if (goal === null) throw new Error("Goal not found.");
  assertGoalMutable(goal);
  const summary = cleanText(input.summary, 4_000);
  if (summary.length === 0) throw new Error("Plan summary is required.");
  const id = planId();
  const nextVersion = (goal.plans[0]?.version ?? 0) + 1;
  await db().transaction((tx) => [
    tx`UPDATE goal_plans SET status = 'superseded', superseded_at = now()
       WHERE goal_id = ${goalIdValue} AND status = 'active'`,
    tx`INSERT INTO goal_plans (id, goal_id, version, summary, strategy)
       VALUES (${id}, ${goalIdValue}, ${nextVersion}, ${summary}, ${cleanText(input.strategy ?? "", 10_000)})`,
    tx`UPDATE goals SET updated_at = now() WHERE owner_id = ${ownerId} AND id = ${goalIdValue}`,
    tx`INSERT INTO eve_events (id, owner_id, type, source_type, source_id, goal_id, summary, payload)
       VALUES (${eventId()}, ${ownerId}, 'PLAN_CREATED', 'owner_or_agent', ${id}, ${goalIdValue},
         ${eventSummary(`Created plan version ${nextVersion}`)}, ${JSON.stringify({ version: nextVersion })}::jsonb)`,
  ]);
  const updated = await getGoal(ownerId, goalIdValue);
  return updated!.plans.find((plan) => plan.id === id)!;
}

export interface CreateMilestoneInput {
  title: string;
  description?: string;
  targetDate?: string | null;
  position?: number;
  successCriteria?: string[];
}

export async function createGoalMilestone(
  ownerId: string,
  goalIdValue: string,
  input: CreateMilestoneInput,
): Promise<GoalMilestoneView> {
  const goal = await getGoal(ownerId, goalIdValue);
  if (goal === null) throw new Error("Goal not found.");
  assertGoalMutable(goal);
  const title = cleanText(input.title, 200);
  if (title.length === 0) throw new Error("Milestone title is required.");
  const id = milestoneId();
  await db().transaction((tx) => [
    tx`INSERT INTO goal_milestones (
      id, goal_id, title, description, target_date, position, success_criteria
    ) VALUES (
      ${id}, ${goalIdValue}, ${title}, ${cleanText(input.description ?? "", 4_000)},
      ${input.targetDate ?? null}, ${input.position ?? 0}, ${JSON.stringify(input.successCriteria ?? [])}::jsonb
    )`,
    tx`UPDATE goals SET updated_at = now() WHERE owner_id = ${ownerId} AND id = ${goalIdValue}`,
    tx`INSERT INTO eve_events (id, owner_id, type, source_type, source_id, goal_id, summary)
       VALUES (${eventId()}, ${ownerId}, 'MILESTONE_CREATED', 'owner_or_agent', ${id}, ${goalIdValue},
         ${eventSummary(`Created milestone: ${title}`)})`,
  ]);
  const updated = await getGoal(ownerId, goalIdValue);
  return updated!.milestones.find((milestone) => milestone.id === id)!;
}

export async function updateGoalMilestone(
  ownerId: string,
  goalIdValue: string,
  id: string,
  patch: Partial<CreateMilestoneInput> & { status?: MilestoneStatus },
): Promise<GoalMilestoneView> {
  const goal = await getGoal(ownerId, goalIdValue);
  const current = goal?.milestones.find((milestone) => milestone.id === id);
  if (!goal || !current) throw new Error("Milestone not found.");
  assertGoalMutable(goal);
  const title = patch.title === undefined ? current.title : cleanText(patch.title, 200);
  if (title.length === 0) throw new Error("Milestone title is required.");
  const status = patch.status ?? current.status;
  await db().transaction((tx) => [
    tx`UPDATE goal_milestones SET
      title = ${title}, description = ${patch.description === undefined ? current.description : cleanText(patch.description, 4_000)},
      status = ${status}, target_date = ${patch.targetDate === undefined ? current.targetDate : patch.targetDate},
      position = ${patch.position ?? current.position},
      success_criteria = ${JSON.stringify(patch.successCriteria ?? current.successCriteria)}::jsonb,
      completed_at = CASE WHEN ${status} = 'completed' THEN COALESCE(completed_at, now()) ELSE NULL END,
      updated_at = now()
      WHERE id = ${id} AND goal_id = ${goalIdValue}`,
    tx`UPDATE goals SET updated_at = now() WHERE owner_id = ${ownerId} AND id = ${goalIdValue}`,
    tx`INSERT INTO eve_events (id, owner_id, type, source_type, source_id, goal_id, summary, payload)
       VALUES (${eventId()}, ${ownerId}, 'MILESTONE_UPDATED', 'owner_or_agent', ${id}, ${goalIdValue},
         ${eventSummary(`Updated milestone: ${title}`)}, ${JSON.stringify({ status })}::jsonb)`,
  ]);
  const updated = await getGoal(ownerId, goalIdValue);
  return updated!.milestones.find((milestone) => milestone.id === id)!;
}

export async function deleteGoalMilestone(
  ownerId: string,
  goalIdValue: string,
  id: string,
): Promise<void> {
  const goal = await getGoal(ownerId, goalIdValue);
  const current = goal?.milestones.find((milestone) => milestone.id === id);
  if (!goal || !current) throw new Error("Milestone not found.");
  assertGoalMutable(goal);
  await db().transaction((tx) => [
    tx`DELETE FROM goal_milestones WHERE id = ${id} AND goal_id = ${goalIdValue}`,
    tx`UPDATE goals SET updated_at = now() WHERE owner_id = ${ownerId} AND id = ${goalIdValue}`,
    tx`INSERT INTO eve_events (id, owner_id, type, source_type, source_id, goal_id, summary)
       VALUES (${eventId()}, ${ownerId}, 'MILESTONE_DELETED', 'owner_or_agent', ${id}, ${goalIdValue},
         ${eventSummary(`Deleted milestone: ${current.title}`)})`,
  ]);
}

export interface CreateGoalTaskInput {
  title: string;
  description?: string;
  milestoneId?: string | null;
  parentTaskId?: string | null;
  status?: GoalTaskStatus;
  priority?: GoalPriority;
  dueAt?: string | null;
  assignedTo?: string | null;
  requiredCapabilities?: string[];
  successCriteria?: string[];
  estimatedEffortMinutes?: number | null;
  estimatedCostUsd?: number | null;
  position?: number;
}

function assertCapabilityIds(ids: readonly string[]): void {
  const unknown = ids.filter((id) => getCapability(id) === null);
  if (unknown.length > 0) throw new Error(`Unknown capabilities: ${unknown.join(", ")}.`);
}

function assertTaskRelations(goal: GoalDetailView, milestone: string | null, parent: string | null) {
  if (milestone && !goal.milestones.some((item) => item.id === milestone)) {
    throw new Error("Milestone does not belong to this goal.");
  }
  if (parent && !goal.tasks.some((item) => item.id === parent)) {
    throw new Error("Parent task does not belong to this goal.");
  }
}

export async function createGoalTask(
  ownerId: string,
  goalIdValue: string,
  input: CreateGoalTaskInput,
): Promise<GoalTaskView> {
  const goal = await getGoal(ownerId, goalIdValue);
  if (goal === null) throw new Error("Goal not found.");
  assertGoalMutable(goal);
  const title = cleanText(input.title, 240);
  if (title.length === 0) throw new Error("Task title is required.");
  assertTaskRelations(goal, input.milestoneId ?? null, input.parentTaskId ?? null);
  assertCapabilityIds(input.requiredCapabilities ?? []);
  const id = taskId();
  const status = input.status ?? "todo";
  await db().transaction((tx) => [
    tx`INSERT INTO goal_tasks (
      id, goal_id, milestone_id, parent_task_id, title, description, status, priority,
      due_at, assigned_to, required_capabilities, success_criteria,
      estimated_effort_minutes, estimated_cost_usd, position, started_at, completed_at
    ) VALUES (
      ${id}, ${goalIdValue}, ${input.milestoneId ?? null}, ${input.parentTaskId ?? null},
      ${title}, ${cleanText(input.description ?? "", 8_000)}, ${status}, ${input.priority ?? "normal"},
      ${input.dueAt ?? null}, ${input.assignedTo ? cleanText(input.assignedTo, 160) : null},
      ${JSON.stringify(input.requiredCapabilities ?? [])}::jsonb,
      ${JSON.stringify(input.successCriteria ?? [])}::jsonb,
      ${input.estimatedEffortMinutes ?? null}, ${input.estimatedCostUsd ?? null}, ${input.position ?? 0},
      ${status === "in_progress" ? new Date().toISOString() : null},
      ${status === "completed" ? new Date().toISOString() : null}
    )`,
    tx`UPDATE goals SET updated_at = now() WHERE owner_id = ${ownerId} AND id = ${goalIdValue}`,
    tx`INSERT INTO eve_events (id, owner_id, type, source_type, source_id, goal_id, goal_task_id, summary, payload)
       VALUES (${eventId()}, ${ownerId}, 'TASK_CREATED', 'owner_or_agent', ${id}, ${goalIdValue}, ${id},
         ${eventSummary(`Created task: ${title}`)}, ${JSON.stringify({ status, priority: input.priority ?? "normal" })}::jsonb)`,
  ]);
  const updated = await getGoal(ownerId, goalIdValue);
  return updated!.tasks.find((task) => task.id === id)!;
}

export async function updateGoalTask(
  ownerId: string,
  goalIdValue: string,
  id: string,
  patch: Omit<Partial<CreateGoalTaskInput>, "status">,
): Promise<GoalTaskView> {
  const goal = await getGoal(ownerId, goalIdValue);
  const current = goal?.tasks.find((task) => task.id === id);
  if (!goal || !current) throw new Error("Task not found.");
  assertGoalMutable(goal);
  const title = patch.title === undefined ? current.title : cleanText(patch.title, 240);
  if (title.length === 0) throw new Error("Task title is required.");
  const milestone = patch.milestoneId === undefined ? current.milestoneId : patch.milestoneId;
  const parent = patch.parentTaskId === undefined ? current.parentTaskId : patch.parentTaskId;
  assertTaskRelations(goal, milestone ?? null, parent ?? null);
  if (parent === id) throw new Error("A task cannot be its own parent.");
  const requiredCapabilities = patch.requiredCapabilities ?? current.requiredCapabilities;
  assertCapabilityIds(requiredCapabilities);
  await db().transaction((tx) => [
    tx`UPDATE goal_tasks SET
      title = ${title}, description = ${patch.description === undefined ? current.description : cleanText(patch.description, 8_000)},
      milestone_id = ${milestone ?? null}, parent_task_id = ${parent ?? null},
      priority = ${patch.priority ?? current.priority}, due_at = ${patch.dueAt === undefined ? current.dueAt : patch.dueAt},
      assigned_to = ${patch.assignedTo === undefined ? current.assignedTo : patch.assignedTo ? cleanText(patch.assignedTo, 160) : null},
      required_capabilities = ${JSON.stringify(requiredCapabilities)}::jsonb,
      success_criteria = ${JSON.stringify(patch.successCriteria ?? current.successCriteria)}::jsonb,
      estimated_effort_minutes = ${patch.estimatedEffortMinutes === undefined ? current.estimatedEffortMinutes : patch.estimatedEffortMinutes},
      estimated_cost_usd = ${patch.estimatedCostUsd === undefined ? current.estimatedCostUsd : patch.estimatedCostUsd},
      position = ${patch.position ?? current.position}, updated_at = now()
      WHERE id = ${id} AND goal_id = ${goalIdValue}`,
    tx`UPDATE goals SET updated_at = now() WHERE owner_id = ${ownerId} AND id = ${goalIdValue}`,
    tx`INSERT INTO eve_events (id, owner_id, type, source_type, source_id, goal_id, goal_task_id, summary, payload)
       VALUES (${eventId()}, ${ownerId}, 'TASK_UPDATED', 'owner_or_agent', ${id}, ${goalIdValue}, ${id},
         ${eventSummary(`Updated task: ${title}`)}, ${JSON.stringify({ fields: Object.keys(patch) })}::jsonb)`,
  ]);
  const updated = await getGoal(ownerId, goalIdValue);
  return updated!.tasks.find((task) => task.id === id)!;
}

export async function transitionGoalTask(
  ownerId: string,
  goalIdValue: string,
  id: string,
  to: GoalTaskStatus,
  actor: "owner" | "agent",
  reason?: string,
): Promise<GoalTaskView> {
  const goal = await getGoal(ownerId, goalIdValue);
  const current = goal?.tasks.find((task) => task.id === id);
  if (!goal || !current) throw new Error("Task not found.");
  assertGoalMutable(goal);
  if (!canTransitionGoalTask(current.status, to)) {
    throw new Error(`Task cannot transition from ${current.status} to ${to}.`);
  }
  if (to === "in_progress" || to === "completed") {
    if (current.blockedByDependencies) throw new Error("Complete task dependencies first.");
    if (current.unavailableCapabilities.length > 0) {
      throw new Error(`Required capabilities are unavailable: ${current.unavailableCapabilities.join(", ")}.`);
    }
  }
  const safeReason = reason ? cleanText(reason, 1_000) : null;
  const changed = (await db().transaction((tx) => [
    tx`UPDATE goal_tasks SET
      status = ${to},
      started_at = CASE WHEN ${to} = 'in_progress' THEN COALESCE(started_at, now()) ELSE started_at END,
      completed_at = CASE WHEN ${to} = 'completed' THEN now() ELSE NULL END,
      updated_at = now()
      WHERE id = ${id} AND goal_id = ${goalIdValue} AND status = ${current.status}
      RETURNING id`,
    tx`UPDATE goals SET updated_at = now() WHERE owner_id = ${ownerId} AND id = ${goalIdValue}`,
    tx`INSERT INTO eve_events (id, owner_id, type, source_type, source_id, goal_id, goal_task_id, severity, summary, rationale, payload)
       SELECT ${eventId()}, ${ownerId}, 'TASK_STATUS_CHANGED', ${actor}, ${id}, ${goalIdValue}, ${id},
         ${to === "blocked" || to === "failed" ? "warning" : "info"},
         ${eventSummary(`Task moved from ${current.status} to ${to}: ${current.title}`)},
         ${JSON.stringify(safeReason ? [safeReason] : [])}::jsonb,
         ${JSON.stringify({ from: current.status, to })}::jsonb
       WHERE EXISTS (SELECT 1 FROM goal_tasks WHERE id = ${id} AND goal_id = ${goalIdValue} AND status = ${to})`,
  ])) as Row[][];
  if (changed[0]?.length === 0) throw new Error("Task state changed before this update could be recorded.");
  const updated = await getGoal(ownerId, goalIdValue);
  return updated!.tasks.find((task) => task.id === id)!;
}

export async function deleteGoalTask(
  ownerId: string,
  goalIdValue: string,
  id: string,
): Promise<void> {
  const goal = await getGoal(ownerId, goalIdValue);
  const current = goal?.tasks.find((task) => task.id === id);
  if (!goal || !current) throw new Error("Task not found.");
  assertGoalMutable(goal);
  if (!["todo", "ready", "failed", "cancelled"].includes(current.status)) {
    throw new Error("Only unstarted, failed, or cancelled tasks can be deleted.");
  }
  if (goal.linkedRunIds.length > 0) {
    const linked = (await db().query(
      `SELECT 1 FROM task_runs WHERE owner_id = $1 AND goal_task_id = $2 LIMIT 1`,
      [ownerId, id],
    )) as Row[];
    if (linked.length > 0) throw new Error("A task with execution history cannot be deleted.");
  }
  await db().transaction((tx) => [
    tx`DELETE FROM goal_tasks WHERE id = ${id} AND goal_id = ${goalIdValue}`,
    tx`UPDATE goals SET updated_at = now() WHERE owner_id = ${ownerId} AND id = ${goalIdValue}`,
    tx`INSERT INTO eve_events (id, owner_id, type, source_type, source_id, goal_id, summary)
       VALUES (${eventId()}, ${ownerId}, 'TASK_DELETED', 'owner_or_agent', ${id}, ${goalIdValue},
         ${eventSummary(`Deleted task: ${current.title}`)})`,
  ]);
}

async function goalTaskPair(
  ownerId: string,
  goalIdValue: string,
  task: string,
  dependsOn: string,
): Promise<boolean> {
  const rows = (await db().query(
    `SELECT count(*)::int AS count
     FROM goal_tasks t JOIN goals g ON g.id = t.goal_id
     WHERE g.owner_id = $1 AND g.id = $2 AND t.id IN ($3, $4)`,
    [ownerId, goalIdValue, task, dependsOn],
  )) as Row[];
  return number(rows[0]?.count) === 2;
}

export async function addGoalTaskDependency(
  ownerId: string,
  goalIdValue: string,
  task: string,
  dependsOn: string,
): Promise<void> {
  const goal = await getGoal(ownerId, goalIdValue);
  if (goal === null) throw new Error("Goal not found.");
  assertGoalMutable(goal);
  if (task === dependsOn) throw new Error("A task cannot depend on itself.");
  if (!(await goalTaskPair(ownerId, goalIdValue, task, dependsOn))) {
    throw new Error("Both tasks must belong to this goal.");
  }
  const cycleRows = (await db().query(
    `WITH RECURSIVE reachable(id) AS (
       SELECT depends_on_task_id FROM goal_task_dependencies WHERE task_id = $1
       UNION
       SELECT d.depends_on_task_id FROM goal_task_dependencies d JOIN reachable r ON d.task_id = r.id
     ) SELECT 1 FROM reachable WHERE id = $2 LIMIT 1`,
    [dependsOn, task],
  )) as Row[];
  if (cycleRows.length > 0) throw new Error("This dependency would create a cycle.");
  await db().transaction((tx) => [
    tx`INSERT INTO goal_task_dependencies (task_id, depends_on_task_id)
       VALUES (${task}, ${dependsOn}) ON CONFLICT DO NOTHING`,
    tx`UPDATE goals SET updated_at = now() WHERE owner_id = ${ownerId} AND id = ${goalIdValue}`,
    tx`INSERT INTO eve_events (id, owner_id, type, source_type, source_id, goal_id, goal_task_id, summary, payload)
       VALUES (${eventId()}, ${ownerId}, 'TASK_DEPENDENCY_ADDED', 'owner_or_agent', ${task}, ${goalIdValue}, ${task},
         'Added task dependency', ${JSON.stringify({ dependsOnTaskId: dependsOn })}::jsonb)`,
  ]);
}

export async function removeGoalTaskDependency(
  ownerId: string,
  goalIdValue: string,
  task: string,
  dependsOn: string,
): Promise<void> {
  const goal = await getGoal(ownerId, goalIdValue);
  if (goal === null) throw new Error("Goal not found.");
  assertGoalMutable(goal);
  if (!(await goalTaskPair(ownerId, goalIdValue, task, dependsOn))) {
    throw new Error("Both tasks must belong to this goal.");
  }
  await db().transaction((tx) => [
    tx`DELETE FROM goal_task_dependencies WHERE task_id = ${task} AND depends_on_task_id = ${dependsOn}`,
    tx`UPDATE goals SET updated_at = now() WHERE owner_id = ${ownerId} AND id = ${goalIdValue}`,
    tx`INSERT INTO eve_events (id, owner_id, type, source_type, source_id, goal_id, goal_task_id, summary, payload)
       VALUES (${eventId()}, ${ownerId}, 'TASK_DEPENDENCY_REMOVED', 'owner_or_agent', ${task}, ${goalIdValue}, ${task},
         'Removed task dependency', ${JSON.stringify({ dependsOnTaskId: dependsOn })}::jsonb)`,
  ]);
}

export async function linkGoalThread(
  ownerId: string,
  goalIdValue: string,
  threadId: string,
): Promise<void> {
  if ((await getGoal(ownerId, goalIdValue)) === null) throw new Error("Goal not found.");
  const safeThreadId = cleanText(threadId, 240);
  if (safeThreadId.length === 0) throw new Error("Thread id is required.");
  await db().transaction((tx) => [
    tx`INSERT INTO goal_thread_links (goal_id, owner_id, thread_id)
       VALUES (${goalIdValue}, ${ownerId}, ${safeThreadId}) ON CONFLICT DO NOTHING`,
    tx`INSERT INTO eve_events (id, owner_id, type, source_type, source_id, goal_id, summary)
       VALUES (${eventId()}, ${ownerId}, 'GOAL_THREAD_LINKED', 'conversation', ${safeThreadId}, ${goalIdValue},
         'Linked conversation to goal')`,
  ]);
}

export async function getFocus(
  ownerId: string,
  limit = 20,
  env: NodeJS.ProcessEnv = process.env,
): Promise<GoalFocusItem[]> {
  const goals = await listGoals(ownerId, { status: "active", limit: 200 });
  const details = await Promise.all(goals.map((goal) => getGoal(ownerId, goal.id, env)));
  return rankFocusCandidates(
    details.flatMap((goal) =>
      goal === null
        ? []
        : goal.tasks.map((task) => ({
            goal: {
              id: goal.id,
              title: goal.title,
              status: goal.status,
              priority: goal.priority,
              targetDate: goal.targetDate,
            },
            task,
          })),
    ),
  ).slice(0, Math.max(1, Math.min(limit, 50)));
}
