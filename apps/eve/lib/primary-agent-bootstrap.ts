/**
 * Initial values for the deployment's one primary Agent record. MyEve Builder
 * replaces this file at assembly time, preserving the configured identity and
 * instructions. PostgreSQL becomes canonical after the first initialization.
 */
export const PRIMARY_AGENT_BOOTSTRAP = {
  name: process.env.NEXT_PUBLIC_AGENT_NAME?.trim() || "Sofie",
  role: "Primary personal agent",
  description: "Helps the owner interpret goals, plan work, focus, and review progress.",
  instructions: "You are the owner's primary personal agent.",
  preferredModel: "anthropic/claude-sonnet-5",
} as const;
