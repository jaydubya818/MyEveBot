/**
 * QA-27: Deep Agent is a route name in deployable code, not a qualified
 * provider. Keep the user-facing copy in one place so chat instructions,
 * routing refusals, and the owner label cannot drift.
 */
export const DEEP_AGENT_UNAVAILABLE_LABEL =
  "Deep Agent is unavailable until qualified";

export function deepAgentIsQualified(input: {
  binding: { id: string; version: string | number } | null | undefined;
  qualification:
    | { status: string; health: string }
    | null
    | undefined;
}): boolean {
  return (
    input.binding != null &&
    input.qualification != null &&
    input.qualification.status === "QUALIFIED" &&
    input.qualification.health === "HEALTHY"
  );
}
