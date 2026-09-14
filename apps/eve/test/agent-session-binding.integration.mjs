import assert from "node:assert/strict";
import test from "node:test";
import { routeAuth } from "eve/channels/auth";

import { eveAuth } from "../agent/channels/eve.ts";
import { db } from "../agent/lib/receipts-db.ts";
import { bindAgentRun, reconcileStaleAgentRuns, resolveSessionAgent } from "../agent/lib/session-settings.ts";
import { createAgent, ensurePrimaryAgent, transitionAgent } from "../lib/agents.ts";
import { createWebSessionToken, WEB_SESSION_COOKIE } from "../lib/web-auth.ts";

const configured = Boolean(process.env.DATABASE_URL?.trim());
const integration = configured ? test : test.skip;

function principal(ownerId, agentId, threadId) {
  return {
    principalId: ownerId,
    attributes: {
      owner: "true",
      ...(agentId ? { myeveAgentId: agentId } : {}),
      ...(threadId ? { webThreadId: threadId } : {}),
    },
  };
}

integration("session and thread Agent bindings are authoritative across requests", async () => {
  const ownerId = `agent_binding_test_${crypto.randomUUID()}`;
  const actor = { type: "owner", id: ownerId };
  const sessionIds = [];
  const threadIds = [];
  const previousEnv = Object.fromEntries(["NODE_ENV", "MYEVE_ACCESS_PASSWORD", "MYEVE_OWNER_ID", "MYEVE_SESSION_SECRET"].map((key) => [key, process.env[key]]));
  try {
    const primary = await ensurePrimaryAgent(ownerId);
    const researcher = await createAgent(ownerId, {
      name: "Researcher", role: "Research", instructions: "Use primary sources.", capabilityIds: [], riskCeiling: "low",
    }, actor);
    const finance = await createAgent(ownerId, {
      name: "Finance", role: "Finance", instructions: "Use finance context.", capabilityIds: [], riskCeiling: "low",
    }, actor);
    const disabled = await createAgent(ownerId, {
      name: "Disabled", role: "Research", instructions: "Do not execute.", capabilityIds: [], riskCeiling: "low",
    }, actor);
    const archived = await createAgent(ownerId, {
      name: "Archived", role: "Research", instructions: "Do not execute.", capabilityIds: [], riskCeiling: "low",
    }, actor);
    await transitionAgent(ownerId, disabled.id, "disabled", actor);
    await transitionAgent(ownerId, archived.id, "archived", actor);

    Object.assign(process.env, {
      NODE_ENV: "production",
      MYEVE_ACCESS_PASSWORD: "phase-five-test-password",
      MYEVE_OWNER_ID: ownerId,
      MYEVE_SESSION_SECRET: "0123456789abcdef0123456789abcdef",
    });
    const cookie = `${WEB_SESSION_COOKIE}=${createWebSessionToken(process.env)}`;
    const routeRequest = (agentId) => new Request("https://agent.example/eve/v1/session", { headers: { cookie, "x-myeve-agent-id": agentId } });
    const activeAuth = await routeAuth(routeRequest(researcher.id), eveAuth);
    assert.ok(!(activeAuth instanceof Response));
    assert.equal(activeAuth.attributes.myeveAgentId, researcher.id);
    for (const [agentId, code] of [[`agent_unknown_${crypto.randomUUID()}`, "invalid_agent_binding"], [disabled.id, "inactive_agent_binding"], [archived.id, "inactive_agent_binding"]]) {
      const rejected = await routeAuth(routeRequest(agentId), eveAuth);
      assert.ok(rejected instanceof Response);
      assert.equal(rejected.status, 403);
      assert.equal((await rejected.json()).code, code);
    }

    const boundSessionId = `session_${crypto.randomUUID()}`;
    sessionIds.push(boundSessionId);
    await bindAgentRun(boundSessionId, "0", ownerId, researcher, null);
    await bindAgentRun(boundSessionId, "1", ownerId, researcher, null);
    const distinctTurnRuns = await db().query(
      `SELECT id FROM agent_runs WHERE session_id=$1 AND owner_id=$2 ORDER BY id`,
      [boundSessionId, ownerId],
    );
    assert.equal(distinctTurnRuns.length, 2, "each durable turn must have a separate Agent Run budget");
    await db().query(
      `UPDATE agent_runs SET started_at=now() - interval '901 seconds' WHERE id=$1`,
      [distinctTurnRuns[0].id],
    );
    assert.equal(await reconcileStaleAgentRuns(ownerId, boundSessionId), 1);
    const reconciled = await db().query(`SELECT status FROM agent_runs WHERE id=$1`, [distinctTurnRuns[0].id]);
    assert.equal(reconciled[0].status, "failed", "expired orphan Runs must not poison a later turn");
    const fromPersistedRun = await resolveSessionAgent({
      ownerId, sessionId: boundSessionId,
      auth: { current: principal(ownerId), initiator: principal(ownerId) },
      primaryFallback: true,
    });
    assert.equal(fromPersistedRun?.id, researcher.id, "missing header must retain the persisted Run Agent");
    assert.notEqual(fromPersistedRun?.id, primary.id, "a bound session must never substitute the primary Agent");

    const threadId = `thread_${crypto.randomUUID()}`;
    threadIds.push(threadId);
    await db().query(`INSERT INTO web_chat_threads(id,owner_id,agent_id,title,updated_at,chat) VALUES($1,$2,$3,'Bound Researcher',1,'{}'::jsonb)`, [threadId, ownerId, researcher.id]);
    const fromPersistedThread = await resolveSessionAgent({
      ownerId, sessionId: `session_${crypto.randomUUID()}`,
      auth: { current: principal(ownerId, null, threadId), initiator: principal(ownerId, null, threadId) },
      primaryFallback: true,
    });
    assert.equal(fromPersistedThread?.id, researcher.id, "missing Agent header must retain the persisted thread Agent");

    const legacyThreadId = `thread_${crypto.randomUUID()}`;
    threadIds.push(legacyThreadId);
    await db().query(`INSERT INTO web_chat_threads(id,owner_id,agent_id,title,updated_at,chat) VALUES($1,$2,NULL,'Legacy unbound thread',1,'{}'::jsonb)`, [legacyThreadId, ownerId]);
    const legacySessionId = `session_${crypto.randomUUID()}`;
    sessionIds.push(legacySessionId);
    const legacySelection = await resolveSessionAgent({
      ownerId, sessionId: legacySessionId,
      auth: { current: principal(ownerId, null, legacyThreadId), initiator: principal(ownerId, null, legacyThreadId) },
      primaryFallback: true,
    });
    assert.equal(legacySelection?.id, primary.id, "a genuinely unbound legacy thread may use primary fallback");
    await bindAgentRun(legacySessionId, "0", ownerId, legacySelection, legacyThreadId);
    const persistedLegacyThread = await db().query(`SELECT agent_id FROM web_chat_threads WHERE owner_id=$1 AND id=$2`, [ownerId, legacyThreadId]);
    assert.equal(persistedLegacyThread[0].agent_id, primary.id, "first execution must persist the legacy thread binding");

    await assert.rejects(
      () => resolveSessionAgent({
        ownerId, sessionId: `session_${crypto.randomUUID()}`,
        auth: { current: principal(ownerId), initiator: principal(ownerId, `agent_unknown_${crypto.randomUUID()}`) },
        primaryFallback: true,
      }),
      /Persisted Agent binding does not belong/,
    );
    await assert.rejects(
      () => resolveSessionAgent({
        ownerId, sessionId: `session_${crypto.randomUUID()}`,
        auth: { current: principal(ownerId), initiator: principal(ownerId, disabled.id) },
        primaryFallback: true,
      }),
      /disabled and cannot execute/,
    );
    await assert.rejects(
      () => resolveSessionAgent({
        ownerId, sessionId: `session_${crypto.randomUUID()}`,
        auth: { current: principal(ownerId), initiator: principal(ownerId, archived.id) },
        primaryFallback: true,
      }),
      /archived and cannot execute/,
    );
    await assert.rejects(
      () => resolveSessionAgent({
        ownerId, sessionId: boundSessionId,
        auth: { current: principal(ownerId, finance.id), initiator: principal(ownerId, researcher.id) },
        primaryFallback: true,
      }),
      /Requested Agent does not match|persisted session or thread binding/,
    );
    await assert.rejects(
      () => bindAgentRun(boundSessionId, "2", ownerId, finance, null),
      /Cannot change a persisted session executor binding/,
    );

    const unbound = await resolveSessionAgent({
      ownerId, sessionId: `session_${crypto.randomUUID()}`,
      auth: { current: principal(ownerId), initiator: principal(ownerId) },
      primaryFallback: true,
    });
    assert.equal(unbound?.id, primary.id, "only a genuinely unbound session may use primary fallback");
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await db().query(`DELETE FROM agent_runs WHERE owner_id=$1`, [ownerId]).catch(() => undefined);
    await db().query(`DELETE FROM web_chat_threads WHERE owner_id=$1`, [ownerId]).catch(() => undefined);
    await db().query(`DELETE FROM agent_audit_events WHERE owner_id=$1`, [ownerId]).catch(() => undefined);
    await db().query(`DELETE FROM agent_capabilities WHERE owner_id=$1`, [ownerId]).catch(() => undefined);
    await db().query(`DELETE FROM agents WHERE owner_id=$1`, [ownerId]).catch(() => undefined);
  }
});
