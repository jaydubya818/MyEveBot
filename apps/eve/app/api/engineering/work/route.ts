import { handleWorkRequest } from "@/lib/engineering/api";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return handleWorkRequest(request);
}
export async function POST(request: Request) {
  return handleWorkRequest(request);
}
