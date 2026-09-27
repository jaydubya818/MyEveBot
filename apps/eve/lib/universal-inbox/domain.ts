import { createHash } from "node:crypto";
import { CONTRACT_VERSION, type AttentionEvent, type AttentionItem, type AttentionView } from "./contracts.ts";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, entry]) => [key, canonical(entry)]));
  return value;
}
export function hash(value: unknown): string { return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex"); }
export function itemId(ownerId: string, event: AttentionEvent): string { return `attention_${hash([ownerId, event.correlationId, event.episode])}`; }
export function evidenceId(ownerId: string, event: AttentionEvent): string { return hash([ownerId, event.source.system, event.source.accountId, event.source.eventId]); }
export function isTerminal(item: AttentionItem): boolean { return ["RESOLVED", "DISMISSED", "SUPERSEDED"].includes(item.status); }
export function needsYou(item: AttentionItem, now: string): boolean {
  return item.status === "NEEDS_ACTION" && item.action !== null
    && item.action.involvement === "NECESSARY_JUDGMENT"
    && item.action.reason !== "internal_coordination"
    && (!item.action.expiresAt || item.action.expiresAt > now);
}
export function view(item: AttentionItem, now: string): AttentionView {
  const actionable = needsYou(item, now);
  return { ...item, needsYou: actionable, availableActions: [item.notification === "READ" ? "mark_unread" : "mark_read",
    ...(!isTerminal(item) && !item.action && !item.responseId ? ["dismiss" as const] : []), ...(actionable ? ["respond" as const] : [])] };
}
export function priorityScore(priority: AttentionEvent["priority"]): number {
  return Number(priority.blockingActiveWork) * 10000 + Number(priority.urgency === "urgent") * 1000
    + Number(priority.ownerRequested) * 100 + Math.min(priority.dependencyCount, 50) + priority.sourceImportance * 10;
}
/** A closed episode never reopens. A new request requires a new explicit episode. */
export function project(ownerId: string, event: AttentionEvent, current: AttentionItem | null, now: string): AttentionItem {
  if (current?.workId && event.workId && current.workId !== event.workId) throw new Error("WORK_LINK_CHANGED");
  if (current?.workGeneration != null && event.workGeneration != null &&
      (current.workGeneration !== event.workGeneration || current.workVersion !== event.workVersion)) throw new Error("WORK_BINDING_REQUIRES_NEW_EPISODE");
  if (current?.goal && event.goal && hash(current.goal) !== hash(event.goal)) throw new Error("GOAL_BINDING_CHANGED");
  if (current && event.sequence <= current.sourceSequence) return current;
  if (current?.responseId && ((event.workGeneration != null && current.workGeneration !== event.workGeneration) ||
      (event.goal && hash(current.goal) !== hash(event.goal)))) throw new Error("RESPONSE_WORK_LINK_FROZEN");
  if (current?.responseId && event.workId && current.workId !== event.workId) throw new Error("RESPONSE_WORK_LINK_FROZEN");
  if (current && !isTerminal(current) && event.action && current.action && hash(event.action) !== current.actionBinding) throw new Error("ACTION_REQUIRES_NEW_EPISODE");
  const item: AttentionItem = current ? { ...current } : {
    version: CONTRACT_VERSION, id: itemId(ownerId, event), ownerId, correlationId: event.correlationId, episode: event.episode,
    workId: event.workId, kind: event.kind, status: "NEW", title: event.title, summary: event.summary,
    revision: 0, sourceSequence: -1, createdAt: now, updatedAt: now, seenAt: null, notification: "UNREAD",
    source: event.source, priority: event.priority, priorityScore: 0, action: null, actionBinding: null, followUpAt: null, responseId: null,
    workGeneration: event.workGeneration, workVersion: event.workVersion, goal: event.goal, waitingFor: event.waitingFor,
    actionRequiredAt: null, resolvedAt: null, supersededAt: null, lastExternalReplyAt: null, lastMessageAt: null,
  };
  item.workId = item.workId ?? event.workId;
  item.workGeneration = item.workGeneration ?? event.workGeneration;
  item.workVersion = item.workVersion ?? event.workVersion;
  item.goal = item.goal ?? event.goal;
  if (["relay", "email", "slack", "webhook"].includes(event.source.system)) {
    item.lastMessageAt = now;
    if (event.relation === "reply") item.lastExternalReplyAt = now;
  }
  item.sourceSequence = event.sequence;
  item.revision++;
  item.updatedAt = now;
  // Terminal state and any pending answer win over late source requests.
  if (isTerminal(item)) {
    if (item.status === "RESOLVED" && event.kind === "RESULT" && !event.action) {
      item.kind = "RESULT"; item.title = event.title; item.summary = event.summary;
      item.source = event.source; item.notification = "UNREAD";
      item.priority = event.priority; item.priorityScore = priorityScore(event.priority); item.followUpAt = event.followUpAt;
    }
    return item;
  }
  item.kind = event.kind;
  item.title = event.title;
  item.summary = event.summary;
  item.source = event.source;
  item.priority = event.priority;
  item.priorityScore = priorityScore(event.priority);
  item.followUpAt = event.followUpAt;
  item.waitingFor = event.waitingFor;
  item.notification = "UNREAD";
  if (event.disposition === "resolve" || event.disposition === "supersede") {
    item.status = event.disposition === "resolve" ? "RESOLVED" : "SUPERSEDED";
    if (item.status === "RESOLVED") item.resolvedAt = now;
    else item.supersededAt = now;
    item.action = null;
    item.actionBinding = null;
  } else if (!item.responseId && event.action) {
    item.actionRequiredAt ??= now;
    item.action = event.action;
    item.actionBinding = hash(event.action);
    item.status = event.action.involvement === "NECESSARY_JUDGMENT" ? "NEEDS_ACTION" : "WAITING";
  } else if (!item.action && !item.responseId) {
    item.status = event.disposition === "waiting" ? "WAITING" : "NEW";
  }
  return item;
}
