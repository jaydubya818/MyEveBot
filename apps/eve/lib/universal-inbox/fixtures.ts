import type { ApprovalRequestView } from "../approvals.ts";
import type { Envelope } from "../relay/transport.ts";
import { approvalItem, externalMessage, relayMessage, workEvent, type SourceContext } from "./adapters.ts";
import { eventSchema, type AttentionView, type OwnerAction } from "./contracts.ts";
import { FixtureAttentionRepository } from "./fixture-repository.ts";
import { UniversalInbox } from "./service.ts";

export const FIXTURE_NOW = "2026-09-27T12:00:00.000Z";
export const fixtureContext: SourceContext = { accountId: "fixture-account", correlationId: "work:fixture-work", workId: "fixture-work", sequence: 1 };
export const fixtureDecision: OwnerAction = { id: "choose-provider", kind: "decision", reason: "choice", involvement: "NECESSARY_JUDGMENT",
  prompt: "Choose the provider for this Work.", options: ["A", "B"], expiresAt: null };
export const fixtureRelay: Envelope = {
  id: "relay-message-1", protocol: "relay.federation", version: "1.0",
  caller: { ownerId: "peer-owner", agentId: "peer-agent" }, target: { ownerId: "fixture-owner", agentId: "sofie", address: "relay://fixture-owner/sofie" },
  capability: "message.send", resource: "messages", createdAt: FIXTURE_NOW, expiresAt: "2026-09-28T12:00:00.000Z",
  idempotencyKey: "relay-delivery-1", conversationId: "peer-thread-1", payload: { body: "The provider has sent the options." }, publication: null,
  authorizationContext: { grantId: "peer-grant", policyDecisionId: "peer-policy", localAuthorizationRequired: true },
};
export const fixtureApproval: ApprovalRequestView = {
  id: "fixture-approval", taskId: "fixture-run", goalId: null, goalTaskId: null, agentId: "sofie", roleId: null,
  capabilityId: "tool.send_email", provider: "email", resource: "recipient@example.test", action: "send", actionClass: "send",
  parameters: {}, bindingHash: "a".repeat(64), risk: "high", effects: ["Send the saved message to the named recipient"], estimatedCostUsd: null,
  prompt: "Approve the saved email", requestedBy: "Sofie", requestedAt: FIXTURE_NOW, expiresAt: "2026-09-28T12:00:00.000Z", status: "pending",
  decision: null, decisionReason: null, decidedBy: null, decidedAt: null,
};
export function decisionEvent(sequence = 2) {
  return workEvent({ id: `decision-${sequence}`, state: "decision", title: "Choose provider A or B", summary: "Your choice unblocks this Work.", at: FIXTURE_NOW, action: fixtureDecision }, { ...fixtureContext, sequence })!;
}
export function answerFor(item: AttentionView, idempotencyKey = "fixture-answer") {
  return { itemId: item.id, actionId: item.action!.id, actionBinding: item.actionBinding!, expectedRevision: item.revision, idempotencyKey, answer: "A" };
}
/** Server/test-only adapter. Browser UI should import the generated JSON and contract types. */
export async function createFixtureInbox(path = ":memory:", ownerId = "fixture-owner") {
  const repository = new FixtureAttentionRepository(path);
  const inbox = new UniversalInbox(ownerId, repository, () => FIXTURE_NOW);
  await inbox.ingest(relayMessage(fixtureRelay, fixtureContext));
  await inbox.ingest(decisionEvent());
  await inbox.ingest(approvalItem(fixtureApproval, { ...fixtureContext, correlationId: "approval:fixture-approval", sequence: 1 }));
  await inbox.ingest(externalMessage({ provider: "email", id: "email-1", sender: "partner@example.test", threadId: "email-thread", timestamp: FIXTURE_NOW,
    subject: "External reply", text: "The documents are ready.", reference: "email-1", attachments: [{ id: "attachment-1", name: "proposal.pdf", reference: "provider:attachment-1" }] },
    { ...fixtureContext, correlationId: "email:thread-1", workId: null }));
  await inbox.ingest(eventSchema.parse({ ...decisionEvent(), correlationId: "follow-up:tester", action: null, kind: "FOLLOW_UP", disposition: "waiting",
    title: "Waiting for tester", summary: "Sofie will check the scheduled follow-up.", followUpAt: "2026-09-28T12:00:00.000Z", source: { ...decisionEvent().source, eventId: "tester-wait" } }));
  return { inbox, repository };
}
