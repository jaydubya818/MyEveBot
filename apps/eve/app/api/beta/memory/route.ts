import { betaRequest } from "../../../../lib/beta-integration/runtime.ts";
export const GET = (request: Request) => betaRequest(request, "memory");
export const POST = GET;
