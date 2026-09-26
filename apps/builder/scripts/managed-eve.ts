/** Operator-only first-beta provisioning. Never expose this command as an HTTP route. */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";

import { buildEnv } from "../lib/deploy-env";
import { assembleDeployment, templateInfo } from "../lib/assemble";
import { requiredKeys, validateConfig, type AgentConfig } from "../lib/config";
import { reserveEnvironment, updateEnvironment, type ManagedEnvironment, type ManagedEnvironmentRegistry } from "../lib/managed-environment";
import { readManagedRegistry, withManagedRegistry } from "../lib/managed-registry-file";
import { resolveBetaRelayTrust } from "../lib/relay-trust";
import {
  assertRequiredProjectEnvKeys, connectStoreToProject, createBlobStore, createDeployment,
  createProject, deleteProject, getDeploymentStatus, getProject, listProjectEnvKeys, listStores,
  managedProjectMarker, provisionNeonDatabase, setStandardProtection, upsertEnv,
  setProjectPaused,
} from "../lib/vercel-api";

interface ProvisionFile {
  email: string;
  teamId: string;
  teamSlug: string;
  sourceSha: string;
  budgetUsd: number;
  config: AgentConfig;
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function privateFile(path: string): Promise<string> {
  if (!isAbsolute(path)) throw new Error("Operator input path must be absolute.");
  const resolved = resolve(path);
  const distance = relative(process.cwd(), resolved);
  if (distance === "" || (!distance.startsWith("..") && !isAbsolute(distance))) {
    throw new Error("Operator input must live outside the source checkout.");
  }
  const metadata = await stat(resolved);
  if (!metadata.isFile() || (metadata.mode & 0o077) !== 0) {
    throw new Error("Operator input must be a regular, owner-only file (0600).");
  }
  return resolved;
}

async function vercelToken(): Promise<string> {
  if (process.env.MYEVE_CONTROL_VERCEL_TOKEN?.trim()) return process.env.MYEVE_CONTROL_VERCEL_TOKEN.trim();
  if (process.platform !== "darwin") throw new Error("Set MYEVE_CONTROL_VERCEL_TOKEN on this host.");
  const path = join(homedir(), "Library/Application Support/com.vercel.cli/auth.json");
  const body = JSON.parse(await readFile(await privateFile(path), "utf8")) as {
    token?: unknown; expiresAt?: unknown;
  };
  if (typeof body.token !== "string" || body.token.length < 20 ||
      typeof body.expiresAt !== "number" || body.expiresAt < Date.now() / 1000 + 60) {
    throw new Error("Vercel CLI authentication expired. Run vercel login, then retry.");
  }
  return body.token;
}

function exactSourceSha(expected: string): void {
  const actual = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (!/^[0-9a-f]{40}$/.test(expected) || actual !== expected) {
    throw new Error("Provisioning source does not match the pinned SHA.");
  }
  const changed = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim();
  if (changed) throw new Error("Provisioning requires a clean source checkout.");
}

function budgetCli(args: string[]): string {
  const child = spawnSync("npx", ["--yes", "vercel@60.1.3", "ai-gateway", "budgets", ...args], {
    encoding: "utf8", timeout: 120_000,
  });
  if (child.status !== 0) throw new Error("Vercel AI Gateway budget operation failed.");
  return child.stdout;
}

function setBudget(projectName: string, projectId: string, amount: number, teamSlug: string): void {
  if (!Number.isInteger(amount) || amount < 1 || amount > 100) {
    throw new Error("Managed beta budget must be an integer from $1 to $100.");
  }
  budgetCli(["set", "project", projectName, "--limit", String(amount),
    "--refresh-period", "monthly", "--scope", teamSlug]);
  const listed = JSON.parse(budgetCli(["list", "--json", "--scope-type", "project", "--scope", teamSlug])) as {
    budgets?: { scopeId?: unknown; limitAmount?: unknown; refreshPeriod?: unknown; active?: unknown }[];
  };
  if (!Array.isArray(listed.budgets) || !listed.budgets.some((item) =>
    item.scopeId === projectId && item.limitAmount === amount &&
    item.refreshPeriod === "monthly" && item.active === true
  )) throw new Error("Vercel did not confirm the managed Eve's project budget.");
}

function storeName(projectName: string, kind: "db" | "blob"): string {
  return `${projectName.slice(0, 26)}-${kind}`;
}

async function existingOrCreateStore(
  token: string, teamId: string, name: string, kind: "db" | "blob",
): Promise<string> {
  const matching = (await listStores(token, teamId)).filter((store) =>
    store.name === name && store.kind === (kind === "blob" ? "blob" : "integration"),
  );
  if (matching.length > 1) throw new Error("Ambiguous managed storage name; operator review required.");
  if (matching[0]) return matching[0].id;
  return kind === "blob"
    ? createBlobStore(token, teamId, name)
    : provisionNeonDatabase(token, teamId, name);
}

async function ownerReadiness(origin: string, password: string): Promise<{ ready: boolean; checks: string[] }> {
  const login = await fetch(`${origin}/api/auth/login`, {
    method: "POST", redirect: "manual", signal: AbortSignal.timeout(15_000),
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ password }),
  });
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  if (!login.ok || !cookie) throw new Error("Managed Eve owner sign-in failed.");
  const response = await fetch(`${origin}/api/readiness?fresh=1`, {
    redirect: "manual", signal: AbortSignal.timeout(30_000), headers: { Cookie: cookie },
  });
  if (!response.ok) throw new Error("Managed Eve readiness endpoint failed.");
  const report = await response.json() as {
    overall?: unknown; checks?: { id?: unknown; state?: unknown; required?: unknown }[];
  };
  if (!Array.isArray(report.checks)) throw new Error("Managed Eve returned an invalid readiness report.");
  const missing = report.checks.filter((check) =>
    check.required && check.state !== "ready" && check.state !== "excluded")
    .map((check) => String(check.id));
  return { ready: report.overall === "ready" && missing.length === 0, checks: missing };
}

function current(registry: ManagedEnvironmentRegistry, id: string): ManagedEnvironment {
  const environment = registry.environments.find((item) => item.id === id);
  if (!environment) throw new Error("Managed environment disappeared from registry.");
  return environment;
}

async function provision(path: string): Promise<void> {
  const input = JSON.parse(await readFile(await privateFile(path), "utf8")) as ProvisionFile;
  if (!input || !input.config || typeof input.teamId !== "string" ||
      typeof input.teamSlug !== "string" || !/^[a-f0-9]{40}$/.test(input.sourceSha)) {
    throw new Error("Invalid managed provisioning input.");
  }
  const problem = validateConfig(input.config);
  if (problem) throw new Error(problem);
  exactSourceSha(input.sourceSha);
  const needsBlob = requiredKeys(input.config.features).blob;
  if (input.config.postgres.mode !== "create" ||
      (needsBlob && input.config.blob.mode !== "create") || !input.config.relay) {
    throw new Error("Managed beta requires a new database, a new Blob store for file features, and Relay pairing.");
  }
  process.env.BUILDER_RELAY_ORIGIN = requiredEnvironment("BUILDER_RELAY_ORIGIN");
  const relay = await resolveBetaRelayTrust(input.config.relay.fingerprint);
  const token = await vercelToken();
  const registryPath = requiredEnvironment("MYEVE_CONTROL_REGISTRY_PATH");
  await withManagedRegistry(registryPath, async (initial, checkpoint) => {
    let registry = initial;
    let environment = registry.environments.find((item) => item.email === input.email.toLowerCase());
    if (!environment) {
      registry = reserveEnvironment(registry, { email: input.email, projectName: input.config.projectName });
      environment = registry.environments.at(-1)!;
      await checkpoint(registry);
    }
    const id = environment.id;
    if (environment.projectName !== input.config.projectName) throw new Error("Tester project differs from reservation.");
    if (environment.state === "failed" || environment.state === "deleted") {
      throw new Error("Failed or deleted environments need operator recovery, not an automatic retry.");
    }
    if (environment.state === "reserved") {
      const project = await createProject(token, input.teamId, environment.projectName, id);
      const marker = await managedProjectMarker(token, input.teamId, project.id);
      if (marker !== id) throw new Error(project.existed
        ? "Existing project is not owned by this managed Eve reservation."
        : "New project did not retain its managed environment marker.");
      registry = updateEnvironment(registry, id, { state: "project_created", projectId: project.id });
      await checkpoint(registry);
    }
    environment = current(registry, id);
    if (environment.state === "project_created") {
      const projectId = environment.projectId!;
      if (!environment.databaseStoreId) {
        const databaseStoreId = await existingOrCreateStore(token, input.teamId, storeName(environment.projectName, "db"), "db");
        registry = updateEnvironment(registry, id, { databaseStoreId });
        await checkpoint(registry);
      }
      environment = current(registry, id);
      if (needsBlob && !environment.blobStoreId) {
        const blobStoreId = await existingOrCreateStore(token, input.teamId, storeName(environment.projectName, "blob"), "blob");
        registry = updateEnvironment(registry, id, { blobStoreId });
        await checkpoint(registry);
      }
      environment = current(registry, id);
      let keys = await listProjectEnvKeys(token, input.teamId, projectId);
      if (!keys.includes("DATABASE_URL")) await connectStoreToProject(token, input.teamId, environment.databaseStoreId!, projectId);
      if (needsBlob && !keys.includes("BLOB_READ_WRITE_TOKEN")) {
        await connectStoreToProject(token, input.teamId, environment.blobStoreId!, projectId);
      }
      keys = await listProjectEnvKeys(token, input.teamId, projectId);
      assertRequiredProjectEnvKeys(keys, needsBlob ? ["DATABASE_URL", "BLOB_READ_WRITE_TOKEN"] : ["DATABASE_URL"]);
      registry = updateEnvironment(registry, id, { state: "storage_created" });
      await checkpoint(registry);
    }
    environment = current(registry, id);
    if (environment.state === "storage_created") {
      await setStandardProtection(token, input.teamId, environment.projectId!);
      const info = await templateInfo();
      const vars = buildEnv(input.config, {
        templateVersion: info.version,
        templateRelease: info.release,
        builderUrl: requiredEnvironment("MYEVE_CONTROL_BUILDER_ORIGIN"),
        ownerId: environment.ownerId,
      }, relay);
      await upsertEnv(token, input.teamId, environment.projectId!, vars);
      const keys = await listProjectEnvKeys(token, input.teamId, environment.projectId!, "env");
      assertRequiredProjectEnvKeys(keys, vars.map((item) => item.key));
      registry = updateEnvironment(registry, id, { state: "configured" });
      await checkpoint(registry);
    }
    environment = current(registry, id);
    if (environment.state === "configured") {
      setBudget(environment.projectName, environment.projectId!, input.budgetUsd, input.teamSlug);
      registry = updateEnvironment(registry, id, { aiGatewayBudgetUsd: input.budgetUsd });
      await checkpoint(registry);
      const files = await assembleDeployment(input.config);
      const deployment = await createDeployment(token, input.teamId, environment.projectName, files);
      registry = updateEnvironment(registry, id, {
        state: "deployed", deploymentId: deployment.id, templateSha: input.sourceSha, error: null,
      });
      await checkpoint(registry);
    }
    environment = current(registry, id);
    if (environment.state === "deployed") {
      const deploymentId = environment.deploymentId!;
      const projectName = environment.projectName;
      let deployment = await getDeploymentStatus(token, input.teamId, deploymentId);
      for (let attempt = 0; attempt < 40 && deployment.readyState !== "READY"; attempt++) {
        if (deployment.readyState === "ERROR" || deployment.readyState === "CANCELED") {
          throw new Error("Managed Eve deployment failed; inspect Vercel build logs.");
        }
        await new Promise((resolve) => setTimeout(resolve, 5_000));
        deployment = await getDeploymentStatus(token, input.teamId, deploymentId);
      }
      if (deployment.readyState !== "READY") throw new Error("Managed Eve deployment did not become ready.");
      const alias = deployment.aliases.find((value) => value === `${projectName}.vercel.app`) ??
        [...deployment.aliases].sort((a, b) => a.length - b.length)[0];
      if (!alias) throw new Error("Managed Eve has no production alias.");
      const origin = `https://${alias}`;
      const readiness = await ownerReadiness(origin, input.config.accessPassword);
      if (!readiness.ready) {
        throw new Error(`Managed Eve needs setup before activation: ${readiness.checks.join(", ") || "unknown"}.`);
      }
      registry = updateEnvironment(registry, id, {
        state: "healthy", origin, lastHealthCheckAt: new Date().toISOString(),
      });
      await checkpoint(registry);
    }
    environment = current(registry, id);
    console.log(JSON.stringify({
      environmentId: environment.id,
      projectId: environment.projectId,
      deploymentId: environment.deploymentId,
      origin: environment.origin,
      state: environment.state,
      budgetUsd: environment.aiGatewayBudgetUsd,
    }));
    return { registry, result: undefined };
  });
}

async function recoverFailedDeployment(id: string, expectedDeploymentId: string): Promise<void> {
  const token = await vercelToken();
  const teamId = requiredEnvironment("MYEVE_CONTROL_TEAM_ID");
  await withManagedRegistry(requiredEnvironment("MYEVE_CONTROL_REGISTRY_PATH"), async (initial, checkpoint) => {
    let registry = initial;
    const environment = current(registry, id);
    if (environment.state !== "deployed" || environment.deploymentId !== expectedDeploymentId ||
        !environment.projectId) throw new Error("Recovery requires the exact failed deployment and project.");
    const marker = await managedProjectMarker(token, teamId, environment.projectId);
    if (marker !== id) throw new Error("Project no longer belongs to this managed environment.");
    const deployment = await getDeploymentStatus(token, teamId, expectedDeploymentId);
    if (deployment.readyState !== "ERROR" && deployment.readyState !== "CANCELED") {
      throw new Error("Only a confirmed failed deployment can be recovered.");
    }
    registry = updateEnvironment(registry, id, { state: "failed", error: `Deployment ${expectedDeploymentId} ${deployment.readyState}` });
    await checkpoint(registry);
    registry = updateEnvironment(registry, id, {
      state: "configured", deploymentId: null, templateSha: null,
    });
    await checkpoint(registry);
    console.log(JSON.stringify({ environmentId: id, state: "configured", failedDeploymentId: expectedDeploymentId }));
    return { registry, result: undefined };
  });
}

async function monitor(path: string): Promise<void> {
  const input = JSON.parse(await readFile(await privateFile(path), "utf8")) as ProvisionFile;
  const token = await vercelToken();
  await withManagedRegistry(requiredEnvironment("MYEVE_CONTROL_REGISTRY_PATH"), async (initial, checkpoint) => {
    let registry = initial;
    const environment = registry.environments.find((item) => item.email === input.email.toLowerCase());
    if (!environment || environment.projectName !== input.config.projectName ||
        !environment.projectId || !environment.deploymentId || !environment.origin ||
        !["healthy", "active"].includes(environment.state)) {
      throw new Error("Monitor requires an exact healthy managed Eve and private owner config.");
    }
    const marker = await managedProjectMarker(token, input.teamId, environment.projectId);
    const deployment = await getDeploymentStatus(token, input.teamId, environment.deploymentId);
    let readiness: { ready: boolean; checks: string[] } | null = null;
    let error: string | null = null;
    if (marker !== environment.id) error = "Project ownership marker changed.";
    else if (deployment.readyState !== "READY") error = `Deployment is ${deployment.readyState}.`;
    else {
      try {
        readiness = await ownerReadiness(environment.origin, input.config.accessPassword);
        if (!readiness.ready) error = `Readiness needs setup: ${readiness.checks.join(", ")}.`;
      } catch (cause) {
        error = cause instanceof Error ? cause.message : "Owner readiness failed.";
      }
    }
    registry = updateEnvironment(registry, environment.id, {
      error,
      ...(error === null ? { lastHealthCheckAt: new Date().toISOString() } : {}),
    });
    await checkpoint(registry);
    console.log(JSON.stringify({ environmentId: environment.id, healthy: error === null, error }));
    return { registry, result: undefined };
  });
}

async function recordExport(configPath: string, archivePath: string): Promise<void> {
  const input = JSON.parse(await readFile(await privateFile(configPath), "utf8")) as ProvisionFile;
  const archive = await readFile(await privateFile(archivePath));
  if (archive.length === 0 || archive.length > 25_000_000) throw new Error("Owner archive size is invalid.");
  await withManagedRegistry(requiredEnvironment("MYEVE_CONTROL_REGISTRY_PATH"), async (initial, checkpoint) => {
    let registry = initial;
    const environment = registry.environments.find((item) => item.email === input.email.toLowerCase());
    if (!environment || environment.projectName !== input.config.projectName || !environment.origin ||
        !["healthy", "active"].includes(environment.state)) {
      throw new Error("Export verification requires the exact healthy managed Eve.");
    }
    const login = await fetch(`${environment.origin}/api/auth/login`, {
      method: "POST", redirect: "manual", signal: AbortSignal.timeout(15_000),
      headers: { "Content-Type": "application/json", Origin: environment.origin },
      body: JSON.stringify({ password: input.config.accessPassword }),
    });
    const cookie = login.headers.get("set-cookie")?.split(";")[0];
    if (!login.ok || !cookie) throw new Error("Owner sign-in failed before archive verification.");
    const form = new FormData();
    form.set("archive", new File([new Uint8Array(archive)], "owner-backup.zip", { type: "application/zip" }));
    const response = await fetch(`${environment.origin}/api/owner-data`, {
      method: "POST", redirect: "manual", signal: AbortSignal.timeout(30_000),
      headers: { Cookie: cookie, Origin: environment.origin }, body: form,
    });
    if (!response.ok) throw new Error("Managed Eve rejected the owner archive.");
    const result = await response.json() as { validation?: { version?: unknown; fileCount?: unknown } };
    if (result.validation?.version !== 1 || typeof result.validation.fileCount !== "number") {
      throw new Error("Managed Eve did not return a valid archive-verification receipt.");
    }
    const sha256 = createHash("sha256").update(archive).digest("hex");
    registry = updateEnvironment(registry, environment.id, { lastExportSha256: sha256 });
    await checkpoint(registry);
    console.log(JSON.stringify({ environmentId: environment.id, sha256, verifiedFiles: result.validation.fileCount }));
    return { registry, result: undefined };
  });
}

async function pause(id: string, expectedProjectId: string): Promise<void> {
  const token = await vercelToken();
  const teamId = requiredEnvironment("MYEVE_CONTROL_TEAM_ID");
  await withManagedRegistry(requiredEnvironment("MYEVE_CONTROL_REGISTRY_PATH"), async (initial, checkpoint) => {
    let registry = initial;
    const environment = current(registry, id);
    if (!["healthy", "active"].includes(environment.state) || environment.projectId !== expectedProjectId) {
      throw new Error("Pause requires the exact healthy or active project ID.");
    }
    if (await managedProjectMarker(token, teamId, expectedProjectId) !== id) {
      throw new Error("Project no longer belongs to this managed environment.");
    }
    await setProjectPaused(token, teamId, expectedProjectId, true);
    registry = updateEnvironment(registry, id, { state: "paused" });
    await checkpoint(registry);
    console.log(JSON.stringify({ environmentId: id, state: "paused", projectId: expectedProjectId }));
    return { registry, result: undefined };
  });
}

async function resume(id: string, configPath: string): Promise<void> {
  const input = JSON.parse(await readFile(await privateFile(configPath), "utf8")) as ProvisionFile;
  const token = await vercelToken();
  await withManagedRegistry(requiredEnvironment("MYEVE_CONTROL_REGISTRY_PATH"), async (initial, checkpoint) => {
    let registry = initial;
    const environment = current(registry, id);
    if (environment.state !== "paused" || environment.email !== input.email.toLowerCase() ||
        environment.projectName !== input.config.projectName || !environment.projectId || !environment.origin) {
      throw new Error("Resume requires the exact paused Eve and private owner config.");
    }
    if (await managedProjectMarker(token, input.teamId, environment.projectId) !== id) {
      throw new Error("Project no longer belongs to this managed environment.");
    }
    await setProjectPaused(token, input.teamId, environment.projectId, false);
    let healthy = false;
    for (let attempt = 0; attempt < 12 && !healthy; attempt++) {
      try { healthy = (await ownerReadiness(environment.origin, input.config.accessPassword)).ready; }
      catch { /* Vercel may take a short time to unpause the production alias. */ }
      if (!healthy) await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
    if (!healthy) throw new Error("Project resumed, but owner readiness has not recovered; retry after provider propagation.");
    registry = updateEnvironment(registry, id, {
      state: "healthy", lastHealthCheckAt: new Date().toISOString(), error: null,
    });
    await checkpoint(registry);
    console.log(JSON.stringify({ environmentId: id, state: "healthy", projectId: environment.projectId }));
    return { registry, result: undefined };
  });
}

async function cleanupRehearsal(id: string, expectedProjectId: string, expectedStoreId: string): Promise<void> {
  const token = await vercelToken();
  const teamId = requiredEnvironment("MYEVE_CONTROL_TEAM_ID");
  const teamSlug = requiredEnvironment("MYEVE_CONTROL_TEAM_SLUG");
  await withManagedRegistry(requiredEnvironment("MYEVE_CONTROL_REGISTRY_PATH"), async (initial, checkpoint) => {
    let registry = initial;
    let environment = current(registry, id);
    if (!environment.email.endsWith("@example.invalid") || environment.relayAccountId ||
        environment.relayAgentId || environment.blobStoreId ||
        environment.projectId !== expectedProjectId || environment.databaseStoreId !== expectedStoreId ||
        !environment.lastExportSha256 || !["healthy", "paused", "deleting"].includes(environment.state)) {
      throw new Error("Cleanup is restricted to an exact unpaired, exported synthetic rehearsal.");
    }
    const existingProject = await getProject(token, teamId, expectedProjectId);
    if (existingProject) {
      if (await managedProjectMarker(token, teamId, expectedProjectId) !== id) {
        throw new Error("Project no longer belongs to this managed rehearsal.");
      }
      if (environment.state !== "paused" && environment.state !== "deleting") {
        await setProjectPaused(token, teamId, expectedProjectId, true);
      }
    }
    if (environment.state !== "deleting") {
      registry = updateEnvironment(registry, id, { state: "deleting" });
      await checkpoint(registry);
    }
    if (existingProject) await deleteProject(token, teamId, expectedProjectId);
    if (await getProject(token, teamId, expectedProjectId)) {
      throw new Error("Disposable Vercel project still exists after deletion.");
    }
    const stores = await listStores(token, teamId);
    const store = stores.find((item) => item.id === expectedStoreId);
    if (store) {
      if (store.kind !== "integration" || store.name !== storeName(environment.projectName, "db")) {
        throw new Error("Disposable database store identity changed; cleanup stopped.");
      }
      const child = spawnSync("npx", ["--yes", "vercel@60.1.3", "integration-resource", "remove",
        expectedStoreId, "--json", "--yes", "--scope", teamSlug], { encoding: "utf8", timeout: 120_000 });
      if (child.status !== 0) throw new Error("Vercel did not delete the dedicated rehearsal database.");
    }
    if ((await listStores(token, teamId)).some((item) => item.id === expectedStoreId)) {
      throw new Error("Disposable database is still listed after deletion.");
    }
    environment = current(registry, id);
    registry = updateEnvironment(registry, id, {
      state: "deleted", deletedAt: new Date().toISOString(), origin: null,
    });
    await checkpoint(registry);
    console.log(JSON.stringify({ environmentId: id, state: "deleted", projectId: expectedProjectId,
      databaseStoreId: expectedStoreId, exportSha256: environment.lastExportSha256 }));
    return { registry, result: undefined };
  });
}

async function main(): Promise<void> {
  const [command, argument] = process.argv.slice(2);
  if (command === "provision" && argument) return provision(argument);
  if (command === "recover-failed-deployment" && argument && process.argv[4]) {
    return recoverFailedDeployment(argument, process.argv[4]);
  }
  if (command === "monitor" && argument) return monitor(argument);
  if (command === "record-export" && argument && process.argv[4]) return recordExport(argument, process.argv[4]);
  if (command === "pause" && argument && process.argv[4]) return pause(argument, process.argv[4]);
  if (command === "resume" && argument && process.argv[4]) return resume(argument, process.argv[4]);
  if (command === "cleanup-rehearsal" && argument && process.argv[4] && process.argv[5]) {
    return cleanupRehearsal(argument, process.argv[4], process.argv[5]);
  }
  if (command === "status") {
    const registry = await readManagedRegistry(requiredEnvironment("MYEVE_CONTROL_REGISTRY_PATH"));
    console.log(JSON.stringify(registry.environments.map((environment) => ({
      id: environment.id, email: environment.email, projectName: environment.projectName,
      state: environment.state, origin: environment.origin,
      budgetUsd: environment.aiGatewayBudgetUsd, lastHealthCheckAt: environment.lastHealthCheckAt,
    })), null, 2));
    return;
  }
  throw new Error("Usage: managed-eve.ts provision CONFIG | monitor CONFIG | record-export CONFIG ARCHIVE | pause ID PROJECT_ID | resume ID CONFIG | cleanup-rehearsal ID PROJECT_ID DB_STORE_ID | status | recover-failed-deployment ID DEPLOYMENT_ID");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Managed Eve operation failed.");
  process.exitCode = 1;
});
