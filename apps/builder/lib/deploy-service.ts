import webpush from "web-push";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { requiredKeys, type AgentConfig } from "./config";
import type { ResolvedRelayTrust } from "./relay-trust";
import { connectStoreToProject, createBlobStore, listProjectEnvKeys, provisionNeonDatabase, VercelApiError, type EnvVar } from "./vercel-api";

/** Env stamps that let a deployed agent identify itself for later updates. */
export interface UpdateStamps {
  templateVersion: string;
  templateRelease: number;
  builderUrl: string;
}

export function buildEnv(config: AgentConfig, stamps: UpdateStamps, relay: ResolvedRelayTrust | null = null): EnvVar[] {
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
export async function connectStorage(
  token: string,
  teamId: string | null,
  projectId: string,
  projectName: string,
  config: AgentConfig,
): Promise<{ databaseStoreId: string | null; blobStoreId: string | null }> {
  const wantBlob = requiredKeys(config.features).blob;
  let databaseStoreId: string | null = null;
  let blobStoreId: string | null = null;

  if (config.postgres.mode === "create") {
    const storeId = await provisionNeonDatabase(
      token,
      teamId,
      uniqueStoreName(projectName, "db"),
    );
    databaseStoreId = storeId;
    await connectStoreToProject(token, teamId, storeId, projectId);
  } else if (config.postgres.mode === "connect") {
    databaseStoreId = config.postgres.storeId;
    await connectStoreToProject(token, teamId, config.postgres.storeId, projectId);
  }
  if (wantBlob && config.blob.mode !== "manual") {
    const storeId =
      config.blob.mode === "create"
        ? await createBlobStore(token, teamId, uniqueStoreName(projectName, "blob"))
        : config.blob.storeId;
    blobStoreId = storeId;
    await connectStoreToProject(token, teamId, storeId, projectId);
  }

  const expected: string[] = [];
  if (config.postgres.mode !== "manual") expected.push("DATABASE_URL");
  if (wantBlob && config.blob.mode !== "manual") expected.push("BLOB_READ_WRITE_TOKEN");
  if (expected.length === 0) return { databaseStoreId, blobStoreId };

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
  return { databaseStoreId, blobStoreId };
}

