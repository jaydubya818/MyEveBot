import { randomUUID } from "node:crypto";

import type { EvalReporter } from "eve/evals/reporters";

import { db } from "../agent/lib/receipts-db";

function ownerId(): string {
  return (
    process.env.SKILL_EVAL_OWNER_ID?.trim() ||
    process.env.MYEVE_OWNER_ID?.trim() ||
    process.env.SOFIE_OWNER_ID?.trim() ||
    "owner"
  );
}

function runMode(): "manual" | "changed" | "ci" {
  const value = process.env.SKILL_EVAL_MODE;
  return value === "changed" || value === "ci" ? value : "manual";
}

function resultUsage(result: Parameters<NonNullable<EvalReporter["onEvalComplete"]>>[0]) {
  let inputTokens = 0;
  let outputTokens = 0;
  let costUsd = 0;
  for (const event of result.result.events) {
    if (event.type !== "step.completed") continue;
    inputTokens += event.data.usage?.inputTokens ?? 0;
    outputTokens += event.data.usage?.outputTokens ?? 0;
    costUsd += event.data.usage?.costUsd ?? 0;
  }
  return { inputTokens, outputTokens, costUsd };
}

export function SkillManagerReporter(): EvalReporter {
  const runId = process.env.SKILL_EVAL_RUN_ID?.trim() || `skill_eval_${randomUUID()}`;
  const skillsByEvalId = new Map<string, string>();
  const hashesByEvalId = new Map<string, string>();

  return {
    async onRunStart(evaluations, target) {
      for (const evaluation of evaluations) {
        const skill = evaluation.metadata?.skill;
        if (typeof skill === "string") skillsByEvalId.set(evaluation.id, skill);
        const contentHash = evaluation.metadata?.contentHash;
        if (typeof contentHash === "string") hashesByEvalId.set(evaluation.id, contentHash);
      }
      await db().query(
        `INSERT INTO skill_eval_runs (
           id, owner_id, target, status, mode, requested_count, requested_skills, started_at
         ) VALUES ($1, $2, $3, 'running', $4, $5, $6::jsonb, now())
         ON CONFLICT (id) DO UPDATE
         SET status = 'running', target = excluded.target, mode = excluded.mode,
             requested_count = excluded.requested_count,
             requested_skills = excluded.requested_skills, error = NULL`,
        [
          runId,
          ownerId(),
          `${target.kind}:${target.url}`,
          runMode(),
          skillsByEvalId.size,
          JSON.stringify([...skillsByEvalId.values()]),
        ],
      );
    },
    async onEvalComplete(result) {
      const skillName = skillsByEvalId.get(result.id);
      if (skillName === undefined) return;
      const usage = resultUsage(result);
      const durationMs = Math.max(
        0,
        new Date(result.completedAt).getTime() - new Date(result.startedAt).getTime(),
      );
      await db().query(
        `INSERT INTO skill_eval_results (
           run_id, skill_name, eval_id, verdict, assertions, content_hash,
           duration_ms, input_tokens, output_tokens, cost_usd,
           error, started_at, completed_at
         ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (run_id, skill_name) DO UPDATE
         SET verdict = excluded.verdict, assertions = excluded.assertions,
             content_hash = excluded.content_hash, duration_ms = excluded.duration_ms,
             input_tokens = excluded.input_tokens, output_tokens = excluded.output_tokens,
             cost_usd = excluded.cost_usd, error = excluded.error,
             completed_at = excluded.completed_at`,
        [
          runId,
          skillName,
          result.id,
          result.verdict,
          JSON.stringify(result.assertions),
          hashesByEvalId.get(result.id) ?? null,
          durationMs,
          usage.inputTokens,
          usage.outputTokens,
          usage.costUsd,
          result.error ?? null,
          result.startedAt,
          result.completedAt,
        ],
      );
      await db().query(
        `UPDATE skill_eval_runs
         SET completed_count = completed_count + 1,
             passed = passed + $2, failed = failed + $3,
             scored = scored + $4, skipped = skipped + $5,
             errored = errored + $6, cost_usd = cost_usd + $7
         WHERE id = $1`,
        [
          runId,
          result.verdict === "passed" ? 1 : 0,
          result.verdict === "failed" ? 1 : 0,
          result.verdict === "scored" ? 1 : 0,
          result.verdict === "skipped" ? 1 : 0,
          result.error === undefined ? 0 : 1,
          usage.costUsd,
        ],
      );
    },
    async onRunComplete(summary) {
      await db().query(
        `UPDATE skill_eval_runs
         SET status = $2, requested_count = $3, completed_count = $3,
             passed = $4, failed = $5, scored = $6,
             skipped = $7, errored = $8, completed_at = $9
         WHERE id = $1`,
        [
          runId,
          summary.failed > 0 ? "failed" : "completed",
          summary.results.length,
          summary.passed,
          summary.failed,
          summary.scored,
          summary.skipped,
          summary.errored,
          summary.completedAt,
        ],
      );
    },
  };
}
