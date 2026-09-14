import { defaultTelegramAuth, telegramChannel } from "eve/channels/telegram";

// Credentials come from TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET_TOKEN.
// The webhook route is mounted at POST /eve/v1/telegram.
//
// This is a personal agent: it only answers private DMs. Production fails
// closed unless TELEGRAM_ALLOWED_USER_IDS contains the owner-approved Telegram
// user ids. Local development may omit the list for channel setup testing.
function allowedUserIds(env: NodeJS.ProcessEnv): string[] {
  return (env.TELEGRAM_ALLOWED_USER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

export function telegramUserAllowed(
  fromId: string | number | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const allowlist = allowedUserIds(env);
  if (allowlist.length === 0) return env.NODE_ENV !== "production";
  return fromId !== undefined && allowlist.includes(String(fromId));
}

export default telegramChannel({
  botUsername: process.env.TELEGRAM_BOT_USERNAME ?? "eve_tele_bot",
  async onMessage(ctx, message) {
    if (message.chat.type !== "private") return null;
    if (message.from?.isBot === true) return null;

    const fromId = message.from?.id;
    if (!telegramUserAllowed(fromId)) return null;

    const hasContent = (message.text || message.caption).trim().length > 0 || message.attachments.length > 0;
    if (!hasContent) return null;

    // Remember the owner's DM so web-created reminders and triggers can
    // deliver to Telegram when the owner picks it in Manage.
    const { rememberOwnerTelegramChat } = await import("../lib/delivery");
    await rememberOwnerTelegramChat(message.chat.id);

    await ctx.telegram.startTyping();
    return { auth: defaultTelegramAuth(message) };
  },
  uploadPolicy: {
    allowedMediaTypes: ["image/*", "application/pdf"],
    maxBytes: 10 * 1024 * 1024,
  },
});
