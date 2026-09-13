import assert from "node:assert/strict";
import test from "node:test";

import {
  CAPABILITY_DEFINITIONS,
  checkCapabilityAvailability,
  findCapabilities,
  getAvailableCapabilities,
  getCapabilitiesForObjective,
} from "../lib/capability-registry.ts";

test("registry ids and authored tool references are unique", () => {
  const ids = CAPABILITY_DEFINITIONS.map((capability) => capability.id);
  const toolReferences = CAPABILITY_DEFINITIONS
    .filter((capability) => capability.kind === "tool")
    .map((capability) => capability.source.reference);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(toolReferences).size, toolReferences.length);
});

test("availability distinguishes disabled features from missing configuration", () => {
  assert.deepEqual(
    checkCapabilityAvailability("memory.supermemory", { EVE_ENABLED_FEATURES: "browser" }),
    { status: "disabled", configured: false, reason: "Not included in this deployment." },
  );
  assert.deepEqual(checkCapabilityAvailability("memory.supermemory", {}), {
    status: "unconfigured",
    configured: false,
    reason: "Requires SUPERMEMORY_API_KEY.",
  });
});

test("available capability filtering respects risk and permission", () => {
  const available = getAvailableCapabilities(
    { maxRisk: "low", permission: "utility.execute" },
    { EVE_ENABLED_FEATURES: "utilities" },
  );
  assert.deepEqual(available.map((capability) => capability.id), ["tool.roll_dice"]);
});

test("objective discovery returns relevant available capabilities only", () => {
  const env = {
    EVE_ENABLED_FEATURES: "memory,integrations,browser",
    SUPERMEMORY_API_KEY: "configured",
    COMPOSIO_API_KEY: "configured",
  };
  const interview = getCapabilitiesForObjective("Research my interviewers using email and the web", env);
  assert.ok(interview.some((capability) => capability.id === "integration.composio"));
  assert.ok(interview.some((capability) => capability.id === "computer.browser"));
  assert.ok(interview.every((capability) => capability.availability.status === "available"));

  const memory = findCapabilities("memory", { availability: "available" }, env);
  assert.ok(memory.some((capability) => capability.id === "memory.supermemory"));
});

test("structured Knowledge is database-backed and independent of Supermemory", () => {
  const capabilities = getCapabilitiesForObjective("What did we decide about Relay?", {
    EVE_ENABLED_FEATURES: "knowledge",
    DATABASE_URL: "postgres://configured",
  });
  assert.ok(capabilities.some((capability) => capability.id === "knowledge.structured"));
  assert.ok(capabilities.some((capability) => capability.id === "tool.list_decisions"));
  assert.ok(capabilities.every((capability) => capability.id !== "memory.supermemory"));
});
