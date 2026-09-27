import { mkdir, writeFile } from "node:fs/promises";
import {
  integrationRuntime,
  inspectedSources,
} from "./fixtures/goal-work/integration-runtime.mjs";
import { runGoalWorkAcceptance } from "./goal-work.acceptance.mjs";
const h = await integrationRuntime();
try {
  const result = await runGoalWorkAcceptance(h);
  if (process.env.GOAL_EVIDENCE_DIR) {
    await mkdir(process.env.GOAL_EVIDENCE_DIR, { recursive: true });
    for (const [name, value] of Object.entries({
      ...result.artifacts,
      qualification: { ...result, artifacts: undefined },
      sources: inspectedSources,
    }))
      await writeFile(
        `${process.env.GOAL_EVIDENCE_DIR}/${name}.json`,
        JSON.stringify(value, null, 2) + "\n",
      );
  }
  console.log(
    "QUALIFICATION",
    JSON.stringify({
      scenarios: result.passed.length,
      counters: result.counters,
      canonicalFixtureWorks: result.canonicalFixtureWorks,
      live: "NOT_RUN",
    }),
  );
} finally {
  await h.close();
}
