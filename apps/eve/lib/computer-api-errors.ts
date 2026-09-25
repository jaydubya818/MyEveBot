import { apiError, apiRequestId } from "@/lib/api-errors";
import { redactEvidenceText } from "@/lib/task-types";

interface ComputerApiFailureOptions {
  context: string;
  status?: number;
  code?: string;
  message?: string;
}

function safeDiagnostic(error: unknown): { name: string; message: string } {
  const name = error instanceof Error ? error.name : "UnknownError";
  const message = error instanceof Error ? error.message : String(error);
  return {
    name: name.slice(0, 80),
    message: redactEvidenceText(message)
      .replace(/\bhttps?:\/\/[^\s"']+/gi, "[REDACTED_URL]")
      .slice(0, 1_000),
  };
}

export function computerApiFailure(
  request: Request,
  error: unknown,
  options: ComputerApiFailureOptions,
): Response {
  const requestId = logComputerApiDiagnostic(request, error, options.context);
  return apiError(
    request,
    options.status ?? 503,
    options.code ?? "computer_unavailable",
    options.message ?? "The computer session is currently unavailable.",
    requestId,
  );
}

export function logComputerApiDiagnostic(
  request: Request,
  error: unknown,
  context: string,
): string {
  const requestId = apiRequestId(request);
  console.error(context, { requestId, error: safeDiagnostic(error) });
  return requestId;
}
