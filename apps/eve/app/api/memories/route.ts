import { memoryStore } from "@/agent/lib/memory-store";
import { apiError } from "@/lib/api-errors";
import { capabilityMap } from "@/lib/capabilities";
import { requireWebAuth } from "@/lib/web-auth";
import { requestOwnerId } from "@/lib/agent-api";

function memoryGuard(request: Request): Response | null {
  const denied = requireWebAuth(request);
  if (denied) return denied;
  if (capabilityMap().memory.state !== "ready") {
    return apiError(request, 503, "memory_not_configured", "Memory needs Supermemory setup.");
  }
  return null;
}

export async function GET(request: Request): Promise<Response> {
  const denied = memoryGuard(request);
  if (denied) return denied;
  try {
    const memories = await memoryStore.listForOwner(requestOwnerId(request));
    return Response.json({ memories });
  } catch (error) {
    console.error("Memory list failed", error);
    return apiError(request, 503, "memory_unavailable", "Memory is temporarily unavailable.");
  }
}

export async function DELETE(request: Request): Promise<Response> {
  const denied = memoryGuard(request);
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { id?: unknown } | null;
  if (body === null || typeof body.id !== "string" || body.id.length === 0) {
    return new Response("Invalid body", { status: 400 });
  }
  try {
    const forgotten = await memoryStore.deleteForOwner(requestOwnerId(request), body.id);
    if (!forgotten) return new Response("Not found", { status: 404 });
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Memory delete failed", error);
    return apiError(request, 503, "memory_delete_failed", "That memory could not be deleted.");
  }
}
