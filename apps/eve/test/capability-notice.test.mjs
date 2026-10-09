import assert from "node:assert/strict";
import test from "node:test";

import { setupRequiredCapabilityLabels } from "../lib/capability-notice.ts";

test("limited-mode copy names only capabilities that need setup", () => {
  assert.deepEqual(
    setupRequiredCapabilityLabels([
      { id: "appearance", state: "ready" },
      { id: "memory", state: "setup_required" },
      { id: "connections", state: "setup_required" },
      { id: "finance", state: "excluded" },
    ]),
    ["Memory", "Connected apps"],
  );
});

test("limited-mode copy stays out of the way when everything is ready", () => {
  assert.deepEqual(
    setupRequiredCapabilityLabels([
      { id: "memory", state: "ready" },
      { id: "connections", state: "ready" },
    ]),
    [],
  );
});
