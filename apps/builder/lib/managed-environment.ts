import { createHash, randomUUID } from "node:crypto";

export const MANAGED_ENVIRONMENT_STATES = [
  "reserved", "project_created", "storage_created", "configured",
  "deployed", "healthy", "active", "upgrading", "paused", "deleting", "deleted", "failed",
] as const;

export type ManagedEnvironmentState = (typeof MANAGED_ENVIRONMENT_STATES)[number];

export interface ManagedEnvironment {
  id: string;
  email: string;
  projectName: string;
  ownerId: string;
  state: ManagedEnvironmentState;
  projectId: string | null;
  databaseStoreId: string | null;
  blobStoreId: string | null;
  deploymentId: string | null;
  origin: string | null;
  templateSha: string | null;
  pendingDeploymentId?: string | null;
  pendingTemplateSha?: string | null;
  previousState?: "healthy" | "active" | null;
  lastDatabaseBackupSha256?: string | null;
  lastDatabaseBackupPath?: string | null;
  relayAccountId: string | null;
  relayAgentId: string | null;
  relayKeyVersion: string | null;
  aiGatewayBudgetUsd: number | null;
  lastHealthCheckAt: string | null;
  lastExportSha256: string | null;
  lastExportAt?: string | null;
  lastExportSource?: "control-plane" | "owner-provided" | null;
  relayRetiredAt?: string | null;
  deletionAuthorizationSha256?: string | null;
  deletedAt: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ManagedEnvironmentRegistry {
  version: 1;
  environments: ManagedEnvironment[];
}

const ALLOWED_TRANSITIONS: Record<ManagedEnvironmentState, readonly ManagedEnvironmentState[]> = {
  reserved: ["project_created", "failed"],
  project_created: ["storage_created", "failed"],
  storage_created: ["configured", "failed"],
  configured: ["deployed", "failed"],
  deployed: ["healthy", "failed"],
  healthy: ["active", "upgrading", "paused", "deleting", "failed"],
  active: ["upgrading", "paused", "deleting", "failed"],
  upgrading: ["healthy", "active", "failed"],
  paused: ["healthy", "active", "deleting", "failed"],
  deleting: ["deleted", "failed"],
  deleted: [],
  failed: ["reserved", "project_created", "storage_created", "configured", "deployed", "healthy", "paused", "deleting"],
};

const PROJECT_NAME = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function newManagedEnvironment(input: {
  email: string;
  projectName: string;
  now?: Date;
}): ManagedEnvironment {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("A valid tester email is required.");
  if (!PROJECT_NAME.test(input.projectName)) throw new Error("Invalid managed project name.");
  const now = (input.now ?? new Date()).toISOString();
  return {
    id: randomUUID(),
    email,
    projectName: input.projectName,
    ownerId: randomUUID(),
    state: "reserved",
    projectId: null,
    databaseStoreId: null,
    blobStoreId: null,
    deploymentId: null,
    origin: null,
    templateSha: null,
    pendingDeploymentId: null,
    pendingTemplateSha: null,
    previousState: null,
    lastDatabaseBackupSha256: null,
    lastDatabaseBackupPath: null,
    relayAccountId: null,
    relayAgentId: null,
    relayKeyVersion: null,
    aiGatewayBudgetUsd: null,
    lastHealthCheckAt: null,
    lastExportSha256: null,
    lastExportAt: null,
    lastExportSource: null,
    relayRetiredAt: null,
    deletionAuthorizationSha256: null,
    deletedAt: null,
    error: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function reserveEnvironment(
  registry: ManagedEnvironmentRegistry,
  input: { email: string; projectName: string; now?: Date },
): ManagedEnvironmentRegistry {
  const candidate = newManagedEnvironment(input);
  if (registry.environments.some((environment) =>
    environment.state !== "deleted" &&
    (environment.email === candidate.email || environment.projectName === candidate.projectName)
  )) {
    throw new Error("This tester or project already has a managed environment.");
  }
  return { version: 1, environments: [...registry.environments, candidate] };
}

export function updateEnvironment(
  registry: ManagedEnvironmentRegistry,
  id: string,
  patch: Partial<Omit<ManagedEnvironment, "id" | "email" | "projectName" | "ownerId" | "createdAt">>,
  now = new Date(),
): ManagedEnvironmentRegistry {
  for (const key of ["id", "email", "projectName", "ownerId", "createdAt"]) {
    if (key in patch) throw new Error(`Managed identity field ${key} cannot change.`);
  }
  const current = registry.environments.find((environment) => environment.id === id);
  if (!current) throw new Error("Unknown managed environment.");
  if (current.state === "deleted") throw new Error("A deleted environment cannot be changed.");
  if (patch.state && patch.state !== current.state && !ALLOWED_TRANSITIONS[current.state].includes(patch.state)) {
    throw new Error(`Invalid managed environment transition: ${current.state} → ${patch.state}.`);
  }
  const next = { ...current, ...patch, updatedAt: now.toISOString() };
  for (const other of registry.environments) {
    if (other.id === id || other.state === "deleted") continue;
    for (const key of ["projectId", "databaseStoreId", "blobStoreId", "deploymentId", "relayAgentId"] as const) {
      if (next[key] !== null && next[key] === other[key]) {
        throw new Error(`Managed environment ${key} is already assigned.`);
      }
    }
  }
  if (next.state === "project_created" && !next.projectId) throw new Error("Project ID required.");
  if (next.state === "storage_created" && (!next.projectId || !next.databaseStoreId)) {
    throw new Error("Dedicated project and database IDs required.");
  }
  if (["deployed", "healthy", "active"].includes(next.state) &&
      (!next.projectId || !next.databaseStoreId || !next.deploymentId || !next.templateSha)) {
    throw new Error("Managed deployment provenance is incomplete.");
  }
  if (next.state === "active" && (!next.aiGatewayBudgetUsd || !next.lastHealthCheckAt || !next.origin)) {
    throw new Error("A healthy Eve, public origin, and model budget are required before activation.");
  }
  if (next.state === "upgrading" && (!next.deploymentId || !next.templateSha ||
      !next.lastDatabaseBackupSha256 || !next.previousState)) {
    throw new Error("Upgrade requires current deployment and a verified database backup.");
  }
  if (next.state === "deleted" && !next.deletedAt) throw new Error("Deletion receipt time required.");
  return {
    version: 1,
    environments: registry.environments.map((environment) => environment.id === id ? next : environment),
  };
}

export function registryDigest(registry: ManagedEnvironmentRegistry): string {
  return createHash("sha256").update(JSON.stringify(registry)).digest("hex");
}
