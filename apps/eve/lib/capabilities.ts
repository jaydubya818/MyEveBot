export const CAPABILITY_IDS = [
  "appearance",
  "reminders",
  "triggers",
  "memory",
  "connections",
  "skills",
  "computer",
  "finance",
  "goals",
  "knowledge",
] as const;

export type CapabilityId = (typeof CAPABILITY_IDS)[number];
export type CapabilityState = "ready" | "setup_required" | "excluded";

export interface CapabilityStatus {
  id: CapabilityId;
  state: CapabilityState;
  reason?: string;
  setupHint?: string;
}

const ALL_FEATURES = [
  "memory",
  "proactive",
  "receipts",
  "skills",
  "file-sharing",
  "integrations",
  "browser",
  "utilities",
  "goals",
  "knowledge",
] as const;

function enabledSet(env: NodeJS.ProcessEnv): Set<string> {
  const raw = env.EVE_ENABLED_FEATURES;
  if (raw === undefined || raw.trim().length === 0) return new Set(ALL_FEATURES);
  return new Set(
    raw
      .split(",")
      .map((feature) => feature.trim())
      .filter(Boolean),
  );
}

function hasEnv(env: NodeJS.ProcessEnv, name: string): boolean {
  return Boolean(env[name]?.trim());
}

function status(
  id: CapabilityId,
  included: boolean,
  configured: boolean,
  options: { reason: string; setupHint: string },
): CapabilityStatus {
  if (!included) return { id, state: "excluded" };
  if (configured) return { id, state: "ready" };
  return { id, state: "setup_required", ...options };
}

export function getCapabilityStatuses(
  env: NodeJS.ProcessEnv = process.env,
): CapabilityStatus[] {
  const enabled = enabledSet(env);
  const databaseReady = hasEnv(env, "DATABASE_URL");

  return [
    { id: "appearance", state: "ready" },
    status("reminders", enabled.has("proactive"), databaseReady, {
      reason: "Reminders need a database before the agent can keep a reliable schedule.",
      setupHint: "Add DATABASE_URL, then reload this page.",
    }),
    status("triggers", enabled.has("proactive"), databaseReady, {
      reason: "Event triggers need a database to store webhooks and run history.",
      setupHint: "Add DATABASE_URL, then reload this page.",
    }),
    status("memory", enabled.has("memory"), hasEnv(env, "SUPERMEMORY_API_KEY"), {
      reason: "Long-term memory is not connected yet.",
      setupHint: "Add SUPERMEMORY_API_KEY, then reload this page.",
    }),
    status("connections", enabled.has("integrations"), hasEnv(env, "COMPOSIO_API_KEY"), {
      reason: "Connected apps are not configured yet.",
      setupHint: "Add COMPOSIO_API_KEY, then reload this page.",
    }),
    status("skills", enabled.has("skills"), hasEnv(env, "BLOB_READ_WRITE_TOKEN"), {
      reason: "Saved skills need durable file storage.",
      setupHint: "Add BLOB_READ_WRITE_TOKEN, then reload this page.",
    }),
    status("computer", enabled.has("browser"), databaseReady, {
      reason: "Isolated browser sessions are available on demand after their session ledger is configured; an inactive session is not a disabled browser.",
      setupHint: "Enable the browser feature, add DATABASE_URL, and apply migration 0010.",
    }),
    status("finance", enabled.has("receipts"), databaseReady, {
      reason: "Finance needs a database before the agent can store receipts.",
      setupHint: "Add DATABASE_URL and apply the receipt migration, then reload this page.",
    }),
    status("goals", enabled.has("goals"), databaseReady, {
      reason: "Goals need a database before the agent can keep plans, tasks, and progress reliably.",
      setupHint: "Add DATABASE_URL and apply the Goal OS migration, then reload this page.",
    }),
    status("knowledge", enabled.has("knowledge"), databaseReady, {
      reason: "Knowledge needs a database before it can preserve claims, decisions, and provenance.",
      setupHint: "Add DATABASE_URL and apply the Knowledge migration, then reload this page.",
    }),
  ];
}

export function capabilityMap(
  env: NodeJS.ProcessEnv = process.env,
): Record<CapabilityId, CapabilityStatus> {
  return Object.fromEntries(
    getCapabilityStatuses(env).map((capability) => [capability.id, capability]),
  ) as Record<CapabilityId, CapabilityStatus>;
}
