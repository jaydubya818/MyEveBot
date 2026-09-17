import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("..", import.meta.url);

test("general work contracts preserve lineage, budgets, evidence, and owner review", async () => {
  const [migration, tasks, start, complete, results] = await Promise.all([
    readFile(new URL("migrations/0013_colleague_first_execution.sql", root), "utf8"),
    readFile(new URL("lib/task-runs.ts", root), "utf8"),
    readFile(new URL("agent/tools/start_task.ts", root), "utf8"),
    readFile(new URL("agent/tools/complete_work.ts", root), "utf8"),
    readFile(new URL("components/results-panel.tsx", root), "utf8"),
  ]);
  assert.match(migration, /delegated_work/);
  assert.match(migration, /parent_task_id/);
  assert.match(tasks, /Delegation depth is limited to one child level/);
  assert.match(start, /maxEstimatedCostUsd/);
  assert.match(complete, /evidenceSummary/);
  for (const action of ["Accept", "Request changes", "Run again", "Save as skill", "Make routine"]) assert.match(results, new RegExp(action));
});

test("computer takeover pauses tool access and exposes explicit recovery", async () => {
  const [sessions, policy, controls, instructions] = await Promise.all([
    readFile(new URL("lib/computer-sessions.ts", root), "utf8"),
    readFile(new URL("agent/tools/persistent-agent-policy.ts", root), "utf8"),
    readFile(new URL("components/computer-sessions-panel.tsx", root), "utf8"),
    readFile(new URL("agent/instructions/computer-runtime.ts", root), "utf8"),
  ]);
  assert.match(sessions, /status IN \('ready','running'\)/);
  assert.doesNotMatch(sessions, /status IN \('ready','running','paused'\) AND expires_at/);
  assert.match(policy, /decision\.allowed && browserName/);
  assert.doesNotMatch(policy, /Start a computer session before using browser tools/);
  assert.match(controls, />Take over</);
  assert.match(controls, />Resume</);
  assert.match(sessions, /r\.title AS run_title/);
  assert.match(controls, /session\.taskTitle \?\? session\.runTitle \?\? session\.goalTitle/);
  assert.match(instructions, /pause_for_takeover/);
});

test("routines retain approval boundaries and safe management controls", async () => {
  const [migration, makeRoutine, manageRoutine] = await Promise.all([
    readFile(new URL("migrations/0013_colleague_first_execution.sql", root), "utf8"),
    readFile(new URL("agent/tools/make_routine.ts", root), "utf8"),
    readFile(new URL("agent/tools/manage_routine.ts", root), "utf8"),
  ]);
  assert.match(migration, /approval_boundary/);
  assert.match(makeRoutine, /sourceOutcomeId/);
  assert.match(manageRoutine, /"pause", "resume", "update", "test"/);
  assert.match(manageRoutine, /dryRun: true/);
});
