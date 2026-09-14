import { searchThreads } from "@/lib/threads-db";
import { apiError, requireDatabase } from "@/lib/api-errors";
import { requireWebAuth } from "@/lib/web-auth";

// Full-text search across the server-side thread store. Matches user and
// assistant message text inside each thread's persisted event log, so old
// conversations are findable by what was said, not just their titles.

export async function GET(request: Request): Promise<Response> {
  const denied = requireWebAuth(request);
  if (denied) return denied;
  const unavailable = requireDatabase(request);
  if (unavailable) return unavailable;

  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return Response.json({ results: [] });

  try {
    const results = await searchThreads(query, 20);
    return Response.json({ results });
  } catch (error) {
    console.error("Thread search failed", error);
    return apiError(request, 503, "thread_search_failed", "Conversation search is temporarily unavailable.");
  }
}
