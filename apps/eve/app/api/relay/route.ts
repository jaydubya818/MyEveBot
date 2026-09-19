import { handleOwnerRequest } from "@/lib/relay/owner-api";
export const runtime = "nodejs";
export const maxDuration = 300;
export const GET = handleOwnerRequest;
export const POST = handleOwnerRequest;
