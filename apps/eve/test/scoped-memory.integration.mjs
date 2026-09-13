import assert from "node:assert/strict";
import test from "node:test";

import { assembleContext } from "../agent/lib/context-assembly.ts";
import { db } from "../agent/lib/receipts-db.ts";
import { memoryStore } from "../agent/lib/memory-store.ts";
import { createAgent, ensurePrimaryAgent, transitionAgent } from "../lib/agents.ts";
import { createGoal, createGoalTask } from "../lib/goals.ts";

const configured = Boolean(process.env.DATABASE_URL?.trim());
const integration = configured ? test : test.skip;

integration("scoped memory and Context Assembly prove the seeded Agent/Goal isolation path", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalOwner = process.env.MYEVE_OWNER_ID;
  const ownerId = `memory_test_${crypto.randomUUID()}`;
  const otherOwnerId = `memory_test_${crypto.randomUUID()}`;
  const remote = new Map([["legacy_personal", { id: "legacy_personal", content: "Jay prefers concise summaries.", permanent: true }]]);
  let nextDocument = 0;
  globalThis.fetch = async (url, init = {}) => {
    const target = new URL(String(url));
    if (target.hostname !== "api.supermemory.ai") return originalFetch(url, init);
    const path = target.pathname;
    const body = init.body ? JSON.parse(String(init.body)) : {};
    if (path === "/v4/memories/list") {
      return Response.json({ memoryEntries: [...remote.values()].map((entry) => ({
        id: entry.id, memory: entry.content, isStatic: entry.permanent, isLatest: true, isForgotten: false,
      })) });
    }
    if (path === "/v4/memories" && init.method === "POST") {
      const id = `doc_${++nextDocument}`;
      remote.set(id, { id, content: body.memories[0].content, permanent: body.memories[0].isStatic });
      return Response.json({ documentId: id });
    }
    if (path === "/v4/search") {
      return Response.json({ results: [...remote.values()].map((entry) => ({
        documentId: entry.id, content: entry.content, similarity: 0.95,
      })) });
    }
    if (path === "/v4/memories" && init.method === "DELETE") {
      remote.delete(body.id);
      return Response.json({ forgotten: true });
    }
    return new Response("Unexpected fake Supermemory request", { status: 500 });
  };
  process.env.MYEVE_OWNER_ID = ownerId;

  const actor = { type: "owner", id: ownerId };
  try {
    await ensurePrimaryAgent(ownerId);
    const otherPrimary = await ensurePrimaryAgent(otherOwnerId);
    const researcher = await createAgent(ownerId, {
      name: "Researcher", role: "Research", instructions: "Prefer primary research sources.",
      capabilityIds: ["web.search", "web.read"], riskCeiling: "low",
    }, actor);
    const finance = await createAgent(ownerId, {
      name: "Finance Analyst", role: "Finance", instructions: "Use the personal spending analysis convention.",
      capabilityIds: [], riskCeiling: "low",
    }, actor);
    const adobe = await createGoal({ ownerId, title: "Prepare for Adobe interview", description: "Build confidence for the interview.", status: "active" });
    const unrelated = await createGoal({ ownerId, title: "Plan a vacation", status: "active" });
    const task = await createGoalTask(ownerId, adobe.id, {
      title: "Research the Adobe interview loop", description: "Find the current format.", status: "in_progress",
      assignedTo: researcher.id, successCriteria: ["Primary sources reviewed"],
    });
    const threadId = `thread_${crypto.randomUUID()}`;
    await db().query(
      `INSERT INTO web_chat_threads (id,owner_id,agent_id,title,updated_at,chat) VALUES ($1,$2,$3,'Adobe prep',1,'{}'::jsonb)`,
      [threadId, ownerId, researcher.id],
    );
    await db().query(`INSERT INTO goal_thread_links (goal_id,owner_id,thread_id) VALUES ($1,$2,$3)`, [adobe.id, ownerId, threadId]);

    const researcherContext = { ownerId, agentId: researcher.id, goalId: adobe.id, taskId: task.id, ownerAuthorized: true };
    await memoryStore.importLegacyOwnerMemories(ownerId);
    await memoryStore.add("Prefer primary research sources.", { context: researcherContext, scope: { type: "agent", id: researcher.id } });
    await memoryStore.add("Interview schedule and prep context.", { context: researcherContext, scope: { type: "goal", id: adobe.id } });
    await memoryStore.add("Personal spending analysis convention.", {
      context: { ownerId, agentId: finance.id, ownerAuthorized: true },
      scope: { type: "agent", id: finance.id },
    });
    await memoryStore.add("Vacation dates and hotel shortlist.", {
      context: { ownerId, agentId: researcher.id, goalId: unrelated.id, ownerAuthorized: true },
      scope: { type: "goal", id: unrelated.id },
    });

    await assert.rejects(
      () => memoryStore.add("Cross-agent write", { context: researcherContext, scope: { type: "agent", id: finance.id } }),
      /another Agent/,
    );
    await assert.rejects(
      () => memoryStore.add("Cross-owner write", { context: researcherContext, scope: { type: "owner", id: otherOwnerId } }),
      /Cross-owner/,
    );

    const result = await assembleContext({
      ownerId, agentId: researcher.id, sessionId: `session_${crypto.randomUUID()}`, threadId,
      recentConversation: "Owner: Help me prepare for the Adobe interview.",
    });
    assert.match(result.markdown, /Prefer primary research sources/);
    assert.match(result.markdown, /Jay prefers concise summaries/);
    assert.match(result.markdown, /Prepare for Adobe interview/);
    assert.match(result.markdown, /Interview schedule and prep context/);
    assert.match(result.markdown, /Research the Adobe interview loop/);
    assert.match(result.markdown, /Help me prepare for the Adobe interview/);
    assert.doesNotMatch(result.markdown, /Personal spending analysis convention/);
    assert.doesNotMatch(result.markdown, /Vacation dates and hotel shortlist/);

    const visible = await memoryStore.search("all context", researcherContext);
    assert.equal(visible.some((memory) => memory.scope.type === "agent" && memory.scope.id === finance.id), false);
    assert.equal(visible.some((memory) => memory.scope.type === "goal" && memory.scope.id === unrelated.id), false);
    assert.deepEqual(await memoryStore.search("all context", {
      ownerId: otherOwnerId, agentId: otherPrimary.id, ownerAuthorized: true,
    }), []);

    await transitionAgent(ownerId, researcher.id, "disabled", actor);
    await assert.rejects(
      () => assembleContext({
        ownerId, agentId: researcher.id, sessionId: `session_${crypto.randomUUID()}`, threadId,
        recentConversation: "Owner: Continue the Adobe task.",
      }),
      /disabled and cannot execute/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalOwner === undefined) delete process.env.MYEVE_OWNER_ID;
    else process.env.MYEVE_OWNER_ID = originalOwner;
    await db().query(`DELETE FROM context_assemblies WHERE owner_id IN ($1,$2)`, [ownerId, otherOwnerId]).catch(() => undefined);
    await db().query(`DELETE FROM run_context_entries WHERE owner_id IN ($1,$2)`, [ownerId, otherOwnerId]).catch(() => undefined);
    await db().query(`DELETE FROM thread_summaries WHERE owner_id IN ($1,$2)`, [ownerId, otherOwnerId]).catch(() => undefined);
    await db().query(`DELETE FROM memory_records WHERE owner_id IN ($1,$2)`, [ownerId, otherOwnerId]).catch(() => undefined);
    await db().query(`DELETE FROM goal_thread_links WHERE owner_id IN ($1,$2)`, [ownerId, otherOwnerId]).catch(() => undefined);
    await db().query(`DELETE FROM web_chat_threads WHERE owner_id IN ($1,$2)`, [ownerId, otherOwnerId]).catch(() => undefined);
    await db().query(`DELETE FROM eve_events WHERE owner_id IN ($1,$2)`, [ownerId, otherOwnerId]).catch(() => undefined);
    await db().query(`DELETE FROM goals WHERE owner_id IN ($1,$2)`, [ownerId, otherOwnerId]).catch(() => undefined);
    await db().query(`DELETE FROM agent_runs WHERE owner_id IN ($1,$2)`, [ownerId, otherOwnerId]).catch(() => undefined);
    await db().query(`DELETE FROM agent_audit_events WHERE owner_id IN ($1,$2)`, [ownerId, otherOwnerId]).catch(() => undefined);
    await db().query(`DELETE FROM agent_capabilities WHERE owner_id IN ($1,$2)`, [ownerId, otherOwnerId]).catch(() => undefined);
    await db().query(`DELETE FROM agents WHERE owner_id IN ($1,$2)`, [ownerId, otherOwnerId]).catch(() => undefined);
  }
});
