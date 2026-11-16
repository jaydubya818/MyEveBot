/**
 * The owner-safe code of a refusal: only a leading UPPER_SNAKE code (optionally `:<stage digit>`), never a message body, value or path.
 * e.g. `HOSTED_CONFIRMATION_PROPOSE:[Request ID: …] Server Error` -> `HOSTED_CONFIRMATION_PROPOSE`; `QDEV_WORK_BUDGET_EXCEEDS_OPERATION_RESERVATION:1` kept.
 */
export function refusalCode(error: unknown, fallback = "UNCLASSIFIED"): string {
  const raw = (error as { code?: unknown } | null)?.code ?? (error as Error | null)?.message;
  const match = typeof raw === "string" ? /^[A-Z][A-Z0-9_]{2,80}(?::[0-9]{1,2}(?![0-9]))?/.exec(raw) : null;
  return match ? match[0] : fallback;
}

/**
 * The owner-safe halt code shown in chat and kept in the journal: a QDEV_* code as is; otherwise `QDEV_HALTED:<CODE>` where CODE is the first
 * UPPER_SNAKE token (>= 6 chars, at least one underscore) of the underlying refusal, e.g. "Capability admission denied: RUNTIME_ROLE_UNQUALIFIED"
 * -> `QDEV_HALTED:RUNTIME_ROLE_UNQUALIFIED`. Never a message body, value or path; plain `QDEV_HALTED` when no such token exists.
 */
export const HALT_CODE = /^QDEV_[A-Z_]+(?::[A-Z][A-Z0-9_]{5,80})?$/;
export function haltCode(code: unknown): string {
  const raw = typeof code === "string" ? code : "";
  if (/^QDEV_[A-Z_]+$/.test(raw) || HALT_CODE.test(raw)) return raw;   // QDEV_X or an already-detailed QDEV_X:<CODE> (e.g. QDEV_RESULT_NOT_COMPLETED:FACTORY_FAILED)
  const token = /(?<![A-Za-z0-9_])[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+(?![A-Za-z0-9_])/.exec(raw)?.[0];
  return token && token.length >= 6 && token.length <= 81 ? `QDEV_HALTED:${token}` : "QDEV_HALTED";
}

/**
 * The halt detail kept for haltCode(): the error message, and when it carries no UPPER_SNAKE token, the error's own lower_snake `code`
 * upper-cased (e.g. CapabilityError capabilities_unavailable "This hosted installation is not qualified." -> "... [CAPABILITIES_UNAVAILABLE]").
 */
export function haltDetail(error: unknown): string {
  const message = error instanceof Error ? error.message : "QDEV_UNKNOWN";
  if (haltCode(message) !== "QDEV_HALTED") return message;
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/.test(code) && code.length <= 80 ? `${message} [${code.toUpperCase()}]` : message;
}
