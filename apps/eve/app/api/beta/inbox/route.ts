import { betaRequest } from "../../../../lib/beta-integration/runtime.ts";
export const GET = (request: Request) => betaRequest(request, "inbox");
export const POST = GET;
