import { goalAttentionEvent } from "./attention-adapter.ts";
import { contractDigest } from "./canonical-adapter.ts";
import type { GoalWorkService } from "./service.ts";
export interface InboxResponse {
  id: string;
  ownerId: string;
  itemId: string;
  workId: string | null;
  action: {
    id: string;
    kind: string;
    reason: string;
    involvement: string;
    prompt: string;
    options: string[];
    expiresAt: string | null;
  };
  actionBinding: string;
  answer: string;
  status: "PENDING" | "DELIVERED" | "CANCELLED";
}
export interface InboxResponseReader {
  read(ownerId: string, responseId: string): Promise<InboxResponse | null>;
  /** Resolve registered source correlation, never parse model text or scan all Goals. */
  context(
    ownerId: string,
    actionId: string,
  ): Promise<{ goalId: string } | null>;
}
export class GoalInboxConsumer {
  constructor(
    readonly service: GoalWorkService,
    readonly responses: InboxResponseReader,
  ) {}
  async accept(delivery: InboxResponse): Promise<string> {
    const response = await this.responses.read(
      this.service.ownerId,
      delivery.id,
    );
    const identity = (r: InboxResponse) => [
      r.ownerId,
      r.itemId,
      r.action,
      r.actionBinding,
      r.answer,
    ];
    if (
      !response ||
      response.ownerId !== this.service.ownerId ||
      contractDigest(identity(response)) !== contractDigest(identity(delivery))
    )
      throw new Error("Untrusted Inbox response");
    const eventId = `inbox:${response.id}`;
    const evidenceRef = `inbox-response:${response.id}:${contractDigest(identity(response))}`;
    const [prior] = await this.service.database.query(
      "SELECT payload FROM goal_work_signals WHERE owner_id=$1 AND event_id=$2",
      [this.service.ownerId, eventId],
    );
    if (prior) {
      if (prior.payload.evidenceRef !== evidenceRef)
        throw new Error("Inbox response identity conflict");
      await this.service.tick(prior.payload.goalId);
      return `goal-response:${response.id}`;
    }
    if (response.status === "CANCELLED")
      return `goal-response-cancelled:${response.id}`;
    // The lookup is owner-scoped. A missing current generation settles as stale,
    // never restates the Goal or creates new authority.
    const context = await this.responses.context(
      this.service.ownerId,
      response.action.id,
    );
    const item = context
      ? (await this.service.needsYou(context.goalId)).find(
          (i) => i.id === response.action.id,
        )
      : undefined;
    if (!item) return `goal-response-stale:${response.id}`;
    const event = goalAttentionEvent(item);
    const expectedItemId = `attention_${contractDigest([this.service.ownerId, event.correlationId, event.episode])}`;
    if (
      response.itemId !== expectedItemId ||
      response.workId !== null ||
      response.actionBinding !== contractDigest(event.action) ||
      contractDigest(response.action) !== contractDigest(event.action) ||
      !item.options.includes(response.answer)
    )
      throw new Error("Stale Inbox action binding");
    await this.service.receive({
      ownerId: item.ownerId,
      goalId: item.goalId,
      taskId: item.taskId,
      goalGeneration: item.goalGeneration,
      taskGeneration: item.taskGeneration,
      eventId,
      dependencyId: item.dependencyId,
      kind: "owner",
      reference: item.reference,
      evidenceRef,
      option: response.answer,
    });
    return `goal-response:${response.id}`;
  }
}
/** External waiting is a FOLLOW_UP with no action and no execution schedule. The
 * Inbox's existing follow-up delivery owns timing; Goals only supplies context. */
export function goalFollowUp(item: {
  ownerId: string;
  id: string;
  label: string;
  reference: string;
  revision: number;
  at: string;
  followUpAt: string | null;
}) {
  return {
    kind: "FOLLOW_UP" as const,
    title: item.label,
    summary: "Waiting for an external dependency.",
    source: {
      system: "notification" as const,
      accountId: item.ownerId,
      eventId: `${item.id}:${item.revision}`,
      sender: "Sofie",
      threadId: null,
      occurredAt: item.at,
      reference: item.reference,
      grantId: null,
      attachments: [],
      evidence: [],
    },
    correlationId: item.id,
    episode: 1,
    sequence: item.revision,
    workId: null,
    action: null,
    disposition: "waiting" as const,
    priority: {
      blockingActiveWork: false,
      deadlineAt: null,
      urgency: "normal" as const,
      ownerRequested: false,
      dependencyCount: 1,
      sourceImportance: 0,
    },
    followUpAt: item.followUpAt,
  };
}
