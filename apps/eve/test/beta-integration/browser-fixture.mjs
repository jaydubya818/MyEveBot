import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { BetaIntegration } from "../../lib/beta-integration/runtime.ts";
import { produceLocalResult } from "./local-result.mjs";
const pool = new Pool({
  host: "127.0.0.1",
  port: 55489,
  user: "postgres",
  database: "myeve_beta_phase2",
});
try {
  const beta = new BetaIntegration(pool, {
      repository: "qualification/design-partner",
      maxCostUsd: 1,
      maxDurationSeconds: 300,
    }),
    owner = "beta-owner";
  const [row] = await beta.query(
    "SELECT id FROM goals WHERE owner_id=$1 AND title='Prepare the authenticated browser brief' ORDER BY created_at DESC LIMIT 1",
    [owner],
  );
  if (!row) throw Error("Create the browser Goal first");
  const goal = await beta.queries(owner).goal(row.id),
    first = goal.tasks[0],
    taskId = "browser-decision-" + randomUUID();
  await beta.service(owner, "owner").addTask(goal.id, {
    id: taskId,
    objective: "Confirm the launch channel",
    criteria: goal.successCriteria,
    dependencies: [
      {
        id: "first",
        kind: "task",
        reference: first.id,
        label: "Brief prepared",
      },
      {
        id: "choice",
        kind: "owner",
        reference: "fixture:launch-channel",
        label: "Choose the browser launch channel",
        options: ["Website", "Email"],
      },
    ],
    provenance: { kind: "owner", reference: "browser-fixture", depth: 0 },
  });
  const result = await produceLocalResult(beta, owner, first.currentWork);
  await beta
    .service(owner)
    .receiveResult(goal.id, first.id, first.currentWork, result.id);
  const state = {
    goalId: goal.id,
    taskId,
    firstWork: first.currentWork,
    resultId: result.id,
  };
  await writeFile(
    new URL(
      "../../../../docs/verification/beta-integration/phase2/browser-fixture.json",
      import.meta.url,
    ),
    JSON.stringify(state, null, 2) + "\n",
  );
  console.log(state);
} finally {
  await pool.end();
}
