import { readExternalAlphaWork } from "./work-readback.ts";
import { z } from "zod";
import { assertBusinessEffect } from "../business-effects.ts";
import type { ExecutionDatabase } from "../execution-types.ts";
import type { WorkStore } from "../engineering/store.ts";
import { WorkError } from "../engineering/types.ts";
import { externalAlphaPolicy } from "./policy.ts";
import { ExternalAlphaWorkAuthority, WorkAuthoritySigner } from "./work-authority.ts";
import {
  ExternalAlphaWorkController,
  HttpExternalAlphaFactoryClient,
  externalAlphaWorkConfig,
  receiptKeys,
  type ExternalAlphaFactoryClient,
} from "./work-controller.ts";
import { alphaTasksCriteria, canonicalAlphaTasksWork } from "./work-tuple.ts";

const actionSchema = z
  .object({
    operation: z.enum(["start", "reconcile", "stop", "takeover"]),
    expectedWorkVersion: z.number().int().positive(),
    expectedWorkGeneration: z.number().int().positive(),
  })
  .strict();

/** Sofie may only create the one canonical first-project Work. A request that
 * names the canonical title/objective/criteria is normalised to the server's
 * stable ids and idempotency key (so a retry or duplicate delivery returns the
 * same Work); anything else is refused with the canonical text. */
export function externalAlphaCanonicalCreate(
  input: { title: string; objective: string; repository: string; criteria: Array<{ statement: string; method: string }>; maxCostUsd: number; maxDurationSeconds: number } | undefined,
  ownerId: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  const policy = externalAlphaPolicy(env);
  if (!policy || policy.ownerId !== ownerId)
    throw new WorkError("EXTERNAL_ALPHA_WORK_NOT_ELIGIBLE", "EXTERNAL_ALPHA_WORK_NOT_ELIGIBLE: owner required.", 403);
  const canonical = canonicalAlphaTasksWork(policy.repository, ownerId);
  if (
    !input ||
    input.title !== canonical.title ||
    input.objective !== canonical.objective ||
    input.repository !== canonical.repository ||
    input.maxCostUsd !== canonical.maxCostUsd ||
    input.maxDurationSeconds !== canonical.maxDurationSeconds ||
    input.criteria.length !== alphaTasksCriteria.length ||
    input.criteria.some((c, i) => c.statement !== alphaTasksCriteria[i] || c.method !== "test")
  )
    throw new WorkError(
      "EXTERNAL_ALPHA_TUPLE_MISMATCH",
      "EXTERNAL_ALPHA_TUPLE_MISMATCH: this alpha supports one project. Create exactly: title " +
        JSON.stringify(canonical.title) + ", objective " + JSON.stringify(canonical.objective) + ", repository " +
        JSON.stringify(canonical.repository) + ", maxCostUsd 1.3, maxDurationSeconds 180, and these criteria, each with method test: " +
        JSON.stringify(alphaTasksCriteria),
      400,
    );
  return canonical;
}

export interface ExternalAlphaActionDependencies {
  database?: ExecutionDatabase;
  factory?: ExternalAlphaFactoryClient;
  signer?: WorkAuthoritySigner;
  env?: NodeJS.ProcessEnv;
}
/** The only entry from a Sofie tool call to the external-owner Work path. */
export async function externalAlphaFactoryAction(
  store: WorkStore,
  workId: string,
  value: unknown,
  effect: { sessionId: string; callId: string },
  dependencies: ExternalAlphaActionDependencies = {},
) {
  const env = dependencies.env ?? process.env;
  const input = actionSchema.parse(value);
  const policy = externalAlphaPolicy(env),
    config = externalAlphaWorkConfig(env);
  if (!policy || !config)
    throw new WorkError("EXTERNAL_ALPHA_POLICY_REQUIRED", "EXTERNAL_ALPHA_POLICY_REQUIRED", 403);
  const p = store.principal;
  if (p.scopeKind !== "personal" || p.scopeId !== policy.ownerId || p.actorId !== policy.ownerId)
    throw new WorkError("alpha_owner", "Owner scope denied.", 403);
  const work = await store.get(workId);
  if (work.version !== input.expectedWorkVersion || work.generation !== input.expectedWorkGeneration)
    throw new WorkError("factory_work_changed", "Reload the current Work before acting.");
  const controller = new ExternalAlphaWorkController(
    new ExternalAlphaWorkAuthority(
      dependencies.database ?? (store.database as ExecutionDatabase),
      policy,
      dependencies.signer ?? WorkAuthoritySigner.fromEnv(env),
    ),
    dependencies.factory ?? new HttpExternalAlphaFactoryClient(config, { projectId: policy.projectId }),
    config,
    receiptKeys(config),
  );
  if (input.operation === "start") {
    await assertBusinessEffect(store, workId, { operation: "execute_factory" });
    const out = await controller.start(work, effect);
    return {
      state: out.sent ? "STARTED" : "ALREADY_" + out.authority.state,
      authority: out.authority.state,
      requestId: out.authority.requestId,
      currentTruth: [
        out.sent
          ? "Work authority was consumed once by MyFactory; the exact request is running under fixed limits."
          : `No new authority was minted: the existing authority is ${out.authority.state}.`,
      ],
    };
  }
  if (input.operation === "reconcile") {
    const out = await controller.reconcile(workId, { work });
    const result = "result" in out ? out.result : undefined;
    const outcome =
      result?.retained
        ? `Result retained: ${result.retained.resultId}; candidate ${result.retained.candidateSha}; independent verifier ${result.retained.verdict}${result.retained.replay ? " (retained replay)" : ""}. Read it under Result and Proof; publication and acceptance are not established.`
        : result?.rejected
          ? `The Factory Result was rejected (${result.rejected}) and was not retained.`
          : result?.pending
            ? "The Factory has not published the Result yet."
            : null;
    const terminal = "terminalSettlement" in out
      ? out.terminalSettlement as { factoryState?: string } | undefined
      : undefined;
    const terminalTruth = terminal && ["FAILED", "CANCELLED", "NOT_DISPATCHED"].includes(terminal.factoryState ?? "")
      ? `Factory outcome: ${terminal.factoryState}. No candidate Result or Proof was produced. Authenticated cleanup and known accounting are settled.`
      : null;
    return {
      state: out.state,
      result: result?.retained ?? null,
      currentTruth: [`Work authority state: ${out.state}.`, ...(terminalTruth ? [terminalTruth] : outcome ? [outcome] : [])],
    };
  }
  const out = await controller.stop(workId, { work });
  if (input.operation === "takeover") {
    const saved = await controller.authority.forWork(workId);
    const readback = await readExternalAlphaWork(store, work);
    const safelyStopped = out.state === "NONE" || (["CANCELLED", "COMPLETED"].includes(out.state) &&
      (!saved?.receipt || !!readback?.factoryOutcome || (!!readback?.result && readback.result.settlementState === "SETTLED" &&
        readback.result.cleanupConfirmed && readback.accounting.unknownMicrousd === 0)));
    if (!safelyStopped) return { state: out.state, control: work.control,
      currentTruth: [`Takeover waits for authenticated cleanup; Work authority state: ${out.state}. Reconcile the existing request before transferring control.`] };
    const taken = await store.change(workId, { operation: "takeover", expectedVersion: work.version });
    return { state: out.state, control: taken.control, workVersion: taken.version, workGeneration: taken.generation,
      currentTruth: [`The exact Factory request is stopped; Work is now in your hands at version ${taken.version}, generation ${taken.generation}. Retained Result and Proof remain historical evidence.`] };
  }
  return { state: out.state, currentTruth: [`Stop requested; Work authority state: ${out.state}.`] };
}
