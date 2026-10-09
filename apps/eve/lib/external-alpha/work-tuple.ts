import { createHash } from "node:crypto";
import { digest } from "../engineering/contract.ts";
import { WorkError, type Work } from "../engineering/types.ts";

/** The one canonical first external-alpha project. The ten criteria, project and
 * task are pinned both here and (by digest and text) in migration 0086, so a
 * different task needs a reviewed code and schema change, not a model request. */
export const alphaTasksProject = Object.freeze({
  name: "Alpha Tasks",
  task: "add a Priority field (exactly Low|Medium|High) shown on the task list",
});
export const alphaTasksCriteria: readonly string[] = Object.freeze([
  "Existing tasks still display and function",
  "Creating or editing a task supports exactly Low, Medium and High",
  "Priority persists after reload",
  "The task list displays each task's priority",
  "An invalid priority is rejected",
  "Existing tests pass",
  "Focused tests cover creation, editing, persistence, display and invalid input",
  "No unrelated product or UI changes",
  "No production deployment or external publication",
  "An independent verifier checks the exact resulting source and artifact against these criteria rather than trusting the producer",
]);
export const alphaTasksTitle = "Alpha Tasks: add a Priority field";
export const alphaTasksObjective =
  "In the Alpha Tasks project, add a Priority field (exactly Low|Medium|High) shown on the task list.";
export const alphaTasksCriteriaSha256 = digest({
  version: 1,
  criteria: alphaTasksCriteria,
});
export const alphaTasksTupleSha256 = digest({
  version: 1,
  project: alphaTasksProject.name,
  task: alphaTasksProject.task,
  criteriaSha256: alphaTasksCriteriaSha256,
});
// Independent pins: changing the criteria without changing these (and the SQL) fails at import.
if (
  alphaTasksCriteriaSha256 !==
    "266874e4e72dcce0f02ff58bedf56801d6e9906080ed6e7b987dc6537a20b466" ||
  alphaTasksTupleSha256 !==
    "22768f0af6d9aa49f6f0c6553bf1a44ee7599377c1b1935904b998167bf70577"
)
  throw Error("EXTERNAL_ALPHA_TUPLE_PIN");

export const sha256Hex = (text: string) =>
  createHash("sha256").update(text, "utf8").digest("hex");

/** Deterministic RFC-4122-shaped id (version nibble 8, variant nibble a). */
export function deterministicUuid(seed: string): string {
  const h = sha256Hex(seed).slice(0, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-8${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Input Sofie may submit for the canonical Work. Stable ids make a refresh or
 * duplicate tool delivery an idempotent store.create, never a second Work. */
export function canonicalAlphaTasksWork(repository: string, ownerId: string) {
  return {
    title: alphaTasksTitle,
    objective: alphaTasksObjective,
    repository,
    criteria: alphaTasksCriteria.map((statement, i) => ({
      id: deterministicUuid("EXTERNAL_ALPHA_CRITERION_V1:" + i),
      statement,
      method: "test" as const,
    })),
    maxCostUsd: 1.3,
    maxDurationSeconds: 180,
    idempotencyKey: deterministicUuid(
      "EXTERNAL_ALPHA_FIRST_WORK_V1:" + ownerId,
    ),
  };
}

type WorkShape = Pick<
  Work,
  | "scopeId"
  | "title"
  | "objective"
  | "repository"
  | "lifecycle"
  | "control"
  | "criteria"
  | "maxCostUsd"
  | "maxDurationSeconds"
>;
/** Owner and repository scope plus the canonical tuple. Returns nothing; throws. */
export function assertCanonicalAlphaWork(
  work: WorkShape,
  policy: { ownerId: string; repository: string },
) {
  const deny = (code: string, message: string): never => {
    throw new WorkError(code, `${code}: ${message}`, 403);
  };
  if (work.scopeId !== policy.ownerId)
    deny("EXTERNAL_ALPHA_WORK_NOT_ELIGIBLE", "Work belongs to another owner.");
  if (work.repository !== policy.repository)
    deny("EXTERNAL_ALPHA_WORK_NOT_ELIGIBLE", "Repository is outside the alpha workspace.");
  if (work.lifecycle !== "active" || work.control !== "agent")
    deny("EXTERNAL_ALPHA_WORK_NOT_ELIGIBLE", "Active owner-delegated Work is required.");
  if (work.maxCostUsd !== 1.3 || work.maxDurationSeconds !== 180)
    deny("EXTERNAL_ALPHA_WORK_NOT_ELIGIBLE", "Work limits must be exactly $1.30 and 180 seconds.");
  if (
    work.title !== alphaTasksTitle ||
    work.objective !== alphaTasksObjective ||
    work.criteria.length !== alphaTasksCriteria.length ||
    work.criteria.some(
      (c, i) => c.statement !== alphaTasksCriteria[i] || c.method !== "test",
    )
  )
    deny("EXTERNAL_ALPHA_TUPLE_MISMATCH", "Work is not the canonical first project.");
}
