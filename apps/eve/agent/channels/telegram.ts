import { blockedChannel } from "../lib/blocked-channel.ts";
import { defaultTelegramAuth, telegramChannel } from "eve/channels/telegram";
import type { TelegramChannelConfig } from "eve/channels/telegram";
import {TelegramOwnerReceiptStore,telegramHash,type TelegramOwnerReceiptKey} from "../../lib/telegram-owner-receipts.ts";

// Credentials come from TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET_TOKEN.
// The webhook route is mounted at POST /eve/v1/telegram.
//
// This is a personal agent: it only answers private DMs from explicitly
// allowlisted users. Development traffic must meet the same identity rule.
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
  return fromId !== undefined && allowlist.includes(String(fromId));
}

type OwnerAuth={authenticator?:string;principalId?:string;attributes?:Record<string,unknown>};
function receiptFromAuth(auth:OwnerAuth|null|undefined):TelegramOwnerReceiptKey {
  const attributes=auth?.attributes;
  if(auth?.authenticator!=="telegram-webhook"||attributes?.owner!=="true"||
    typeof auth.principalId!=="string"||typeof attributes.telegramBotId!=="string"||
    typeof attributes.telegramPayloadHash!=="string"||typeof attributes.chat_id!=="string"||
    typeof attributes.message_id!=="string"||attributes.chat_type!=="private"||
    String(attributes.user_id)!==attributes.chat_id)
    throw new Error("Exact owner Telegram turn binding is unavailable.");
  return {ownerId:auth.principalId,botId:attributes.telegramBotId,chatId:attributes.chat_id,
    messageId:attributes.message_id,payloadHash:attributes.telegramPayloadHash};
}
function currentOwnerTarget(key:TelegramOwnerReceiptKey,env:NodeJS.ProcessEnv,botToken:string) {
  const ownerId=env.MYEVE_OWNER_ID?.trim()||env.SOFIE_OWNER_ID?.trim();
  return ownerId===key.ownerId&&env.TELEGRAM_PROACTIVE_CHAT_ID?.trim()===key.chatId&&
    env.TELEGRAM_BOT_TOKEN?.trim()===botToken&&telegramUserAllowed(key.chatId,env);
}
function localQualificationAllowed(env:NodeJS.ProcessEnv) {
  return env.MYEVE_TELEGRAM_LOCAL_QUALIFICATION==="true"&&process.env.MYEVE_TELEGRAM_LOCAL_QUALIFICATION==="true"&&
    env.NODE_ENV!=="production"&&process.env.NODE_ENV!=="production"&&!env.VERCEL_ENV&&!process.env.VERCEL_ENV;
}

/** Claim the reply before the provider call. An ambiguous provider result is
 * REPLY_UNKNOWN forever until independent reconciliation; no implicit resend. */
export async function sendQualifiedTelegramReply(options:{
  auth:OwnerAuth|null|undefined;text:string;store:TelegramOwnerReceiptStore;env:NodeJS.ProcessEnv;botToken:string;
  post:(text:string)=>Promise<{id:string;chatId?:string;chatType?:string}>;
}) {
  if(!localQualificationAllowed(options.env))throw new Error("Local Telegram qualification is disabled.");
  const key=receiptFromAuth(options.auth);
  // Eve's Telegram post helper splits larger replies into multiple provider
  // writes; this qualification permits one bounded send per claimed receipt.
  if(!options.text.trim()||options.text.length>4096)
    throw new Error("One bounded Telegram reply is required; reconcile this turn before sending.");
  if(!currentOwnerTarget(key,options.env,options.botToken))throw new Error("Owner Telegram target authority changed.");
  const replyTextHash=telegramHash(options.text);
  if(!await options.store.claimReply(key,replyTextHash))return {status:"duplicate" as const};
  if(!localQualificationAllowed(options.env))throw new Error("Local Telegram qualification is disabled before send.");
  if(!currentOwnerTarget(key,options.env,options.botToken))throw new Error("Owner Telegram target authority changed before send.");
  const sent=await options.post(options.text);
  if(!sent.id||sent.chatId!==key.chatId||sent.chatType!=="private")
    throw new Error("Telegram provider reply could not be confirmed. Do not resend automatically.");
  await options.store.confirmReply(key,replyTextHash,sent.id);
  return {status:"replied" as const,providerMessageId:sent.id};
}

/** Local adapter probe only. The exported channel remains release-blocked. */
export function localTelegramQualificationChannel(options: {
  env: NodeJS.ProcessEnv;
  credentials: {botToken:string;webhookSecretToken:string};
  api: NonNullable<TelegramChannelConfig["api"]>;
  rememberChat: (chatId:string)=>Promise<void>;
  receipts: TelegramOwnerReceiptStore;
}) {
  const {env,credentials,api,rememberChat,receipts}=options;
  if(!localQualificationAllowed(env))
    throw new Error("Local Telegram qualification is disabled.");
  const botId=/^(\d{6,20}):[A-Za-z0-9_-]+$/.exec(credentials.botToken)?.[1];
  if(!botId||!credentials.webhookSecretToken)throw new Error("An exact local Telegram bot and webhook secret are required.");
  return telegramChannel({
  botUsername: env.TELEGRAM_BOT_USERNAME ?? "eve_tele_bot",
  credentials,api,
  async onMessage(ctx, message) {
    if (message.chat.type !== "private") return null;
    if (message.from?.isBot === true) return null;

    const fromId = message.from?.id;
    const ownerId=env.MYEVE_OWNER_ID?.trim()||env.SOFIE_OWNER_ID?.trim();
    if (!ownerId || !telegramUserAllowed(fromId,env) || String(fromId)!==message.chat.id ||
      env.TELEGRAM_PROACTIVE_CHAT_ID?.trim()!==message.chat.id ||
      env.TELEGRAM_BOT_TOKEN?.trim()!==credentials.botToken) return null;

    const hasContent = (message.text || message.caption).trim().length > 0 || message.attachments.length > 0;
    if (!hasContent) return null;
    const telegramAuth=defaultTelegramAuth(message);
    if(!telegramAuth)return null;
    const key={ownerId,botId,chatId:message.chat.id,messageId:message.messageId,
      payloadHash:telegramHash({chatId:message.chat.id,messageId:message.messageId,fromId:String(fromId),
        text:message.text,caption:message.caption,attachments:message.attachments})};
    // These setup effects are safe to repeat. They precede the durable claim
    // so their failure cannot strand a turn that was never dispatched.
    await rememberChat(message.chat.id);
    await ctx.telegram.startTyping();
    if(!await receipts.claimInbound(key))return null;
    return { auth: {
      ...telegramAuth,
      issuer:"myeve-telegram-owner",principalId:ownerId,principalType:"user" as const,subject:ownerId,
      attributes:{...telegramAuth.attributes,owner:"true",telegramUserId:String(fromId),
        telegramBotId:botId,telegramPayloadHash:key.payloadHash},
    } };
  },
  events:{
    async "turn.started"(_event,_channel,ctx){await receipts.markTurnStarted(receiptFromAuth(ctx.session.auth.current));},
    async "message.completed"(event,channel,ctx){
      if(event.finishReason==="tool-calls"||!event.message?.trim())return;
      await sendQualifiedTelegramReply({auth:ctx.session.auth.current,text:event.message,store:receipts,
        env,botToken:credentials.botToken,post:text=>channel.telegram.post(text)});
    },
    // These default handlers send Telegram messages. Local qualification has
    // no receipt contract for HITL or error replies, so they stay silent.
    "input.requested"(){},"authorization.required"(){},"authorization.completed"(){},
    "turn.failed"(){},"session.failed"(){},
  },
  uploadPolicy: {
    allowedMediaTypes: ["image/*", "application/pdf"],
    maxBytes: 10 * 1024 * 1024,
  },
  });
}

export default blockedChannel("/eve/v1/telegram");
