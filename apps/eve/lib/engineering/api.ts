import { z } from "zod";
import { webPrincipal } from "../web-auth.ts";
import { boundedJson } from "../relay/client.ts";
import { WorkStore } from "./store.ts";
import { WorkError } from "./types.ts";
import { ExecutionStore } from "./execution-store.ts";
import { RoutingStore, routingForWorkVersion } from "./routing-store.ts";
import { manifest } from "./execution.ts";

export function engineeringPrincipal(request: Request) {
  // Internal qualification only until business identity and execution are qualified.
  if (process.env.MYEVE_ENGINEERING_MODE !== "dogfood")
    throw new WorkError(
      "engineering_disabled",
      "Engineering is not enabled in this deployment.",
      404,
    );
  const principal = webPrincipal(request, {
    ...process.env,
    NODE_ENV: "production",
  });
  if (!principal)
    throw new WorkError(
      "sign_in_required",
      "Sign in to this workspace first.",
      401,
    );
  if (
    request.method !== "GET" &&
    (request.headers.get("origin") !== new URL(request.url).origin ||
      request.headers.get("sec-fetch-site") === "cross-site")
  )
    throw new WorkError(
      "same_origin_required",
      "A same-origin workspace action is required.",
      403,
    );
  return {
    scopeId: principal.id,
    actorId: principal.id,
    scopeKind: "personal" as const,
  };
}
const headers = { "cache-control": "no-store" };
export async function handleWorkRequest(request: Request, id?: string) {
  try {
    const store = new WorkStore(engineeringPrincipal(request));
    if (id) z.string().uuid().parse(id);
    if (request.method === "GET") {
      const executions = new ExecutionStore(store);
      const selectedWork = id ? await store.get(id) : null;
      const state = id ? await executions.get(id) : null;
      const items = id ? [] : await store.list();
      return Response.json(
        id
          ? {
              work: selectedWork,
              events: await store.events(id),
              criteriaHistory: await store.criteriaHistory(id),
              execution: state,
              manifest: state ? manifest(selectedWork!,state) : null,
              executionHistory: state ? await executions.history(id) : [],
              routing: routingForWorkVersion(await new RoutingStore(store).snapshot(id), selectedWork!.version),
            }
          : {
              work: items,
              manifests: await Promise.all(items.map(async work=>{const value=await executions.get(work.id);return value?manifest(work,value):null;})),
              execution: {
                available: !!process.env.MYEVE_ENGINEERING_CONFIG && process.env.VERCEL_ENV !== "production",
                reason:
                  process.env.MYEVE_ENGINEERING_CONFIG ? "" : "Repository access and the coding executor must pass qualification before execution can start. Work and criteria can be prepared now.",
              },
            },
        { headers },
      );
    }
    const value = await boundedJson(new Response(request.body), 32000);
    if (id)
      return Response.json(
        { work: await store.change(id, value) },
        { headers },
      );
    const result = await store.create(value);
    return Response.json(result, {
      status: result.created ? 201 : 200,
      headers,
    });
  } catch (error) {
    if (error instanceof WorkError)
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status, headers },
      );
    if (error instanceof z.ZodError)
      return Response.json(
        {
          error: "Check the required fields, criteria and limits.",
          code: "invalid_work",
        },
        { status: 400, headers },
      );
    return Response.json(
      {
        error:
          "Work is temporarily unavailable. Your saved Work has not been discarded.",
        code: "work_unavailable",
      },
      { status: 503, headers },
    );
  }
}
