import { defineAgent } from "eve";

export default defineAgent({
  description:
    "Trust & Resilience QA specialist for the deployed personal agent's authentication, owner boundary, failure, cancellation, and retry checks. Read-only and evidence-backed.",
  model: "anthropic/claude-sonnet-5",
});
