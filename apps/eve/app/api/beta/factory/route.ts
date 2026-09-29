import { betaRequest } from "../../../../lib/beta-integration/runtime.ts";
export const POST = (request: Request) => betaRequest(request, "factory");
