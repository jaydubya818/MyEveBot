import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { newManagedEnvironment, reserveEnvironment, updateEnvironment, type ManagedEnvironmentRegistry } from "./managed-environment";
import { readManagedRegistry, withManagedRegistry } from "./managed-registry-file";

const EMPTY: ManagedEnvironmentRegistry = { version: 1, environments: [] };
const fixed = new Date("2026-09-26T12:00:00Z");

test("one tester and project cannot be reserved twice, including email case changes", () => {
  const registry = reserveEnvironment(EMPTY, { email: "Tester@Example.com", projectName: "eve-beta-1", now: fixed });
  assert.equal(registry.environments[0]?.email, "tester@example.com");
  assert.notEqual(registry.environments[0]?.ownerId, "owner");
  assert.throws(() => reserveEnvironment(registry, { email: "tester@example.com", projectName: "eve-beta-2" }));
  assert.throws(() => reserveEnvironment(registry, { email: "other@example.com", projectName: "eve-beta-1" }));
});

test("activation requires isolated provenance, health, and a model budget", () => {
  const environment = newManagedEnvironment({ email: "tester@example.com", projectName: "eve-beta-1", now: fixed });
  let registry: ManagedEnvironmentRegistry = { version: 1, environments: [environment] };
  assert.throws(() => updateEnvironment(registry, environment.id, { state: "active" }));
  registry = updateEnvironment(registry, environment.id, { state: "project_created", projectId: "prj_one" }, fixed);
  assert.throws(() => updateEnvironment(registry, environment.id, { state: "storage_created" }));
  registry = updateEnvironment(registry, environment.id, { state: "storage_created", databaseStoreId: "store_one" }, fixed);
  registry = updateEnvironment(registry, environment.id, { state: "configured" }, fixed);
  registry = updateEnvironment(registry, environment.id, { state: "deployed", deploymentId: "dpl_one", templateSha: "a".repeat(40) }, fixed);
  registry = updateEnvironment(registry, environment.id, { state: "healthy", lastHealthCheckAt: fixed.toISOString() }, fixed);
  assert.throws(() => updateEnvironment(registry, environment.id, { state: "active" }));
  registry = updateEnvironment(registry, environment.id, { state: "active", origin: "https://eve-beta-1.vercel.app", aiGatewayBudgetUsd: 20 }, fixed);
  assert.equal(registry.environments[0]?.state, "active");
  assert.throws(() => updateEnvironment(registry, environment.id, { ownerId: "someone-else" } as never));
});

test("a second Eve cannot claim another Eve's project or database", () => {
  const first = newManagedEnvironment({ email: "one@example.com", projectName: "eve-one", now: fixed });
  const second = newManagedEnvironment({ email: "two@example.com", projectName: "eve-two", now: fixed });
  let registry: ManagedEnvironmentRegistry = { version: 1, environments: [first, second] };
  registry = updateEnvironment(registry, first.id, { state: "project_created", projectId: "prj_one" }, fixed);
  assert.throws(() => updateEnvironment(registry, second.id, { state: "project_created", projectId: "prj_one" }), /already assigned/);
  registry = updateEnvironment(registry, second.id, { state: "project_created", projectId: "prj_two" }, fixed);
  registry = updateEnvironment(registry, first.id, { state: "storage_created", databaseStoreId: "store_one" }, fixed);
  assert.throws(() => updateEnvironment(registry, second.id, { state: "storage_created", databaseStoreId: "store_one" }), /already assigned/);
});

test("registry is private, atomic, backed up, and rejects concurrent mutations", async () => {
  const dir = await mkdtemp(join(tmpdir(), "myeve-managed-registry-"));
  const file = join(dir, "registry.json");
  try {
    await withManagedRegistry(file, async (registry) => ({
      registry: reserveEnvironment(registry, { email: "tester@example.com", projectName: "eve-beta-1", now: fixed }),
      result: null,
    }));
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    const first = readManagedRegistry(file);
    let release!: () => void;
    let entered!: () => void;
    const acquired = new Promise<void>((resolve) => { entered = resolve; });
    const held = new Promise<void>((resolve) => { release = resolve; });
    const blocked = withManagedRegistry(file, async (registry) => {
      entered();
      await held;
      return { registry: updateEnvironment(registry, registry.environments[0]!.id,
        { state: "project_created", projectId: "prj_one" }, fixed), result: null };
    });
    await acquired;
    await assert.rejects(withManagedRegistry(file, async (registry) => ({ registry, result: null })), /locked/);
    release();
    await blocked;
    assert.equal((await first).environments.length, 1);
    assert.equal(JSON.parse(await readFile(`${file}.bak`, "utf8")).environments.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a remote-stage checkpoint survives a later failure", async () => {
  const dir = await mkdtemp(join(tmpdir(), "myeve-managed-checkpoint-"));
  const file = join(dir, "registry.json");
  try {
    await assert.rejects(withManagedRegistry(file, async (registry, checkpoint) => {
      await checkpoint(reserveEnvironment(registry, {
        email: "tester@example.com", projectName: "eve-beta-1", now: fixed,
      }));
      throw new Error("provider unavailable");
    }), /provider unavailable/);
    assert.equal((await readManagedRegistry(file)).environments.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
