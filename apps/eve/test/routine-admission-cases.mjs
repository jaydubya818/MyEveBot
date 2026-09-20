import {
  ActionGateway as RealGateway,
  consumeActionAuthority,
} from "../lib/action-gateway.ts";
import assert from "node:assert/strict";
import { ExecutionStore } from "../lib/execution-store.ts";
import { routineConfigurationSchema } from "../lib/execution-types.ts";
import { ExecutionDelivery } from "../lib/execution-delivery.ts";
import { executeNextOccurrence } from "../lib/execution-worker.ts";
import { runRoutineNow } from "../lib/routine-run-now.ts";
import { admissionFixture } from "./admission-fixtures.mjs";
export async function qualifyAdmission(
  client,
  database,
  secondDatabase = database,
) {
  const ownerId = "admission-owner",
    agentId = "admission-ava";
  await client.query(
    `INSERT INTO agents(id,owner_id,slug,name,role,instructions,is_primary,status,max_steps,max_runtime_seconds,max_estimated_cost_usd) VALUES($1,$2,'ava','Ava','Review','Review',true,'active',30,600,1)`,
    [agentId, ownerId],
  );
  let available = false,
    enabled = true,
    models = 0,
    providers = 0,
    computers = 0;
  const admission = admissionFixture(database, {
    availability: async (input) =>
      input.capability.id === "notification.send"
        ? { status: "UNAVAILABLE", reasonCode: "provider_missing" }
        : available
          ? { status: "AVAILABLE" }
          : { status: "UNAVAILABLE", reasonCode: "account_missing" },
    executionEnabled: () => enabled,
  });
  const store = new ExecutionStore(database, admission);
  const config = routineConfigurationSchema.parse({
    instructions: "Review local goals",
    authority: {
      allowedCapabilities: ["tool.list_goals"],
      maximumRisk: "medium",
    },
    deliveryChannel: "telegram",
  });
  await store.createRoutine({
    ownerId,
    id: "admission-routine",
    sourceKind: "manual",
    sourceId: "fixture",
    name: "Daily Brief",
    agentId,
    configuration: config,
    changedBy: ownerId,
  });
  const input = {
    ownerId,
    routineId: "admission-routine",
    key: "one-period",
    scheduledFor: new Date().toISOString(),
  };
  const race = await Promise.all([store.enqueue(input), store.enqueue(input)]);
  assert.equal(race[0], race[1]);
  assert.equal(
    (
      await client.query(
        "SELECT count(*) FROM execution_occurrences WHERE owner_id=$1",
        [ownerId],
      )
    ).rows[0].count,
    "1",
  );
  const original = (
    await client.query("SELECT * FROM execution_occurrences WHERE id=$1", [
      race[0],
    ])
  ).rows[0];
  assert.equal(original.status, "blocked_precheck");
  assert.equal(original.run_id, null);
  assert.equal(original.attempt_count, 0);
  assert.equal(original.cost_usd, "0.000000");
  assert.equal(
    (
      await client.query("SELECT count(*) FROM task_runs WHERE owner_id=$1", [
        ownerId,
      ])
    ).rows[0].count,
    "0",
  );
  const runner = {
    preflight: async () => {},
    run: async () => {
      models++;
      return { resultReference: "local-result" };
    },
  };
  assert.equal(
    await executeNextOccurrence({
      ownerId,
      workerId: "blocked",
      store,
      runner,
    }),
    false,
  );
  assert.deepEqual([models, providers, computers], [0, 0, 0]);
  assert.equal(
    (await runRoutineNow(ownerId, input.routineId, 1, store)).status,
    409,
  );
  assert.equal(await admission.inspect("other-owner", input.routineId), null);
  available = true;
  assert.equal(
    (await admission.inspect(ownerId, input.routineId)).state,
    "READY",
  );
  await store.enqueue(input);
  assert.equal(await store.claim(ownerId, "no-backlog"), null);
  assert.deepEqual(
    (
      await client.query(
        "SELECT admission FROM execution_occurrences WHERE id=$1",
        [race[0]],
      )
    ).rows[0].admission,
    original.admission,
  );
  // UI READY -> provider disconnect before the server accepts manual work.
  available = false;
  assert.equal(
    (await runRoutineNow(ownerId, input.routineId, 1, store)).status,
    409,
  );
  available = true;
  assert.equal(
    (await runRoutineNow(ownerId, input.routineId, 2, store)).status,
    409,
  );
  enabled = false;
  assert.equal(
    (await runRoutineNow(ownerId, input.routineId, 1, store)).status,
    409,
  );
  enabled = true;
  const accepted = await runRoutineNow(ownerId, input.routineId, 1, store);
  assert.equal(accepted.status, 202);
  available = false;
  assert.equal(await store.claim(ownerId, "disconnect-race"), null);
  available = true;
  assert.equal(
    (await store.occurrence(ownerId, accepted.occurrenceId)).status,
    "blocked_precheck",
  );
  // Reconnection only admits a new period. It cannot replay historical blocked work.
  await store.enqueue({ ...input, key: "new-period" });
  const claims = await Promise.all([
    store.claim(ownerId, "winner-a"),
    store.claim(ownerId, "winner-b"),
  ]);
  assert.equal(claims.filter(Boolean).length, 1);
  const claim = claims.find(Boolean);
  await store.complete(claim, "persisted-local-result");
  const delivery = new ExecutionDelivery(database);
  let notificationCalls = 0;
  assert.equal(
    await delivery.deliverNext(ownerId, {
      deliver: async () => {
        notificationCalls++;
        return { status: "unavailable" };
      },
    }),
    true,
  );
  assert.equal(
    await delivery.deliverNext(ownerId, {
      deliver: async () => {
        throw new Error("no repeat");
      },
    }),
    false,
  );
  const result = (
    await client.query(
      "SELECT status,result_reference,failure_code FROM review_deliveries WHERE run_id=$1",
      [claim.runId],
    )
  ).rows[0];
  assert.equal(result.status, "skipped");
  assert.equal(result.failure_code, "delivery_unavailable");
  assert.equal(result.result_reference, "persisted-local-result");
  assert.equal(notificationCalls, 1);
  assert.equal(
    (
      await client.query("SELECT status FROM task_runs WHERE id=$1", [
        claim.runId,
      ])
    ).rows[0].status,
    "completed",
  );
  assert.equal(
    (
      await client.query(
        "SELECT consecutive_failures FROM execution_routines WHERE id=$1",
        [input.routineId],
      )
    ).rows[0].consecutive_failures,
    0,
  );
  await store.enqueue({ ...input, key: "safe-execution" });
  const safeRunner = {
    preflight: async (c) => {
      assert.equal(
        (await admission.inspect(ownerId, c.routineId)).canRun,
        true,
      );
    },
    run: async () => {
      models++;
      await client.query(
        `INSERT INTO web_chat_threads(id,owner_id,title,updated_at,chat) VALUES('admission-result',$1,'Local result',1,'{"result":"Saved review"}')`,
        [ownerId],
      );
      return { resultReference: "admission-result" };
    },
  };
  assert.equal(
    await executeNextOccurrence({
      ownerId,
      workerId: "safe-worker",
      store,
      runner: safeRunner,
    }),
    true,
  );
  assert.equal(models, 1);
  assert.equal(
    (
      await client.query(
        "SELECT count(*) FROM web_chat_threads WHERE owner_id=$1 AND id='admission-result'",
        [ownerId],
      )
    ).rows[0].count,
    "1",
  );
  // Agent state race and global kill after occurrence creation are checked before claims.
  await store.enqueue({ ...input, key: "kill-race" });
  enabled = false;
  assert.equal(await store.claim(ownerId, "global-race"), null);
  enabled = true;
  await client.query(
    "UPDATE agents SET is_primary=false,status='disabled' WHERE id=$1",
    [agentId],
  );
  assert.equal(await store.claim(ownerId, "agent-race"), null);
  assert.deepEqual([models, providers, computers], [1, 0, 0]);
  await client.query(
    "UPDATE agents SET is_primary=true,status='active' WHERE id=$1",
    [agentId],
  );
  const blockedStore = new ExecutionStore(
    secondDatabase,
    admissionFixture(secondDatabase, {
      availability: async () => ({
        status: "UNAVAILABLE",
        reasonCode: "account_missing",
      }),
    }),
  );
  const mixed = await Promise.all([
    store.enqueue({ ...input, key: "mixed-race" }),
    blockedStore.enqueue({ ...input, key: "mixed-race" }),
  ]);
  assert.equal(mixed[0], mixed[1]);
  const [winner] = (
    await client.query(
      "SELECT status,run_id FROM execution_occurrences WHERE id=$1",
      [mixed[0]],
    )
  ).rows;
  assert.equal(
    (
      await client.query("SELECT count(*) FROM task_runs WHERE id=$1", [
        `${mixed[0]}_run`,
      ])
    ).rows[0].count,
    winner.status === "blocked_precheck" ? "0" : "1",
  );
  await store.enqueue({ ...input, key: "handle-kill" });
  const killClaim = await store.claim(ownerId, "handle-worker");
  assert.ok(killClaim);
  const gateway = new RealGateway(
    database,
    {
      evaluate: async () => ({
        decision: "ALLOW",
        reason: "fixture",
        source: "fixture",
      }),
    },
    undefined,
    () => enabled,
  );
  await assert.rejects(
    gateway.execute(
      {
        ownerId,
        runId: killClaim.runId,
        actionKey: "kill-before-provider",
        capabilityId: "tool.list_goals",
        actionClass: "read",
        parameters: {},
        executor: { kind: "routine", agentId },
        trigger: { kind: "scheduled_occurrence", id: killClaim.occurrenceId },
        occurrence: {
          id: killClaim.occurrenceId,
          claimVersion: killClaim.version,
          workerId: killClaim.workerId,
        },
      },
      {
        resolveTarget: async () => ({
          provider: "fake",
          account: ownerId,
          resource: "fixture",
        }),
        execute: async (p, h) => {
          enabled = false;
          await consumeActionAuthority(h, p, "tool.list_goals");
          providers++;
          return {};
        },
        verify: async () => ({ verified: true, receipt: {} }),
      },
    ),
  );
  assert.equal(
    providers,
    0,
    "global kill is rechecked when the one-use handle is consumed",
  );
  enabled = true;
  console.log(
    "PASS: admission blocked-period uniqueness; zero Run/model/provider/Computer on missing dependency; immutable history; reconnect without replay; server Run Now races; one winning claim; optional delivery unavailable preserves completed result; no failure-counter increment",
  );
}
