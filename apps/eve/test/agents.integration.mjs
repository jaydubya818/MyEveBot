import assert from "node:assert/strict";
import test from "node:test";

import { db } from "../agent/lib/receipts-db.ts";
import { bindAgentRun } from "../agent/lib/session-settings.ts";
import { createAgent, duplicateAgent, ensurePrimaryAgent, getAgent, listAgents, transitionAgent, updateAgent } from "../lib/agents.ts";

const configured = Boolean(process.env.DATABASE_URL?.trim());
const integration = configured ? test : test.skip;

integration("persistent Agent repository enforces owner, lifecycle, capabilities, primary, duplication, and run attribution", async () => {
  const ownerId = `agent_test_${crypto.randomUUID()}`;
  const otherOwnerId = `agent_test_${crypto.randomUUID()}`;
  const actor = { type: "owner", id: ownerId };
  try {
    const primary = await ensurePrimaryAgent(ownerId);
    assert.equal(primary.isPrimary, true);
    assert.equal(primary.status, "active");
    assert.equal((await listAgents(ownerId, true)).filter((agent) => agent.isPrimary).length, 1);
    await assert.rejects(() => transitionAgent(ownerId, primary.id, "paused", actor), /primary Agent cannot/);

    const researcher = await createAgent(ownerId, {
      name: "Researcher", role: "Research", description: "Evidence-backed research.",
      instructions: "Prefer primary sources.", reasoningPreference: "high", riskCeiling: "medium",
      notificationPolicy: "digest", capabilityIds: ["web.search", "web.read", "files.read", "files.write"],
      limits: { maxSteps: 12, maxRuntimeSeconds: 600, maxEstimatedCostUsd: 1.5, maxRetries: 1 },
    }, actor);
    assert.deepEqual(researcher.capabilities.map((capability) => capability.id), ["files.read", "files.write", "web.read", "web.search"]);
    assert.equal(await getAgent(otherOwnerId, researcher.id), null);

    const paused = await transitionAgent(ownerId, researcher.id, "paused", actor); assert.equal(paused.status, "paused");
    const resumed = await transitionAgent(ownerId, researcher.id, "active", actor); assert.equal(resumed.status, "active");
    const updated = await updateAgent(ownerId, researcher.id, { ...researcher, name: "Senior Researcher", capabilityIds: ["web.search"] }, actor);
    assert.equal(updated.name, "Senior Researcher"); assert.deepEqual(updated.capabilities.map((capability) => capability.id), ["web.search"]);

    const copy = await duplicateAgent(ownerId, researcher.id, "Competitive Researcher", actor);
    assert.notEqual(copy.id, researcher.id); assert.equal(copy.capabilities[0].id, "web.search");
    await bindAgentRun("session_test", "1", ownerId, researcher, "thread_test");
    const run = await db().query(`SELECT agent_id,thread_id FROM agent_runs WHERE session_id=$1 AND owner_id=$2`, ["session_test", ownerId]);
    assert.equal(run[0].agent_id, researcher.id); assert.equal(run[0].thread_id, "thread_test");
    assert.equal((await transitionAgent(ownerId, copy.id, "archived", actor)).status, "archived");
  } finally {
    await db().query(`DELETE FROM agent_runs WHERE owner_id IN ($1,$2)`, [ownerId, otherOwnerId]);
    await db().query(`DELETE FROM agent_audit_events WHERE owner_id IN ($1,$2)`, [ownerId, otherOwnerId]);
    await db().query(`DELETE FROM agent_capabilities WHERE owner_id IN ($1,$2)`, [ownerId, otherOwnerId]);
    await db().query(`DELETE FROM agents WHERE owner_id IN ($1,$2)`, [ownerId, otherOwnerId]);
  }
});
