import assert from "node:assert/strict";
import test from "node:test";

import { db } from "../agent/lib/receipts-db.ts";
import { createAgent, transitionAgent } from "../lib/agents.ts";
import {
  assertComputerCapability,
  createComputerSession,
  getComputerSession,
  activeComputerAgentId,
  listComputerActions,
  recordComputerActionRequested,
  recordComputerActionResult,
  pauseComputerSession,
  resumeComputerSession,
  stopComputerSession,
  transitionComputerSession,
  updateComputerSessionAllowedDomains,
} from "../lib/computer-sessions.ts";

const integration = process.env.DATABASE_URL?.trim() ? test : test.skip;

integration("Agent Run computer sessions enforce links, isolation, capabilities, limits, actions, and lifecycle", async () => {
  const ownerId = `computer_test_${crypto.randomUUID()}`;
  const otherOwnerId = `computer_test_${crypto.randomUUID()}`;
  const goalId = `goal_${crypto.randomUUID()}`;
  const goalTaskId = `task_${crypto.randomUUID()}`;
  const runId = `task_${crypto.randomUUID()}`;
  const actor = { type: "owner", id: ownerId };
  let firstAgent;
  let secondAgent;
  try {
    firstAgent = await createAgent(ownerId, {
      name: "Researcher", role: "Research", instructions: "Use public sources.", riskCeiling: "medium",
      capabilityIds: ["computer.session.create", "browser.navigate", "browser.read", "files.write"],
    }, actor);
    secondAgent = await createAgent(ownerId, {
      name: "Writer", role: "Writing", instructions: "Write reports.", riskCeiling: "medium",
      capabilityIds: ["computer.session.create", "browser.navigate"],
    }, actor);
    await db().query(`INSERT INTO goals (id,owner_id,title,status) VALUES ($1,$2,'Research tools','active')`, [goalId, ownerId]);
    await db().query(`INSERT INTO goal_tasks (id,goal_id,title,status) VALUES ($1,$2,'Compare tools','in_progress')`, [goalTaskId, goalId]);
    await db().query(
      `INSERT INTO task_runs (id,owner_id,kind,title,goal_id,goal_task_id,agent_id,status,max_duration_seconds,max_specialists,max_model_steps,max_retries_per_specialist,max_estimated_cost_usd)
       VALUES ($1,$2,'product_qa','Computer integration',$3,$4,$5,'running',600,1,20,0,2)`,
      [runId, ownerId, goalId, goalTaskId, firstAgent.id],
    );

    const session = await createComputerSession({
      ownerId, agentId: firstAgent.id, runtimeSessionId: `runtime_${crypto.randomUUID()}`,
      goalId, taskId: goalTaskId, runId, limits: { maxBrowserActions: 1 },
    });
    assert.equal(session.agentId, firstAgent.id);
    assert.equal(session.goalId, goalId);
    assert.equal(session.taskId, goalTaskId);
    assert.equal(session.runId, runId);
    assert.equal(session.runTitle, "Computer integration");
    assert.equal(await getComputerSession(otherOwnerId, session.id), null);
    await transitionComputerSession({ ownerId, id: session.id, to: "ready", sandboxId: "sandbox_test" });

    assert.equal((await assertComputerCapability({ ownerId, runtimeSessionId: session.runtimeSessionId, agentId: firstAgent.id, capabilityId: "browser.navigate" })).agent.id, firstAgent.id);
    await assert.rejects(() => assertComputerCapability({ ownerId, runtimeSessionId: session.runtimeSessionId, agentId: secondAgent.id, capabilityId: "browser.navigate" }), /another Agent/);
    await assert.rejects(() => assertComputerCapability({ ownerId, runtimeSessionId: session.runtimeSessionId, agentId: firstAgent.id, capabilityId: "terminal.execute" }), /not assigned/);

    await recordComputerActionRequested({ ownerId, agentId: firstAgent.id, runtimeSessionId: session.runtimeSessionId, callId: "call_1", toolName: "browser__navigate", toolInput: { action: "goto", url: "https://example.com" } });
    await recordComputerActionResult({ ownerId, agentId: firstAgent.id, runtimeSessionId: session.runtimeSessionId, callId: "call_1", toolName: "browser__navigate", status: "completed", output: { ok: true } });
    const actions = await listComputerActions(ownerId, session.id);
    assert.equal(actions.length, 1);
    assert.equal(actions[0].type, "browser.navigate");
    assert.equal(actions[0].status, "completed");
    assert.equal((await getComputerSession(ownerId, session.id)).browser.currentUrl, "https://example.com");
    await assert.rejects(() => recordComputerActionRequested({ ownerId, agentId: firstAgent.id, runtimeSessionId: session.runtimeSessionId, callId: "call_2", toolName: "browser__read", toolInput: {} }), /action limit/);
    assert.equal((await getComputerSession(ownerId, session.id)).status, "failed");

    const stoppable = await createComputerSession({ ownerId, agentId: firstAgent.id, runtimeSessionId: `runtime_${crypto.randomUUID()}` });
    await transitionComputerSession({ ownerId, id: stoppable.id, to: "ready", sandboxId: "sandbox_stop_test" });
    assert.equal(await activeComputerAgentId(ownerId, stoppable.runtimeSessionId), firstAgent.id);
    const networkUpdated = await updateComputerSessionAllowedDomains({
      ownerId,
      id: stoppable.id,
      allowedDomains: ["example.com", "*.example.com"],
    });
    assert.deepEqual(networkUpdated.networkPolicy.allowedDomains, ["example.com", "*.example.com"]);
    const networkEvents = await db().query(
      `SELECT id FROM eve_events WHERE owner_id=$1 AND source_id=$2 AND type='COMPUTER_NETWORK_POLICY_UPDATED'`,
      [ownerId, stoppable.id],
    );
    assert.equal(networkEvents.length, 1);
    assert.equal((await pauseComputerSession(ownerId, stoppable.id)).status, "paused");
    assert.equal(await activeComputerAgentId(ownerId, stoppable.runtimeSessionId), null);
    // This repository-only fixture has no Run/Browser/provider binding. It
    // cannot regain execution authority merely because its row says paused.
    await assert.rejects(() => resumeComputerSession(ownerId, stoppable.id), /requires an active Run, ComputerSession, BrowserSession, and provider session binding/);
    assert.equal((await getComputerSession(ownerId, stoppable.id)).status, "paused");
    assert.equal(await activeComputerAgentId(ownerId, stoppable.runtimeSessionId), null);
    await assert.rejects(() => stopComputerSession(ownerId, stoppable.id), /Computer provider environment is unresolved|Exact Computer resource ownership is unavailable/);
    assert.equal((await getComputerSession(ownerId, stoppable.id)).status, "paused");

    await transitionAgent(ownerId, secondAgent.id, "disabled", actor);
    await assert.rejects(() => createComputerSession({ ownerId, agentId: secondAgent.id, runtimeSessionId: `runtime_${crypto.randomUUID()}` }), /disabled/);
  } finally {
    await db().query(`DELETE FROM computer_artifacts WHERE owner_id=$1`, [ownerId]);
    await db().query(`DELETE FROM computer_sessions WHERE owner_id=$1`, [ownerId]);
    await db().query(`DELETE FROM task_runs WHERE owner_id=$1`, [ownerId]);
    await db().query(`DELETE FROM goal_tasks WHERE goal_id=$1`, [goalId]);
    await db().query(`DELETE FROM goals WHERE owner_id=$1`, [ownerId]);
    await db().query(`DELETE FROM eve_events WHERE owner_id=$1`, [ownerId]);
    await db().query(`DELETE FROM agent_audit_events WHERE owner_id=$1`, [ownerId]);
    await db().query(`DELETE FROM agent_capabilities WHERE owner_id=$1`, [ownerId]);
    await db().query(`DELETE FROM agents WHERE owner_id=$1`, [ownerId]);
  }
});
