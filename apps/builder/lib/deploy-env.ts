import { generateKeyPairSync, randomBytes } from "node:crypto";
import webpush from "web-push";

import { requiredKeys, type AgentConfig } from "./config";
import type { ResolvedRelayTrust } from "./relay-trust";
import type { EnvVar } from "./vercel-api";

export interface UpdateStamps {
  templateVersion: string;
  templateRelease: number;
  builderUrl: string;
  ownerId?: string;
}

export function buildEnv(config: AgentConfig, stamps: UpdateStamps, relay: ResolvedRelayTrust | null = null): EnvVar[] {
  const vapid = webpush.generateVAPIDKeys();
  const vars: EnvVar[] = [
    { key: "OWNER_NAME", value: config.ownerName.trim() },
    { key: "OWNER_TIMEZONE", value: config.ownerTimezone },
    { key: "NEXT_PUBLIC_AGENT_NAME", value: config.agentName.trim() },
    { key: "NEXT_PUBLIC_OWNER_NAME", value: config.ownerName.trim() },
    { key: "MYEVE_ACCESS_PASSWORD", value: config.accessPassword },
    { key: "MYEVE_SESSION_SECRET", value: randomBytes(48).toString("base64url") },
    { key: "MYEVE_OWNER_ID", value: stamps.ownerId ?? "owner" },
    { key: "EVE_ENABLED_FEATURES", value: config.features.join(",") },
    { key: "NEXT_PUBLIC_VAPID_PUBLIC_KEY", value: vapid.publicKey },
    { key: "VAPID_PRIVATE_KEY", value: vapid.privateKey },
    { key: "EVE_TEMPLATE_VERSION", value: stamps.templateVersion },
    { key: "EVE_TEMPLATE_RELEASE", value: String(stamps.templateRelease) },
    { key: "EVE_PROJECT_NAME", value: config.projectName },
    { key: "EVE_BUILDER_URL", value: stamps.builderUrl },
  ];
  if (config.postgres.mode === "manual") vars.push({ key: "DATABASE_URL", value: config.postgres.url.trim() });
  if (requiredKeys(config.features).blob && config.blob.mode === "manual") {
    vars.push({ key: "BLOB_READ_WRITE_TOKEN", value: config.blob.token.trim() });
  }
  if (config.keys.supermemoryApiKey?.trim()) vars.push({ key: "SUPERMEMORY_API_KEY", value: config.keys.supermemoryApiKey.trim() });
  if (config.keys.composioApiKey?.trim()) vars.push({ key: "COMPOSIO_API_KEY", value: config.keys.composioApiKey.trim() });
  if (config.telegram !== null) {
    vars.push({ key: "TELEGRAM_BOT_TOKEN", value: config.telegram.botToken.trim() });
    vars.push({ key: "TELEGRAM_WEBHOOK_SECRET_TOKEN", value: config.telegram.webhookSecret });
    if (config.telegram.botUsername.trim()) vars.push({ key: "TELEGRAM_BOT_USERNAME", value: config.telegram.botUsername.trim() });
    if (config.telegram.allowedUserIds.trim()) {
      vars.push({ key: "TELEGRAM_ALLOWED_USER_IDS", value: config.telegram.allowedUserIds.trim() });
      const proactiveChatId = config.telegram.allowedUserIds.split(",").map((value) => value.trim()).find(Boolean);
      if (proactiveChatId) vars.push({ key: "TELEGRAM_PROACTIVE_CHAT_ID", value: proactiveChatId });
    }
  }
  if (relay) {
    const artifactKey = generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }).toString();
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
