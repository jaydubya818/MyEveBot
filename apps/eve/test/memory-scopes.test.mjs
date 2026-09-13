import assert from "node:assert/strict";
import test from "node:test";

import {
  allowedMemoryScopes,
  applyContextBudget,
  rankScopedMemories,
  scopeIsAllowed,
  selectThreadSummary,
  validateMemoryScope,
} from "../lib/memory-scopes.ts";

const execution = { ownerId: "owner_a", agentId: "agent_researcher", goalId: "goal_adobe", taskId: "gtask_research" };

test("scope validation rejects malformed identifiers", () => {
  assert.equal(validateMemoryScope({ type: "agent", id: "agent_researcher" }), null);
  assert.match(validateMemoryScope({ type: "goal", id: "agent_researcher" }), /Malformed goal/);
  assert.match(validateMemoryScope({ type: "task", id: "../task_other" }), /Malformed task/);
});

test("allowed scopes are derived from server execution identity", () => {
  assert.deepEqual(allowedMemoryScopes(execution), [
    { type: "owner", id: "owner_a" },
    { type: "agent", id: "agent_researcher" },
    { type: "goal", id: "goal_adobe" },
    { type: "task", id: "gtask_research" },
  ]);
  assert.equal(scopeIsAllowed({ type: "agent", id: "agent_finance" }, execution), false);
  assert.equal(scopeIsAllowed({ type: "owner", id: "owner_b" }, execution), false);
  assert.equal(scopeIsAllowed({ type: "goal", id: "goal_unrelated" }, execution), false);
});

test("authorization filtering happens before deterministic ranking", () => {
  const candidate = (id, type, scopeId, relevance) => ({
    id, scope: { type, id: scopeId }, content: id, confidence: 1, semanticRelevance: relevance, updatedAt: "2026-09-13T00:00:00.000Z",
  });
  const ranked = rankScopedMemories([
    candidate("finance-private", "agent", "agent_finance", 1),
    candidate("owner", "owner", "owner_a", 0.9),
    candidate("researcher", "agent", "agent_researcher", 0.7),
    candidate("adobe", "goal", "goal_adobe", 0.8),
    candidate("unrelated-goal", "goal", "goal_other", 1),
  ], execution, new Date("2026-09-13T00:00:00.000Z").getTime());
  assert.deepEqual(ranked.map((item) => item.id), ["adobe", "researcher", "owner"]);
});

test("context budgeting never silently drops mandatory Task or Goal constraints", () => {
  const result = applyContextBudget([
    { id: "task", kind: "Task", content: "x".repeat(400), tier: "hot", mandatory: true, score: 1000 },
    { id: "goal", kind: "Goal", content: "y".repeat(400), tier: "hot", mandatory: true, score: 900 },
    { id: "memory-high", kind: "Memory", content: "z".repeat(200), tier: "warm", score: 100 },
    { id: "memory-low", kind: "Memory", content: "q".repeat(200), tier: "cold", score: 1 },
  ], { maximumTokens: 250, reservedInstructionTokens: 25, retrievalTokens: 60 });
  assert.deepEqual(result.included.map((item) => item.id), ["task", "goal"]);
  assert.deepEqual(result.excluded.map((item) => item.id), ["memory-high", "memory-low"]);
  assert.equal(result.overBudget, false);
});

test("context budget enforces HOT, WARM, then COLD before item scores", () => {
  const result = applyContextBudget([
    { id: "cold-high-score", kind: "History", content: "c".repeat(80), tier: "cold", score: 999 },
    { id: "warm-low-score", kind: "Memory", content: "w".repeat(80), tier: "warm", score: 1 },
  ], { maximumTokens: 25, reservedInstructionTokens: 0, retrievalTokens: 25 });
  assert.deepEqual(result.included.map((item) => item.id), ["warm-low-score"]);
  assert.deepEqual(result.excluded.map((item) => item.id), ["cold-high-score"]);
});

test("summary selection uses the newest active durable summary", () => {
  assert.equal(selectThreadSummary([
    { id: "old", status: "active", updatedAt: "2026-09-11T00:00:00Z" },
    { id: "superseded", status: "superseded", updatedAt: "2026-09-13T00:00:00Z" },
    { id: "new", status: "active", updatedAt: "2026-09-12T00:00:00Z" },
  ])?.id, "new");
});
