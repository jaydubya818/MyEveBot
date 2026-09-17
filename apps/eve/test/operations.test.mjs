import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { operationsReportFromCounts } from "../lib/operations.ts";

const zero = {
  failedTurns: 0,
  stuckRuns: 0,
  orphanedComputers: 0,
  routineFailures: 0,
  modelLimits: 0,
  artifactFailures: 0,
};

test("operations report is healthy when every monitored signal is clear", () => {
  const report = operationsReportFromCounts(zero, "2026-09-17T00:00:00.000Z");
  assert.equal(report.overall, "healthy");
  assert.equal(report.signals.length, 6);
  assert.ok(report.signals.every((signal) => signal.state === "healthy"));
});

test("stale Runs and orphaned Computer sessions are immediately critical", () => {
  const report = operationsReportFromCounts({ ...zero, stuckRuns: 1, orphanedComputers: 1 });
  assert.equal(report.overall, "critical");
  assert.equal(report.signals.find((signal) => signal.id === "stuck_runs")?.state, "critical");
  assert.equal(report.signals.find((signal) => signal.id === "orphaned_computers")?.state, "critical");
});

test("transient failures warn before their escalation threshold", () => {
  const report = operationsReportFromCounts({ ...zero, failedTurns: 1, routineFailures: 1, artifactFailures: 1 });
  assert.equal(report.overall, "warning");
  assert.ok(report.signals.filter((signal) => signal.count > 0).every((signal) => signal.state === "warning"));
});

test("operations monitoring is wired through a guarded API, hook, schedule, and production canaries", async () => {
  const [route, hook, schedule, canary, runbook] = await Promise.all([
    readFile(new URL("../app/api/operations/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../agent/hooks/operations-telemetry.ts", import.meta.url), "utf8"),
    readFile(new URL("../agent/schedules/operations-monitor.ts", import.meta.url), "utf8"),
    readFile(new URL("../scripts/smoke-core-production.mjs", import.meta.url), "utf8"),
    readFile(new URL("../../../docs/operations-runbook.md", import.meta.url), "utf8"),
  ]);
  assert.match(route, /requireWebAuth/);
  assert.match(hook, /"turn.failed"/);
  assert.match(hook, /ARTIFACT_FAILURE/);
  assert.match(schedule, /\*\/5 \* \* \* \*/);
  assert.match(canary, /api\/goals/);
  assert.match(canary, /api\/task-runs/);
  assert.match(canary, /api\/automations/);
  assert.match(runbook, /Rollback triggers/);
});
