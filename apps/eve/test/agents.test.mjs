import assert from "node:assert/strict";
import test from "node:test";

import { agentSlug, effectiveCapability, validateAgentInput } from "../lib/agents.ts";

function agent(overrides = {}) {
  return {
    id: "agent_researcher", ownerId: "owner_a", name: "Researcher", slug: "researcher", label: null,
    role: "Research", description: "Evidence-backed research", instructions: "Prefer primary sources.",
    status: "active", isPrimary: false, preferredModel: null, reasoningPreference: "high", avatarConfig: {},
    riskCeiling: "medium", notificationPolicy: "activity",
    limits: { maxSteps: 20, maxRuntimeSeconds: 900, maxEstimatedCostUsd: 2, maxRetries: 1 },
    capabilities: [{ id: "web.search", name: "Web search", enabled: true, risk: "low", availability: "available" }],
    createdAt: "2026-09-13T00:00:00.000Z", updatedAt: "2026-09-13T00:00:00.000Z", archivedAt: null,
    ...overrides,
  };
}

test("Agent slugs are deterministic and distribution-generic", () => {
  assert.equal(agentSlug("Evidence Researcher"), "evidence-researcher");
  assert.equal(agentSlug("Áva's Analyst"), "ava-s-analyst");
});

test("Agent validation rejects unknown and over-ceiling capabilities", () => {
  const base = { name: "Researcher", role: "Research", instructions: "Prefer primary sources.", riskCeiling: "low" };
  assert.match(validateAgentInput({ ...base, capabilityIds: ["integration.composio"] }), /exceeds/);
  assert.match(validateAgentInput({ ...base, capabilityIds: ["missing.capability"] }), /Unknown capability/);
  assert.equal(validateAgentInput({ ...base, capabilityIds: ["web.search", "files.read"] }), null);
});

test("secondary Agents cannot borrow unassigned or unavailable capabilities", () => {
  assert.deepEqual(effectiveCapability(agent(), "web.search"), { allowed: true });
  assert.match(effectiveCapability(agent(), "integration.composio").reason, /not assigned/);
  const unavailable = agent({ capabilities: [{ id: "web.search", name: "Web search", enabled: true, risk: "low", availability: "unconfigured", availabilityReason: "Requires a key." }] });
  assert.match(effectiveCapability(unavailable, "web.search").reason, /Requires a key/);
});

test("paused, disabled, and archived Agents cannot execute", () => {
  for (const status of ["paused", "disabled", "archived"]) {
    assert.match(effectiveCapability(agent({ status }), "web.search").reason, new RegExp(status));
  }
});

test("primary Agent retains deployment capabilities and protection is separate from role", () => {
  assert.deepEqual(effectiveCapability(agent({ isPrimary: true, capabilities: [] }), "integration.composio"), { allowed: true });
  assert.equal(validateAgentInput({ name: "Writer", role: "Administrator", instructions: "Write clearly.", riskCeiling: "low", capabilityIds: [] }), null);
});
