import { defineEvalConfig } from "eve/evals";

import { SkillManagerReporter } from "./skill-manager-reporter";

export default defineEvalConfig({
  maxConcurrency: 2,
  timeoutMs: 90_000,
  reporters: process.env.DATABASE_URL?.trim() ? [SkillManagerReporter()] : [],
});
