import run0 from "./retained/0a8db3e4-7d40-4be6-92b0-d5e6f6124648.json";
import run1 from "./retained/293b3ad5-2f93-4337-b3f3-ea37df476cb8.json";
import run2 from "./retained/a7438d26-d413-42db-84b7-eacda88c00ee.json";
import run3 from "./retained/d2263f0f-a636-4dcc-bba5-506e822d10a5.json";
import run4 from "./retained/e31927e6-4ff2-41a3-84d1-61b5f8533da9.json";
import run5 from "./retained/ee91fa28-2b8d-480f-84ee-2679c7ce15a6.json";
import { evaluationArtifactSchema } from "./evaluation.ts";

/** Public synthetic historical experiments only; no owner data or provider calls. */
export function retainedEvaluationRuns() {
  return [run0, run1, run2, run3, run4, run5]
    .map((run) => evaluationArtifactSchema.parse(run))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
