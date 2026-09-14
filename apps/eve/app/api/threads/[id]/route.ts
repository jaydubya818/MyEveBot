import { deleteThread, getThreadChat, upsertThread, upsertThreadMeta } from "@/lib/threads-db";
import { apiError, requireDatabase } from "@/lib/api-errors";
import { requireWebAuth } from "@/lib/web-auth";

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
    const chat = await getThreadChat(id);
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
    origin: (body.origin === "reminder" || body.origin === "webhook"
      ? body.origin
      : "web") as "web" | "reminder" | "webhook",
  };
  // Meta-only updates (rename, pin) omit the chat payload to leave it intact.
  try {
    if (typeof body.chat === "object" && body.chat !== null) {
      await upsertThread(id, meta, body.chat);
    } else {
      await upsertThreadMeta(id, meta);
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
    await deleteThread(id);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Thread delete failed", error);
    return apiError(request, 503, "thread_delete_failed", "This conversation could not be deleted.");
  }
}
