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
