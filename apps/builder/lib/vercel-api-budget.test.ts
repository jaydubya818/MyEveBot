import assert from "node:assert/strict";
import { it } from "node:test";
import { setProjectModelBudget } from "./vercel-api";

it("sets and verifies a per-project monthly budget before managed deployment", async () => {
  const original = globalThis.fetch;
  let called = false;
  globalThis.fetch = async (input, init) => {
    called = true;
    assert.equal(String(input), "https://api.vercel.com/ai-gateway/budgets?teamId=team_1");
    assert.equal(init?.method, "PUT");
    assert.deepEqual(JSON.parse(String(init?.body)), {
      scopeType: "project", projectId: "prj_1", limitAmount: 10, refreshPeriod: "monthly",
    });
    return Response.json({
      scopeType: "project", scopeId: "prj_1", limitAmount: 10,
      currentSpend: 0, refreshPeriod: "monthly", active: true,
    });
  };
  try {
    const budget = await setProjectModelBudget("token", "team_1", "prj_1", 10);
    assert.equal(budget.limitAmount, 10);
    assert.equal(called, true);
  } finally {
    globalThis.fetch = original;
  }
});

it("refuses an unconfirmed model budget", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    scopeType: "project", scopeId: "a-different-project", limitAmount: 10,
    currentSpend: 0, refreshPeriod: "monthly", active: true,
  });
  try {
    await assert.rejects(setProjectModelBudget("token", null, "prj_1", 10));
  } finally {
    globalThis.fetch = original;
  }
});
