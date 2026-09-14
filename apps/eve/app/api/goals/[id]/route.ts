import { apiError, requireDatabase } from "@/lib/api-errors";
import { capabilityMap } from "@/lib/capabilities";
import {
  GOAL_PRIORITIES,
  GOAL_STATUSES,
  GOAL_TASK_STATUSES,
  MILESTONE_STATUSES,
  PLANNING_MODES,
  type GoalPriority,
  type GoalStatus,
  type GoalTaskStatus,
  type MilestoneStatus,
  type PlanningMode,
} from "@/lib/goal-types";
import {
  addGoalTaskDependency,
  createGoalMilestone,
  createGoalPlan,
  createGoalTask,
  deleteGoalMilestone,
  deleteGoalTask,
  getGoal,
  linkGoalThread,
  removeGoalTaskDependency,
  transitionGoal,
  transitionGoalTask,
  updateGoal,
  updateGoalMilestone,
  updateGoalTask,
} from "@/lib/goals";
import { requireWebAuth, webPrincipal } from "@/lib/web-auth";

type RouteContext = { params: Promise<{ id: string }> };

function guard(request: Request): Response | null {
  const denied = requireWebAuth(request) ?? requireDatabase(request);
  if (denied) return denied;
  if (capabilityMap().goals.state === "excluded") {
    return apiError(request, 404, "goals_not_included", "Goals are not included in this deployment.");
  }
  return null;
}

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function strings(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value.slice(0, 30)
    : undefined;
}

function optionalNumber(value: unknown): number | null | undefined {
  return value === null || typeof value === "number" ? value : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function optionalNullableString(value: unknown): string | null | undefined {
  return value === null || typeof value === "string" ? value : undefined;
}

function handled(request: Request, error: unknown): Response {
  const message = error instanceof Error ? error.message : "The goal request failed.";
  const lower = message.toLowerCase();
  const status = lower.includes("not found") ? 404 : lower.includes("changed before") ? 409 : 400;
  return apiError(request, status, status === 404 ? "goal_not_found" : status === 409 ? "goal_conflict" : "invalid_goal_operation", message);
}

export async function GET(request: Request, ctx: RouteContext): Promise<Response> {
  const denied = guard(request);
  if (denied) return denied;
  const { id } = await ctx.params;
  try {
    const goal = await getGoal(webPrincipal(request)!.id, id);
    return goal === null
      ? apiError(request, 404, "goal_not_found", "Goal not found.")
      : Response.json({ goal }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Goal read failed", error);
    return apiError(request, 503, "goal_unavailable", "This goal is temporarily unavailable.");
  }
}

export async function PATCH(request: Request, ctx: RouteContext): Promise<Response> {
  const denied = guard(request);
  if (denied) return denied;
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (body === null || typeof body.kind !== "string") {
    return apiError(request, 400, "invalid_goal_operation", "A goal operation is required.");
  }
  const ownerId = webPrincipal(request)!.id;
  try {
    if (body.kind === "goal") {
      if (body.status !== undefined) {
        if (!isOneOf(body.status, GOAL_STATUSES)) throw new Error("Unknown goal status.");
        const goal = await transitionGoal(ownerId, id, body.status as GoalStatus, "owner", optionalString(body.reason));
        return Response.json({ goal });
      }
      if (body.priority !== undefined && !isOneOf(body.priority, GOAL_PRIORITIES)) throw new Error("Unknown goal priority.");
      if (body.planningMode !== undefined && !isOneOf(body.planningMode, PLANNING_MODES)) throw new Error("Unknown planning mode.");
      const goal = await updateGoal(ownerId, id, {
        title: optionalString(body.title), description: optionalString(body.description),
        motivation: optionalString(body.motivation), priority: body.priority as GoalPriority | undefined,
        planningMode: body.planningMode as PlanningMode | undefined,
        successCriteria: strings(body.successCriteria), targetDate: optionalNullableString(body.targetDate),
      });
      return Response.json({ goal });
    }
    if (body.kind === "milestone" && typeof body.milestoneId === "string") {
      if (body.status !== undefined && !isOneOf(body.status, MILESTONE_STATUSES)) throw new Error("Unknown milestone status.");
      const milestone = await updateGoalMilestone(ownerId, id, body.milestoneId, {
        title: optionalString(body.title), description: optionalString(body.description),
        targetDate: optionalNullableString(body.targetDate), position: optionalNumber(body.position) ?? undefined,
        successCriteria: strings(body.successCriteria), status: body.status as MilestoneStatus | undefined,
      });
      return Response.json({ milestone });
    }
    if (body.kind === "task" && typeof body.taskId === "string") {
      if (body.status !== undefined) {
        if (!isOneOf(body.status, GOAL_TASK_STATUSES)) throw new Error("Unknown task status.");
        const task = await transitionGoalTask(ownerId, id, body.taskId, body.status as GoalTaskStatus, "owner", optionalString(body.reason));
        return Response.json({ task });
      }
      if (body.priority !== undefined && !isOneOf(body.priority, GOAL_PRIORITIES)) throw new Error("Unknown task priority.");
      const task = await updateGoalTask(ownerId, id, body.taskId, {
        title: optionalString(body.title), description: optionalString(body.description),
        milestoneId: optionalNullableString(body.milestoneId), parentTaskId: optionalNullableString(body.parentTaskId),
        priority: body.priority as GoalPriority | undefined, dueAt: optionalNullableString(body.dueAt),
        assignedTo: optionalNullableString(body.assignedTo), requiredCapabilities: strings(body.requiredCapabilities),
        successCriteria: strings(body.successCriteria), estimatedEffortMinutes: optionalNumber(body.estimatedEffortMinutes),
        estimatedCostUsd: optionalNumber(body.estimatedCostUsd), position: optionalNumber(body.position) ?? undefined,
      });
      return Response.json({ task });
    }
    throw new Error("Unknown goal operation.");
  } catch (error) {
    return handled(request, error);
  }
}

export async function POST(request: Request, ctx: RouteContext): Promise<Response> {
  const denied = guard(request);
  if (denied) return denied;
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (body === null || typeof body.kind !== "string") return apiError(request, 400, "invalid_goal_operation", "A goal operation is required.");
  const ownerId = webPrincipal(request)!.id;
  try {
    if (body.kind === "plan" && typeof body.summary === "string") {
      return Response.json({ plan: await createGoalPlan(ownerId, id, { summary: body.summary, strategy: optionalString(body.strategy) }) }, { status: 201 });
    }
    if (body.kind === "milestone" && typeof body.title === "string") {
      return Response.json({ milestone: await createGoalMilestone(ownerId, id, { title: body.title, description: optionalString(body.description), targetDate: optionalNullableString(body.targetDate), position: optionalNumber(body.position) ?? undefined, successCriteria: strings(body.successCriteria) }) }, { status: 201 });
    }
    if (body.kind === "task" && typeof body.title === "string") {
      if (body.status !== undefined && !isOneOf(body.status, GOAL_TASK_STATUSES)) throw new Error("Unknown task status.");
      if (body.priority !== undefined && !isOneOf(body.priority, GOAL_PRIORITIES)) throw new Error("Unknown task priority.");
      return Response.json({ task: await createGoalTask(ownerId, id, {
        title: body.title, description: optionalString(body.description), milestoneId: optionalNullableString(body.milestoneId),
        parentTaskId: optionalNullableString(body.parentTaskId), status: body.status as GoalTaskStatus | undefined,
        priority: body.priority as GoalPriority | undefined, dueAt: optionalNullableString(body.dueAt),
        assignedTo: optionalNullableString(body.assignedTo), requiredCapabilities: strings(body.requiredCapabilities),
        successCriteria: strings(body.successCriteria), estimatedEffortMinutes: optionalNumber(body.estimatedEffortMinutes),
        estimatedCostUsd: optionalNumber(body.estimatedCostUsd), position: optionalNumber(body.position) ?? undefined,
      }) }, { status: 201 });
    }
    if (body.kind === "dependency" && typeof body.taskId === "string" && typeof body.dependsOnTaskId === "string") {
      await addGoalTaskDependency(ownerId, id, body.taskId, body.dependsOnTaskId);
      return Response.json({ ok: true }, { status: 201 });
    }
    if (body.kind === "thread" && typeof body.threadId === "string") {
      await linkGoalThread(ownerId, id, body.threadId);
      return Response.json({ ok: true }, { status: 201 });
    }
    throw new Error("Unknown goal operation.");
  } catch (error) {
    return handled(request, error);
  }
}

export async function DELETE(request: Request, ctx: RouteContext): Promise<Response> {
  const denied = guard(request);
  if (denied) return denied;
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (body === null || typeof body.kind !== "string") return apiError(request, 400, "invalid_goal_operation", "A goal operation is required.");
  const ownerId = webPrincipal(request)!.id;
  try {
    if (body.kind === "task" && typeof body.taskId === "string") await deleteGoalTask(ownerId, id, body.taskId);
    else if (body.kind === "milestone" && typeof body.milestoneId === "string") await deleteGoalMilestone(ownerId, id, body.milestoneId);
    else if (body.kind === "dependency" && typeof body.taskId === "string" && typeof body.dependsOnTaskId === "string") await removeGoalTaskDependency(ownerId, id, body.taskId, body.dependsOnTaskId);
    else throw new Error("Unknown goal operation.");
    return Response.json({ ok: true });
  } catch (error) {
    return handled(request, error);
  }
}
