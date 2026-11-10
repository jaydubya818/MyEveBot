/**
 * The owner-safe code of a refusal: only a leading UPPER_SNAKE code (optionally `:<stage digit>`), never a message body, value or path.
 * e.g. `HOSTED_CONFIRMATION_PROPOSE:[Request ID: …] Server Error` -> `HOSTED_CONFIRMATION_PROPOSE`; `QDEV_WORK_BUDGET_EXCEEDS_OPERATION_RESERVATION:1` kept.
 */
export function refusalCode(error: unknown, fallback = "UNCLASSIFIED"): string {
  const raw = (error as { code?: unknown } | null)?.code ?? (error as Error | null)?.message;
  const match = typeof raw === "string" ? /^[A-Z][A-Z0-9_]{2,80}(?::[0-9]{1,2}(?![0-9]))?/.exec(raw) : null;
  return match ? match[0] : fallback;
}
