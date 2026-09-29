import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile, readFile } from "node:fs/promises";
import { Pool } from "pg";
import { BetaIntegration } from "../../lib/beta-integration/runtime.ts";
import {
  sweepBetaSchedules,
  runBetaScheduleSweep,
} from "../../lib/beta-integration/scheduler.ts";
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
    owner = "schedule-" + randomUUID();
  assert.equal(await runBetaScheduleSweep(), undefined);
  for (const future of [true, false]) {
    const id = randomUUID(),
      taskId = randomUUID(),
      service = beta.service(owner);
    await beta
      .service(owner, "owner")
      .create({
        id,
        objective: "Retained schedule qualification",
        criteria: ["Canonical result required"],
      });
    const plan = await service.plan(
      id,
      "Follow retained schedule",
      "Local qualification",
    );
    await service.addTask(id, {
      id: taskId,
      objective: "Prepare scheduled output",
      criteria: ["Canonical result required"],
      dependencies: [
        {
          id: "due",
          kind: "schedule",
          reference: "existing:operations-monitor",
          label: "Retained scheduled start",
          notBefore: new Date(
            Date.now() + (future ? 3600000 : -1000),
          ).toISOString(),
        },
      ],
      provenance: { kind: "plan", reference: plan.id, depth: 0 },
    });
    await Promise.all(
      Array.from({ length: 6 }, () => sweepBetaSchedules(beta, owner)),
    );
    const goal = await beta.queries(owner).goal(id);
    if (future) assert.equal(goal.tasks[0].currentWork, null);
    else {
      const work = await beta.store(owner).get(goal.tasks[0].currentWork);
      assert.equal(work.control, "paused");
      assert.equal(
        (
          await beta.query(
            "SELECT count(*)::int n FROM beta_goal_work_bindings WHERE owner_id=$1",
            [owner],
          )
        )[0].n,
        1,
      );
      assert.equal(
        (
          await beta.query(
            "SELECT count(*)::int n FROM engineering_routing_decisions WHERE scope_id=$1",
            [owner],
          )
        )[0].n,
        0,
      );
    }
  }
  await writeFile(
    new URL(
      "../../../../docs/verification/beta-integration/phase2/scheduler.json",
      import.meta.url,
    ),
    JSON.stringify(
      {
        status: "PASS",
        existingSource: "operations-monitor",
        futureDependency: "BLOCKED",
        concurrentWakeCount: 6,
        createdWork: 1,
        workControl: "paused",
        admissions: 0,
        externalEvents: "NOT_MOUNTED_PENDING_REVIEW",
      },
      null,
      2,
    ) + "\n",
  );
  // Prepare an explicit Goal judgment fixture for the authenticated UI. No Result or source event is fabricated.
  const evidence = JSON.parse(
    await readFile(
      new URL(
        "../../../../docs/verification/beta-integration/phase2/canonical-journey.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const [browserGoal] = await beta.query(
    "SELECT id FROM goals WHERE owner_id=$1 AND title='Phase 2 authenticated launch follow-up' ORDER BY created_at DESC LIMIT 1",
    [evidence.owner],
  );
  assert(browserGoal);
  await beta
    .service(evidence.owner, "owner")
    .addTask(browserGoal.id, {
      id: randomUUID(),
      objective: "Confirm the follow-up channel",
      criteria: ["Owner channel selected"],
      dependencies: [
        {
          id: "choice",
          kind: "owner",
          reference: "fixture:phase2-channel",
          label: "Choose the follow-up channel",
          options: ["Website", "Email"],
        },
      ],
      provenance: {
        kind: "owner",
        reference: "local-authenticated-browser-qualification",
        depth: 0,
      },
    });
  await beta.service(evidence.owner).tick(browserGoal.id);
  console.log("PASS retained due schedules and Goal judgment browser fixture");
} finally {
  await pool.end();
}
