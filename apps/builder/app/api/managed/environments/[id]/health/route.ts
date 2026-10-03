import { adminDenied, isManagedAdmin } from "@/managed/admin-auth";
import { checkManagedHealth } from "@/managed/health";
import { managedProjectName } from "@/managed/state";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!isManagedAdmin(request)) return adminDenied();
  const { id } = await context.params;
  try { managedProjectName(id); }
  catch { return Response.json({ error: "Unknown managed Eve" }, { status: 404 }); }
  try {
    const result = await checkManagedHealth(id);
    return Response.json(result, {
      status: result.status === "healthy" ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ error: "Health could not be verified; inspect the environment and Vercel configuration" }, {
      status: 503, headers: { "Cache-Control": "no-store" },
    });
  }
}
