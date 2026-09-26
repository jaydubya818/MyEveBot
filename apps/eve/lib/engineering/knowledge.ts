import { randomUUID } from "node:crypto";
import { z } from "zod";

import { WorkStore } from "./store.ts";
import { WorkError } from "./types.ts";

const factInput = z.object({
  workId: z.string().uuid(),
  statement: z.string().trim().min(1).max(20_000),
  confidence: z.number().finite().min(0).max(1).default(1),
  sourceId: z.string().min(1).max(255),
  origin: z.discriminatedUnion("type", [
    z.object({ type: z.literal("owner") }).strict(),
    z.object({ type: z.literal("agent"), agentId: z.string().min(1) }).strict(),
  ]),
  supersedesId: z.string().min(1).max(255).optional(),
}).strict();

export type EngineeringFactInput = z.input<typeof factInput>;

export interface EngineeringFact {
  id: string;
  workId: string;
  repository: string;
  statement: string;
  confidence: number;
  status: "active" | "stale" | "contradicted" | "superseded";
  supersedesId: string | null;
  supersededById: string | null;
  source: {
    id: string;
    type: string;
    provider: string | null;
    externalId: string | null;
    referenceUri: string | null;
    snapshotRef: string | null;
    contentHash: string | null;
    capturedAt: string;
    relation: "supports" | "confirmed_by";
  };
  createdAt: string;
  updatedAt: string;
}

const iso = (value: unknown) => value instanceof Date ? value.toISOString() : String(value);
const nullable = (value: unknown) => value === null || value === undefined ? null : String(value);

function asFact(row: Record<string, unknown>): EngineeringFact {
  return {
    id: String(row.id), workId: String(row.work_id), repository: String(row.repository),
    statement: String(row.statement), confidence: Number(row.confidence),
    status: String(row.status) as EngineeringFact["status"],
    supersedesId: nullable(row.supersedes_id), supersededById: nullable(row.superseded_by_id),
    source: {
      id: String(row.source_id), type: String(row.source_type), provider: nullable(row.provider),
      externalId: nullable(row.external_id), referenceUri: nullable(row.reference_uri),
      snapshotRef: nullable(row.snapshot_ref), contentHash: nullable(row.content_hash),
      capturedAt: iso(row.captured_at),
      relation: String(row.provenance_relation) as EngineeringFact["source"]["relation"],
    },
    createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
  };
}

/** Owner-scoped engineering facts reuse canonical Knowledge and its provenance.
 * The Work link, claim and source are committed by one statement. Callers must
 * obtain the source from a trusted transport or artifact, not model text. */
export class EngineeringKnowledgeStore {
  constructor(readonly workStore: WorkStore) {}

  async save(value: EngineeringFactInput): Promise<EngineeringFact> {
    const input = factInput.parse(value);
    const { scopeId, scopeKind } = this.workStore.principal;
    if (scopeKind !== "personal")
      throw new WorkError("engineering_knowledge_scope", "Engineering Knowledge requires a qualified personal owner scope.", 403);

    const claimId = `knowledge_${randomUUID()}`;
    const provenanceId = `provenance_${randomUUID()}`;
    const previousId = input.supersedesId ?? null;
    const relation = previousId ? "confirmed_by" : "supports";
    const rows = await this.workStore.database.query(
      `WITH scoped_work AS MATERIALIZED (
         SELECT w.scope_id,w.scope_kind,w.id,w.repository
         FROM engineering_work w
         WHERE w.scope_id=$1 AND w.scope_kind='personal' AND w.id=$2
         FOR SHARE OF w
       ), source AS MATERIALIZED (
         SELECT s.id FROM knowledge_sources s
         WHERE s.owner_id=$1 AND s.id=$3
           AND (s.reference_uri IS NOT NULL OR s.external_id IS NOT NULL OR s.snapshot_ref IS NOT NULL)
           AND NOT EXISTS (
             SELECT 1 FROM engineering_work_knowledge other_link
             WHERE other_link.scope_id=s.owner_id AND other_link.scope_kind='personal'
               AND other_link.source_id=s.id AND other_link.work_id<>$2
           )
       ), previous AS MATERIALIZED (
         SELECT k.id FROM engineering_work_knowledge link
         JOIN knowledge_records k ON k.owner_id=link.scope_id AND k.id=link.knowledge_id
         WHERE $4::text IS NOT NULL AND link.scope_id=$1 AND link.scope_kind='personal'
           AND link.work_id=$2 AND link.knowledge_id=$4
           AND k.kind='fact' AND k.status IN ('active','stale','contradicted')
         FOR UPDATE OF k
       ), retired AS (
         UPDATE knowledge_records k SET status='superseded',updated_at=now()
         FROM previous p,scoped_work w,source s
         WHERE k.owner_id=$1 AND k.id=p.id AND k.status IN ('active','stale','contradicted')
         RETURNING k.id
       ), inserted AS (
         INSERT INTO knowledge_records
           (id,owner_id,kind,statement,confidence,status,created_by_type,created_by_id,project_ref,supersedes_id)
         SELECT $5,w.scope_id,'fact',$6,$7,'active',$8,$9,w.repository,$4
         FROM scoped_work w CROSS JOIN source s
         WHERE $4::text IS NULL OR EXISTS (SELECT 1 FROM retired)
         RETURNING id
       ), provenance AS (
         INSERT INTO knowledge_provenance_links
           (id,owner_id,knowledge_id,source_id,relation,confidence)
         SELECT $10,$1,i.id,$3,$11,1 FROM inserted i RETURNING knowledge_id
       ), work_link AS (
         INSERT INTO engineering_work_knowledge
           (scope_id,scope_kind,work_id,knowledge_id,source_id,provenance_relation)
         SELECT w.scope_id,w.scope_kind,w.id,i.id,$3,$11
         FROM inserted i CROSS JOIN scoped_work w RETURNING knowledge_id
       )
       SELECT i.id FROM inserted i JOIN provenance p ON p.knowledge_id=i.id
       JOIN work_link l ON l.knowledge_id=i.id`,
      [scopeId, input.workId, input.sourceId, previousId, claimId, input.statement,
        input.confidence, input.origin.type, input.origin.type === "agent" ? input.origin.agentId : null,
        provenanceId, relation],
    );
    if (rows.length !== 1)
      throw new WorkError("engineering_knowledge_changed", "Work, source, or the earlier fact is unavailable in this owner scope. Reload before saving.");
    return (await this.get(input.workId, claimId))!;
  }

  async get(workId: string, id: string): Promise<EngineeringFact | null> {
    const rows = await this.read(workId, { id, includeHistory: true, limit: 1 });
    return rows[0] ?? null;
  }

  async list(workId: string, options: { query?: string; status?: EngineeringFact["status"]; includeHistory?: boolean; limit?: number } = {}): Promise<EngineeringFact[]> {
    return this.read(workId, options);
  }

  private async read(workId: string, options: { id?: string; query?: string; status?: EngineeringFact["status"]; includeHistory?: boolean; limit?: number }): Promise<EngineeringFact[]> {
    if (this.workStore.principal.scopeKind !== "personal")
      throw new WorkError("engineering_knowledge_scope", "Engineering Knowledge requires a qualified personal owner scope.", 403);
    await this.workStore.get(workId);
    const limit = Math.min(50, Math.max(1, options.limit ?? 25));
    const { scopeId } = this.workStore.principal;
    const rows = await this.workStore.database.query(
      `SELECT k.id,k.statement,k.confidence,k.status,k.supersedes_id,k.created_at,k.updated_at,
         link.work_id,w.repository,link.source_id,link.provenance_relation,
         s.source_type,s.provider,s.external_id,s.reference_uri,s.snapshot_ref,s.content_hash,s.captured_at,
         (SELECT successor.id FROM knowledge_records successor
          WHERE successor.owner_id=k.owner_id AND successor.supersedes_id=k.id LIMIT 1) AS superseded_by_id
       FROM engineering_work_knowledge link
       JOIN engineering_work w ON w.scope_id=link.scope_id AND w.scope_kind=link.scope_kind AND w.id=link.work_id
       JOIN knowledge_records k ON k.owner_id=link.scope_id AND k.id=link.knowledge_id AND k.kind='fact'
       JOIN knowledge_sources s ON s.owner_id=link.scope_id AND s.id=link.source_id
       JOIN knowledge_provenance_links p ON p.owner_id=link.scope_id AND p.knowledge_id=k.id
         AND p.source_id=link.source_id AND p.relation=link.provenance_relation
       WHERE link.scope_id=$1 AND link.scope_kind='personal' AND link.work_id=$2
         AND ($3::text IS NULL OR k.id=$3)
         AND ($4::boolean OR k.status<>'superseded')
         AND ($5::text IS NULL OR k.statement ILIKE '%' || $5 || '%')
         AND ($6::text IS NULL OR k.status=$6)
       ORDER BY k.updated_at DESC,k.id DESC LIMIT $7`,
      [scopeId, workId, options.id ?? null, options.includeHistory ?? false,
        options.query?.trim() || null, options.status ?? null, limit],
    );
    return rows.map(asFact);
  }
}
