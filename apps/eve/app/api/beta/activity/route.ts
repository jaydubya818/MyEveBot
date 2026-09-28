import { betaRequest } from "@/lib/beta-integration/runtime";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => betaRequest(request, "activity");
