import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { db } from "../agent/lib/receipts-db.ts";
import { ensurePrimaryAgent } from "../lib/agents.ts";
import { createGoal } from "../lib/goals.ts";
import {
  addKnowledgeProvenance,
  createKnowledge,
  createKnowledgeRelationship,
  createKnowledgeSource,
  getKnowledge,
  listKnowledge,
  listKnowledgeRelationships,
  transitionKnowledge,
} from "../lib/knowledge.ts";

const configured = Boolean(process.env.DATABASE_URL?.trim());
const integration = configured ? test : test.skip;

integration("knowledge core preserves typed state, provenance, Goal links, relationships, and owner boundaries", async () => {
  const ownerId = `knowledge_owner_${randomUUID()}`;
  const otherOwnerId = `knowledge_owner_${randomUUID()}`;
  try {
    const agent = await ensurePrimaryAgent(ownerId);
    const otherAgent = await ensurePrimaryAgent(otherOwnerId);
    const goal = await createGoal({ ownerId, title: "Ship Knowledge Core" });
    const foreignGoal = await createGoal({ ownerId: otherOwnerId, title: "Foreign goal" });
    const source = await createKnowledgeSource({ ownerId, sourceType: "chat", provider: "eve", externalId: `session_${randomUUID()}`, referenceUri: "/?thread=knowledge-test", author: "Owner" });
    const foreignSource = await createKnowledgeSource({ ownerId: otherOwnerId, sourceType: "manual" });
    const origin = { ownerId, createdByType: "agent", createdById: agent.id };

    const fact = await createKnowledge({ ...origin, kind: "fact", statement: "The interview is Tuesday.", confidence: 0.9, goalId: goal.id, firstSeenAt: new Date().toISOString(), provenance: [{ sourceId: source.id, relation: "supports", confidence: 0.95 }] });
    assert.equal(fact.goalId, goal.id); assert.equal(fact.provenance[0].source.id, source.id);
    const replacement = await createKnowledge({ ...origin, kind: "fact", statement: "The interview is Wednesday.", confidence: 1, supersedesId: fact.id, provenance: [{ sourceId: source.id, relation: "confirmed_by" }] });
    assert.equal((await getKnowledge(ownerId, fact.id)).status, "superseded");
    assert.equal((await getKnowledge(ownerId, fact.id)).supersededById, replacement.id);

    const observation = await createKnowledge({ ...origin, kind: "observation", statement: "Owner requested shorter drafts repeatedly.", confidence: 0.8, occurrenceCount: 8, firstObservedAt: new Date().toISOString(), lastObservedAt: new Date().toISOString() });
    const hypothesis = await createKnowledge({ ...origin, kind: "hypothesis", statement: "Earlier scheduling may improve completion.", confidence: 0.55, testDescription: "Compare completion rates over four weeks.", decisionTrigger: "At least 15% improvement", goalId: goal.id, provenance: [{ sourceId: source.id, relation: "derived_from" }] });
    const decision = await createKnowledge({ ...origin, kind: "decision", title: "Keep Relay internal", statement: "Keep Relay internal through V1.", rationale: "Avoid premature separation.", alternatives: ["Create a separate service now"], reopenCondition: "External agents require independent direct access.", decidedAt: new Date().toISOString(), goalId: goal.id, provenance: [{ sourceId: source.id, relation: "mentioned_in" }] });
    const commitment = await createKnowledge({ ...origin, kind: "commitment", subject: "Owner", statement: "Review the launch checklist.", dueAt: new Date(Date.now() + 86_400_000).toISOString(), goalId: goal.id });
    const preference = await createKnowledge({ ...origin, kind: "preference", statement: "Use shorter Slack drafts.", preferenceKey: "slack.draft_length", preferenceValue: "short", preferenceScope: "slack", preferenceSourceType: "approved_observation", preferenceSourceId: observation.id });
    const insight = await createKnowledge({ ...origin, kind: "insight", statement: "Concise drafts reduce revision cycles.", confidence: 0.76, generatedAt: new Date().toISOString(), provenance: [{ sourceId: source.id, relation: "derived_from" }] });

    assert.equal((await transitionKnowledge(ownerId, hypothesis.id, "supported")).status, "supported");
    assert.ok((await transitionKnowledge(ownerId, commitment.id, "fulfilled")).fulfilledAt);
    assert.equal(preference.preferenceSourceId, observation.id);
    assert.equal(insight.provenance.length, 1);
    assert.equal((await listKnowledge(ownerId, { kind: "decision", query: "Relay", goalId: goal.id, minConfidence: 0.5 }))[0].id, decision.id);

    // Exercise the same tool handlers Sofie uses, against real isolated owner data.
    const samples = {
      record_fact: { statement: "Knowledge verification fact", confidence: 1 },
      record_observation: { statement: "Knowledge verification observation", confidence: 0.7, occurrenceCount: 1 },
      record_hypothesis: { statement: "Knowledge verification hypothesis", confidence: 0.5, testDescription: "Compare two isolated trials" },
      record_decision: { title: "Knowledge verification decision", decision: "Use isolated test records", rationale: "Protect owner data", alternatives: [] },
      record_commitment: { subject: "Knowledge verification", commitment: "Review the isolated test results" },
      record_preference: { statement: "Knowledge verification preference", preferenceKey: "verification.format", preferenceValue: "brief", preferenceScope: "verification" },
    };
    const sessionId = `knowledge_session_${randomUUID()}`;
    const ctx = (toolName, principalId = ownerId, role = "owner") => ({
      toolName, session: { id: sessionId, auth: { current: { principalId, principalType: "user", attributes: { owner: "true", role } } } },
    });
    const saved = {};
    for (const [name, input] of Object.entries(samples)) {
      const tool = (await import(`../agent/tools/${name}.ts`)).default;
      const record = await tool.execute(tool.inputSchema.parse(input), ctx(name));
      saved[record.kind] = record;
      assert.equal(record.provenance.length, 1, `${name} attaches conversation evidence`);
      assert.equal(record.provenance[0].source.externalId, sessionId);
      assert.equal((await listKnowledge(ownerId, { kind: record.kind, query: "verification", status: record.status })).some(r => r.id === record.id), true);
      await assert.rejects(tool.execute(input, ctx(name, ownerId, "guest")), /authenticated owner scope/);
    }
    const inspect = (await import("../agent/tools/get_knowledge.ts")).default;
    assert.equal((await inspect.execute({ id: saved.preference.id }, ctx("get_knowledge"))).preferenceSourceType, "explicit_user");
    await assert.rejects(inspect.execute({ id: saved.fact.id }, ctx("get_knowledge", otherOwnerId)), /not found/);
    const update = (await import("../agent/tools/update_knowledge_status.ts")).default;
    assert.equal((await update.execute({ id: saved.commitment.id, status: "fulfilled" }, ctx("update_knowledge_status"))).status, "fulfilled");
    await assert.rejects(update.execute({ id: saved.commitment.id, status: "open" }, ctx("update_knowledge_status")), /cannot move/);
    const search = (await import("../agent/tools/search_knowledge.ts")).default;
    assert.equal((await search.execute({ query: "verification", type: "hypothesis", limit: 25 }, ctx("search_knowledge")))[0].id, saved.hypothesis.id);

    const relationship = await createKnowledgeRelationship({ ownerId, subjectType: "decision", subjectId: decision.id, predicate: "affects", objectType: "goal", objectId: goal.id, confidence: 1 });
    assert.equal((await listKnowledgeRelationships(ownerId, { type: "decision", id: decision.id }))[0].id, relationship.id);

    assert.equal(await getKnowledge(otherOwnerId, decision.id), null);
    await assert.rejects(createKnowledge({ ...origin, kind: "fact", statement: "Foreign Goal link", goalId: foreignGoal.id }), /Goal not found for this owner/);
    await assert.rejects(createKnowledge({ ownerId, createdByType: "agent", createdById: otherAgent.id, kind: "fact", statement: "Foreign Agent origin" }), /Origin Agent not found for this owner/);
    await assert.rejects(addKnowledgeProvenance(ownerId, decision.id, { sourceId: foreignSource.id, relation: "supports" }), /source not found for this owner/i);
    await assert.rejects(createKnowledgeRelationship({ ownerId, subjectType: "decision", subjectId: decision.id, predicate: "affects", objectType: "goal", objectId: foreignGoal.id }), /goal relationship endpoint not found for this owner/i);
  } finally {
    await db().query(`DELETE FROM knowledge_relationships WHERE owner_id IN ($1,$2)`, [ownerId, otherOwnerId]);
    await db().query(`DELETE FROM knowledge_provenance_links WHERE owner_id IN ($1,$2)`, [ownerId, otherOwnerId]);
    await db().query(`DELETE FROM knowledge_records WHERE owner_id IN ($1,$2)`, [ownerId, otherOwnerId]);
    await db().query(`DELETE FROM knowledge_sources WHERE owner_id IN ($1,$2)`, [ownerId, otherOwnerId]);
    await db().query(`DELETE FROM agent_audit_events WHERE owner_id IN ($1,$2)`, [ownerId, otherOwnerId]);
    await db().query(`DELETE FROM agent_capabilities WHERE owner_id IN ($1,$2)`, [ownerId, otherOwnerId]);
    await db().query(`DELETE FROM agents WHERE owner_id IN ($1,$2)`, [ownerId, otherOwnerId]);
    await db().query(`DELETE FROM goals WHERE owner_id IN ($1,$2)`, [ownerId, otherOwnerId]);
  }
});
