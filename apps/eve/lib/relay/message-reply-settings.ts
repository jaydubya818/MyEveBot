import { z } from "zod";
import { settingsStore } from "../../agent/lib/settings-db.ts";

export const messageReplySettingsSchema = z.object({
  enabled: z.boolean(),
  publicProfile: z.string().trim().max(4000),
}).strict().refine(value => !value.enabled || value.publicProfile.length > 0, "Add the information your Agent may share before enabling replies.");
export type MessageReplySettings = z.infer<typeof messageReplySettingsSchema>;
export async function messageReplySettings(ownerId: string): Promise<MessageReplySettings> {
  const value = await settingsStore.getFresh(`relay-message-replies:${ownerId}`);
  if (!value) return { enabled: false, publicProfile: "" };
  return messageReplySettingsSchema.parse(JSON.parse(value));
}
export async function saveMessageReplySettings(ownerId: string, input: unknown) {
  const settings = messageReplySettingsSchema.parse(input);
  await settingsStore.set(`relay-message-replies:${ownerId}`, JSON.stringify(settings));
  return settings;
}
