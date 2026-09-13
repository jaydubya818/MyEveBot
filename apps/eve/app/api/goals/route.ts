import { apiError, requireDatabase } from "@/lib/api-errors";
import { capabilityMap } from "@/lib/capabilities";
import {
  GOAL_PRIORITIES,
  GOAL_STATUSES,
  PLANNING_MODES,
  type GoalPriority,
  type GoalStatus,
  type PlanningMode,
} from "@/lib/goal-types";
import { createGoal, listGoals } from "@/lib/goals";
import { requireWebAuth, webPrincipal } from "@/lib/web-auth";

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

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function optionalNullableString(value: unknown): string | null | undefined {
  return value === null || typeof value === "string" ? value : undefined;
}

function stringList(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value.slice(0, 20)
    : undefined;
}

function handleError(request: Request, error: unknown): Response {
  const message = error instanceof Error ? error.message : "The goal request failed.";
  const notFound = message.toLowerCase().includes("not found");
  return apiError(request, notFound ? 404 : 400, notFound ? "goal_not_found" : "invalid_goal", message);
}

export async function GET(request: Request): Promise<Response> {
  const denied = guard(request);
  if (denied) return denied;
  const principal = webPrincipal(request)!;
  const url = new URL(request.url);
  const rawStatus = url.searchParams.get("status");
  if (rawStatus !== null && !isOneOf(rawStatus, GOAL_STATUSES)) {
    return apiError(request, 400, "invalid_goal_status", "Unknown goal status.");
  }
  try {
    const goals = await listGoals(principal.id, {
      status: (rawStatus ?? undefined) as GoalStatus | undefined,
      query: url.searchParams.get("q") ?? undefined,
      limit: Number(url.searchParams.get("limit") ?? "100"),
    });
    return Response.json(
      { goals, capability: capabilityMap().goals },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Goal list failed", error);
    return apiError(request, 503, "goals_unavailable", "Goals are temporarily unavailable.");
  }
}

export async function POST(request: Request): Promise<Response> {
  const denied = guard(request);
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (body === null || typeof body.title !== "string") {
    return apiError(request, 400, "invalid_goal", "A goal title is required.");
  }
  if (body.status !== undefined && !isOneOf(body.status, GOAL_STATUSES)) {
    return apiError(request, 400, "invalid_goal_status", "Unknown goal status.");
  }
  if (body.priority !== undefined && !isOneOf(body.priority, GOAL_PRIORITIES)) {
    return apiError(request, 400, "invalid_goal_priority", "Unknown goal priority.");
  }
  if (body.planningMode !== undefined && !isOneOf(body.planningMode, PLANNING_MODES)) {
    return apiError(request, 400, "invalid_planning_mode", "Unknown planning mode.");
  }
  try {
    const goal = await createGoal({
      ownerId: webPrincipal(request)!.id,
      title: body.title,
      description: optionalString(body.description),
      motivation: optionalString(body.motivation),
      status: body.status as GoalStatus | undefined,
      priority: body.priority as GoalPriority | undefined,
      planningMode: body.planningMode as PlanningMode | undefined,
      successCriteria: stringList(body.successCriteria),
      targetDate: optionalNullableString(body.targetDate),
      source: "web",
      sourceReference: optionalNullableString(body.sourceReference),
      threadId: optionalNullableString(body.threadId),
      idempotencyKey: optionalString(body.idempotencyKey),
    });
    return Response.json({ goal }, { status: 201 });
  } catch (error) {
    return handleError(request, error);
  }
}
