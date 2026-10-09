import { randomUUID } from "node:crypto";

import { db } from "@/agent/lib/receipts-db";

type OperationType =
  | "export_started" | "export_completed" | "export_failed" | "backup_verified"
  | "restore_planned" | "restore_started" | "restore_completed" | "restore_failed" | "restore_verified"
  | "memory_corrected" | "memory_deleted" | "memory_forgotten"
  | "knowledge_corrected" | "knowledge_deleted" | "preference_corrected" | "contradiction_resolved"
  | "connector_disconnected" | "connector_revoked"
  | "deletion_started" | "deletion_completed" | "deletion_failed";

export interface OwnerDataOperationView {
  id: string;
  type: OperationType;
  status: "running" | "completed" | "partially_completed" | "failed";
  archiveVersion: number | null;
  recordCount: number | null;
  checksum: string | null;
  errorSummary: string | null;
  createdAt: string;
  completedAt: string | null;
}

type Row = Record<string, unknown>;
const text = (value: unknown) => String(value ?? "");
const nullableText = (value: unknown) => value == null ? null : text(value);
const iso = (value: unknown) => value instanceof Date ? value.toISOString() : text(value);

function view(row: Row): OwnerDataOperationView {
  return {
    id: text(row.id), type: text(row.operation_type) as OperationType,
    status: text(row.status) as OwnerDataOperationView["status"],
    archiveVersion: row.archive_version == null ? null : Number(row.archive_version),
    recordCount: row.record_count == null ? null : Number(row.record_count),
    checksum: nullableText(row.checksum), errorSummary: nullableText(row.error_summary),
    createdAt: iso(row.created_at), completedAt: row.completed_at == null ? null : iso(row.completed_at),
  };
}

export async function recordOwnerDataOperation(input: {
  ownerId: string;
  type: OperationType;
  status: OwnerDataOperationView["status"];
  archiveVersion?: number;
  recordCount?: number;
  domainCounts?: Record<string, number>;
  checksum?: string;
  errorSummary?: string;
  metadata?: Record<string, unknown>;
}): Promise<OwnerDataOperationView> {
  const id = `dataop_${randomUUID()}`;
  const completedAt = input.status === "running" ? null : new Date().toISOString();
  const result = await db().query(
    `INSERT INTO owner_data_operations
      (id,owner_id,operation_type,status,archive_version,record_count,domain_counts,checksum,error_summary,metadata,completed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10::jsonb,$11)
     RETURNING id,operation_type,status,archive_version,record_count,checksum,error_summary,created_at,completed_at`,
    [id, input.ownerId, input.type, input.status, input.archiveVersion ?? null, input.recordCount ?? null,
      JSON.stringify(input.domainCounts ?? {}), input.checksum ?? null, input.errorSummary?.slice(0, 500) ?? null,
      JSON.stringify(input.metadata ?? {}), completedAt],
  ) as Row[];
  return view(result[0]);
}

export async function listOwnerDataOperations(ownerId: string, limit = 20): Promise<OwnerDataOperationView[]> {
  const result = await db().query(
    `SELECT id,operation_type,status,archive_version,record_count,checksum,error_summary,created_at,completed_at
     FROM owner_data_operations WHERE owner_id=$1 ORDER BY created_at DESC,id DESC LIMIT $2`,
    [ownerId, Math.max(1, Math.min(100, limit))],
  ) as Row[];
  return result.map(view);
}
