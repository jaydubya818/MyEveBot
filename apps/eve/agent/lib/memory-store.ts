import { randomUUID } from "node:crypto";

import { db } from "./receipts-db.ts";
import {
  rankScopedMemories,
  scopeIsAllowed,
  validateMemoryScope,
  type ExecutionScope,
  type MemoryScope,
  type ScopedMemoryCandidate,
} from "../../lib/memory-scopes.ts";
import { ownerName } from "./owner.ts";

const API_BASE = "https://api.supermemory.ai";

function containerTag(): string {
  const configured = process.env.MEMORY_CONTAINER_TAG?.trim();
  if (configured) return configured;
  const ownerSlug = ownerName().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `owner-${ownerSlug || "default"}`;
}

export type MemoryAccessContext = ExecutionScope;

export interface MemoryEntry {
  id: string;
  content: string;
  scope: MemoryScope;
  permanent: boolean;
  confidence: number;
  sourceType: string;
  sourceId: string | null;
  updatedAt: string | null;
  lastConfirmedAt: string | null;
}

export interface OwnerMemoryDeletionResult {
  found: boolean;
  deleted: boolean;
  remoteDeleted: boolean;
  remoteDeletionVerified: boolean;
}

interface SemanticSearchResult {
  id: string;
  content: string;
  similarity: number;
  updatedAt: string | null;
}

interface SemanticMemoryEntry {
  id: string;
  content: string;
  permanent: boolean;
  updatedAt: string | null;
}

class SupermemoryError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "SupermemoryError";
    this.status = status;
  }
}

async function api<T>(path: string, method: string, body?: unknown): Promise<T> {
  const apiKey = process.env.SUPERMEMORY_API_KEY;
  if (!apiKey) throw new Error("SUPERMEMORY_API_KEY is not set.");
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new SupermemoryError(`Supermemory ${method} ${path} failed (${response.status}): ${text}`, response.status);
  return (text.length > 0 ? JSON.parse(text) : null) as T;
}

const semanticMemory = {
  async add(content: string, permanent: boolean): Promise<string> {
    const result = await api<{ documentId?: string }>("/v4/memories", "POST", {
      containerTag: containerTag(), memories: [{ content, isStatic: permanent }],
    });
    if (!result.documentId) throw new Error("Supermemory did not return a document id.");
    return result.documentId;
  },
  async search(query: string): Promise<SemanticSearchResult[]> {
    const result = await api<{ results?: Array<Record<string, unknown>> }>("/v4/search", "POST", {
      q: query, containerTag: containerTag(), searchMode: "hybrid",
    });
    return (result.results ?? []).map((raw) => ({
      id: String(raw.id ?? raw.docId ?? raw.documentId ?? ""),
      content: String(raw.memory ?? raw.chunk ?? raw.content ?? ""),
      similarity: Number(raw.similarity ?? raw.score ?? 0),
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : null,
    })).filter((entry) => entry.id || entry.content);
  },
  async list(): Promise<SemanticMemoryEntry[]> {
    const result = await api<{ memoryEntries?: Array<Record<string, unknown>> }>("/v4/memories/list", "POST", {
      containerTags: [containerTag()], limit: 200,
    });
    return (result.memoryEntries ?? [])
      .filter((raw) => raw.isForgotten !== true && raw.isLatest !== false)
      .map((raw) => ({
        id: String(raw.id ?? ""), content: String(raw.memory ?? ""), permanent: raw.isStatic === true,
        updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : null,
      })).filter((entry) => entry.id && entry.content);
  },
  async delete(id: string): Promise<boolean> {
    try {
      const result = await api<{ forgotten?: boolean }>("/v4/memories", "DELETE", { containerTag: containerTag(), id });
      return result.forgotten ?? true;
    } catch (error) {
      if (error instanceof SupermemoryError && error.status === 404) return false;
      throw error;
    }
  },
  async deleteVerified(id: string): Promise<{ deleted: boolean; verifiedAbsent: boolean }> {
    const deleted = await this.delete(id);
    try {
      await api(`/v3/memories/${encodeURIComponent(id)}`, "GET");
      return { deleted, verifiedAbsent: false };
    } catch (error) {
      if (error instanceof SupermemoryError && error.status === 404) return { deleted: true, verifiedAbsent: true };
      throw error;
    }
  },
};

type Row = Record<string, unknown>;
const importedOwners = new Set<string>();
function text(value: unknown): string { return typeof value === "string" ? value : String(value ?? ""); }
function nullableText(value: unknown): string | null { return value == null ? null : text(value); }
function iso(value: unknown): string | null { return value instanceof Date ? value.toISOString() : nullableText(value); }

function rowEntry(row: Row): MemoryEntry {
  return {
    id: text(row.id), content: text(row.content), scope: { type: text(row.scope_type) as MemoryScope["type"], id: text(row.scope_id) },
    permanent: row.permanent === true, confidence: Number(row.confidence), sourceType: text(row.source_type),
    sourceId: nullableText(row.source_id), updatedAt: iso(row.updated_at), lastConfirmedAt: iso(row.last_confirmed_at),
  };
}

async function importLegacyOwnerMemories(ownerId: string): Promise<void> {
  if (importedOwners.has(ownerId)) return;
  const migrated = await db().query(`SELECT owner_id FROM memory_scope_migrations WHERE owner_id=$1 LIMIT 1`, [ownerId]);
  if (migrated[0]) {
    importedOwners.add(ownerId);
    return;
  }
  const configuredOwnerId = process.env.MYEVE_OWNER_ID?.trim() || process.env.SOFIE_OWNER_ID?.trim();
  if (configuredOwnerId && configuredOwnerId !== ownerId) {
    await db().query(`INSERT INTO memory_scope_migrations (owner_id) VALUES ($1) ON CONFLICT DO NOTHING`, [ownerId]);
    importedOwners.add(ownerId);
    return;
  }
  const entries = await semanticMemory.list();
  for (const entry of entries) {
    await db().query(
      `INSERT INTO memory_records (id,owner_id,scope_type,scope_id,content,provider_id,source_type,confidence,permanent,updated_at)
       VALUES ($1,$2,'owner',$2,$3,$4,'legacy_supermemory',1,$5,coalesce($6::timestamptz,now()))
       ON CONFLICT (owner_id,provider,provider_id) WHERE provider_id IS NOT NULL DO NOTHING`,
      [`memory_${randomUUID()}`, ownerId, entry.content, entry.id, entry.permanent, entry.updatedAt],
    );
  }
  await db().query(`INSERT INTO memory_scope_migrations (owner_id) VALUES ($1) ON CONFLICT DO NOTHING`, [ownerId]);
  importedOwners.add(ownerId);
}

async function assertOwnedScope(context: MemoryAccessContext, scope: MemoryScope): Promise<void> {
  const invalid = validateMemoryScope(scope);
  if (invalid) throw new Error(invalid);
  if (scope.type === "owner") {
    if (scope.id !== context.ownerId) throw new Error("Cross-owner memory scope rejected.");
    return;
  }
  if (scope.type === "agent") {
    if (scope.id !== context.agentId) throw new Error("An Agent cannot access another Agent's private memory.");
    const rows = await db().query(`SELECT id FROM agents WHERE owner_id=$1 AND id=$2 LIMIT 1`, [context.ownerId, scope.id]);
    if (!rows[0]) throw new Error("Agent scope does not belong to this owner.");
    return;
  }
  if (scope.type === "project") throw new Error("Project memory is reserved for the future Project authorization provider.");
  if (!scopeIsAllowed(scope, context)) throw new Error(`${scope.type === "goal" ? "Goal" : "Task"} memory is not associated with this execution.`);
  const relation = scope.type === "goal"
    ? await db().query(`SELECT id FROM goals WHERE owner_id=$1 AND id=$2 LIMIT 1`, [context.ownerId, scope.id])
    : await db().query(
        `SELECT id FROM task_runs WHERE owner_id=$1 AND id=$2 UNION ALL SELECT t.id FROM goal_tasks t JOIN goals g ON g.id=t.goal_id WHERE g.owner_id=$1 AND t.id=$2 LIMIT 1`,
        [context.ownerId, scope.id],
      );
  if (!relation[0]) throw new Error(`${scope.type === "goal" ? "Goal" : "Task"} scope does not belong to this owner.`);
}

export const memoryStore = {
  async add(content: string, options: { context: MemoryAccessContext; scope: MemoryScope; permanent?: boolean; sourceType?: string; sourceId?: string | null; confidence?: number }): Promise<MemoryEntry> {
    await assertOwnedScope(options.context, options.scope);
    await importLegacyOwnerMemories(options.context.ownerId);
    const clean = content.replaceAll("\0", "").trim();
    if (!clean || clean.length > 4000) throw new Error("Memory must be between 1 and 4,000 characters.");
    const confidence = Math.max(0, Math.min(1, options.confidence ?? 1));
    const id = `memory_${randomUUID()}`;
    await db().query(
      `INSERT INTO memory_records (id,owner_id,scope_type,scope_id,content,source_type,source_id,confidence,permanent,status,last_confirmed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'archived',now())`,
      [id, options.context.ownerId, options.scope.type, options.scope.id, clean, options.sourceType ?? "explicit", options.sourceId ?? null, confidence, options.permanent ?? false],
    );
    let providerId: string | null = null;
    try {
      providerId = await semanticMemory.add(clean, options.permanent ?? false);
      const rows = await db().query(
        `UPDATE memory_records SET provider_id=$3,status='active',updated_at=now()
         WHERE owner_id=$1 AND id=$2 RETURNING *`,
        [options.context.ownerId, id, providerId],
      ) as Row[];
      return rowEntry(rows[0]);
    } catch (error) {
      if (providerId) await semanticMemory.delete(providerId).catch(() => undefined);
      await db().query(`UPDATE memory_records SET status='deleted',updated_at=now() WHERE owner_id=$1 AND id=$2`, [options.context.ownerId, id]).catch(() => undefined);
      throw error;
    }
  },

  async search(query: string, context: MemoryAccessContext): Promise<MemoryEntry[]> {
    await importLegacyOwnerMemories(context.ownerId);
    const semantic = await semanticMemory.search(query);
    if (semantic.length === 0) return [];
    const providerIds = semantic.map((entry) => entry.id).filter(Boolean);
    const contents = semantic.map((entry) => entry.content).filter(Boolean);
    const rows = await db().query(
      `SELECT * FROM memory_records WHERE owner_id=$1 AND status='active'
       AND (provider_id = ANY($2::text[]) OR content = ANY($3::text[]))`,
      [context.ownerId, providerIds, contents],
    ) as Row[];
    const semanticById = new Map(semantic.map((entry) => [entry.id, entry]));
    const semanticByContent = new Map(semantic.map((entry) => [entry.content, entry]));
    const candidates: ScopedMemoryCandidate[] = rows.map((row) => {
      const match = semanticById.get(text(row.provider_id)) ?? semanticByContent.get(text(row.content));
      return {
        id: text(row.id), scope: { type: text(row.scope_type) as MemoryScope["type"], id: text(row.scope_id) },
        content: text(row.content), confidence: Number(row.confidence), semanticRelevance: match?.similarity ?? 0,
        updatedAt: iso(row.updated_at),
      };
    });
    const ranked = rankScopedMemories(candidates, context);
    const byId = new Map(rows.map((row) => [text(row.id), rowEntry(row)]));
    return ranked.map((candidate) => byId.get(candidate.id)!).filter(Boolean);
  },

  async list(context: MemoryAccessContext): Promise<MemoryEntry[]> {
    await importLegacyOwnerMemories(context.ownerId);
    const rows = await db().query(
      `SELECT * FROM memory_records WHERE owner_id=$1 AND status='active' ORDER BY updated_at DESC,id DESC`,
      [context.ownerId],
    ) as Row[];
    return rows.map(rowEntry).filter((entry) => scopeIsAllowed(entry.scope, context));
  },

  async delete(memoryId: string, context: MemoryAccessContext): Promise<boolean> {
    const rows = await db().query(`SELECT * FROM memory_records WHERE owner_id=$1 AND id=$2 AND status='active' LIMIT 1`, [context.ownerId, memoryId]) as Row[];
    const row = rows[0];
    if (!row) return false;
    const entry = rowEntry(row);
    if (!scopeIsAllowed(entry.scope, context)) throw new Error("Memory is outside this Agent's authorized scopes.");
    const providerId = nullableText(row.provider_id);
    const remote = providerId ? await semanticMemory.deleteVerified(providerId) : { deleted: true, verifiedAbsent: true };
    if (remote.verifiedAbsent) await db().query(`UPDATE memory_records SET status='deleted',updated_at=now() WHERE owner_id=$1 AND id=$2`, [context.ownerId, memoryId]);
    return remote.verifiedAbsent;
  },

  async listForOwner(ownerId: string): Promise<MemoryEntry[]> {
    await importLegacyOwnerMemories(ownerId);
    const rows = await db().query(
      `SELECT * FROM memory_records WHERE owner_id=$1 AND status='active' ORDER BY scope_type,updated_at DESC,id DESC`,
      [ownerId],
    ) as Row[];
    return rows.map(rowEntry);
  },

  async deleteForOwner(ownerId: string, memoryId: string): Promise<boolean> {
    const result = await this.deleteForOwnerDetailed(ownerId, memoryId);
    return result.deleted;
  },

  async deleteForOwnerDetailed(ownerId: string, memoryId: string): Promise<OwnerMemoryDeletionResult> {
    const rows = await db().query(
      `SELECT provider_id FROM memory_records WHERE owner_id=$1 AND id=$2 AND status='active' LIMIT 1`,
      [ownerId, memoryId],
    ) as Row[];
    if (!rows[0]) return { found: false, deleted: false, remoteDeleted: false, remoteDeletionVerified: false };
    const providerId = nullableText(rows[0].provider_id);
    const remote = providerId ? await semanticMemory.deleteVerified(providerId) : { deleted: true, verifiedAbsent: true };
    if (!remote.verifiedAbsent) return { found: true, deleted: false, remoteDeleted: remote.deleted, remoteDeletionVerified: false };
    await db().query(`UPDATE memory_records SET status='deleted',updated_at=now() WHERE owner_id=$1 AND id=$2`, [ownerId, memoryId]);
    return { found: true, deleted: true, remoteDeleted: remote.deleted, remoteDeletionVerified: true };
  },

  async correctForOwner(ownerId: string, memoryId: string, content: string): Promise<{ status: "completed"; replacement: MemoryEntry; remoteDeletionVerified: true }> {
    const rows = await db().query(
      `SELECT * FROM memory_records WHERE owner_id=$1 AND id=$2 AND status='active' LIMIT 1`,
      [ownerId, memoryId],
    ) as Row[];
    const current = rows[0];
    if (!current) throw new Error("Memory not found.");
    const clean = content.replaceAll("\0", "").trim();
    if (!clean || clean.length > 4000) throw new Error("Memory must be between 1 and 4,000 characters.");
    const replacementId = `memory_${randomUUID()}`;
    const replacementProviderId = await semanticMemory.add(clean, current.permanent === true);
    try {
      await db().query(
        `INSERT INTO memory_records
          (id,owner_id,scope_type,scope_id,content,provider,provider_id,source_type,source_id,confidence,permanent,status,last_confirmed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'owner_correction',$8,$9,$10,'active',now())`,
        [replacementId, ownerId, text(current.scope_type), text(current.scope_id), clean, text(current.provider), replacementProviderId, memoryId, Number(current.confidence), current.permanent === true],
      );
    } catch (error) {
      await semanticMemory.deleteVerified(replacementProviderId).catch(() => undefined);
      throw error;
    }
    const previousProviderId = nullableText(current.provider_id);
    const previousRemote = previousProviderId ? await semanticMemory.deleteVerified(previousProviderId) : { deleted: true, verifiedAbsent: true };
    if (!previousRemote.verifiedAbsent) {
      const rollback = await semanticMemory.deleteVerified(replacementProviderId).catch(() => ({ deleted: false, verifiedAbsent: false }));
      if (rollback.verifiedAbsent) await db().query(`UPDATE memory_records SET status='deleted',updated_at=now() WHERE owner_id=$1 AND id=$2`, [ownerId, replacementId]);
      throw new Error(rollback.verifiedAbsent ? "The previous remote Memory could not be verified as deleted; the correction was rolled back." : "Memory correction partially completed and needs owner review.");
    }
    await db().query(`UPDATE memory_records SET status='deleted',updated_at=now() WHERE owner_id=$1 AND id=$2`, [ownerId, memoryId]);
    const replacementRows = await db().query(`SELECT * FROM memory_records WHERE owner_id=$1 AND id=$2 LIMIT 1`, [ownerId, replacementId]) as Row[];
    return { status: "completed", replacement: rowEntry(replacementRows[0]), remoteDeletionVerified: true };
  },

  async healthcheck(): Promise<void> {
    await semanticMemory.list();
  },

  importLegacyOwnerMemories,
};
