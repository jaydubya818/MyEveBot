import { defineEvalConfig } from "eve/evals";
import { Braintrust } from "eve/evals/reporters";

import { SkillManagerReporter } from "./skill-manager-reporter";

export default defineEvalConfig({
  judge: { model: "anthropic/claude-haiku-4.5" },
  maxConcurrency: 2,
  timeoutMs: 120_000,
  reporters: [
    ...(process.env.DATABASE_URL?.trim() ? [SkillManagerReporter()] : []),
    ...(process.env.BRAINTRUST_API_KEY ? [Braintrust({ projectName: "sofie" })] : []),
  ],
});
