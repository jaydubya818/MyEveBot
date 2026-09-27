import { z } from "zod";
import { requireSameOrigin, webPrincipal } from "../web-auth.ts";
import type { GoalWorkService } from "./service.ts";
import type { GoalWorkQueries } from "./projections.ts";
import { goalInput, taskInput, text } from "./validation.ts";
const command = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("create"), goal: goalInput }).strict(),
  z
    .object({
      operation: z.literal("change"),
      goal: goalInput,
      expectedRevision: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("control"),
      expectedRevision: z.number().int().positive(),
      goalId: text,
      action: z.enum(["pause", "resume", "reopen", "archive"]),
      reason: text,
    })
    .strict(),
  z
    .object({
      operation: z.literal("plan"),
      goalId: text,
      summary: text,
      reason: text,
      commandId: z.string().uuid(),
    })
    .strict(),
  z
    .object({ operation: z.literal("task"), goalId: text, task: taskInput })
    .strict(),
  z
    .object({
      operation: z.literal("confirm"),
      goalId: text,
      criterion: text,
      decisionRef: text,
      expectedRevision: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("confirm_completion"),
      goalId: text,
      decisionRef: text,
      expectedRevision: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("decision"),
      response: z
        .object({
          itemId: text.max(255),
          actionId: text.max(255),
          actionBinding: z.string().regex(/^[a-f0-9]{64}$/),
          expectedRevision: z.number().int().positive(),
          idempotencyKey: text.max(255),
          answer: text.max(4000),
        })
        .strict(),
    })
    .strict(),
]);
export interface GoalApiDependencies {
  authenticate(request: Request): Promise<{ id: string } | null>;
  service(ownerId: string): GoalWorkService;
  queries(ownerId: string): GoalWorkQueries;
  /** Canonical Inbox.respond; accepting a response does not mean Work resumed. */
  respond(ownerId: string, input: unknown): Promise<unknown>;
}
export function signedGoalAuthenticator(env: NodeJS.ProcessEnv = process.env) {
  return async (request: Request) =>
    webPrincipal(request, { ...env, NODE_ENV: "production" });
}
const headers = {
  "cache-control": "no-store",
  "content-type": "application/json",
};
/** Unmounted handler factory. Integration owns path registration and availability. */
export function createGoalApi(deps: GoalApiDependencies) {
  return async (request: Request): Promise<Response> => {
    const send = (body: unknown, status = 200) =>
      Response.json(body, { status, headers });
    try {
      const owner = await deps.authenticate(request);
      if (!owner) return send({ error: "authentication_required" }, 401);
      if (requireSameOrigin(request))
        return send({ error: "cross_origin_request" }, 403);
      const url = new URL(request.url),
        queries = deps.queries(owner.id),
        service = deps.service(owner.id);
      if (request.method === "GET") {
        const goalId = url.searchParams.get("goalId"),
          taskId = url.searchParams.get("taskId");
        if (taskId && !goalId) return send({ error: "goal_required" }, 400);
        if (url.searchParams.get("view") === "brief") {
          const interval = z
            .object({
              since: z.string().datetime({ offset: true }),
              until: z.string().datetime({ offset: true }),
              cursorAt: z.string().datetime({ offset: true }).optional(),
              cursorId: text.optional(),
            })
            .parse({
              since:
                url.searchParams.get("since") ??
                new Date(Date.now() - 86400000).toISOString(),
              until: url.searchParams.get("until") ?? new Date().toISOString(),
              cursorAt: url.searchParams.get("cursorAt") ?? undefined,
              cursorId: url.searchParams.get("cursorId") ?? undefined,
            });
          if (
            !!interval.cursorAt !== !!interval.cursorId ||
            Date.parse(interval.since) > Date.parse(interval.until)
          )
            return send({ error: "invalid_interval" }, 400);
          return send(
            await queries.brief(
              interval.since,
              interval.until,
              interval.cursorAt
                ? { at: interval.cursorAt, id: interval.cursorId! }
                : undefined,
            ),
          );
        }
        if (taskId && goalId)
          return send({ task: await queries.task(goalId, taskId) });
        if (goalId) return send({ goal: await queries.goal(goalId) });
        return send(
          await queries.today(
            url.searchParams.get("cursor") ?? "",
            Number(url.searchParams.get("limit") ?? 10),
          ),
        );
      }
      if (request.method !== "POST")
        return send({ error: "method_not_allowed" }, 405);
      const reader = request.body?.getReader();
      let size = 0,
        body = "";
      const decoder = new TextDecoder();
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 32768) {
            await reader.cancel();
            return send({ error: "request_too_large" }, 413);
          }
          body += decoder.decode(value, { stream: true });
        }
        body += decoder.decode();
      }
      const input = command.parse(JSON.parse(body));
      switch (input.operation) {
        case "create":
          await service.create(input.goal);
          return send({ goal: await queries.goal(input.goal.id) }, 201);
        case "change":
          await service.reviseGoal(
            input.goal.id,
            input.goal,
            input.expectedRevision,
          );
          return send({ goal: await queries.goal(input.goal.id) });
        case "control":
          await service.controlGoal(
            input.goalId,
            input.action,
            input.reason,
            input.expectedRevision,
          );
          if (input.action === "resume") await service.tick(input.goalId);
          return send({ goal: await queries.goal(input.goalId) });
        case "plan":
          return send({
            plan: await service.plan(
              input.goalId,
              input.summary,
              input.reason,
              undefined,
              input.commandId,
            ),
          });
        case "task":
          await service.addTask(input.goalId, input.task);
          return send(
            { task: await queries.task(input.goalId, input.task.id) },
            201,
          );
        case "confirm":
          await service.confirmOutcome(
            input.goalId,
            input.criterion,
            input.decisionRef,
            input.expectedRevision,
          );
          await service.completeGoal(input.goalId);
          return send({ goal: await queries.goal(input.goalId) });
        case "confirm_completion":
          await service.confirmCompletion(
            input.goalId,
            input.decisionRef,
            input.expectedRevision,
          );
          await service.completeGoal(input.goalId);
          return send({ goal: await queries.goal(input.goalId) });
        case "decision":
          return send(
            { response: await deps.respond(owner.id, input.response) },
            202,
          );
      }
    } catch (error) {
      if (error instanceof z.ZodError || error instanceof SyntaxError)
        return send({ error: "invalid_input" }, 400);
      if (error instanceof Error && /not found/i.test(error.message))
        return send({ error: "not_found" }, 404);
      // Storage outages differ from conflicts; never expose database/evidence details.
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        /^(08|53|57)/.test(String(error.code))
      )
        return send({ error: "service_unavailable" }, 503);
      return send(
        {
          error: "state_changed",
          message: "Refresh the current record before retrying.",
        },
        409,
      );
    }
  };
}
