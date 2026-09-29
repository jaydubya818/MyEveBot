import { z } from "zod";
import { CONTRACT_VERSION, eventSchema, responseSchema, type InboxQuery, type OwnerResponse, type OwnerResponseInput } from "./contracts.ts";
import { evidenceId, hash, isTerminal, itemId, needsYou, project, view } from "./domain.ts";
import type { AttentionRepository } from "./repository.ts";

const ownerSchema = z.string().trim().min(1).max(255);
/** Construct only after authenticating an owner; do not accept ownerId from a request body. */
export class UniversalInbox {
  readonly ownerId: string;
  constructor(ownerId: string, readonly repository: AttentionRepository, private clock = () => new Date().toISOString()) {
    this.ownerId = ownerSchema.parse(ownerId);
  }
  async ingest(input: unknown) {
    const event = eventSchema.parse(input);
    const now = this.clock();
    return this.repository.transaction(async tx => {
      const id = itemId(this.ownerId, event);
      const key = evidenceId(this.ownerId, event);
      const duplicate = await tx.getEvidence(this.ownerId, key);
      if (duplicate) {
        if (duplicate.digest !== hash(event)) throw new Error("SOURCE_EVENT_ID_CONFLICT");
        await tx.saveEvidence({ ...duplicate, deliveries: duplicate.deliveries + 1 });
        return view((await tx.getItem(this.ownerId, duplicate.itemId))!, now);
      }
      const current = await tx.getItem(this.ownerId, id);
      const next = project(this.ownerId, event, current, now);
      await tx.saveItem(next);
      await tx.saveEvidence({ id: key, itemId: id, ownerId: this.ownerId, digest: hash(event), event, receivedAt: now, deliveries: 1 });
      if (isTerminal(next) && next.responseId) {
        const response = await tx.getResponse(this.ownerId, next.responseId);
        if (response?.status === "PENDING") await tx.saveResponse({ ...response, status: "CANCELLED", receipt: "source_settled" });
      }
      return view(next, now);
    });
  }
  async replace(previous: unknown, replacement: unknown) {
    const oldEvent = eventSchema.parse(previous);
    const newEvent = eventSchema.parse(replacement);
    if (oldEvent.disposition !== "supersede" || !newEvent.action || oldEvent.correlationId !== newEvent.correlationId ||
        newEvent.episode <= oldEvent.episode || oldEvent.workId !== newEvent.workId) throw new Error("INVALID_REPLACEMENT");
    return this.repository.transaction(async tx => {
      // Reuse the service inside the existing transaction; no nested database transaction.
      const local = new UniversalInbox(this.ownerId, { ...this.repository, transaction: async run => run(tx) } as AttentionRepository, this.clock);
      await local.ingest(oldEvent);
      return local.ingest(newEvent);
    });
  }
  async list(query: InboxQuery = {}) {
    const now = this.clock();
    const result = await this.repository.list(this.ownerId, query, now);
    return { version: CONTRACT_VERSION, items: result.items.map(item => view(item, now)), nextCursor: result.nextCursor };
  }
  async get(id: string) {
    const item = await this.repository.get(this.ownerId, id);
    if (!item) throw new Error("NOT_FOUND");
    return view(item, this.clock());
  }
  async mark(id: string, operation: "mark_read" | "mark_unread" | "dismiss", expectedRevision: number) {
    if (!["mark_read", "mark_unread", "dismiss"].includes(operation)) throw new Error("INVALID_OPERATION");
    return this.repository.transaction(async tx => {
      const item = await tx.getItem(this.ownerId, id);
      if (!item) throw new Error("NOT_FOUND");
      if (item.revision !== expectedRevision) throw new Error("STALE_ITEM");
      if (!view(item, this.clock()).availableActions.includes(operation)) throw new Error("ACTION_NOT_AVAILABLE");
      item.notification = operation === "mark_unread" ? "UNREAD" : "READ";
      item.seenAt = operation === "mark_unread" ? null : this.clock();
      if (operation === "dismiss") item.status = "DISMISSED";
      else if (item.status === "NEW" && operation === "mark_read") item.status = "SEEN";
      item.updatedAt = this.clock(); item.revision++;
      await tx.saveItem(item);
      return view(item, this.clock());
    });
  }
  async respond(raw: OwnerResponseInput) {
    const input = responseSchema.parse(raw);
    return this.repository.transaction(async tx => {
      const id = `response_${hash([this.ownerId, input.idempotencyKey])}`;
      const prior = await tx.getResponse(this.ownerId, id);
      if (prior) {
        if (prior.itemId !== input.itemId || prior.action.id !== input.actionId || prior.actionBinding !== input.actionBinding || prior.answer !== input.answer) throw new Error("RESPONSE_ID_CONFLICT");
        return prior;
      }
      const item = await tx.getItem(this.ownerId, input.itemId);
      if (!item) throw new Error("NOT_FOUND");
      if (item.revision !== input.expectedRevision || !needsYou(item, this.clock()) || !item.action || item.action.id !== input.actionId || item.actionBinding !== input.actionBinding) throw new Error("STALE_ACTION");
      if (item.action.options.length && !item.action.options.includes(input.answer)) throw new Error("INVALID_CHOICE");
      const response: OwnerResponse = { correlationId: item.correlationId, episode: item.episode, workGeneration: item.workGeneration, workVersion: item.workVersion, goal: item.goal, id, ownerId: this.ownerId, itemId: item.id, workId: item.workId, action: item.action,
        actionBinding: input.actionBinding, answer: input.answer, createdAt: this.clock(), status: "PENDING", receipt: null };
      item.responseId = id; item.status = "WAITING"; item.notification = "READ"; item.seenAt = this.clock(); item.updatedAt = this.clock(); item.revision++;
      await tx.saveResponse(response);
      await tx.saveItem(item);
      return response;
    });
  }
  /** The consumer must enforce current canonical authority AND dedupe by response.id. */
  async deliver(consumer: ResponseConsumer, limit = 20): Promise<number> {
    let count = 0;
    for (const response of await this.repository.pending(this.ownerId, Math.min(100, Math.max(1, limit)))) {
      const item = await this.repository.get(this.ownerId, response.itemId);
      if (!item || isTerminal(item)) continue;
      // A crash after accept() is safe only when the consumer uses the stable idempotency key.
      const result = await consumer.accept(response);
      const receipt = typeof result === "string" ? result : result.receipt;
      const stale = typeof result !== "string" && result.status === "stale";
      if (!receipt || receipt.length > 2000) throw new Error("INVALID_CONSUMER_RECEIPT");
      await this.repository.transaction(async tx => {
        const current = await tx.getItem(this.ownerId, response.itemId);
        const pending = await tx.getResponse(this.ownerId, response.id);
        if (!current || pending?.status !== "PENDING") return;
        await tx.saveResponse({ ...pending, status: stale ? "STALE" : "DELIVERED", receipt });
        if (!isTerminal(current)) {
          current.status = stale ? "SUPERSEDED" : "RESOLVED";
          if (stale) current.supersededAt = this.clock(); else current.resolvedAt = this.clock(); current.action = null; current.actionBinding = null;
          current.updatedAt = this.clock(); current.revision++;
          await tx.saveItem(current);
        }
      });
      count++;
    }
    return count;
  }
}
export interface ResponseConsumer {
  /** Durable idempotency by response.id is required; receiving a response grants no execution authority. */
  accept(response: OwnerResponse): Promise<string | { status: "accepted" | "stale"; receipt: string }>;
}
