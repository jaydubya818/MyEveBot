import { handleNativeAdmission } from "@/lib/engineering/native-api";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return handleNativeAdmission(request, (await context.params).id);
}
export async function POST(request: Request, context: Context) {
  return handleNativeAdmission(request, (await context.params).id);
}
