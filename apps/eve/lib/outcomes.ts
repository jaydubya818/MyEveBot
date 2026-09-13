import { randomUUID } from "node:crypto";

import { db } from "../agent/lib/receipts-db.ts";
import type {
  OutcomeEvidenceRef,
  OutcomeStatus,
  OutcomeView,
  OwnerFeedback,
} from "./outcome-types.ts";

type Row = Record<string, unknown>;

function text(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value ?? "");
}

function nullableText(value: unknown): string | null {
  return value === null || value === undefined ? null : text(value);
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function clean(value: string, max: number): string {
  return value.trim().replace(/\s+/g, " ").slice(0, max);
}

function outcomeFromRow(row: Row, evidence: OutcomeEvidenceRef[]): OutcomeView {
  return {
    id: text(row.id),
    goalId: nullableText(row.goal_id),
    goalTaskId: nullableText(row.goal_task_id),
    runId: nullableText(row.run_id),
    status: text(row.status) as OutcomeStatus,
    ownerFeedback: text(row.owner_feedback) as OwnerFeedback,
    summary: text(row.summary),
    rationale: stringList(row.rationale),
    evidence,
    occurredAt: text(row.occurred_at),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

async function evidenceForOutcomes(ids: readonly string[]): Promise<Map<string, OutcomeEvidenceRef[]>> {
  if (ids.length === 0) return new Map();
  const rows = (await db().query(
    `SELECT outcome_id, evidence_type, evidence_id FROM outcome_evidence_links
     WHERE outcome_id = ANY($1::text[]) ORDER BY created_at, evidence_type, evidence_id`,
    [ids],
  )) as Row[];
  const result = new Map<string, OutcomeEvidenceRef[]>();
  for (const row of rows) {
    const id = text(row.outcome_id);
    result.set(id, [...(result.get(id) ?? []), {
      type: text(row.evidence_type) as OutcomeEvidenceRef["type"],
      id: text(row.evidence_id),
    }]);
  }
  return result;
}

export async function listOutcomes(ownerId: string, limit = 100): Promise<OutcomeView[]> {
  const rows = (await db().query(
    `SELECT * FROM outcomes WHERE owner_id = $1
     ORDER BY occurred_at DESC, id DESC LIMIT $2`,
    [ownerId, Math.max(1, Math.min(limit, 200))],
  )) as Row[];
  const evidence = await evidenceForOutcomes(rows.map((row) => text(row.id)));
  return rows.map((row) => outcomeFromRow(row, evidence.get(text(row.id)) ?? []));
}

export async function getOutcome(ownerId: string, id: string): Promise<OutcomeView | null> {
  const rows = (await db().query(
    `SELECT * FROM outcomes WHERE owner_id = $1 AND id = $2 LIMIT 1`,
    [ownerId, id],
  )) as Row[];
  if (!rows[0]) return null;
  const evidence = await evidenceForOutcomes([id]);
  return outcomeFromRow(rows[0], evidence.get(id) ?? []);
}

export interface CreateOutcomeInput {
  ownerId: string;
  goalId?: string | null;
  goalTaskId?: string | null;
  runId?: string | null;
  status: OutcomeStatus;
  ownerFeedback?: OwnerFeedback;
  summary: string;
  rationale?: string[];
  evidence?: OutcomeEvidenceRef[];
  occurredAt?: string;
  idempotencyKey?: string;
  source?: "owner" | "agent" | "web";
}

async function validateLinks(input: CreateOutcomeInput): Promise<void> {
  if (!input.goalId && !input.runId) throw new Error("An outcome must link to a goal or run.");
  if (input.goalTaskId && !input.goalId) throw new Error("A goal is required when linking a goal task.");
  if (input.goalId) {
    const goals = (await db().query(
      `SELECT g.id, t.id AS task_id FROM goals g
       LEFT JOIN goal_tasks t ON t.goal_id = g.id AND t.id = $3
       WHERE g.owner_id = $1 AND g.id = $2 LIMIT 1`,
      [input.ownerId, input.goalId, input.goalTaskId ?? null],
    )) as Row[];
    if (!goals[0]) throw new Error("Linked goal not found.");
    if (input.goalTaskId && !goals[0].task_id) throw new Error("Linked task does not belong to the goal.");
  }
  if (input.runId) {
    const runs = (await db().query(
      `SELECT id FROM task_runs WHERE owner_id = $1 AND id = $2 LIMIT 1`,
      [input.ownerId, input.runId],
    )) as Row[];
    if (!runs[0]) throw new Error("Linked run not found.");
  }
  for (const evidence of input.evidence ?? []) {
    const rows = evidence.type === "event"
      ? await db().query(`SELECT id FROM eve_events WHERE owner_id = $1 AND id = $2 LIMIT 1`, [input.ownerId, evidence.id])
      : await db().query(
          `SELECT a.id FROM task_artifacts a JOIN task_runs r ON r.id = a.task_id
           WHERE r.owner_id = $1 AND a.id = $2 LIMIT 1`,
          [input.ownerId, evidence.id],
        );
    if (!(rows as Row[])[0]) throw new Error(`Linked ${evidence.type} evidence not found.`);
  }
}

export async function createOutcome(input: CreateOutcomeInput): Promise<OutcomeView> {
  const summary = clean(input.summary, 1000);
  if (!summary) throw new Error("Outcome summary is required.");
  const idempotencyKey = input.idempotencyKey ? clean(input.idempotencyKey, 200) : null;
  if (idempotencyKey) {
    const existing = (await db().query(
      `SELECT id FROM outcomes WHERE owner_id = $1 AND idempotency_key = $2 LIMIT 1`,
      [input.ownerId, idempotencyKey],
    )) as Row[];
    if (existing[0]) return (await getOutcome(input.ownerId, text(existing[0].id)))!;
  }
  await validateLinks(input);
  const id = `outcome_${randomUUID()}`;
  const eventId = `event_${randomUUID()}`;
  const rationale = (input.rationale ?? []).map((value) => clean(value, 500)).filter(Boolean).slice(0, 20);
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  await db().transaction((tx) => [
    tx`INSERT INTO outcomes (
      id, owner_id, goal_id, goal_task_id, run_id, status, owner_feedback,
      summary, rationale, idempotency_key, occurred_at
    ) VALUES (
      ${id}, ${input.ownerId}, ${input.goalId ?? null}, ${input.goalTaskId ?? null},
      ${input.runId ?? null}, ${input.status}, ${input.ownerFeedback ?? "unknown"},
      ${summary}, ${JSON.stringify(rationale)}::jsonb, ${idempotencyKey}, ${occurredAt}
    )`,
    ...(input.evidence ?? []).map((evidence) => tx`
      INSERT INTO outcome_evidence_links (outcome_id, evidence_type, evidence_id)
      VALUES (${id}, ${evidence.type}, ${evidence.id}) ON CONFLICT DO NOTHING
    `),
    tx`INSERT INTO eve_events (
      id, owner_id, type, source_type, source_id, goal_id, goal_task_id, run_id,
      severity, summary, rationale, payload, delivery_classification
    ) VALUES (
      ${eventId}, ${input.ownerId}, 'OUTCOME_RECORDED', ${input.source ?? "agent"}, ${id},
      ${input.goalId ?? null}, ${input.goalTaskId ?? null}, ${input.runId ?? null},
      ${input.status === "failed" || input.status === "ineffective" ? "warning" : "info"},
      ${summary}, ${JSON.stringify(rationale)}::jsonb,
      ${JSON.stringify({ outcomeId: id, status: input.status, ownerFeedback: input.ownerFeedback ?? "unknown" })}::jsonb,
      'activity'
    )`,
  ]);
  return (await getOutcome(input.ownerId, id))!;
}

export async function updateOutcomeFeedback(
  ownerId: string,
  id: string,
  ownerFeedback: OwnerFeedback,
): Promise<OutcomeView> {
  const rows = (await db().query(
    `UPDATE outcomes SET owner_feedback = $3, updated_at = now()
     WHERE owner_id = $1 AND id = $2 RETURNING goal_id, goal_task_id, run_id, summary`,
    [ownerId, id, ownerFeedback],
  )) as Row[];
  if (!rows[0]) throw new Error("Outcome not found.");
  await db().query(
    `INSERT INTO eve_events (
      id, owner_id, type, source_type, source_id, goal_id, goal_task_id, run_id,
      summary, payload, delivery_classification
    ) VALUES ($1, $2, 'OUTCOME_FEEDBACK_UPDATED', 'owner', $3, $4, $5, $6, $7, $8::jsonb, 'silent')`,
    [`event_${randomUUID()}`, ownerId, id, rows[0].goal_id, rows[0].goal_task_id, rows[0].run_id,
      `Owner feedback updated for: ${text(rows[0].summary)}`.slice(0, 1000), JSON.stringify({ ownerFeedback })],
  );
  return (await getOutcome(ownerId, id))!;
}
