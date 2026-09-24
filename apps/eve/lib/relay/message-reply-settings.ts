import { z } from "zod";
import type { FederationStore } from "./store.ts";

export const messageReplySettingsSchema = z.object({
  enabled: z.boolean(),
  publicProfile: z.string().trim().max(4000),
}).strict().refine(value => !value.enabled || value.publicProfile.length > 0, "Add the information your Agent may share before enabling replies.");
export type MessageReplySettings = z.infer<typeof messageReplySettingsSchema>;
export async function messageReplySettings(store: Pick<FederationStore, "ownerId" | "database">): Promise<MessageReplySettings> {
  // A storage error must not silently turn an enabled answer into a receipt.
  const [row] = await store.database.query("SELECT value FROM app_settings WHERE name=$1", [`relay-message-replies:${store.ownerId}`]);
  const value = row?.value;
  if (!value) return { enabled: false, publicProfile: "" };
  return messageReplySettingsSchema.parse(JSON.parse(value));
}
export async function saveMessageReplySettings(store: Pick<FederationStore, "ownerId" | "database">, input: unknown) {
  const settings = messageReplySettingsSchema.parse(input);
  await store.database.query(
    "INSERT INTO app_settings(name,value) VALUES($1,$2) ON CONFLICT(name) DO UPDATE SET value=EXCLUDED.value,updated_at=now()",
    [`relay-message-replies:${store.ownerId}`, JSON.stringify(settings)],
  );
  return settings;
}
