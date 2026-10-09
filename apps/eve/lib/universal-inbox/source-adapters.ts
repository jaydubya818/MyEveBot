import { z } from "zod";
import type { Message } from "../../agent/lib/agentmail.ts";
import { envelopeSchema } from "../relay/transport.ts";
import { externalMessage, relayMessage, type SourceContext } from "./adapters.ts";
import { eventSchema, type AttentionEvent, type OwnerAction } from "./contracts.ts";
const ref = z.string().min(1).max(255);
/** Adapters accept already fetched/verified provider data. None fetch, subscribe, or authenticate. */
export function agentMailMessage(message: Message, context: SourceContext) {
  if (message.inbox_id !== context.accountId) throw new Error("SOURCE_ACCOUNT_MISMATCH");
  return eventSchema.parse({ ...externalMessage({ provider: "email", id: message.message_id, sender: message.from,
    threadId: message.thread_id, timestamp: message.timestamp, subject: message.subject || "Email message",
    text: (message.extracted_text ?? message.text ?? message.preview ?? "").slice(0, 4000), reference: message.message_id, attachments: (message.attachments ?? []).map(a => ({ id: a.attachment_id, name: a.filename ?? "Attachment", reference: a.attachment_id })) }, context),
    relation: message.in_reply_to ? "reply" : "update" });
}
const gmailSchema = z.object({ id: ref, threadId: ref, snippet: z.string().max(4000), internalDate: z.string().regex(/^\d{1,16}$/),
  payload: z.object({ headers: z.array(z.object({ name: ref, value: z.string().max(4000) })).max(200) }),
});
export function gmailMessage(raw: unknown, context: SourceContext) {
  const message = gmailSchema.parse(raw);
  const header = (name: string) => message.payload.headers.find(h => h.name.toLowerCase() === name)?.value;
  const at = Number(message.internalDate);
  if (!Number.isSafeInteger(at) || !Number.isFinite(new Date(at).getTime())) throw new Error("INVALID_MESSAGE_TIME");
  return eventSchema.parse({ ...externalMessage({ provider: "email", id: message.id, sender: header("from") ?? "Unknown sender",
    threadId: message.threadId, timestamp: new Date(at).toISOString(), subject: header("subject")?.slice(0, 500) || "Email message",
    text: message.snippet, reference: message.id, attachments: [] }, context), relation: header("in-reply-to") ? "reply" : "update" });
}
const slackSchema = z.object({ type: z.literal("message"), user: ref, channel: ref, ts: z.string().regex(/^\d+\.\d+$/),
  thread_ts: z.string().regex(/^\d+\.\d+$/).optional(), text: z.string().max(4000) }).strict();
export function slackMessage(raw: unknown, context: SourceContext) {
  const message = slackSchema.parse(raw); // unsupported edits/deletes/bot subtypes fail closed for a source-owned adapter
  return eventSchema.parse({ ...externalMessage({ provider: "slack", id: `${message.channel}:${message.ts}`, sender: message.user,
    threadId: `${message.channel}:${message.thread_ts ?? message.ts}`, timestamp: new Date(Number(message.ts) * 1000).toISOString(),
    subject: "Slack message", text: message.text, reference: `${message.channel}:${message.ts}`, attachments: [] }, context),
    relation: message.thread_ts && message.thread_ts !== message.ts ? "reply" : "update" });
}
export function webhookEvent(raw: unknown, context: SourceContext) {
  const event = z.object({ id: ref, type: z.enum(["request", "reply", "information"]), sender: ref, timestamp: z.string().datetime({ offset: true }),
    threadId: ref, title: z.string().min(1).max(500), text: z.string().max(4000) }).strict().parse(raw);
  return eventSchema.parse({ ...externalMessage({ provider: "webhook", id: event.id, sender: event.sender, threadId: event.threadId,
    timestamp: event.timestamp, subject: event.title, text: event.text, reference: event.id, attachments: [] }, context),
    kind: event.type === "request" ? "REQUEST" : "MESSAGE", relation: event.type === "information" ? "update" : event.type });
}
export function relayPeerEvent(raw: unknown, context: SourceContext) {
  const envelope = envelopeSchema.parse(raw);
  if (envelope.capability === "message.send") {
    const payload = envelope.payload as { replyTo?: unknown };
    return eventSchema.parse({ ...relayMessage(envelope, context), relation: typeof payload?.replyTo === "string" ? "reply" : "request" });
  }
  if (envelope.capability !== "work.request") throw new Error("UNSUPPORTED_RELAY_EVENT");
  const payload = z.object({ task: z.string().min(1).max(4000) }).passthrough().parse(envelope.payload);
  const { accountId, ...mapping } = context;
  return eventSchema.parse({ ...mapping, kind: "REQUEST", title: "Peer work request", summary: payload.task, relation: "request",
    source: { system: "relay", accountId, eventId: envelope.id, sender: `relay://${envelope.caller.ownerId}/${envelope.caller.agentId}`,
      threadId: envelope.conversationId ?? null, occurredAt: envelope.createdAt, reference: envelope.id,
      grantId: envelope.authorizationContext.grantId, evidence: [envelope.authorizationContext.policyDecisionId] } });
}
/** Local triage is explicit. Source-supplied words never create an owner decision themselves. */
export function requestOwnerDecision(event: AttentionEvent, action: OwnerAction): AttentionEvent {
  return eventSchema.parse({ ...event, kind: action.kind === "approval" ? "APPROVAL" : "DECISION", action });
}
/** A canonical dependency resolver verified the exact reply before producing this settlement. */
export function replySettlement(reply: AttentionEvent): AttentionEvent {
  if (reply.relation !== "reply") throw new Error("NOT_AN_EXTERNAL_REPLY");
  return eventSchema.parse({ ...reply, action: null, disposition: "resolve", followUpAt: null });
}
