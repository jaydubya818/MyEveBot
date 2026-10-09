import { randomUUID } from "node:crypto";

import { db } from "../agent/lib/receipts-db.ts";
import {
  DEFAULT_KNOWLEDGE_STATUS,
  KNOWLEDGE_KINDS,
  KNOWLEDGE_STATUSES,
  ORIGIN_TYPES,
  PREFERENCE_SOURCE_TYPES,
  PROVENANCE_RELATIONS,
  RELATIONSHIP_ENTITY_TYPES,
  SOURCE_TYPES,
  canTransitionKnowledge,
  validConfidence,
  validateRelationshipPredicate,
  type KnowledgeKind,
  type KnowledgeRecordView,
  type KnowledgeRelationshipView,
  type KnowledgeSourceView,
  type KnowledgeStatus,
  type OriginType,
  type PreferenceSourceType,
  type ProvenanceRelation,
  type RelationshipEntityType,
  type SourceType,
} from "./knowledge-types.ts";

type Row = Record<string, unknown>;

function text(value: unknown): string { return typeof value === "string" ? value : String(value ?? ""); }
function nullableText(value: unknown): string | null { return value === null || value === undefined ? null : text(value); }
function number(value: unknown): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function nullableNumber(value: unknown): number | null { return value === null || value === undefined ? null : number(value); }
function iso(value: unknown): string { return value instanceof Date ? value.toISOString() : text(value); }
function nullableIso(value: unknown): string | null { return value === null || value === undefined ? null : iso(value); }
function stringArray(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function clean(value: string, max = 20_000): string { return value.replaceAll("\0", "").trim().slice(0, max); }

function sourceView(row: Row): KnowledgeSourceView {
  return {
    id: text(row.id), sourceType: text(row.source_type) as SourceType,
    provider: nullableText(row.provider), externalId: nullableText(row.external_id),
    referenceUri: nullableText(row.reference_uri), author: nullableText(row.author),
    capturedAt: iso(row.captured_at), contentHash: nullableText(row.content_hash),
    snapshotRef: nullableText(row.snapshot_ref), createdAt: iso(row.created_at),
  };
}

function recordView(row: Row): KnowledgeRecordView {
  return {
    id: text(row.id), kind: text(row.kind) as KnowledgeKind, title: nullableText(row.title),
    statement: text(row.statement), confidence: number(row.confidence), status: text(row.status),
    occurrenceCount: nullableNumber(row.occurrence_count), firstSeenAt: nullableIso(row.first_seen_at),
    lastConfirmedAt: nullableIso(row.last_confirmed_at), firstObservedAt: nullableIso(row.first_observed_at),
    lastObservedAt: nullableIso(row.last_observed_at), testDescription: nullableText(row.test_description),
    decisionTrigger: nullableText(row.decision_trigger), rationale: nullableText(row.rationale),
    alternatives: stringArray(row.alternatives), decidedAt: nullableIso(row.decided_at),
    reopenCondition: nullableText(row.reopen_condition), subject: nullableText(row.subject),
    dueAt: nullableIso(row.due_at), fulfilledAt: nullableIso(row.fulfilled_at),
    preferenceKey: nullableText(row.preference_key), preferenceValue: row.preference_value ?? null,
    preferenceScope: nullableText(row.preference_scope),
    preferenceSourceType: nullableText(row.preference_source_type) as PreferenceSourceType | null,
    preferenceSourceId: nullableText(row.preference_source_id), active: typeof row.active === "boolean" ? row.active : null,
    reviewAt: nullableIso(row.review_at), expiresAt: nullableIso(row.expires_at), generatedAt: nullableIso(row.generated_at),
    createdByType: text(row.created_by_type) as OriginType, createdById: nullableText(row.created_by_id),
    goalId: nullableText(row.goal_id), goalTitle: nullableText(row.goal_title), projectRef: nullableText(row.project_ref),
    supersedesId: nullableText(row.supersedes_id), supersededById: nullableText(row.superseded_by_id),
    createdAt: iso(row.created_at), updatedAt: iso(row.updated_at), provenance: [],
  };
}

export interface CreateSourceInput {
  ownerId: string; sourceType: SourceType; provider?: string | null; externalId?: string | null;
  referenceUri?: string | null; author?: string | null; capturedAt?: string;
  contentHash?: string | null; snapshotRef?: string | null;
}

export async function createKnowledgeSource(input: CreateSourceInput): Promise<KnowledgeSourceView> {
  if (!SOURCE_TYPES.includes(input.sourceType)) throw new Error("Unknown source type.");
  if (input.sourceType !== "manual" && !input.referenceUri && !input.externalId && !input.snapshotRef) {
    throw new Error("A referenced source needs a URI, external ID, or snapshot reference.");
  }
  const id = `source_${randomUUID()}`;
  const rows = await db().query(
    `INSERT INTO knowledge_sources (id, owner_id, source_type, provider, external_id, reference_uri, author, captured_at, content_hash, snapshot_ref)
     VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8::timestamptz,now()),$9,$10)
     ON CONFLICT (owner_id, provider, external_id) WHERE provider IS NOT NULL AND external_id IS NOT NULL
     DO UPDATE SET reference_uri=COALESCE(EXCLUDED.reference_uri,knowledge_sources.reference_uri), author=COALESCE(EXCLUDED.author,knowledge_sources.author), captured_at=GREATEST(EXCLUDED.captured_at,knowledge_sources.captured_at)
     RETURNING *`,
    [id, input.ownerId, input.sourceType, input.provider ?? null, input.externalId ?? null, input.referenceUri ?? null, input.author ?? null, input.capturedAt ?? null, input.contentHash ?? null, input.snapshotRef ?? null],
  ) as Row[];
  return sourceView(rows[0]!);
}

export interface ProvenanceInput { sourceId: string; relation: ProvenanceRelation; confidence?: number; }

export interface CreateKnowledgeInput {
  ownerId: string; kind: KnowledgeKind; statement: string; confidence?: number; status?: string;
  title?: string | null; occurrenceCount?: number; firstSeenAt?: string | null; lastConfirmedAt?: string | null;
  firstObservedAt?: string | null; lastObservedAt?: string | null; testDescription?: string | null;
  decisionTrigger?: string | null; rationale?: string | null; alternatives?: string[]; decidedAt?: string | null;
  reopenCondition?: string | null; subject?: string | null; dueAt?: string | null;
  preferenceKey?: string | null; preferenceValue?: unknown; preferenceScope?: string | null;
  preferenceSourceType?: PreferenceSourceType | null; preferenceSourceId?: string | null;
  active?: boolean; reviewAt?: string | null; expiresAt?: string | null; generatedAt?: string | null;
  createdByType: OriginType; createdById?: string | null; goalId?: string | null; projectRef?: string | null;
  supersedesId?: string | null; provenance?: ProvenanceInput[];
}

async function assertOwnedReference(ownerId: string, table: "goals" | "agents", id: string, label: string): Promise<void> {
  const rows = await db().query(`SELECT id FROM ${table} WHERE owner_id=$1 AND id=$2 LIMIT 1`, [ownerId, id]) as Row[];
  if (!rows[0]) throw new Error(`${label} not found for this owner.`);
}

async function assertCreateInput(input: CreateKnowledgeInput): Promise<{ confidence: number; status: string }> {
  if (!KNOWLEDGE_KINDS.includes(input.kind)) throw new Error("Unknown knowledge type.");
  if (!ORIGIN_TYPES.includes(input.createdByType)) throw new Error("Unknown knowledge origin.");
  const confidence = input.confidence ?? 1;
  if (!validConfidence(confidence)) throw new Error("Confidence must be between 0 and 1.");
  const status = input.status ?? DEFAULT_KNOWLEDGE_STATUS[input.kind];
  if (!(KNOWLEDGE_STATUSES[input.kind] as readonly string[]).includes(status)) throw new Error(`Invalid ${input.kind} status.`);
  if (!clean(input.statement)) throw new Error("A knowledge statement is required.");
  if (input.createdByType === "agent") {
    if (!input.createdById) throw new Error("Agent-created knowledge requires an Agent ID.");
    await assertOwnedReference(input.ownerId, "agents", input.createdById, "Origin Agent");
  } else if (input.createdById) throw new Error("Only agent-created knowledge accepts a createdById.");
  if (input.goalId) await assertOwnedReference(input.ownerId, "goals", input.goalId, "Goal");
  if (input.kind === "observation" && (!Number.isInteger(input.occurrenceCount) || (input.occurrenceCount ?? 0) < 1)) throw new Error("An observation requires a positive occurrence count.");
  if (input.kind === "decision" && (!input.title?.trim() || !input.decidedAt)) throw new Error("A decision requires a title and decidedAt timestamp.");
  if (input.kind === "commitment" && !input.subject?.trim()) throw new Error("A commitment requires a subject.");
  if (input.kind === "preference") {
    if (!input.preferenceKey?.trim() || input.preferenceValue === undefined || !input.preferenceScope?.trim() || !input.preferenceSourceType || !PREFERENCE_SOURCE_TYPES.includes(input.preferenceSourceType)) throw new Error("A preference requires key, value, scope, and a valid source type.");
    if (input.preferenceSourceType === "approved_observation") {
      if (!input.preferenceSourceId) throw new Error("An approved observation preference requires its observation ID.");
      const rows = await db().query(`SELECT id FROM knowledge_records WHERE owner_id=$1 AND id=$2 AND kind='observation' LIMIT 1`, [input.ownerId, input.preferenceSourceId]) as Row[];
      if (!rows[0]) throw new Error("Approved observation not found for this owner.");
    }
  }
  if (input.kind === "insight" && !input.generatedAt) throw new Error("An insight requires generatedAt.");
  if (input.supersedesId) {
    const rows = await db().query(`SELECT kind,status FROM knowledge_records WHERE owner_id=$1 AND id=$2 LIMIT 1`, [input.ownerId, input.supersedesId]) as Row[];
    if (!rows[0]) throw new Error("Superseded knowledge not found for this owner.");
    if (text(rows[0].kind) !== input.kind) throw new Error("Knowledge may only supersede the same type.");
    if (!canTransitionKnowledge(input.kind, text(rows[0].status), "superseded")) throw new Error("The earlier record cannot be superseded from its current status.");
  }
  for (const link of input.provenance ?? []) {
    if (!PROVENANCE_RELATIONS.includes(link.relation)) throw new Error("Unknown provenance relation.");
    if (!validConfidence(link.confidence ?? 1)) throw new Error("Provenance confidence must be between 0 and 1.");
    const source = await db().query(`SELECT id FROM knowledge_sources WHERE owner_id=$1 AND id=$2 LIMIT 1`, [input.ownerId, link.sourceId]) as Row[];
    if (!source[0]) throw new Error("Provenance source not found for this owner.");
  }
  return { confidence, status };
}

export async function createKnowledge(input: CreateKnowledgeInput): Promise<KnowledgeRecordView> {
  const { confidence, status } = await assertCreateInput(input);
  const id = `knowledge_${randomUUID()}`;
  const columns = ["id", "owner_id", "kind", "statement", "confidence", "status", "created_by_type"];
  const values: unknown[] = [id, input.ownerId, input.kind, clean(input.statement), confidence, status, input.createdByType];
  const optional: Record<string, unknown> = {
    title: input.title ? clean(input.title, 240) : input.title,
    occurrence_count: input.occurrenceCount, first_seen_at: input.firstSeenAt, last_confirmed_at: input.lastConfirmedAt,
    first_observed_at: input.firstObservedAt, last_observed_at: input.lastObservedAt,
    test_description: input.testDescription, decision_trigger: input.decisionTrigger, rationale: input.rationale,
    alternatives: input.alternatives ? JSON.stringify(input.alternatives.map((item) => clean(item, 2000)).slice(0, 20)) : undefined,
    decided_at: input.decidedAt, reopen_condition: input.reopenCondition, subject: input.subject, due_at: input.dueAt,
    preference_key: input.preferenceKey, preference_value: input.preferenceValue === undefined ? undefined : JSON.stringify(input.preferenceValue),
    preference_scope: input.preferenceScope, preference_source_type: input.preferenceSourceType, preference_source_id: input.preferenceSourceId,
    active: input.active ?? (input.kind === "preference" ? true : undefined), review_at: input.reviewAt, expires_at: input.expiresAt,
    generated_at: input.generatedAt, created_by_id: input.createdById, goal_id: input.goalId, project_ref: input.projectRef,
    supersedes_id: input.supersedesId,
  };
  for (const [column, value] of Object.entries(optional)) if (value !== undefined) { columns.push(column); values.push(value); }
  const placeholders = values.map((_, index) => `$${index + 1}${columns[index] === "alternatives" || columns[index] === "preference_value" ? "::jsonb" : ""}`);
  const insert = `INSERT INTO knowledge_records (${columns.join(",")}) VALUES (${placeholders.join(",")})`;
  const sql = db();
  await sql.transaction((transaction) => [
    transaction.query(insert, values),
    ...(input.supersedesId ? [transaction.query(`UPDATE knowledge_records SET status='superseded',active=CASE WHEN kind='preference' THEN false ELSE active END,updated_at=now() WHERE owner_id=$1 AND id=$2`, [input.ownerId, input.supersedesId])] : []),
    ...(input.provenance ?? []).map((link) => transaction.query(
      `INSERT INTO knowledge_provenance_links (id,owner_id,knowledge_id,source_id,relation,confidence) VALUES ($1,$2,$3,$4,$5,$6)`,
      [`provenance_${randomUUID()}`, input.ownerId, id, link.sourceId, link.relation, link.confidence ?? 1],
    )),
  ]);
  return (await getKnowledge(input.ownerId, id))!;
}

export async function addKnowledgeProvenance(ownerId: string, knowledgeId: string, input: ProvenanceInput): Promise<void> {
  if (!PROVENANCE_RELATIONS.includes(input.relation)) throw new Error("Unknown provenance relation.");
  const confidence = input.confidence ?? 1;
  if (!validConfidence(confidence)) throw new Error("Provenance confidence must be between 0 and 1.");
  const [claim, source] = await Promise.all([
    db().query(`SELECT id FROM knowledge_records WHERE owner_id=$1 AND id=$2 LIMIT 1`, [ownerId, knowledgeId]) as Promise<Row[]>,
    db().query(`SELECT id FROM knowledge_sources WHERE owner_id=$1 AND id=$2 LIMIT 1`, [ownerId, input.sourceId]) as Promise<Row[]>,
  ]);
  if (!claim[0]) throw new Error("Knowledge record not found for this owner.");
  if (!source[0]) throw new Error("Provenance source not found for this owner.");
  await db().query(`INSERT INTO knowledge_provenance_links (id,owner_id,knowledge_id,source_id,relation,confidence) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (owner_id,knowledge_id,source_id,relation) DO UPDATE SET confidence=EXCLUDED.confidence`, [`provenance_${randomUUID()}`, ownerId, knowledgeId, input.sourceId, input.relation, confidence]);
}

export interface KnowledgeFilters { kind?: KnowledgeKind; status?: string; goalId?: string; minConfidence?: number; from?: string; to?: string; query?: string; limit?: number; }

export async function listKnowledge(ownerId: string, filters: KnowledgeFilters = {}): Promise<KnowledgeRecordView[]> {
  if (filters.kind && !KNOWLEDGE_KINDS.includes(filters.kind)) throw new Error("Unknown knowledge type.");
  if (filters.minConfidence !== undefined && !validConfidence(filters.minConfidence)) throw new Error("Minimum confidence must be between 0 and 1.");
  const conditions = ["k.owner_id=$1"];
  const values: unknown[] = [ownerId];
  const add = (sql: string, value: unknown) => { values.push(value); conditions.push(sql.replace("?", `$${values.length}`)); };
  if (filters.kind) add("k.kind=?", filters.kind);
  if (filters.status) add("k.status=?", filters.status);
  if (filters.goalId) add("k.goal_id=?", filters.goalId);
  if (filters.minConfidence !== undefined) add("k.confidence>=?", filters.minConfidence);
  if (filters.from) add("k.created_at>=?::timestamptz", filters.from);
  if (filters.to) add("k.created_at<=?::timestamptz", filters.to);
  if (filters.query?.trim()) { values.push(filters.query.trim()); conditions.push(`to_tsvector('english',coalesce(k.title,'')||' '||k.statement||' '||coalesce(k.subject,'')||' '||coalesce(k.preference_key,'')||' '||coalesce(k.preference_value::text,'')) @@ websearch_to_tsquery('english',$${values.length})`); }
  values.push(Math.min(200, Math.max(1, filters.limit ?? 100)));
  const rows = await db().query(
    `SELECT k.*,g.title AS goal_title,(SELECT newer.id FROM knowledge_records newer WHERE newer.owner_id=k.owner_id AND newer.supersedes_id=k.id ORDER BY newer.created_at DESC LIMIT 1) AS superseded_by_id
     FROM knowledge_records k LEFT JOIN goals g ON g.owner_id=k.owner_id AND g.id=k.goal_id
     WHERE ${conditions.join(" AND ")} ORDER BY k.updated_at DESC,k.id DESC LIMIT $${values.length}`,
    values,
  ) as Row[];
  return rows.map(recordView);
}

export async function getKnowledge(ownerId: string, id: string): Promise<KnowledgeRecordView | null> {
  const rows = await db().query(
    `SELECT k.*,g.title AS goal_title,(SELECT newer.id FROM knowledge_records newer WHERE newer.owner_id=k.owner_id AND newer.supersedes_id=k.id ORDER BY newer.created_at DESC LIMIT 1) AS superseded_by_id
     FROM knowledge_records k LEFT JOIN goals g ON g.owner_id=k.owner_id AND g.id=k.goal_id WHERE k.owner_id=$1 AND k.id=$2 LIMIT 1`,
    [ownerId, id],
  ) as Row[];
  if (!rows[0]) return null;
  const view = recordView(rows[0]);
  const links = await db().query(
    `SELECT p.id AS provenance_id,p.relation,p.confidence AS provenance_confidence,p.created_at AS provenance_created_at,s.*
     FROM knowledge_provenance_links p JOIN knowledge_sources s ON s.owner_id=p.owner_id AND s.id=p.source_id
     WHERE p.owner_id=$1 AND p.knowledge_id=$2 ORDER BY p.created_at DESC`,
    [ownerId, id],
  ) as Row[];
  view.provenance = links.map((row) => ({ id: text(row.provenance_id), relation: text(row.relation) as ProvenanceRelation, confidence: number(row.provenance_confidence), createdAt: iso(row.provenance_created_at), source: sourceView(row) }));
  return view;
}

export async function transitionKnowledge(ownerId: string, id: string, status: KnowledgeStatus): Promise<KnowledgeRecordView> {
  const current = await getKnowledge(ownerId, id);
  if (!current) throw new Error("Knowledge record not found.");
  if (!canTransitionKnowledge(current.kind, current.status, status)) throw new Error(`A ${current.status} ${current.kind} cannot move to ${status}.`);
  await db().query(`UPDATE knowledge_records SET status=$3,fulfilled_at=CASE WHEN kind='commitment' AND $3='fulfilled' THEN COALESCE(fulfilled_at,now()) ELSE fulfilled_at END,active=CASE WHEN kind='preference' THEN $3='active' ELSE active END,updated_at=now() WHERE owner_id=$1 AND id=$2`, [ownerId, id, status]);
  return (await getKnowledge(ownerId, id))!;
}

async function assertRelationshipEntity(ownerId: string, type: RelationshipEntityType, id: string): Promise<void> {
  if (["person", "organization", "project"].includes(type)) return;
  const table = type === "source" ? "knowledge_sources" : type === "goal" ? "goals" : type === "agent" ? "agents" : "knowledge_records";
  const rows = await db().query(`SELECT ${table === "knowledge_records" ? "kind" : "id"} FROM ${table} WHERE owner_id=$1 AND id=$2 LIMIT 1`, [ownerId, id]) as Row[];
  if (!rows[0] || (table === "knowledge_records" && text(rows[0].kind) !== type)) throw new Error(`${type} relationship endpoint not found for this owner.`);
}

export async function createKnowledgeRelationship(input: { ownerId: string; subjectType: RelationshipEntityType; subjectId: string; predicate: string; objectType: RelationshipEntityType; objectId: string; confidence?: number }): Promise<KnowledgeRelationshipView> {
  if (!RELATIONSHIP_ENTITY_TYPES.includes(input.subjectType) || !RELATIONSHIP_ENTITY_TYPES.includes(input.objectType)) throw new Error("Unknown relationship endpoint type.");
  if (!validateRelationshipPredicate(input.predicate)) throw new Error("Relationship predicate must be snake_case and at most 64 characters.");
  if (input.subjectType === input.objectType && input.subjectId === input.objectId) throw new Error("A relationship cannot point to itself.");
  const confidence = input.confidence ?? 1;
  if (!validConfidence(confidence)) throw new Error("Confidence must be between 0 and 1.");
  await Promise.all([assertRelationshipEntity(input.ownerId, input.subjectType, input.subjectId), assertRelationshipEntity(input.ownerId, input.objectType, input.objectId)]);
  const rows = await db().query(`INSERT INTO knowledge_relationships (id,owner_id,subject_type,subject_id,predicate,object_type,object_id,confidence) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [`relationship_${randomUUID()}`, input.ownerId, input.subjectType, input.subjectId, input.predicate, input.objectType, input.objectId, confidence]) as Row[];
  return relationshipView(rows[0]!);
}

function relationshipView(row: Row): KnowledgeRelationshipView {
  return { id: text(row.id), subjectType: text(row.subject_type) as RelationshipEntityType, subjectId: text(row.subject_id), predicate: text(row.predicate), objectType: text(row.object_type) as RelationshipEntityType, objectId: text(row.object_id), confidence: number(row.confidence), status: text(row.status) as KnowledgeRelationshipView["status"], createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) };
}

export async function listKnowledgeRelationships(ownerId: string, entity?: { type: RelationshipEntityType; id: string }): Promise<KnowledgeRelationshipView[]> {
  const rows = await db().query(entity ? `SELECT * FROM knowledge_relationships WHERE owner_id=$1 AND ((subject_type=$2 AND subject_id=$3) OR (object_type=$2 AND object_id=$3)) ORDER BY updated_at DESC` : `SELECT * FROM knowledge_relationships WHERE owner_id=$1 ORDER BY updated_at DESC LIMIT 200`, entity ? [ownerId, entity.type, entity.id] : [ownerId]) as Row[];
  return rows.map(relationshipView);
}

export async function listKnowledgeSources(ownerId: string, limit = 100): Promise<KnowledgeSourceView[]> {
  const rows = await db().query(`SELECT * FROM knowledge_sources WHERE owner_id=$1 ORDER BY captured_at DESC,id DESC LIMIT $2`, [ownerId, Math.min(200, Math.max(1, limit))]) as Row[];
  return rows.map(sourceView);
}
