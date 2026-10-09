import { z } from "zod";

const draftSchema = z.object({
  target: z.string().regex(/^relay:\/\/[^/\s]+\/[^/\s]+$/),
  body: z.string().trim().min(1).max(16000),
  conversationId: z.string().min(1).max(255),
  replyTo: z.string().min(1).max(255).optional(),
}).strict();

/** A proposal only. The canonical tool resolves the durable resource before approval. */
export function peerMessageDraft(input: unknown, idempotencyKey: string, now = Date.now()) {
  const draft = draftSchema.parse(input);
  return {
    capability: "message.send" as const,
    target: draft.target,
    conversationId: draft.conversationId,
    idempotencyKey,
    expiresAt: new Date(now + 86400000).toISOString(),
    payload: { body: draft.body, ...(draft.replyTo ? { replyTo: draft.replyTo } : {}) },
  };
}
