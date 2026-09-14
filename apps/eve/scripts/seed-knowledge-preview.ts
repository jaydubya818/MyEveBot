import { ensurePrimaryAgent } from "../lib/agents.ts";
import { createGoal, listGoals } from "../lib/goals.ts";
import { createKnowledge, createKnowledgeRelationship, createKnowledgeSource, listKnowledge } from "../lib/knowledge.ts";

const ownerId = process.env.MYEVE_OWNER_ID?.trim() || process.env.SOFIE_OWNER_ID?.trim() || "owner";
const agent = await ensurePrimaryAgent(ownerId);
const existingGoals = await listGoals(ownerId, { query: "Ship MyEve V1", limit: 1 });
const goal = existingGoals[0] ?? await createGoal({ ownerId, title: "Ship MyEve V1", description: "Preview Goal for Knowledge provenance and decision linkage.", priority: "high", source: "preview" });
const existingDecision = (await listKnowledge(ownerId, { kind: "decision", query: "Relay", limit: 10 })).find((record) => record.title === "Keep Relay internal");

if (!existingDecision) {
  const source = await createKnowledgeSource({ ownerId, sourceType: "chat", provider: "eve", externalId: "knowledge-preview-conversation", referenceUri: "/?thread=knowledge-preview", author: "Owner", capturedAt: new Date().toISOString() });
  const origin = { ownerId, createdByType: "agent" as const, createdById: agent.id };
  const provenance = [{ sourceId: source.id, relation: "mentioned_in" as const, confidence: 1 }];
  const earlierDecision = await createKnowledge({ ...origin, kind: "decision", title: "Separate Relay before V1", statement: "Extract Relay into a standalone service before V1.", rationale: "The boundary may eventually serve external Agents.", alternatives: ["Keep Relay internal"], reopenCondition: "Complexity becomes acceptable before launch.", decidedAt: new Date(Date.now() - 7 * 86_400_000).toISOString(), goalId: goal.id, provenance });
  const decision = await createKnowledge({ ...origin, kind: "decision", title: "Keep Relay internal", statement: "Keep Relay internal through V1.", rationale: "Avoid premature separation.", alternatives: ["Extract Relay into a standalone service now"], reopenCondition: "External agents require independent direct access.", decidedAt: new Date().toISOString(), goalId: goal.id, supersedesId: earlierDecision.id, provenance });
  const fact = await createKnowledge({ ...origin, kind: "fact", statement: "Relay is currently an internal MyEve capability.", confidence: 0.96, firstSeenAt: new Date().toISOString(), lastConfirmedAt: new Date().toISOString(), goalId: goal.id, provenance: [{ sourceId: source.id, relation: "confirmed_by", confidence: 0.96 }] });
  const observation = await createKnowledge({ ...origin, kind: "observation", statement: "The owner requested shorter Slack drafts eight times.", confidence: 0.86, occurrenceCount: 8, firstObservedAt: new Date(Date.now() - 30 * 86_400_000).toISOString(), lastObservedAt: new Date().toISOString(), provenance });
  await createKnowledge({ ...origin, kind: "hypothesis", statement: "Scheduling mock interviews 48 hours earlier may improve completion.", confidence: 0.58, testDescription: "Compare four weeks of completion rates with earlier scheduling.", decisionTrigger: "A sustained improvement of at least 15%.", goalId: goal.id, provenance: [{ sourceId: source.id, relation: "derived_from", confidence: 0.7 }] });
  await createKnowledge({ ...origin, kind: "commitment", subject: "Owner", statement: "Review the V1 launch checklist before release.", dueAt: new Date(Date.now() + 7 * 86_400_000).toISOString(), goalId: goal.id, provenance });
  await createKnowledge({ ...origin, kind: "preference", statement: "Draft concise Slack messages unless more context is requested.", preferenceKey: "slack.draft_length", preferenceValue: "short", preferenceScope: "slack", preferenceSourceType: "approved_observation", preferenceSourceId: observation.id, reviewAt: new Date(Date.now() + 90 * 86_400_000).toISOString(), provenance: [{ sourceId: source.id, relation: "derived_from", confidence: 0.86 }] });
  await createKnowledgeRelationship({ ownerId, subjectType: "decision", subjectId: decision.id, predicate: "affects", objectType: "goal", objectId: goal.id });
  await createKnowledgeRelationship({ ownerId, subjectType: "fact", subjectId: fact.id, predicate: "supports", objectType: "decision", objectId: decision.id, confidence: 0.96 });
  console.log(`Seeded Knowledge preview for ${ownerId}: ${decision.id}`);
} else {
  console.log(`Knowledge preview already seeded for ${ownerId}: ${existingDecision.id}`);
}
