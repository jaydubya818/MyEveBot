import { constants } from "node:fs";
import { copyFile, mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import { MANAGED_ENVIRONMENT_STATES, type ManagedEnvironmentRegistry } from "./managed-environment";

const EMPTY_REGISTRY: ManagedEnvironmentRegistry = { version: 1, environments: [] };

function outsideCheckout(path: string): string {
  if (!isAbsolute(path)) throw new Error("The managed registry path must be absolute.");
  const target = resolve(path);
  const distance = relative(process.cwd(), target);
  if (distance === "" || (!distance.startsWith("..") && !isAbsolute(distance))) {
    throw new Error("The managed registry must live outside the source checkout.");
  }
  return target;
}

function parseRegistry(value: unknown): ManagedEnvironmentRegistry {
  if (value === null || typeof value !== "object" ||
      (value as { version?: unknown }).version !== 1 ||
      !Array.isArray((value as { environments?: unknown }).environments)) {
    throw new Error("Managed registry is invalid or has an unsupported version.");
  }
  const registry = value as ManagedEnvironmentRegistry;
  const ids = new Set<string>();
  const projects = new Set<string>();
  const emails = new Set<string>();
  const resourceIds = new Set<string>();
  for (const environment of registry.environments) {
    if (!environment || typeof environment.id !== "string" ||
        typeof environment.email !== "string" ||
        typeof environment.projectName !== "string" ||
        !MANAGED_ENVIRONMENT_STATES.includes(environment.state)) {
      throw new Error("Managed registry contains an invalid environment.");
    }
    if (ids.has(environment.id) ||
        (environment.state !== "deleted" &&
          (projects.has(environment.projectName) || emails.has(environment.email)))) {
      throw new Error("Managed registry contains duplicate environment identities.");
    }
    ids.add(environment.id);
    if (environment.state !== "deleted") {
      projects.add(environment.projectName);
      emails.add(environment.email);
      for (const key of ["projectId", "databaseStoreId", "blobStoreId", "deploymentId", "relayAgentId"] as const) {
        const value = environment[key];
        if (value !== null) {
          if (resourceIds.has(`${key}:${value}`)) throw new Error("Managed registry shares a resource between environments.");
          resourceIds.add(`${key}:${value}`);
        }
      }
    }
  }
  return registry;
}

async function read(path: string): Promise<ManagedEnvironmentRegistry> {
  try {
    const metadata = await stat(path);
    if ((metadata.mode & 0o077) !== 0) {
      throw new Error("Managed registry permissions must be owner-only (0600).");
    }
    return parseRegistry(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return EMPTY_REGISTRY;
    throw error;
  }
}

/** One-operator atomic file registry. The lock prevents concurrent CLI writes. */
export async function withManagedRegistry<T>(
  filename: string,
  work: (
    registry: ManagedEnvironmentRegistry,
    checkpoint: (registry: ManagedEnvironmentRegistry) => Promise<void>,
  ) => Promise<{ registry: ManagedEnvironmentRegistry; result: T }>,
): Promise<T> {
  const path = outsideCheckout(filename);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const lock = await open(`${path}.lock`, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600)
    .catch((error: unknown) => {
      if (error instanceof Error && "code" in error && error.code === "EEXIST") {
        throw new Error("Managed registry is locked by another operation. Do not remove the lock while it is running.");
      }
      throw error;
    });
  try {
    let current = await read(path);
    const checkpoint = async (registry: ManagedEnvironmentRegistry): Promise<void> => {
      parseRegistry(registry);
      const temporary = `${path}.${process.pid}.tmp`;
      try {
        try { await copyFile(path, `${path}.bak`); } catch (error) {
          if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
        }
        const file = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
        try {
          await file.writeFile(`${JSON.stringify(registry, null, 2)}\n`);
          await file.sync();
        } finally {
          await file.close();
        }
        await rename(temporary, path);
        current = registry;
      } finally {
        await rm(temporary, { force: true });
      }
    };
    const { registry, result } = await work(current, checkpoint);
    if (registry !== current) await checkpoint(registry);
    return result;
  } finally {
    await lock.close();
    await rm(`${path}.lock`, { force: true });
  }
}

export async function readManagedRegistry(filename: string): Promise<ManagedEnvironmentRegistry> {
  return read(outsideCheckout(filename));
}
