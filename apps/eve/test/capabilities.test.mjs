import assert from "node:assert/strict";
import test from "node:test";

import { capabilityMap } from "../lib/capabilities.ts";

test("included capabilities report setup requirements instead of disappearing", () => {
  const capabilities = capabilityMap({});

  assert.equal(capabilities.appearance.state, "ready");
  assert.equal(capabilities.computer.state, "ready");
  assert.equal(capabilities.reminders.state, "setup_required");
  assert.match(capabilities.reminders.setupHint, /DATABASE_URL/);
  assert.equal(capabilities.memory.state, "setup_required");
  assert.match(capabilities.memory.setupHint, /SUPERMEMORY_API_KEY/);
});

test("configured capabilities report ready", () => {
  const capabilities = capabilityMap({
    DATABASE_URL: "postgres://example",
    SUPERMEMORY_API_KEY: "configured",
    COMPOSIO_API_KEY: "configured",
    BLOB_READ_WRITE_TOKEN: "configured",
  });

  for (const id of ["reminders", "triggers", "memory", "connections", "skills", "finance", "goals", "knowledge"]) {
    assert.equal(capabilities[id].state, "ready", id);
  }
});

test("builder feature selection marks omitted capabilities as excluded", () => {
  const capabilities = capabilityMap({ EVE_ENABLED_FEATURES: "memory, browser" });

  assert.equal(capabilities.memory.state, "setup_required");
  assert.equal(capabilities.computer.state, "ready");
  assert.equal(capabilities.finance.state, "excluded");
  assert.equal(capabilities.connections.state, "excluded");
  assert.equal(capabilities.goals.state, "excluded");
  assert.equal(capabilities.knowledge.state, "excluded");
  assert.equal(capabilities.appearance.state, "ready");
});
