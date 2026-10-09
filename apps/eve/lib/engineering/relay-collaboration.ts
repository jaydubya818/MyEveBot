import { createHash } from "node:crypto";
import { z } from "zod";
import { projectPeerMessageResult } from "../relay/message-result.ts";

const reference = z.string().min(1).max(255);
const peer = z.string().regex(/^relay:\/\/[^/\s]+\/[^/\s]+$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const timestamp = z.iso.datetime();
const revision = z.number().int().positive();
const MAX_BYTES = 4000;
const MAX_GRANT_AGE_MS = 30_000;

const workSchema = z.object({
  ownerId: reference, agentId: reference, workId: z.uuid(),
  workVersion: revision, workGeneration: revision,
  lifecycle: z.enum(["active", "accepted", "cancelled", "failed", "superseded"]),
  control: z.enum(["agent", "human", "paused", "stopping"]),
}).strict();
export type RelayCollaborationWork = z.infer<typeof workSchema>;

/** Trusted local adapter input, never a model argument or a remote response.
 * Qualification and current grant readback must be established by the adapter.
 * This seam does not inspect grants or replace the Action Gateway. */
const grantSchema = z.object({
  ownerId: reference, agentId: reference, peer, grantId: reference,
  grantRevision: revision, capability: z.literal("message.send"),
  status: z.enum(["ACTIVE", "REVOKED"]), qualified: z.boolean(),
  checkedAt: timestamp, expiresAt: timestamp,
}).strict();
export type RelayCollaborationGrant = z.infer<typeof grantSchema>;

const bindingSchema = workSchema.omit({ lifecycle: true, control: true }).extend({
  requestId: reference, peer, grantId: reference, grantRevision: revision,
  disclosureHash: hash, createdAt: timestamp, deadline: timestamp,
}).strict();
export type RelayCollaborationBinding = z.infer<typeof bindingSchema>;

const receiptSchema = z.object({
  binding: bindingSchema, body: z.string().min(1).max(MAX_BYTES),
  bodyHash: hash, receivedAt: timestamp, trust: z.literal("ADVISORY_ONLY"),
}).strict();
export type RelayCollaborationReceipt = z.infer<typeof receiptSchema>;

export function relayDisclosureHash(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

function boundedBody(body: string) {
  if (!body.trim() || Buffer.byteLength(body, "utf8") > MAX_BYTES || body.includes("\0"))
    throw new Error("Relay collaboration requires bounded selected text.");
}

function assertCurrent(binding: RelayCollaborationBinding, work: RelayCollaborationWork,
  grant: RelayCollaborationGrant, now: number) {
  if (!Number.isFinite(now)) throw new Error("Invalid observation time.");
  if (work.lifecycle !== "active" || work.control !== "agent" || work.ownerId !== binding.ownerId ||
      work.agentId !== binding.agentId || work.workId !== binding.workId ||
      work.workVersion !== binding.workVersion || work.workGeneration !== binding.workGeneration)
    throw new Error("Relay collaboration Work is no longer current.");
  if (grant.ownerId !== binding.ownerId || grant.agentId !== binding.agentId ||
      grant.peer !== binding.peer || grant.grantId !== binding.grantId ||
      grant.grantRevision !== binding.grantRevision || grant.status !== "ACTIVE" || !grant.qualified ||
      Date.parse(grant.expiresAt) <= now || Date.parse(grant.checkedAt) > now ||
      now - Date.parse(grant.checkedAt) > MAX_GRANT_AGE_MS)
    throw new Error("Relay collaboration requires current exact peer authority.");
  if (Date.parse(binding.createdAt) > now || Date.parse(binding.deadline) <= now ||
      Date.parse(binding.deadline) > Date.parse(grant.expiresAt))
    throw new Error("Relay collaboration deadline is no longer valid.");
}

/** The trusted caller supplies the hash of the exact locally approved disclosure.
 * No memory selector, query, credentials, or Work authority enters the payload.
 * Persist the binding before dispatch; reuse requestId after an unknown outcome. */
export function prepareRelayCollaboration(input: {
  work: RelayCollaborationWork; grant: RelayCollaborationGrant;
  requestId: string; body: string; approvedDisclosureHash: string; deadline: string;
}, now = Date.now()) {
  const work = workSchema.parse(input.work), grant = grantSchema.parse(input.grant);
  boundedBody(input.body);
  const disclosureHash = relayDisclosureHash(input.body);
  if (hash.parse(input.approvedDisclosureHash) !== disclosureHash)
    throw new Error("Relay disclosure differs from the exact approved text.");
  const binding = bindingSchema.parse({
    ownerId: work.ownerId, agentId: work.agentId, workId: work.workId,
    workVersion: work.workVersion, workGeneration: work.workGeneration,
    requestId: input.requestId, peer: grant.peer, grantId: grant.grantId,
    grantRevision: grant.grantRevision, disclosureHash,
    createdAt: new Date(now).toISOString(), deadline: input.deadline,
  });
  assertCurrent(binding, work, grant, now);
  return { binding, payload: { body: input.body } };
}

export type RelayCollaborationObservation =
  | { status: "ATTACH"; receipt: RelayCollaborationReceipt }
  | { status: "DUPLICATE" }
  | { status: "WAITING" | "UNKNOWN" | "DENIED" };

/** Pure readback boundary. authenticatedPeer must come from verified transport,
 * not the response body. previous must be the durable receipt for this binding.
 * A future store must compare/insert atomically while rechecking Work and grants;
 * this function alone does not provide durable or concurrent deduplication. */
export function observeRelayCollaboration(input: {
  binding: RelayCollaborationBinding; work: RelayCollaborationWork;
  grant: RelayCollaborationGrant; authenticatedPeer: string;
  response: unknown; previous?: RelayCollaborationReceipt;
}, now = Date.now()): RelayCollaborationObservation {
  const binding = bindingSchema.parse(input.binding);
  assertCurrent(binding, workSchema.parse(input.work), grantSchema.parse(input.grant), now);
  if (peer.parse(input.authenticatedPeer) !== binding.peer)
    throw new Error("Relay response came from a different peer.");
  // The legacy projector accepts an absent outer ID. Work attachment requires it.
  const outer = z.object({ requestId: reference }).passthrough().safeParse(input.response);
  if (!outer.success || outer.data.requestId !== binding.requestId)
    throw new Error("Relay response lacks the exact request identity.");
  const result = projectPeerMessageResult(input.response, binding.requestId, binding.peer);
  let previous: RelayCollaborationReceipt | undefined;
  if (input.previous) {
    previous = receiptSchema.parse(input.previous);
    boundedBody(previous.body);
    if (JSON.stringify(previous.binding) !== JSON.stringify(binding) ||
        previous.bodyHash !== relayDisclosureHash(previous.body) ||
        Date.parse(previous.receivedAt) < Date.parse(binding.createdAt) ||
        Date.parse(previous.receivedAt) >= Date.parse(binding.deadline) || Date.parse(previous.receivedAt) > now)
      throw new Error("Stored Relay receipt does not match this Work request.");
  }
  if (["REJECTED", "REVOKED", "CANCELLED", "EXPIRED", "FAILED"].includes(result.status))
    return { status: "DENIED" };
  if (result.status !== "COMPLETED")
    return { status: ["QUEUED", "RUNNING", "PENDING"].includes(result.status) ? "WAITING" : "UNKNOWN" };
  const reply = "result" in result ? result.result?.reply : undefined;
  if (!reply) return { status: "UNKNOWN" }; // Delivery acknowledgment is not an answer.
  boundedBody(reply.body);
  const bodyHash = relayDisclosureHash(reply.body);
  if (previous) {
    if (previous.bodyHash !== bodyHash) throw new Error("Relay returned a conflicting duplicate answer.");
    return { status: "DUPLICATE" };
  }
  return { status: "ATTACH", receipt: {
    binding, body: reply.body, bodyHash, receivedAt: new Date(now).toISOString(), trust: "ADVISORY_ONLY",
  } };
}
