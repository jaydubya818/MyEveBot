import { handleWorkRequest } from "@/lib/engineering/api";
export const runtime = "nodejs";
async function handle(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleWorkRequest(request, (await context.params).id);
}
export const GET = handle;
export const PATCH = handle;
