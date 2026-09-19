import { db } from "@/agent/lib/receipts-db";
import { memoryStore } from "@/agent/lib/memory-store";
import { createKnowledge, getKnowledge } from "@/lib/knowledge";
import type { KnowledgeRecordView } from "@/lib/knowledge-types";
import { recordOwnerDataOperation } from "@/lib/owner-data-operations";
import type { ExecutionScope, MemoryScopeType } from "@/lib/memory-scopes";

import { OWNER_KNOWLEDGE_TYPES } from "./owner-knowledge-types";
export { OWNER_KNOWLEDGE_TYPES } from "./owner-knowledge-types";
export type OwnerKnowledgeType = (typeof OWNER_KNOWLEDGE_TYPES)[number];
export type OwnerKnowledgeRepository = "memory" | "knowledge";
export type OwnerKnowledgeReview = "needs_review" | "contradictions" | "stale" | "recent" | "corrected";

type Row = Record<string, unknown>;
export type OwnerKnowledgeQuery = (sql: string, params?: unknown[]) => Promise<Row[]>;

export interface OwnerKnowledgeSource {
  type: string;
  id: string | null;
  label: string;
  date: string | null;
  url: string | null;
}

export interface OwnerKnowledgeView {
  id: string;
  canonicalType: OwnerKnowledgeType;
  canonicalRepository: OwnerKnowledgeRepository;
  title: string | null;
  content: string;
  structuredValue: unknown | null;
  scope: { type: MemoryScopeType; id: string; label: string; accessSummary: string };
  agentRef: { id: string; name: string | null } | null;
  goalRef: { id: string; title: string | null } | null;
  projectRef: string | null;
  taskRef: string | null;
  source: OwnerKnowledgeSource | null;
  provenance: Array<{ relation: string; confidence: number; source: OwnerKnowledgeSource }>;
  status: string;
  confidence: number;
  createdAt: string;
  updatedAt: string;
  lastConfirmedAt: string | null;
  supersedes: string | null;
  supersededBy: string | null;
  contradictions: string[];
  staleReasons: string[];
  eligibleForContext: string[];
  usedInRuns: number;
  remoteAvailability: "available" | "not_applicable" | "provider_unavailable";
}

export interface OwnerKnowledgeFilters {
  query?: string;
  type?: OwnerKnowledgeType;
  scope?: MemoryScopeType;
  agentId?: string;
  goalId?: string;
  source?: string;
  status?: string;
  updatedFrom?: string;
  review?: OwnerKnowledgeReview;
  page?: number;
  limit?: number;
  executionScope?: ExecutionScope;
  recordId?: string;
}

export interface OwnerKnowledgePage {
  items: OwnerKnowledgeView[];
  page: number;
  limit: number;
  hasMore: boolean;
}

const text = (value: unknown): string => typeof value === "string" ? value : String(value ?? "");
const nullableText = (value: unknown): string | null => value == null ? null : text(value);
const iso = (value: unknown): string => value instanceof Date ? value.toISOString() : text(value);
const nullableIso = (value: unknown): string | null => value == null ? null : iso(value);
const number = (value: unknown): number => Number.isFinite(Number(value)) ? Number(value) : 0;
const stringArray = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

function safeSourceUrl(value: unknown): string | null {
  const url = nullableText(value);
  if (!url) return null;
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function sourceLabel(type: string, provider: string | null): string {
  if (type === "explicit") return "Explicit owner statement";
  if (type === "legacy_supermemory") return "Imported Memory";
  if (type === "manual") return "Manual entry";
  return provider ? `${provider} ${type}` : type.replaceAll("_", " ");
}

function sourceFromRow(row: Row, prefix = "source_"): OwnerKnowledgeSource | null {
  const type = nullableText(row[`${prefix}type`]);
  if (!type) return null;
  const provider = nullableText(row[`${prefix}provider`]);
  return {
    type,
    id: nullableText(row[`${prefix}id`]),
    label: sourceLabel(type, provider),
    date: nullableIso(row[`${prefix}date`]),
    url: safeSourceUrl(row[`${prefix}url`]),
  };
}

function scopeAccessSummary(type: MemoryScopeType): string {
  if (type === "agent") return "Eligible only for the named Agent and owner-authorized inspection.";
  if (type === "goal") return "Eligible only while working in this Goal and for owner-authorized inspection.";
  if (type === "task") return "Eligible only for this Task context and owner-authorized inspection.";
  if (type === "project") return "Eligible only through the Project authorization provider and owner-authorized inspection.";
  return "Eligible for the owner's Agents when context policy selects it.";
}

function eligibility(row: Row, type: MemoryScopeType): string[] {
  if (type === "agent") return [nullableText(row.agent_name) ?? "Named Agent", "Owner-authorized context assembly"];
  if (type === "goal") return [nullableText(row.goal_title) ? `Goal: ${text(row.goal_title)}` : "Related Goal", "Owner-authorized context assembly"];
  if (type === "task") return ["Related Task", "Owner-authorized context assembly"];
  if (type === "project") return ["Authorized Project context", "Owner-authorized context assembly"];
  return ["Primary Agent", "Owner-authorized context assembly"];
}

function memoryView(row: Row, providerReady: boolean): OwnerKnowledgeView {
  const scopeType = text(row.scope_type) as MemoryScopeType;
  const scopeId = text(row.scope_id);
  const sourceType = text(row.source_type);
  return {
    id: text(row.id),
    canonicalType: "memory",
    canonicalRepository: "memory",
    title: null,
    content: text(row.content),
    structuredValue: null,
    scope: { type: scopeType, id: scopeId, label: scopeType === "owner" ? "Owner" : `${scopeType[0]!.toUpperCase()}${scopeType.slice(1)}: ${nullableText(row.scope_label) ?? scopeId}`, accessSummary: scopeAccessSummary(scopeType) },
    agentRef: scopeType === "agent" ? { id: scopeId, name: nullableText(row.agent_name) } : null,
    goalRef: scopeType === "goal" ? { id: scopeId, title: nullableText(row.goal_title) } : null,
    projectRef: scopeType === "project" ? scopeId : null,
    taskRef: scopeType === "task" ? scopeId : null,
    source: { type: sourceType, id: nullableText(row.source_id), label: sourceLabel(sourceType, null), date: iso(row.created_at), url: null },
    provenance: [],
    status: text(row.status),
    confidence: number(row.confidence),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    lastConfirmedAt: nullableIso(row.last_confirmed_at),
    supersedes: null,
    supersededBy: null,
    contradictions: [],
    staleReasons: [],
    eligibleForContext: eligibility(row, scopeType),
    usedInRuns: number(row.used_in_runs),
    remoteAvailability: nullableText(row.provider_id) ? (providerReady ? "available" : "provider_unavailable") : "not_applicable",
  };
}

function knowledgeScope(row: Row): { type: MemoryScopeType; id: string; label: string; accessSummary: string } {
  return { type: "owner", id: text(row.owner_id), label: "Owner", accessSummary: "Owner-scoped Knowledge; selection into Agent context remains governed by context policy." };
}

function knowledgeView(row: Row): OwnerKnowledgeView {
  const staleReasons = stringArray(row.stale_reasons);
  const contradictions = stringArray(row.contradictions);
  return {
    id: text(row.id),
    canonicalType: text(row.kind) as OwnerKnowledgeType,
    canonicalRepository: "knowledge",
    title: nullableText(row.title) ?? (text(row.kind) === "preference" ? nullableText(row.preference_key) : text(row.kind) === "commitment" ? nullableText(row.subject) : null),
    content: text(row.statement),
    structuredValue: row.preference_value ?? null,
    scope: knowledgeScope(row),
    agentRef: nullableText(row.created_by_id) ? { id: text(row.created_by_id), name: nullableText(row.agent_name) } : null,
    goalRef: nullableText(row.goal_id) ? { id: text(row.goal_id), title: nullableText(row.goal_title) } : null,
    projectRef: nullableText(row.project_ref),
    taskRef: null,
    source: sourceFromRow(row),
    provenance: [],
    status: text(row.status),
    confidence: number(row.confidence),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    lastConfirmedAt: nullableIso(row.last_confirmed_at),
    supersedes: nullableText(row.supersedes_id),
    supersededBy: nullableText(row.superseded_by_id),
    contradictions,
    staleReasons,
    eligibleForContext: ["Owner-authorized Knowledge retrieval"],
    usedInRuns: number(row.used_in_runs),
    remoteAvailability: "not_applicable",
  };
}

function addCondition(conditions: string[], values: unknown[], expression: string, value: unknown): void {
  values.push(value);
  conditions.push(expression.replace("?", `$${values.length}`));
}

function validatedBounds(filters: OwnerKnowledgeFilters): { page: number; limit: number; offset: number; fetchLimit: number } {
  const requestedPage = Number.isFinite(filters.page) ? filters.page! : 1;
  const requestedLimit = Number.isFinite(filters.limit) ? filters.limit! : 25;
  const page = Math.min(20, Math.max(1, Math.floor(requestedPage)));
  const limit = Math.min(50, Math.max(1, Math.floor(requestedLimit)));
  const offset = (page - 1) * limit;
  return { page, limit, offset, fetchLimit: offset + limit + 1 };
}

function memoryQuery(ownerId: string, filters: OwnerKnowledgeFilters, fetchLimit: number): { sql: string; values: unknown[] } | null {
  if (filters.type && filters.type !== "memory") return null;
  const conditions = ["m.owner_id=$1", "m.status='active'"];
  const values: unknown[] = [ownerId];
  if (filters.recordId) addCondition(conditions, values, "m.id=?", filters.recordId);
  if (filters.query?.trim()) addCondition(conditions, values, "m.content ILIKE '%'||?||'%'", filters.query.trim().slice(0, 200));
  if (filters.scope) addCondition(conditions, values, "m.scope_type=?", filters.scope);
  if (filters.agentId) { addCondition(conditions, values, "m.scope_type='agent' AND m.scope_id=?", filters.agentId); }
  if (filters.goalId) { addCondition(conditions, values, "m.scope_type='goal' AND m.scope_id=?", filters.goalId); }
  if (filters.source) addCondition(conditions, values, "m.source_type=?", filters.source);
  if (filters.status && filters.status !== "active") return null;
  if (filters.updatedFrom) addCondition(conditions, values, "m.updated_at>=?::timestamptz", filters.updatedFrom);
  if (filters.review === "contradictions" || filters.review === "stale" || filters.review === "corrected") return null;
  if (filters.review === "recent") conditions.push("m.created_at>=now()-interval '30 days'");
  if (filters.review === "needs_review") conditions.push("m.last_confirmed_at IS NULL");
  if (filters.executionScope) {
    const scope = filters.executionScope;
    const allowed = ["(m.scope_type='owner' AND m.scope_id=$1)"];
    values.push(scope.agentId); allowed.push(`(m.scope_type='agent' AND m.scope_id=$${values.length})`);
    if (scope.goalId) { values.push(scope.goalId); allowed.push(`(m.scope_type='goal' AND m.scope_id=$${values.length})`); }
    if (scope.projectId) { values.push(scope.projectId); allowed.push(`(m.scope_type='project' AND m.scope_id=$${values.length})`); }
    if (scope.taskId) { values.push(scope.taskId); allowed.push(`(m.scope_type='task' AND m.scope_id=$${values.length})`); }
    conditions.push(`(${allowed.join(" OR ")})`);
  }
  values.push(fetchLimit);
  return {
    values,
    sql: `SELECT m.*,a.name AS agent_name,g.title AS goal_title,coalesce(a.name,g.title,m.scope_id) AS scope_label,
      (SELECT count(*)::int FROM context_assemblies c WHERE c.owner_id=m.owner_id AND c.memory_refs ? m.id) AS used_in_runs
      FROM memory_records m
      LEFT JOIN agents a ON m.scope_type='agent' AND a.owner_id=m.owner_id AND a.id=m.scope_id
      LEFT JOIN goals g ON m.scope_type='goal' AND g.owner_id=m.owner_id AND g.id=m.scope_id
      WHERE ${conditions.join(" AND ")} ORDER BY m.updated_at DESC,m.id DESC LIMIT $${values.length}`,
  };
}

function knowledgeQuery(ownerId: string, filters: OwnerKnowledgeFilters, fetchLimit: number): { sql: string; values: unknown[] } | null {
  if (filters.type === "memory" || (filters.scope && filters.scope !== "owner")) return null;
  const conditions = ["k.owner_id=$1"];
  const values: unknown[] = [ownerId];
  if (filters.recordId) addCondition(conditions, values, "k.id=?", filters.recordId);
  if (filters.type) addCondition(conditions, values, "k.kind=?", filters.type);
  if (filters.query?.trim()) addCondition(conditions, values, "to_tsvector('english',coalesce(k.title,'')||' '||k.statement) @@ websearch_to_tsquery('english',?)", filters.query.trim().slice(0, 200));
  if (filters.agentId) addCondition(conditions, values, "k.created_by_id=?", filters.agentId);
  if (filters.goalId) addCondition(conditions, values, "k.goal_id=?", filters.goalId);
  if (filters.source) addCondition(conditions, values, "EXISTS (SELECT 1 FROM knowledge_provenance_links fp JOIN knowledge_sources fs ON fs.owner_id=fp.owner_id AND fs.id=fp.source_id WHERE fp.owner_id=k.owner_id AND fp.knowledge_id=k.id AND fs.source_type=?)", filters.source);
  if (filters.status) addCondition(conditions, values, "k.status=?", filters.status);
  if (filters.updatedFrom) addCondition(conditions, values, "k.updated_at>=?::timestamptz", filters.updatedFrom);
  if (filters.review === "contradictions") conditions.push("(k.status='contradicted' OR EXISTS (SELECT 1 FROM knowledge_provenance_links cp WHERE cp.owner_id=k.owner_id AND cp.knowledge_id=k.id AND cp.relation='contradicts') OR EXISTS (SELECT 1 FROM knowledge_relationships cr WHERE cr.owner_id=k.owner_id AND cr.status='contradicted' AND ((cr.subject_type=k.kind AND cr.subject_id=k.id) OR (cr.object_type=k.kind AND cr.object_id=k.id))))");
  if (filters.review === "stale") conditions.push("(k.status IN ('stale','superseded','expired') OR k.review_at<=now() OR k.expires_at<=now() OR g.status='archived')");
  if (filters.review === "recent") conditions.push("k.created_at>=now()-interval '30 days'");
  if (filters.review === "corrected") conditions.push("k.supersedes_id IS NOT NULL");
  if (filters.review === "needs_review") conditions.push("(k.status IN ('stale','contradicted','expired','reopened','missed') OR k.review_at<=now() OR k.expires_at<=now())");
  values.push(fetchLimit);
  return {
    values,
    sql: `SELECT k.*,g.title AS goal_title,g.status AS goal_status,a.name AS agent_name,
      (SELECT newer.id FROM knowledge_records newer WHERE newer.owner_id=k.owner_id AND newer.supersedes_id=k.id ORDER BY newer.created_at DESC LIMIT 1) AS superseded_by_id,
      (SELECT s.source_type FROM knowledge_provenance_links p JOIN knowledge_sources s ON s.owner_id=p.owner_id AND s.id=p.source_id WHERE p.owner_id=k.owner_id AND p.knowledge_id=k.id ORDER BY p.created_at DESC LIMIT 1) AS source_type,
      (SELECT s.id FROM knowledge_provenance_links p JOIN knowledge_sources s ON s.owner_id=p.owner_id AND s.id=p.source_id WHERE p.owner_id=k.owner_id AND p.knowledge_id=k.id ORDER BY p.created_at DESC LIMIT 1) AS source_id,
      (SELECT s.provider FROM knowledge_provenance_links p JOIN knowledge_sources s ON s.owner_id=p.owner_id AND s.id=p.source_id WHERE p.owner_id=k.owner_id AND p.knowledge_id=k.id ORDER BY p.created_at DESC LIMIT 1) AS source_provider,
      (SELECT s.captured_at FROM knowledge_provenance_links p JOIN knowledge_sources s ON s.owner_id=p.owner_id AND s.id=p.source_id WHERE p.owner_id=k.owner_id AND p.knowledge_id=k.id ORDER BY p.created_at DESC LIMIT 1) AS source_date,
      (SELECT s.reference_uri FROM knowledge_provenance_links p JOIN knowledge_sources s ON s.owner_id=p.owner_id AND s.id=p.source_id WHERE p.owner_id=k.owner_id AND p.knowledge_id=k.id ORDER BY p.created_at DESC LIMIT 1) AS source_url,
      ARRAY_REMOVE(ARRAY[
        CASE WHEN k.status='stale' THEN 'Marked stale' END,
        CASE WHEN k.status='superseded' THEN 'Superseded by newer information' END,
        CASE WHEN k.status='expired' OR k.expires_at<=now() THEN 'Expired' END,
        CASE WHEN k.review_at<=now() THEN 'Review date reached' END,
        CASE WHEN g.status='archived' THEN 'Related Goal is archived' END
      ],NULL) AS stale_reasons,
      ARRAY(SELECT DISTINCT relation_id FROM (
        SELECT p.source_id AS relation_id FROM knowledge_provenance_links p WHERE p.owner_id=k.owner_id AND p.knowledge_id=k.id AND p.relation='contradicts'
        UNION ALL
        SELECT CASE WHEN r.subject_id=k.id THEN r.object_id ELSE r.subject_id END FROM knowledge_relationships r WHERE r.owner_id=k.owner_id AND r.status='contradicted' AND ((r.subject_type=k.kind AND r.subject_id=k.id) OR (r.object_type=k.kind AND r.object_id=k.id))
      ) conflict) AS contradictions,
      (SELECT count(*)::int FROM context_assemblies c WHERE c.owner_id=k.owner_id AND c.source_refs ? ('knowledge:'||k.id)) AS used_in_runs
      FROM knowledge_records k
      LEFT JOIN goals g ON g.owner_id=k.owner_id AND g.id=k.goal_id
      LEFT JOIN agents a ON a.owner_id=k.owner_id AND a.id=k.created_by_id
      WHERE ${conditions.join(" AND ")} ORDER BY k.updated_at DESC,k.id DESC LIMIT $${values.length}`,
  };
}

function rank(items: OwnerKnowledgeView[], query: string | undefined): OwnerKnowledgeView[] {
  const needle = query?.trim().toLocaleLowerCase() ?? "";
  const terminal = new Set(["superseded", "dismissed", "inactive", "expired", "cancelled", "rejected", "reversed"]);
  const newestUpdate = items.reduce((latest, item) => Math.max(latest, Date.parse(item.updatedAt) || 0), 0);
  const score = (item: OwnerKnowledgeView): number => {
    const title = item.title?.toLocaleLowerCase() ?? "";
    const content = item.content.toLocaleLowerCase();
    const relevance = needle ? (title === needle || content === needle ? 400 : title.includes(needle) ? 250 : content.includes(needle) ? 150 : 0) : 0;
    const ageFromNewest = Math.max(0, newestUpdate - (Date.parse(item.updatedAt) || 0));
    return relevance + (terminal.has(item.status) ? 0 : 80) + Math.round(item.confidence * 20) + Math.max(0, 30 - Math.floor(ageFromNewest / 86_400_000));
  };
  return [...items].sort((left, right) => score(right) - score(left) || right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id));
}

export async function searchOwnerKnowledge(
  ownerId: string,
  filters: OwnerKnowledgeFilters = {},
  query: OwnerKnowledgeQuery = (sql, params = []) => db().query(sql, params) as Promise<Row[]>,
  providerReady = Boolean(process.env.SUPERMEMORY_API_KEY?.trim()),
): Promise<OwnerKnowledgePage> {
  const bounds = validatedBounds(filters);
  const memory = memoryQuery(ownerId, filters, bounds.fetchLimit);
  const knowledge = knowledgeQuery(ownerId, filters, bounds.fetchLimit);
  const [memoryRows, knowledgeRows] = await Promise.all([
    memory ? query(memory.sql, memory.values) : Promise.resolve([]),
    knowledge ? query(knowledge.sql, knowledge.values) : Promise.resolve([]),
  ]);
  const authorized = [...memoryRows.map((row) => memoryView(row, providerReady)), ...knowledgeRows.map(knowledgeView)];
  const ranked = rank(authorized, filters.query);
  const items = ranked.slice(bounds.offset, bounds.offset + bounds.limit);
  return { items, page: bounds.page, limit: bounds.limit, hasMore: ranked.length > bounds.offset + bounds.limit };
}

function provenanceSource(source: KnowledgeRecordView["provenance"][number]["source"]): OwnerKnowledgeSource {
  return { type: source.sourceType, id: source.id, label: sourceLabel(source.sourceType, source.provider), date: source.capturedAt, url: safeSourceUrl(source.referenceUri) };
}

export async function inspectOwnerKnowledge(ownerId: string, repository: OwnerKnowledgeRepository, id: string, executionScope?: ExecutionScope): Promise<OwnerKnowledgeView | null> {
  if (!/^(?:memory|knowledge)_[A-Za-z0-9_-]{1,240}$/.test(id)) return null;
  if (repository === "memory") {
    const page = await searchOwnerKnowledge(ownerId, { type: "memory", recordId: id, executionScope, limit: 1 });
    return page.items[0] ?? null;
  }
  const record = await getKnowledge(ownerId, id);
  if (!record) return null;
  const page = await searchOwnerKnowledge(ownerId, { type: record.kind, recordId: id, limit: 1 });
  const item = page.items[0];
  if (!item) return null;
  item.provenance = record.provenance.map((link) => ({ relation: link.relation, confidence: link.confidence, source: provenanceSource(link.source) }));
  return item;
}

function correctionInput(current: KnowledgeRecordView, content: string, preferenceValue: unknown): Parameters<typeof createKnowledge>[0] {
  return {
    ownerId: "",
    kind: current.kind,
    statement: content,
    confidence: current.confidence,
    title: current.title,
    occurrenceCount: current.occurrenceCount ?? undefined,
    firstSeenAt: current.firstSeenAt,
    lastConfirmedAt: new Date().toISOString(),
    firstObservedAt: current.firstObservedAt,
    lastObservedAt: current.lastObservedAt,
    testDescription: current.testDescription,
    decisionTrigger: current.decisionTrigger,
    rationale: current.rationale,
    alternatives: current.alternatives,
    decidedAt: current.decidedAt,
    reopenCondition: current.reopenCondition,
    subject: current.subject,
    dueAt: current.dueAt,
    preferenceKey: current.preferenceKey,
    preferenceValue: current.kind === "preference" && preferenceValue !== undefined ? preferenceValue : current.preferenceValue,
    preferenceScope: current.preferenceScope,
    preferenceSourceType: current.preferenceSourceType,
    preferenceSourceId: current.preferenceSourceId,
    active: current.kind === "preference" ? true : current.active ?? undefined,
    reviewAt: current.reviewAt,
    expiresAt: current.expiresAt,
    generatedAt: current.generatedAt,
    createdByType: "owner",
    goalId: current.goalId,
    projectRef: current.projectRef,
    supersedesId: current.id,
    provenance: current.provenance.map((link) => ({ sourceId: link.source.id, relation: link.relation, confidence: link.confidence })),
  };
}

export async function correctOwnerKnowledge(input: { ownerId: string; repository: OwnerKnowledgeRepository; id: string; content: string; preferenceValue?: unknown }) {
  const content = input.content.replaceAll("\0", "").trim();
  if (!content || content.length > 20_000) throw new Error("Corrected information must be between 1 and 20,000 characters.");
  if (input.repository === "memory") {
    try {
      const result = await memoryStore.correctForOwner(input.ownerId, input.id, content);
      const operation = await recordOwnerDataOperation({ ownerId: input.ownerId, type: "memory_corrected", status: result.status, recordCount: 1, metadata: { repository: "memory", recordId: input.id, replacementId: result.replacement.id, remoteDeletionVerified: result.remoteDeletionVerified } });
      return { receipt: { id: operation.id, operation: "memory_corrected", result: result.status, previous: "superseded", current: "active", canonicalRecordId: result.replacement.id, remoteDeletionVerified: result.remoteDeletionVerified }, item: await inspectOwnerKnowledge(input.ownerId, "memory", result.replacement.id) };
    } catch (error) {
      const errorSummary = error instanceof Error ? error.message : "Memory correction failed.";
      await recordOwnerDataOperation({
        ownerId: input.ownerId,
        type: "memory_corrected",
        status: errorSummary.toLowerCase().includes("partially completed") ? "partially_completed" : "failed",
        recordCount: 0,
        errorSummary,
        metadata: { repository: "memory", recordId: input.id },
      });
      throw error;
    }
  }
  const current = await getKnowledge(input.ownerId, input.id);
  if (!current) throw new Error("Knowledge record not found.");
  const corrected = await createKnowledge({ ...correctionInput(current, content, input.preferenceValue), ownerId: input.ownerId });
  const type = current.kind === "preference" ? "preference_corrected" : "knowledge_corrected";
  const operation = await recordOwnerDataOperation({ ownerId: input.ownerId, type, status: "completed", recordCount: 1, metadata: { repository: "knowledge", canonicalType: current.kind, recordId: current.id, replacementId: corrected.id } });
  return { receipt: { id: operation.id, operation: type, result: "completed", previous: "superseded", current: "active", canonicalRecordId: corrected.id, sourceHistoryPreserved: true }, item: await inspectOwnerKnowledge(input.ownerId, "knowledge", corrected.id) };
}

export async function forgetOwnerKnowledge(input: { ownerId: string; repository: OwnerKnowledgeRepository; id: string }) {
  if (input.repository === "memory") {
    const result = await memoryStore.deleteForOwnerDetailed(input.ownerId, input.id);
    const status = result.deleted && result.remoteDeletionVerified ? "completed" : result.remoteDeleted ? "partially_completed" : "failed";
    const operation = await recordOwnerDataOperation({ ownerId: input.ownerId, type: "memory_forgotten", status, recordCount: result.deleted ? 1 : 0, errorSummary: status === "completed" ? undefined : "Remote Memory deletion could not be fully verified.", metadata: { repository: "memory", recordId: input.id, remoteDeleted: result.remoteDeleted, remoteDeletionVerified: result.remoteDeletionVerified, canonicalMetadataRemoved: result.deleted } });
    return { receipt: { id: operation.id, operation: "memory_forgotten", result: status, canonicalRecordId: input.id, remoteDeleted: result.remoteDeleted, remoteDeletionVerified: result.remoteDeletionVerified, canonicalMetadataRemoved: result.deleted } };
  }
  const current = await getKnowledge(input.ownerId, input.id);
  if (!current) throw new Error("Knowledge record not found.");
  await db().transaction((transaction) => [
    transaction.query(`UPDATE knowledge_records SET supersedes_id=NULL,updated_at=now() WHERE owner_id=$1 AND supersedes_id=$2`, [input.ownerId, input.id]),
    transaction.query(`DELETE FROM knowledge_relationships WHERE owner_id=$1 AND ((subject_type=$2 AND subject_id=$3) OR (object_type=$2 AND object_id=$3))`, [input.ownerId, current.kind, input.id]),
    transaction.query(`DELETE FROM knowledge_records WHERE owner_id=$1 AND id=$2`, [input.ownerId, input.id]),
  ]);
  const operation = await recordOwnerDataOperation({ ownerId: input.ownerId, type: "knowledge_deleted", status: "completed", recordCount: 1, metadata: { repository: "knowledge", canonicalType: current.kind, recordId: current.id, relationshipsRemoved: true } });
  return { receipt: { id: operation.id, operation: "knowledge_deleted", result: "completed", canonicalRecordId: current.id, canonicalType: current.kind, relationshipsRemoved: true } };
}
