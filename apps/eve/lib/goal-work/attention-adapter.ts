import type { NeedsYouItem } from "./contracts.ts";
/** Structural adapter for the unmerged myeve.attention.v1 AttentionEvent contract.
 * Inbox owns response binding, authentication, notification and delivery. */
export function goalAttentionEvent(item: NeedsYouItem) {
  return {
    kind: "DECISION" as const,
    title: item.title,
    summary: "A choice is needed to continue this Goal.",
    source: {
      system: "notification" as const,
      accountId: item.ownerId,
      eventId: `${item.id}:${item.revision}`,
      sender: "Sofie",
      threadId: null,
      occurredAt: item.updatedAt,
      reference: item.id,
      grantId: null,
      attachments: [],
      evidence: [],
    },
    correlationId: item.id,
    episode: 1,
    sequence: item.revision,
    workId: null,
    action: {
      id: item.id,
      kind: "decision" as const,
      reason: "choice" as const,
      involvement: "NECESSARY_JUDGMENT" as const,
      prompt: item.title,
      options: item.options,
      expiresAt: null,
    },
    disposition: "update" as const,
    priority: {
      blockingActiveWork: false,
      deadlineAt: null,
      urgency: "normal" as const,
      ownerRequested: false,
      dependencyCount: 1,
      sourceImportance: 0,
    },
    followUpAt: null,
  };
}
/** The consumer must apply a whole Goal snapshot only when its revision exceeds
 * the stored revision, then supersede missing episodes. A stale snapshot cannot
 * revive a resolved question. This module creates no separate Inbox storage. */
export const ATTENTION_CONTRACT = "myeve.attention.v1" as const;
