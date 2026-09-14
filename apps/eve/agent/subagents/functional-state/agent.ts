import { defineAgent } from "eve";

export default defineAgent({
  description:
    "Functional & State QA specialist for the deployed personal agent's fixed critical-path local and preview checks. Read-only and evidence-backed.",
  modelContextWindowTokens: 200_000,
  model: "anthropic/claude-sonnet-5",
});
