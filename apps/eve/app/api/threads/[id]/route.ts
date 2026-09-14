import { deleteThread, getThreadChat, upsertThread, upsertThreadMeta } from "@/lib/threads-db";
import { apiError, requireDatabase } from "@/lib/api-errors";
import { requireWebAuth } from "@/lib/web-auth";
import { requestOwnerId } from "@/lib/agent-api";
import { getAgent } from "@/lib/agents";
import { BUILTIN_ROLE_CATALOG } from "@/lib/builtin-role-catalog";

type RouteContext = { params: Promise<{ id: string }> };

function databaseGuard(request: Request): Response | null {
  const denied = requireWebAuth(request);
  return denied ?? requireDatabase(request);
}

export async function GET(request: Request, ctx: RouteContext): Promise<Response> {
  const denied = databaseGuard(request);
  if (denied) return denied;
  const { id } = await ctx.params;
  try {
    const chat = await getThreadChat(requestOwnerId(request), id);
    if (chat === null) return new Response("Not found", { status: 404 });
    return Response.json({ chat });
  } catch (error) {
    console.error("Thread read failed", error);
    return apiError(request, 503, "thread_unavailable", "This conversation is temporarily unavailable.");
  }
}

export async function PUT(request: Request, ctx: RouteContext): Promise<Response> {
  const denied = databaseGuard(request);
  if (denied) return denied;
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => null)) as {
    title?: unknown;
    updatedAt?: unknown;
    pinned?: unknown;
    renamed?: unknown;
    origin?: unknown;
    agentId?: unknown;
    roleId?: unknown;
    chat?: unknown;
  } | null;
  if (body === null || typeof body.title !== "string" || typeof body.updatedAt !== "number") {
    return new Response("Invalid body", { status: 400 });
  }
  const meta = {
    title: body.title,
    updatedAt: body.updatedAt,
    pinned: body.pinned === true,
    renamed: body.renamed === true,
    // Origin only matters on first insert; existing rows keep theirs.
    origin: (body.origin === "reminder" ||
    body.origin === "webhook" ||
    body.origin === "email" ||
    body.origin === "notification" ||
    body.origin === "voice"
      ? body.origin
      : "web") as import("@/lib/threads-db").ThreadOrigin,
    agentId: typeof body.agentId === "string" ? body.agentId : undefined,
    roleId: typeof body.roleId === "string" ? body.roleId : undefined,
  };
  // Meta-only updates (rename, pin) omit the chat payload to leave it intact.
  try {
    const ownerId = requestOwnerId(request);
    if (meta.agentId && await getAgent(ownerId, meta.agentId) === null) {
      return apiError(request, 400, "invalid_agent", "Agent not found for this owner.");
    }
    if (meta.agentId && meta.roleId) {
      return apiError(request, 400, "invalid_executor", "Choose either a persistent Agent or an on-demand Role.");
    }
    const role = meta.roleId ? BUILTIN_ROLE_CATALOG.roles.find((candidate) => candidate.id === meta.roleId) : undefined;
    if (meta.roleId && role?.executionMode !== "on-demand") {
      return apiError(request, 400, "invalid_role", "Role is not available for on-demand use.");
    }
    if (typeof body.chat === "object" && body.chat !== null) {
      await upsertThread(ownerId, id, meta, body.chat);
    } else {
      await upsertThreadMeta(ownerId, id, meta);
    }
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Thread save failed", error);
    return apiError(request, 503, "thread_save_failed", "This conversation could not be saved.");
  }
}

export async function DELETE(request: Request, ctx: RouteContext): Promise<Response> {
  const denied = databaseGuard(request);
  if (denied) return denied;
  const { id } = await ctx.params;
  try {
    await deleteThread(requestOwnerId(request), id);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Thread delete failed", error);
    return apiError(request, 503, "thread_delete_failed", "This conversation could not be deleted.");
  }
}
