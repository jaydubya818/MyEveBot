import webpush from "web-push";
import { generateKeyPairSync, randomBytes } from "node:crypto";

import { assembleDeployment, templateFiles, templateInfo } from "@/lib/assemble";
import { requiredKeys, validateConfig, type AgentConfig, type DeployTarget } from "@/lib/config";
import { validCron } from "@/lib/schedule-codegen";
import { resolveBetaRelayTrust, type ResolvedRelayTrust } from "@/lib/relay-trust";
import {
  assertRequiredProjectEnvKeys,
  connectStoreToProject,
  createBlobStore,
  createDeployment,
  createProject,
  listProjectEnvKeys,
  provisionNeonDatabase,
  upsertEnv,
  VercelApiError,
  type EnvVar,
} from "@/lib/vercel-api";

// The deploy pipeline: project → storage connections → env vars →
// deployment, all against the user's Vercel account with their token.
// Secrets exist only inside this request; the builder stores nothing.
// `dryRun` returns the assembled file list and env keys for the review step
// without touching any account.

export const maxDuration = 120;

interface DeployRequest {
  target?: DeployTarget;
  config?: AgentConfig;
  dryRun?: boolean;
  /** Required to deploy into a project that already exists (replaces its
   * env vars and production deployment); without it we return 409 so the
   * wizard can ask the user first. */
  confirmExisting?: boolean;
}

/** Env stamps that let a deployed agent identify itself for later updates. */
interface UpdateStamps {
  templateVersion: string;
  templateRelease: number;
  builderUrl: string;
}

function buildEnv(config: AgentConfig, stamps: UpdateStamps, relay: ResolvedRelayTrust | null = null): EnvVar[] {
  const vapid = webpush.generateVAPIDKeys();
  const vars: EnvVar[] = [
    { key: "OWNER_NAME", value: config.ownerName.trim() },
    { key: "OWNER_TIMEZONE", value: config.ownerTimezone },
    // Display identity for the web UI; NEXT_PUBLIC_* is inlined at build time.
    { key: "NEXT_PUBLIC_AGENT_NAME", value: config.agentName.trim() },
    { key: "NEXT_PUBLIC_OWNER_NAME", value: config.ownerName.trim() },
    { key: "MYEVE_ACCESS_PASSWORD", value: config.accessPassword },
    { key: "MYEVE_SESSION_SECRET", value: randomBytes(48).toString("base64url") },
    { key: "MYEVE_OWNER_ID", value: "owner" },
    { key: "EVE_ENABLED_FEATURES", value: config.features.join(",") },
    { key: "NEXT_PUBLIC_VAPID_PUBLIC_KEY", value: vapid.publicKey },
    { key: "VAPID_PRIVATE_KEY", value: vapid.privateKey },
    // Deep-link + legacy env identity. The manage page prefers the baked
    // lib/eve-template-stamp.ts for release ordering; env keeps older agents
    // and the update deep-link working. release (from
    // apps/eve/.eve-template-release) orders templates so a content
    // rollback isn't offered as an upgrade.
    { key: "EVE_TEMPLATE_VERSION", value: stamps.templateVersion },
    { key: "EVE_TEMPLATE_RELEASE", value: String(stamps.templateRelease) },
    { key: "EVE_PROJECT_NAME", value: config.projectName },
    { key: "EVE_BUILDER_URL", value: stamps.builderUrl },
  ];
  // Connected stores inject DATABASE_URL / BLOB_READ_WRITE_TOKEN themselves.
  if (config.postgres.mode === "manual") {
    vars.push({ key: "DATABASE_URL", value: config.postgres.url.trim() });
  }
  if (requiredKeys(config.features).blob && config.blob.mode === "manual") {
    vars.push({ key: "BLOB_READ_WRITE_TOKEN", value: config.blob.token.trim() });
  }
  if (config.keys.supermemoryApiKey?.trim()) {
    vars.push({ key: "SUPERMEMORY_API_KEY", value: config.keys.supermemoryApiKey.trim() });
  }
  if (config.keys.composioApiKey?.trim()) {
    vars.push({ key: "COMPOSIO_API_KEY", value: config.keys.composioApiKey.trim() });
  }
  if (config.telegram !== null) {
    vars.push({ key: "TELEGRAM_BOT_TOKEN", value: config.telegram.botToken.trim() });
    vars.push({ key: "TELEGRAM_WEBHOOK_SECRET_TOKEN", value: config.telegram.webhookSecret });
    if (config.telegram.botUsername.trim().length > 0) {
      vars.push({ key: "TELEGRAM_BOT_USERNAME", value: config.telegram.botUsername.trim() });
    }
    if (config.telegram.allowedUserIds.trim().length > 0) {
      vars.push({ key: "TELEGRAM_ALLOWED_USER_IDS", value: config.telegram.allowedUserIds.trim() });
      const proactiveChatId = config.telegram.allowedUserIds
        .split(",")
        .map((value) => value.trim())
        .find(Boolean);
      if (proactiveChatId) {
        vars.push({ key: "TELEGRAM_PROACTIVE_CHAT_ID", value: proactiveChatId });
      }
    }
  }
  if (relay) {
    const artifactKey = generateKeyPairSync("ed25519").privateKey
      .export({ type: "pkcs8", format: "pem" }).toString();
    vars.push(
      { key: "MYEVE_RELAY_ENABLED", value: "true" },
      { key: "MYEVE_RELAY_ORIGIN", value: relay.origin },
      { key: "MYEVE_RELAY_KEY_ID", value: relay.keyId },
      { key: "MYEVE_RELAY_KEY_VERSION", value: relay.keyVersion },
      { key: "MYEVE_RELAY_PUBLIC_KEY", value: relay.publicKey },
      { key: "MYEVE_RELAY_ENCRYPTION_KEY", value: randomBytes(32).toString("hex") },
      { key: "MYEVE_RELAY_ARTIFACT_PRIVATE_KEY", value: artifactKey },
    );
  }
  return vars;
}

/**
 * Store names must be unique across the account, and a redeploy (or a
 * deleted-then-recreated project) would otherwise try to reuse the same
 * name and fail. A random hex suffix keeps every provisioned store
 * distinct even under concurrent creates; the project-name prefix is
 * truncated so the whole name stays within Vercel's 32-character limit.
 */
function uniqueStoreName(projectName: string, kind: "db" | "blob"): string {
  const stamp = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const suffix = `-${kind}-${stamp}`;
  const prefix = projectName.slice(0, 32 - suffix.length).replace(/[-._]+$/, "");
  return `${prefix}${suffix}`;
}

/**
 * Connects the selected stores to the project and verifies Vercel injected
 * the env vars the agent needs — the safety net for picking a database whose
 * integration doesn't provide DATABASE_URL.
 */
async function connectStorage(
  token: string,
  teamId: string | null,
  projectId: string,
  projectName: string,
  config: AgentConfig,
): Promise<void> {
  const wantBlob = requiredKeys(config.features).blob;

  if (config.postgres.mode === "create") {
    const storeId = await provisionNeonDatabase(
      token,
      teamId,
      uniqueStoreName(projectName, "db"),
    );
    await connectStoreToProject(token, teamId, storeId, projectId);
  } else if (config.postgres.mode === "connect") {
    await connectStoreToProject(token, teamId, config.postgres.storeId, projectId);
  }
  if (wantBlob && config.blob.mode !== "manual") {
    const storeId =
      config.blob.mode === "create"
        ? await createBlobStore(token, teamId, uniqueStoreName(projectName, "blob"))
        : config.blob.storeId;
    await connectStoreToProject(token, teamId, storeId, projectId);
  }

  const expected: string[] = [];
  if (config.postgres.mode !== "manual") expected.push("DATABASE_URL");
  if (wantBlob && config.blob.mode !== "manual") expected.push("BLOB_READ_WRITE_TOKEN");
  if (expected.length === 0) return;

  const keys = await listProjectEnvKeys(token, teamId, projectId);
  for (const key of expected) {
    if (!keys.includes(key)) {
      throw new VercelApiError(
        "storage",
        key === "DATABASE_URL"
          ? "The connected database didn't provide DATABASE_URL. Pick a Neon database, or paste a connection string instead."
          : "The connected Blob store didn't provide BLOB_READ_WRITE_TOKEN. Paste a token instead.",
      );
    }
  }
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as DeployRequest | null;
  if (body === null || body.config === undefined) {
    return Response.json({ error: "Missing config" }, { status: 400 });
  }
  const config = body.config;

  const problem = validateConfig(config);
  if (problem !== null) return Response.json({ error: problem }, { status: 400 });
  for (const schedule of config.schedules) {
    if (!validCron(schedule.cron)) {
      return Response.json(
        { error: `Invalid cron expression: ${schedule.cron}` },
        { status: 400 },
      );
    }
  }

  const info = await templateInfo();
  const stamps = {
    templateVersion: info.version,
    templateRelease: info.release,
    builderUrl: new URL(request.url).origin,
  };

  if (body.dryRun === true) {
    const files = await templateFiles(config.features);
    const envKeys = buildEnv(config, stamps).map((entry) => entry.key);
    if (config.relay) envKeys.push(
      "MYEVE_RELAY_ENABLED", "MYEVE_RELAY_ORIGIN", "MYEVE_RELAY_KEY_ID",
      "MYEVE_RELAY_KEY_VERSION", "MYEVE_RELAY_PUBLIC_KEY",
      "MYEVE_RELAY_ENCRYPTION_KEY", "MYEVE_RELAY_ARTIFACT_PRIVATE_KEY",
    );
    if (config.postgres.mode === "create") envKeys.push("DATABASE_URL (new Neon database)");
    if (config.postgres.mode === "connect") envKeys.push("DATABASE_URL (from connected database)");
    if (requiredKeys(config.features).blob && config.blob.mode !== "manual") {
      envKeys.push("BLOB_READ_WRITE_TOKEN (from Blob store)");
    }
    const scheduleFiles = config.schedules.map((_, index) => `agent/schedules/custom-*.ts (#${index + 1})`);
    return Response.json({ files: [...files, ...scheduleFiles], envKeys });
  }

  const target = body.target;
  if (target === undefined || typeof target.token !== "string" || target.token.trim().length === 0) {
    return Response.json({ error: "Missing Vercel token" }, { status: 400 });
  }
  const token = target.token.trim();
  const teamId = target.teamId ?? null;

  try {
    // Resolve and verify trust before creating or changing a project. A URL
    // lookup alone never authorizes a signing key; the owner enters its
    // independently supplied fingerprint in the wizard.
    const relay = config.relay
      ? await resolveBetaRelayTrust(config.relay.fingerprint)
      : null;
    const project = await createProject(token, teamId, config.projectName);
    if (project.existed && relay) {
      return Response.json({
        error: "Relay pairing is available only for a new MyEve project in this beta. An existing project needs a separate key-preserving migration.",
        stage: "relay",
      }, { status: 409 });
    }
    // Nothing has been mutated yet on the existing-project path (createProject
    // only reads it), so this is a safe place to stop and ask.
    if (project.existed && body.confirmExisting !== true) {
      return Response.json(
        {
          error: `A project named "${project.name}" already exists on this Vercel account. Deploying into it will replace its environment variables and production deployment.`,
          code: "project_exists",
        },
        { status: 409 },
      );
    }
    await connectStorage(token, teamId, project.id, project.name, config);
    let env = buildEnv(config, stamps, relay);
    if (project.existed) {
      // Redeploying into an existing agent: keep its VAPID key pair so the
      // browser push subscriptions signed against the old public key survive.
      const existingKeys = await listProjectEnvKeys(token, teamId, project.id);
      if (
        existingKeys.includes("NEXT_PUBLIC_VAPID_PUBLIC_KEY") &&
        existingKeys.includes("VAPID_PRIVATE_KEY")
      ) {
        env = env.filter(
          (entry) =>
            entry.key !== "NEXT_PUBLIC_VAPID_PUBLIC_KEY" && entry.key !== "VAPID_PRIVATE_KEY",
        );
      }
    }
    await upsertEnv(token, teamId, project.id, env);
    const persistedEnvKeys = await listProjectEnvKeys(token, teamId, project.id, "env");
    assertRequiredProjectEnvKeys(
      persistedEnvKeys,
      buildEnv(config, stamps, relay).map((entry) => entry.key),
    );
    const files = await assembleDeployment(config);
    const deployment = await createDeployment(token, teamId, project.name, files);
    return Response.json({
      projectId: project.id,
      projectName: project.name,
      projectExisted: project.existed,
      deploymentId: deployment.id,
      url: deployment.url,
      inspectorUrl: deployment.inspectorUrl,
      readyState: deployment.readyState,
    });
  } catch (error) {
    if (error instanceof VercelApiError) {
      console.error(`deploy failed at ${error.stage}:`, error.message);
      return Response.json({ error: error.message, stage: error.stage }, { status: 502 });
    }
    console.error("deploy failed:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Deploy failed", stage: "deploy" },
      { status: 500 },
    );
  }
}
