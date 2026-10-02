import { CronExpressionParser } from "cron-parser";

import { db } from "./neon.ts";

// Application-managed reminders/schedules, following eve's dynamic-scheduling
// pattern: rows live in Neon, CRUD tools manage them, and one authored
// minute-level schedule claims due rows and hands each to the Telegram
// channel as a proactive session. A one-off reminder has cron = null and is
// marked done after it fires; a recurring one advances next_fire_at from its
// cron expression (evaluated in its stored IANA timezone).

export const DEFAULT_TIMEZONE = "America/Toronto";

export interface ReminderRow {
  id: number;
  prompt: string;
  cron: string | null;
  timezone: string;
  next_fire_at: string;
  chat_id: string | null;
  status: string;
  created_at: string;
  last_fired_at: string | null;
  routine_name: string | null;
  approval_boundary: string | null;
  source_outcome_id: string | null;
  configuration_version: number;
  reviewed_version: number | null;
  execution_routine_id: string | null;
}

const PROJECTION = `
  id,
  prompt,
  cron,
  timezone,
  next_fire_at::text AS next_fire_at,
  chat_id,
  status,
  created_at::text AS created_at,
  last_fired_at::text AS last_fired_at
  , routine_name, approval_boundary, source_outcome_id, configuration_version, reviewed_version, execution_routine_id
`;

let ensured = false;

async function ensureTable(): Promise<void> {
  if (ensured) return;
  await db().query(`
    CREATE TABLE IF NOT EXISTS reminders (
      id serial PRIMARY KEY,
      prompt text NOT NULL,
      cron text,
      timezone text NOT NULL,
      next_fire_at timestamptz NOT NULL,
      chat_id text,
      status text NOT NULL DEFAULT 'active',
      claimed_until timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      last_fired_at timestamptz
    )
  `);
  await db().query(`ALTER TABLE reminders ADD COLUMN IF NOT EXISTS routine_name text`);
  await db().query(`ALTER TABLE reminders ADD COLUMN IF NOT EXISTS approval_boundary text`);
  await db().query(`ALTER TABLE reminders ADD COLUMN IF NOT EXISTS source_outcome_id text`);
  ensured = true;
}

/** Next occurrence strictly after `after`. Throws on an invalid expression. */
export function nextCronOccurrence(cron: string, timezone: string, after = new Date()): Date {
  return CronExpressionParser.parse(cron, { tz: timezone, currentDate: after }).next().toDate();
}

export async function createReminder(input: {
  prompt: string;
  cron: string | null;
  timezone: string;
  nextFireAt: Date;
  chatId: string | null;
  ownerId?: string;
  routineName?: string | null;
  approvalBoundary?: string | null;
  sourceOutcomeId?: string | null;
}): Promise<ReminderRow> {
  await ensureTable();
  const rows = await db().query(
    `INSERT INTO reminders (prompt, cron, timezone, next_fire_at, chat_id, routine_name, approval_boundary, source_outcome_id,owner_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8,$9)
     RETURNING ${PROJECTION}`,
    [input.prompt, input.cron, input.timezone, input.nextFireAt.toISOString(), input.chatId, input.routineName ?? null, input.approvalBoundary ?? null, input.sourceOutcomeId ?? null,input.ownerId ?? (process.env.MYEVE_OWNER_ID?.trim() || process.env.SOFIE_OWNER_ID?.trim() || "owner")],
  );
  return rows[0] as ReminderRow;
}

export async function listRoutines(ownerId: string): Promise<ReminderRow[]> {
  await ensureTable();
  return await db().query(`SELECT ${PROJECTION} FROM reminders WHERE owner_id=$1 AND routine_name IS NOT NULL AND status IN ('active','paused') ORDER BY created_at DESC`, [ownerId]) as ReminderRow[];
}

function requireUpdatedRoutine(rows: ReminderRow[]): ReminderRow {
  if (!rows[0]) throw new Error("Routine changed. Reload and review it again.");
  return rows[0];
}

export async function manageRoutine(input: { ownerId: string; id: number; action: "pause" | "resume" | "update" | "stop"; prompt?: string; cron?: string; timezone?: string; approvalBoundary?: string }): Promise<ReminderRow> {
  await ensureTable();
  const current = (await db().query(`SELECT ${PROJECTION} FROM reminders WHERE id=$1 AND owner_id=$2 AND routine_name IS NOT NULL LIMIT 1`, [input.id,input.ownerId]) as ReminderRow[])[0];
  if (!current) throw new Error("Routine not found.");
  if (input.action === "stop") {
    if (!["active","paused"].includes(current.status)) throw new Error(`Routine cannot stop from ${current.status}.`);
    return requireUpdatedRoutine(await db().query(`UPDATE reminders SET status='cancelled',claimed_until=NULL WHERE id=$1 AND owner_id=$2 AND status IN ('active','paused') RETURNING ${PROJECTION}`, [input.id,input.ownerId]) as ReminderRow[]);
  }
  if (input.action === "pause") {
    if (current.status !== "active") throw new Error(`Routine cannot pause from ${current.status}.`);
    return requireUpdatedRoutine(await db().query(`UPDATE reminders SET status='paused',claimed_until=NULL WHERE id=$1 AND owner_id=$2 AND status='active' RETURNING ${PROJECTION}`, [input.id,input.ownerId]) as ReminderRow[]);
  }
  if (input.action === "resume") {
    if (current.status !== "paused" || !current.cron) throw new Error(`Routine cannot resume from ${current.status}.`);
    const next = nextCronOccurrence(current.cron, current.timezone);
    return requireUpdatedRoutine(await db().query(`UPDATE reminders SET status='active',next_fire_at=$2 WHERE id=$1 AND owner_id=$3 AND status='paused' RETURNING ${PROJECTION}`, [input.id, next.toISOString(),input.ownerId]) as ReminderRow[]);
  }
  const prompt = input.prompt?.trim() || current.prompt;
  const cron = input.cron?.trim() || current.cron;
  const timezone = input.timezone?.trim() || current.timezone;
  if (!cron) throw new Error("A routine requires a recurring cron expression.");
  const next = nextCronOccurrence(cron, timezone);
  return requireUpdatedRoutine(await db().query(`UPDATE reminders SET prompt=$2,cron=$3,timezone=$4,next_fire_at=$5,approval_boundary=$6,claimed_until=NULL WHERE id=$1 AND owner_id=$7 AND configuration_version=$8 RETURNING ${PROJECTION}`, [input.id, prompt, cron, timezone, next.toISOString(), input.approvalBoundary?.trim() || current.approval_boundary,input.ownerId,current.configuration_version]) as ReminderRow[]);
}

export async function listReminders(): Promise<ReminderRow[]> {
  await ensureTable();
  const rows = await db().query(
    `SELECT ${PROJECTION} FROM reminders WHERE status = 'active' ORDER BY next_fire_at ASC`,
  );
  return rows as ReminderRow[];
}

export async function cancelReminder(id: number): Promise<ReminderRow | null> {
  await ensureTable();
  const rows = await db().query(
    `UPDATE reminders SET status = 'cancelled', claimed_until = NULL
     WHERE id = $1 AND status = 'active'
     RETURNING ${PROJECTION}`,
    [id],
  );
  return (rows[0] as ReminderRow | undefined) ?? null;
}

/**
 * Atomically claim due reminders. The lease keeps a crashed dispatcher run
 * from stranding a row forever: an unfinished claim expires and the row is
 * picked up again on a later tick.
 */
export async function claimDueReminders(limit = 10, leaseMinutes = 5): Promise<ReminderRow[]> {
  await ensureTable();
  const rows = await db().query(
    `UPDATE reminders
     SET claimed_until = now() + make_interval(mins => $1)
     WHERE id IN (
       SELECT id FROM reminders
       WHERE status = 'active'
         AND reviewed_version=configuration_version AND execution_routine_id IS NOT NULL
         AND next_fire_at <= now()
         AND (claimed_until IS NULL OR claimed_until < now())
       ORDER BY next_fire_at ASC
       LIMIT $2
     )
     RETURNING ${PROJECTION}`,
    [leaseMinutes, limit],
  );
  return rows as ReminderRow[];
}

/** Mark a claimed reminder delivered: done for one-offs, advanced for cron. */
export async function completeReminder(reminder: ReminderRow): Promise<void> {
  if (reminder.cron === null) {
    await db().query(
      `UPDATE reminders
       SET status = 'done', last_fired_at = now(), claimed_until = NULL
       WHERE id = $1`,
      [reminder.id],
    );
    return;
  }
  const next = nextCronOccurrence(reminder.cron, reminder.timezone);
  await db().query(
    `UPDATE reminders
     SET next_fire_at = $1, last_fired_at = now(), claimed_until = NULL
     WHERE id = $2`,
    [next.toISOString(), reminder.id],
  );
}

/** Release a claim after a delivery failure so a later tick retries it. */
export async function releaseReminder(id: number): Promise<void> {
  await db().query(`UPDATE reminders SET claimed_until = NULL WHERE id = $1`, [id]);
}
