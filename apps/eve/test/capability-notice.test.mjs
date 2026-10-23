import assert from "node:assert/strict";
import test from "node:test";

import { setupRequiredCapabilityLabels, formatLimitedModeDetail } from "../lib/capability-notice.ts";

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

// QA-38: truncation tests
test("limited-mode detail for 1 label uses singular 'needs'", () => {
  assert.equal(
    formatLimitedModeDetail(["Memory"]),
    "Memory needs setup. Everything else remains available.",
  );
});

test("limited-mode detail for 2 labels uses 'and' and plural 'need'", () => {
  assert.equal(
    formatLimitedModeDetail(["Memory", "Connected apps"]),
    "Memory and Connected apps need setup. Everything else remains available.",
  );
});

test("limited-mode detail for 3 labels uses 'and' and plural 'need'", () => {
  assert.equal(
    formatLimitedModeDetail(["Memory", "Connected apps", "Goals"]),
    "Memory and Connected apps and Goals need setup. Everything else remains available.",
  );
});

test("limited-mode detail truncates at 3 visible labels (QA-38: avoid run-on)", () => {
  assert.equal(
    formatLimitedModeDetail(["Memory", "Connected apps", "Goals", "Reminders"]),
    "Memory, Connected apps, and 2 more need setup. Everything else remains available.",
  );
});

test("limited-mode detail truncates 6 labels correctly", () => {
  const labels = ["Memory", "Connected apps", "Goals", "Reminders", "Triggers", "Finance"];
  assert.equal(
    formatLimitedModeDetail(labels),
    "Memory, Connected apps, and 4 more need setup. Everything else remains available.",
  );
});
