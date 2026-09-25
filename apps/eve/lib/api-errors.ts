import { randomUUID } from "node:crypto";

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}

export function apiRequestId(request: Request): string {
  return request.headers.get("x-request-id")?.slice(0, 128) || randomUUID();
}

export function apiError(
  request: Request,
  status: number,
  code: string,
  message: string,
  requestId = apiRequestId(request),
): Response {
  return Response.json(
    { error: { code, message, requestId } } satisfies ApiErrorBody,
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export function requireDatabase(request: Request): Response | null {
  if (process.env.DATABASE_URL?.trim()) return null;
  return apiError(
    request,
    503,
    "database_not_configured",
    "Database setup is required before this feature can be used.",
  );
}
