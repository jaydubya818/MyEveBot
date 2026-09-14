import { listThreads } from "@/lib/threads-db";
import { apiError, requireDatabase } from "@/lib/api-errors";
import { requireWebAuth } from "@/lib/web-auth";

export async function GET(request: Request): Promise<Response> {
  const denied = requireWebAuth(request);
  if (denied) return denied;
  const unavailable = requireDatabase(request);
  if (unavailable) return unavailable;
  try {
    const threads = await listThreads();
    return Response.json({ threads });
  } catch (error) {
    console.error("Thread list failed", error);
    return apiError(request, 503, "threads_unavailable", "Conversations are temporarily unavailable.");
  }
}
