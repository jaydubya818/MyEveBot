import type { AttentionView, InboxQuery } from "./contracts.ts";
import { UniversalInbox } from "./service.ts";

export function notificationPolicy(item: AttentionView, now: string, settings = { pushSupported: false, ownerOptedIn: false }) {
  const closed = ["RESOLVED", "DISMISSED", "SUPERSEDED"].includes(item.status);
  const important = item.priorityScore >= 100;
  return { inbox: !["DISMISSED", "SUPERSEDED"].includes(item.status), needsYou: item.needsYou,
    today: item.needsYou || (!closed && important && (item.notification === "UNREAD" || item.priority.blockingActiveWork)),
    dailyBrief: item.needsYou || (!closed && important) || item.status === "RESOLVED" || Boolean(item.lastExternalReplyAt)
      || Boolean(item.followUpAt && item.followUpAt <= now && item.status === "WAITING"),
    push: item.needsYou && item.priority.urgency === "urgent" && settings.pushSupported && settings.ownerOptedIn,
    notificationKey: `${item.id}:${item.actionBinding ?? item.sourceSequence}`,
  };
}
export async function todayContribution(inbox: Pick<UniversalInbox, "list">, since: string, until: string) {
  const [needs, needsPage, messages, blocked, resolved] = await Promise.all([
    inbox.list({ view: "needs_you", limit: 100 }), inbox.list({ view: "needs_you", limit: 20 }), inbox.list({ bucket: "important", since, until, limit: 20 }),
    inbox.list({ bucket: "blocked", limit: 20 }), inbox.list({ bucket: "resolved", since, until, limit: 20 }),
  ]);
  return { version: "myeve.attention-feed.v1", needsYouCount: { value: needs.items.length, capped: Boolean(needs.nextCursor) },
    needsYou: needsPage,
    importantMessages: messages, blockedWork: blocked, recentResolutions: resolved };
}
export async function dailyBriefContribution(inbox: Pick<UniversalInbox, "list">, since: string, until: string) {
  const page = (query: InboxQuery) => inbox.list({ ...query, limit: 20 });
  const [newNeedsYou, unresolvedImportant, resolved, externalReplies, followUpsDue] = await Promise.all([
    page({ bucket: "new_needs_you", since, until }), page({ bucket: "unresolved_important" }),
    page({ bucket: "resolved", since, until }), page({ bucket: "external_replies", since, until }), page({ bucket: "follow_up", until }),
  ]);
  return { version: "myeve.attention-feed.v1", window: { after: since, through: until },
    newNeedsYou, unresolvedImportant, resolved, externalReplies, followUpsDue };
}
/** Existing scheduler owns wakeup creation and timezone/recurrence. This is only an intent. */
export function followUpIntent(item: AttentionView) {
  if (item.status !== "WAITING" || !item.followUpAt || !item.waitingFor || item.waitingFor === "owner") return null;
  return { ownerId: item.ownerId, key: `attention-follow-up:${item.id}:${item.followUpAt}`, attentionId: item.id,
    workId: item.workId, correlationId: item.correlationId, dueAt: item.followUpAt, waitingFor: item.waitingFor,
    requiresExistingScheduler: true as const };
}
