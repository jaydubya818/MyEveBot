import {
  canonical,
  digest,
  keys,
  requireValue,
  text,
  isDigest,
} from "../contracts.ts";
export { canonical, digest };
export const PROFILE = "alpha-tasks-node-json-v1" as const;
export const TUPLE =
  "22768f0af6d9aa49f6f0c6553bf1a44ee7599377c1b1935904b998167bf70577";
export type Hash = `sha256:${string}`;
export interface Origin {
  ownerId: string;
  installationId: string;
  connectionId: string;
  tenantId: string;
  projectId: string;
  missionId: string;
  planId: string;
  planDigest: string;
  workOrderId: string;
  workOrderRevisionId: string;
  workId: string;
  workVersion: number;
  workGeneration: number;
  tupleSha256: string;
  permitDigest: string;
  resultId: string;
  resultDigest: string;
  proofHash: string;
  authorityId: string;
  authoritySha256: string;
  factoryWorkOrderId: string;
  attemptNumber: 1;
  requestId: string;
  requestDigest: string;
  runId: string;
  factoryVersion: string;
  sourceDigest: string;
  configurationDigest: string;
  inputCommit: string;
  inputTree: string;
  candidateCommit: string;
  candidateTree: string;
  patchDigest: string;
}
export interface RuntimeProfile {
  profile: typeof PROFILE;
  adapterDigest: Hash;
  image: string;
  dataContract: Hash;
  tasksModule: "src/tasks.js";
  renderModule: "src/render.js";
  network: "deny";
  secrets: [];
}
export interface AlphaTasksPackage {
  format: "myeve.app-package.alpha-tasks.v1";
  appId: string;
  version: number;
  spec: { ownerId: string; profile: typeof PROFILE };
  origin: Origin;
  sourceClosureDigest: Hash;
  runtime: RuntimeProfile;
  base: null | { version: number; digest: Hash };
  migration: "identity";
  installation: "explicit-owner-decision";
}
const originStrings = [
  "ownerId",
  "installationId",
  "connectionId",
  "tenantId",
  "projectId",
  "missionId",
  "planId",
  "workOrderId",
  "workOrderRevisionId",
  "workId",
  "resultId",
  "authorityId",
  "factoryWorkOrderId",
  "requestId",
  "runId",
] as const;
const originHashes = [
  "authoritySha256",
  "tupleSha256",
  "permitDigest",
  "resultDigest",
  "proofHash",
  "requestDigest",
  "factoryVersion",
  "sourceDigest",
  "configurationDigest",
  "patchDigest",
] as const;
const originGit = [
  "inputCommit",
  "inputTree",
  "candidateCommit",
  "candidateTree",
] as const;
const positive = (v: unknown): v is number =>
  Number.isSafeInteger(v) && Number(v) > 0;
export function validateOrigin(value: unknown): Origin {
  keys(value, [
    ...originStrings,
    ...originHashes,
    ...originGit,
    "workVersion",
    "workGeneration",
    "planDigest",
    "attemptNumber",
  ]);
  requireValue(
    isDigest(value.planDigest) && value.attemptNumber === 1,
    "APP_RESULT_BINDING",
  );
  for (const k of originStrings) text(value[k], 200);
  for (const k of originHashes)
    requireValue(
      typeof value[k] === "string" && /^[a-f0-9]{64}$/.test(value[k]),
      "APP_RESULT_BINDING",
    );
  for (const k of originGit)
    requireValue(
      typeof value[k] === "string" && /^[a-f0-9]{40}$/.test(value[k]),
      "APP_SOURCE_UNSUPPORTED",
    );
  requireValue(
    positive(value.workVersion) &&
      positive(value.workGeneration) &&
      value.tupleSha256 === TUPLE,
    "APP_RESULT_BINDING",
  );
  canonical(value);
  return structuredClone(value) as Origin;
}
export function validateRuntime(value: unknown): RuntimeProfile {
  keys(value, [
    "profile",
    "adapterDigest",
    "image",
    "dataContract",
    "tasksModule",
    "renderModule",
    "network",
    "secrets",
  ]);
  requireValue(
    value.profile === PROFILE &&
      value.tasksModule === "src/tasks.js" &&
      value.renderModule === "src/render.js" &&
      value.network === "deny" &&
      Array.isArray(value.secrets) &&
      value.secrets.length === 0,
    "APP_RUNTIME_UNQUALIFIED",
  );
  requireValue(
    isDigest(value.adapterDigest) &&
      isDigest(value.dataContract) &&
      typeof value.image === "string" &&
      /^sha256:[a-f0-9]{64}$/.test(value.image),
    "APP_RUNTIME_UNQUALIFIED",
  );
  return structuredClone(value) as RuntimeProfile;
}
export function alphaTasksAppId(
  ownerId: string,
  installationId: string,
  missionId: string,
) {
  return (
    "app_" +
    digest({
      ownerId: text(ownerId),
      installationId: text(installationId),
      missionId: text(missionId),
      profile: PROFILE,
    }).slice(7, 39)
  );
}
export function validateAlphaTasksPackage(value: unknown): AlphaTasksPackage {
  keys(value, [
    "format",
    "appId",
    "version",
    "spec",
    "origin",
    "sourceClosureDigest",
    "runtime",
    "base",
    "migration",
    "installation",
  ]);
  keys(value.spec, ["ownerId", "profile"]);
  const origin = validateOrigin(value.origin);
  validateRuntime(value.runtime);
  requireValue(
    value.format === "myeve.app-package.alpha-tasks.v1" &&
      value.spec.profile === PROFILE &&
      value.spec.ownerId === origin.ownerId &&
      value.appId ===
        alphaTasksAppId(
          origin.ownerId,
          origin.installationId,
          origin.missionId,
        ) &&
      positive(value.version) &&
      isDigest(value.sourceClosureDigest) &&
      value.migration === "identity" &&
      value.installation === "explicit-owner-decision",
    "APP_PACKAGE_UNSUPPORTED",
  );
  if (value.base !== null) {
    keys(value.base, ["version", "digest"]);
    requireValue(
      positive(value.base.version) &&
        value.base.version < value.version &&
        isDigest(value.base.digest),
      "APP_BASE_MISMATCH",
    );
  }
  canonical(value);
  return structuredClone(value) as AlphaTasksPackage;
}
export interface Task {
  id: number;
  title: string;
  done: boolean;
  priority?: "Low" | "Medium" | "High";
}
export interface TaskData {
  next: number;
  tasks: Task[];
}
export const DATA_CONTRACT = digest({
  profile: PROFILE,
  version: 1,
  storage: "json",
  keys: ["next", "tasks"],
  task: ["id", "title", "done", "priority?"],
  priorities: ["Low", "Medium", "High"],
}) as Hash;
export function validateTaskData(value: unknown): TaskData {
  keys(value, ["next", "tasks"]);
  requireValue(
    positive(value.next) &&
      Array.isArray(value.tasks) &&
      value.tasks.length <= 1000,
    "APP_DATA_INVALID",
  );
  const seen = new Set<number>();
  for (const task of value.tasks) {
    keys(task, ["id", "title", "done"], ["priority"]);
    text(task.title, 1000);
    requireValue(
      positive(task.id) &&
        task.id < value.next &&
        !seen.has(task.id) &&
        typeof task.done === "boolean" &&
        (!Object.hasOwn(task, "priority") ||
          ["Low", "Medium", "High"].includes(task.priority)),
      "APP_DATA_INVALID",
    );
    seen.add(task.id);
  }
  canonical(value);
  return structuredClone(value) as TaskData;
}
export type Operation = "list" | "create" | "update" | "render";
export function validateOperation(
  operation: unknown,
  input: unknown,
): { operation: Operation; input: Record<string, unknown> } {
  requireValue(
    ["list", "create", "update", "render"].includes(String(operation)),
    "APP_OPERATION_DENIED",
  );
  if (operation === "list" || operation === "render") keys(input, []);
  else if (operation === "create") {
    keys(input, ["title", "priority"]);
    text(input.title, 1000);
    requireValue(
      ["Low", "Medium", "High"].includes(input.priority),
      "APP_INPUT_INVALID",
    );
  } else {
    keys(input, ["id", "patch"]);
    requireValue(positive(input.id));
    keys(input.patch, [], ["title", "done", "priority"]);
    requireValue(Object.keys(input.patch).length > 0);
    if ("title" in input.patch) text(input.patch.title, 1000);
    if ("done" in input.patch)
      requireValue(typeof input.patch.done === "boolean");
    if ("priority" in input.patch)
      requireValue(["Low", "Medium", "High"].includes(input.patch.priority));
  }
  canonical(input);
  return {
    operation: operation as Operation,
    input: structuredClone(input) as Record<string, unknown>,
  };
}
