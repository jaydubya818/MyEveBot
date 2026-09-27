import type { ApprovalRequestView } from "../approvals.ts";
import type { Envelope } from "../relay/transport.ts";
import { eventSchema, type AttentionEvent, type OwnerAction } from "./contracts.ts";

/** Local mapping, obtained after source authentication and owner-scoped Work lookup. */
export interface SourceContext {
  accountId: string; correlationId: string; workId: string | null; sequence: number; episode?: number;
}
export function relayMessage(envelope: Envelope, context: SourceContext): AttentionEvent {
  if (envelope.capability !== "message.send") throw new Error("NOT_A_RELAY_MESSAGE");
  const body = envelope.payload as { body?: unknown };
  if (!body || typeof body.body !== "string") throw new Error("INVALID_RELAY_MESSAGE");
  const { accountId, ...mapping } = context;
  return eventSchema.parse({ ...mapping,
    kind: "MESSAGE", title: "Message from a Relay peer", summary: body.body.slice(0, 4000),
    source: { system: "relay", accountId, eventId: envelope.id,
      sender: `relay://${envelope.caller.ownerId}/${envelope.caller.agentId}`, threadId: envelope.conversationId ?? null,
      occurredAt: envelope.createdAt, reference: envelope.id, grantId: envelope.authorizationContext.grantId,
      evidence: [envelope.authorizationContext.policyDecisionId] },
  });
}
export interface ExternalMessage {
  provider: "email" | "slack" | "webhook"; id: string; sender: string; threadId: string | null;
  timestamp: string; subject: string; text: string; reference: string;
  attachments: AttentionEvent["source"]["attachments"];
}
export function externalMessage(message: ExternalMessage, context: SourceContext): AttentionEvent {
  const { accountId, ...mapping } = context;
  return eventSchema.parse({ ...mapping, kind: "MESSAGE", title: message.subject, summary: message.text,
    source: { system: message.provider, accountId, eventId: message.id, sender: message.sender, threadId: message.threadId,
      occurredAt: message.timestamp, reference: message.reference, attachments: message.attachments } });
}
export function approvalItem(approval: ApprovalRequestView, context: SourceContext): AttentionEvent {
  const { accountId, ...mapping } = context;
  const action: OwnerAction = {
    id: approval.id, kind: "approval", reason: "approval", involvement: "NECESSARY_JUDGMENT", prompt: approval.prompt,
    options: ["approved", "denied"], expiresAt: approval.expiresAt,
    approval: { id: approval.id, bindingHash: approval.bindingHash, why: approval.prompt.slice(0, 255),
      scope: approval.resource?.slice(0, 255) || approval.capabilityId || approval.action,
      effects: approval.effects.length ? approval.effects : [approval.action] },
  };
  return eventSchema.parse({ ...mapping, kind: "APPROVAL", title: approval.prompt.slice(0, 500), summary: approval.action,
    action: approval.status === "pending" ? action : null,
    disposition: approval.status === "pending" ? "update" : approval.status === "approved" || approval.status === "denied" ? "resolve" : "supersede",
    source: { system: "approval", accountId, eventId: `${approval.id}:${approval.status}`, sender: approval.requestedBy,
      occurredAt: approval.decidedAt ?? approval.requestedAt, reference: approval.id, evidence: [approval.bindingHash, approval.taskId] } });
}
export function reminderOccurrence(input: { id: string; scheduledFor: string; prompt: string; now: string }, context: SourceContext): AttentionEvent | null {
  if (!Number.isFinite(Date.parse(input.scheduledFor)) || !Number.isFinite(Date.parse(input.now))) throw new Error("INVALID_REMINDER_TIME");
  if (Date.parse(input.scheduledFor) > Date.parse(input.now)) return null;
  const { accountId, ...mapping } = context;
  // Reuses the existing dispatcher's occurrence identity; this adapter never schedules or sends.
  return eventSchema.parse({ ...mapping, kind: "REMINDER", title: input.prompt.slice(0, 500), summary: input.prompt,
    source: { system: "reminder", accountId, eventId: `${input.id}:${new Date(input.scheduledFor).toISOString()}`,
      sender: "Sofie", occurredAt: input.scheduledFor, reference: input.id } });
}
export function workEvent(input: { id: string; state: "internal" | "waiting" | "decision" | "retryable_failure" | "owner_recovery" | "completed" | "superseded";
  title: string; summary: string; at: string; action?: OwnerAction; followUpAt?: string }, context: SourceContext): AttentionEvent | null {
  // Coordination and retry loops never produce owner-facing notifications.
  if (input.state === "internal" || input.state === "retryable_failure") return null;
  if (["decision", "owner_recovery"].includes(input.state) && !input.action) throw new Error("OWNER_REASON_REQUIRED");
  const { accountId, ...mapping } = context;
  return eventSchema.parse({ ...mapping, title: input.title, summary: input.summary,
    kind: input.state === "completed" ? "RESULT" : input.state === "waiting" ? "FOLLOW_UP" : input.state === "owner_recovery" ? "EXCEPTION" : "DECISION",
    disposition: input.state === "completed" ? "resolve" : input.state === "superseded" ? "supersede" : input.state === "waiting" ? "waiting" : "update",
    action: input.action ?? null, followUpAt: input.followUpAt ?? null,
    source: { system: "work", accountId, eventId: input.id, sender: "Sofie", occurredAt: input.at, reference: context.workId ?? input.id } });
}
