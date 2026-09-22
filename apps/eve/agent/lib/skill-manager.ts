import { Buffer } from "node:buffer";

import { defineSkill, type SkillPackageDefinition } from "eve/skills";

import packageCatalog from "../../lib/installed-skill-packages.generated.json";
import { db } from "./receipts-db";
import { skillStore } from "./skill-store";
import {
  DEFAULT_SPECIALIST_SKILLS,
  SKILL_AGENTS,
  type SkillAgentId,
  type SkillEvalRunMode,
  type SkillEvalRunSummary,
  type SkillEvalSummary,
  type SkillUsageSummary,
} from "../../lib/skill-manager-types";

type SpecialistAgentId = Exclude<SkillAgentId, "sofie">;
type Row = Record<string, unknown>;

interface EncodedSkillPackage {
  name: string;
  description: string;
  markdown: string;
  files: Record<string, string>;
}

const packages = packageCatalog as unknown as readonly EncodedSkillPackage[];
const packageByName = new Map(packages.map((skill) => [skill.name, skill]));

function text(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function number(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function iso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : text(value);
}

export function skillOwnerId(
  auth: { current: { principalId?: string } | null; initiator?: { principalId?: string } | null },
  env: NodeJS.ProcessEnv = process.env,
): string {
  return (
    auth.current?.principalId?.trim() ||
    auth.initiator?.principalId?.trim() ||
    env.MYEVE_OWNER_ID?.trim() ||
    env.SOFIE_OWNER_ID?.trim() ||
    "owner"
  );
}

function defaultAssignments(agentId: SpecialistAgentId): Set<string> {
  return new Set(DEFAULT_SPECIALIST_SKILLS[agentId]);
}

export async function effectiveSpecialistAssignments(
  ownerId: string,
  agentId: SpecialistAgentId,
): Promise<Set<string>> {
  const assigned = defaultAssignments(agentId);
  const rows = (await db().query(
    `SELECT skill_name, enabled FROM skill_assignments
     WHERE owner_id = $1 AND agent_id = $2`,
    [ownerId, agentId],
  )) as Row[];
  for (const row of rows) {
    const name = text(row.skill_name);
    if (row.enabled === true) assigned.add(name);
    else assigned.delete(name);
  }
  return assigned;
}

export async function listSkillAssignments(
  ownerId: string,
  allSkillNames: readonly string[],
): Promise<Record<SkillAgentId, string[]>> {
  const specialistAgents = SKILL_AGENTS.filter(
    (agent): agent is (typeof SKILL_AGENTS)[number] & { id: SpecialistAgentId } =>
      agent.id !== "sofie",
  );
  const assignments = await Promise.all(
    specialistAgents.map(async (agent) => [
      agent.id,
      [...(await effectiveSpecialistAssignments(ownerId, agent.id))]
        .filter((name) => allSkillNames.includes(name))
        .sort(),
    ] as const),
  );
  return {
    sofie: [...allSkillNames].sort(),
    "functional-state": [],
    "ux-accessibility": [],
    "trust-resilience": [],
    ...Object.fromEntries(assignments),
  };
}

export async function setSkillAssignment(input: {
  ownerId: string;
  agentId: SpecialistAgentId;
  skillName: string;
  enabled: boolean;
  assignedBy: "owner" | "agent";
}): Promise<void> {
  await db().query(
    `INSERT INTO skill_assignments (owner_id, agent_id, skill_name, enabled, assigned_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (owner_id, agent_id, skill_name) DO UPDATE
     SET enabled = excluded.enabled, assigned_by = excluded.assigned_by, updated_at = now()`,
    [input.ownerId, input.agentId, input.skillName, input.enabled, input.assignedBy],
  );
}

export async function assignedSkillPackages(
  ownerId: string,
  agentId: SpecialistAgentId,
): Promise<Record<string, SkillPackageDefinition>> {
  let assigned: Set<string>;
  try {
    assigned = await effectiveSpecialistAssignments(ownerId, agentId);
  } catch (error) {
    console.warn(`Skill assignments unavailable for ${agentId}; using project defaults.`, error);
    assigned = defaultAssignments(agentId);
  }

  const definitions: Record<string, SkillPackageDefinition> = {};
  for (const name of assigned) {
    const packaged = packageByName.get(name);
    if (packaged !== undefined) {
      definitions[name] = {
        description: packaged.description,
        markdown: packaged.markdown,
        files: Object.fromEntries(
          Object.entries(packaged.files).map(([path, content]) => [
            path,
            Buffer.from(content, "base64"),
          ]),
        ),
      };
    }
  }

  try {
    for (const saved of await skillStore.list()) {
      if (!assigned.has(saved.name)) continue;
      definitions[saved.name] = {
        description: saved.description,
        markdown: saved.markdown,
      };
    }
  } catch {
    // Installed project skills remain available when personal-skill storage is offline.
  }
  return definitions;
}

export async function resolveAssignedSkills(
  ownerId: string,
  agentId: SpecialistAgentId,
) {
  const assigned = await assignedSkillPackages(ownerId, agentId);
  return Object.fromEntries(
    Object.entries(assigned).map(([name, skill]) => [name, defineSkill(skill)]),
  );
}

export async function recordSkillUsage(input: {
  ownerId: string;
  skillName: string;
  agentId: SkillAgentId;
  sessionId: string;
  turnId: string;
  stepIndex: number;
}): Promise<void> {
  await db().query(
    `INSERT INTO skill_usage_events (
       owner_id, skill_name, agent_id, session_id, turn_id, task_run_id,
       loaded_step_index, last_accounted_step
     ) VALUES (
       $1, $2, $3, $4, $5,
       (SELECT task_id FROM task_run_sessions WHERE session_id = $4 AND is_current LIMIT 1),
       $6, $6
     )
     ON CONFLICT (session_id, turn_id, skill_name) DO NOTHING`,
    [
      input.ownerId,
      input.skillName,
      input.agentId,
      input.sessionId,
      input.turnId,
      input.stepIndex,
    ],
  );
}

export async function recordSkillStepUsage(input: {
  sessionId: string;
  turnId: string;
  stepIndex: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  costUsd?: number;
}): Promise<void> {
  await db().query(
    `UPDATE skill_usage_events
     SET input_tokens = input_tokens + $4,
         output_tokens = output_tokens + $5,
         cache_read_tokens = cache_read_tokens + $6,
         cache_write_tokens = cache_write_tokens + $7,
         cost_usd = cost_usd + $8,
         last_accounted_step = $3
     WHERE session_id = $1 AND turn_id = $2 AND outcome = 'loaded'
       AND loaded_step_index < $3 AND last_accounted_step < $3`,
    [
      input.sessionId,
      input.turnId,
      input.stepIndex,
      input.inputTokens ?? 0,
      input.outputTokens ?? 0,
      input.cacheReadTokens ?? 0,
      input.cacheWriteTokens ?? 0,
      input.costUsd ?? 0,
    ],
  );
}

export async function completeSkillUsage(input: {
  sessionId: string;
  turnId: string;
  outcome: "succeeded" | "failed" | "cancelled";
}): Promise<void> {
  await db().query(
    `UPDATE skill_usage_events
     SET outcome = $3, completed_at = now(),
         duration_ms = greatest(0, floor(extract(epoch FROM (now() - occurred_at)) * 1000)::int)
     WHERE session_id = $1 AND turn_id = $2 AND outcome = 'loaded'`,
    [input.sessionId, input.turnId, input.outcome],
  );
}

function activityKeys(days: number): string[] {
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  return Array.from({ length: days }, (_, index) => {
    const day = new Date(now);
    day.setUTCDate(now.getUTCDate() - (days - index - 1));
    return day.toISOString().slice(0, 10);
  });
}

export async function getSkillUsageSummaries(
  ownerId: string,
  days = 84,
): Promise<Record<string, SkillUsageSummary>> {
  const [totals, daily, byAgent] = (await Promise.all([
    db().query(
      `SELECT skill_name,
              count(*)::int AS total,
              count(*) FILTER (WHERE outcome = 'succeeded')::int AS succeeded,
              count(*) FILTER (WHERE outcome = 'failed')::int AS failed,
              count(*) FILTER (WHERE outcome = 'cancelled')::int AS cancelled,
              count(*) FILTER (WHERE outcome = 'loaded')::int AS in_progress,
              avg(duration_ms) FILTER (WHERE duration_ms IS NOT NULL)::float8 AS average_duration_ms,
              coalesce(sum(input_tokens), 0)::float8 AS input_tokens,
              coalesce(sum(output_tokens), 0)::float8 AS output_tokens,
              coalesce(sum(cost_usd), 0)::float8 AS cost_usd,
              count(DISTINCT task_run_id) FILTER (WHERE task_run_id IS NOT NULL)::int AS task_run_count,
              max(occurred_at) AS last_used_at
       FROM skill_usage_events WHERE owner_id = $1 GROUP BY skill_name`,
      [ownerId],
    ),
    db().query(
      `SELECT skill_name,
              (date_trunc('day', occurred_at AT TIME ZONE 'UTC'))::date::text AS day,
              count(*)::int AS uses
       FROM skill_usage_events
       WHERE owner_id = $1 AND occurred_at >= now() - ($2 * interval '1 day')
      GROUP BY skill_name, day ORDER BY day ASC`,
      [ownerId, days],
    ),
    db().query(
      `SELECT skill_name, agent_id, count(*)::int AS uses
       FROM skill_usage_events WHERE owner_id = $1
       GROUP BY skill_name, agent_id`,
      [ownerId],
    ),
  ])) as [Row[], Row[], Row[]];

  const keys = activityKeys(days);
  const bySkillDay = new Map<string, Map<string, number>>();
  for (const row of daily) {
    const skill = text(row.skill_name);
    const counts = bySkillDay.get(skill) ?? new Map<string, number>();
    counts.set(text(row.day), number(row.uses));
    bySkillDay.set(skill, counts);
  }
  const agentsBySkill = new Map<string, Partial<Record<SkillAgentId, number>>>();
  for (const row of byAgent) {
    const skill = text(row.skill_name);
    const counts = agentsBySkill.get(skill) ?? {};
    counts[text(row.agent_id) as SkillAgentId] = number(row.uses);
    agentsBySkill.set(skill, counts);
  }

  return Object.fromEntries(
    totals.map((row) => {
      const skill = text(row.skill_name);
      const counts = bySkillDay.get(skill);
      const succeeded = number(row.succeeded);
      const terminal = succeeded + number(row.failed) + number(row.cancelled);
      return [
        skill,
        {
          total: number(row.total),
          succeeded,
          failed: number(row.failed),
          cancelled: number(row.cancelled),
          inProgress: number(row.in_progress),
          completionRate: terminal === 0 ? null : succeeded / terminal,
          averageDurationMs:
            row.average_duration_ms === null || row.average_duration_ms === undefined
              ? null
              : number(row.average_duration_ms),
          inputTokens: number(row.input_tokens),
          outputTokens: number(row.output_tokens),
          costUsd: number(row.cost_usd),
          taskRunCount: number(row.task_run_count),
          byAgent: agentsBySkill.get(skill) ?? {},
          lastUsedAt: iso(row.last_used_at),
          activity: keys.map((key) => counts?.get(key) ?? 0),
        },
      ];
    }),
  );
}

export async function getSkillEvalSummaries(
  ownerId: string,
): Promise<Record<string, SkillEvalSummary>> {
  const rows = (await db().query(
    `WITH ranked AS (
       SELECT r.skill_name, r.verdict, r.assertions, r.content_hash,
              r.duration_ms, r.input_tokens, r.output_tokens, r.cost_usd,
              r.error, r.completed_at,
              count(*) OVER (PARTITION BY r.skill_name)::int AS run_count,
              row_number() OVER (
                PARTITION BY r.skill_name ORDER BY r.completed_at DESC, r.run_id DESC
              ) AS position
       FROM skill_eval_results r
       JOIN skill_eval_runs run ON run.id = r.run_id
       WHERE run.owner_id = $1
     )
     SELECT * FROM ranked WHERE position = 1`,
    [ownerId],
  )) as Row[];

  return Object.fromEntries(
    rows.map((row) => {
      const assertions = Array.isArray(row.assertions) ? row.assertions : [];
      return [
        text(row.skill_name),
        {
          verdict: text(row.verdict) as SkillEvalSummary["verdict"],
          runCount: number(row.run_count),
          lastRunAt: iso(row.completed_at),
          passedAssertions: assertions.filter(
            (assertion) =>
              assertion !== null &&
              typeof assertion === "object" &&
              "passed" in assertion &&
              assertion.passed === true,
          ).length,
          assertionCount: assertions.length,
          contentHash: row.content_hash === null || row.content_hash === undefined
            ? null
            : text(row.content_hash),
          durationMs: row.duration_ms === null || row.duration_ms === undefined
            ? null
            : number(row.duration_ms),
          inputTokens: number(row.input_tokens),
          outputTokens: number(row.output_tokens),
          costUsd: number(row.cost_usd),
          error: row.error === null || row.error === undefined ? null : text(row.error),
        },
      ];
    }),
  );
}

function evalRunFromRow(row: Row): SkillEvalRunSummary {
  return {
    id: text(row.id),
    mode: text(row.mode) as SkillEvalRunSummary["mode"],
    status: text(row.status) as SkillEvalRunSummary["status"],
    requestedCount: number(row.requested_count),
    completedCount: number(row.completed_count),
    requestedSkills: Array.isArray(row.requested_skills)
      ? row.requested_skills.map(text)
      : [],
    passed: number(row.passed),
    failed: number(row.failed),
    scored: number(row.scored),
    skipped: number(row.skipped),
    errored: number(row.errored),
    costUsd: number(row.cost_usd),
    startedAt: iso(row.started_at) ?? new Date(0).toISOString(),
    completedAt: iso(row.completed_at),
    error: row.error === null || row.error === undefined ? null : text(row.error),
  };
}

async function expireStaleSkillEvalRuns(ownerId: string): Promise<void> {
  await db().query(
    `UPDATE skill_eval_runs
     SET status = 'failed',
         error = coalesce(error, 'The eval runner stopped reporting progress.'),
         completed_at = now()
     WHERE owner_id = $1 AND status IN ('queued', 'running')
       AND started_at < now() - interval '2 hours'`,
    [ownerId],
  );
}

export async function latestSkillEvalRun(ownerId: string): Promise<SkillEvalRunSummary | null> {
  await expireStaleSkillEvalRuns(ownerId);
  const rows = (await db().query(
    `SELECT * FROM skill_eval_runs
     WHERE owner_id = $1 ORDER BY started_at DESC LIMIT 1`,
    [ownerId],
  )) as Row[];
  return rows[0] === undefined ? null : evalRunFromRow(rows[0]);
}

export async function activeSkillEvalRun(ownerId: string): Promise<SkillEvalRunSummary | null> {
  await expireStaleSkillEvalRuns(ownerId);
  const rows = (await db().query(
    `SELECT * FROM skill_eval_runs
     WHERE owner_id = $1 AND status IN ('queued', 'running')
     ORDER BY started_at DESC LIMIT 1`,
    [ownerId],
  )) as Row[];
  return rows[0] === undefined ? null : evalRunFromRow(rows[0]);
}

export async function createSkillEvalRun(input: {
  id: string;
  ownerId: string;
  mode: SkillEvalRunMode;
  target: string;
  skillNames: readonly string[];
}): Promise<SkillEvalRunSummary> {
  const rows = (await db().query(
    `INSERT INTO skill_eval_runs (
       id, owner_id, target, status, mode, requested_count, requested_skills, started_at
     ) VALUES ($1, $2, $3, 'queued', $4, $5, $6::jsonb, now())
     RETURNING *`,
    [
      input.id,
      input.ownerId,
      input.target,
      input.mode,
      input.skillNames.length,
      JSON.stringify(input.skillNames),
    ],
  )) as Row[];
  return evalRunFromRow(rows[0]);
}

export async function failSkillEvalRun(runId: string, error: string): Promise<void> {
  await db().query(
    `UPDATE skill_eval_runs
     SET status = 'failed', error = $2, completed_at = now()
     WHERE id = $1 AND status IN ('queued', 'running')`,
    [runId, error.slice(0, 2000)],
  );
}
