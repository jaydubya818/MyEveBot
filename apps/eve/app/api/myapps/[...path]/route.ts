import { handleInstalledApps } from "../../../../lib/myapps/hosting.ts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => handleInstalledApps(request);
export const POST = GET;
