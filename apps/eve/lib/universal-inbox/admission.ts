import { eventSchema, type AttentionEvent, type InboxQuery } from "./contracts.ts";
import { hash } from "./domain.ts";
import { UniversalInbox } from "./service.ts";
import type { SourceContext } from "./adapters.ts";

export interface Admission extends SourceContext {
  projectionHash: string;
  ownerId: string; system: AttentionEvent["source"]["system"]; eventId: string;
  goal?: AttentionEvent["goal"];
  audienceOwnerId: string; visible: boolean; grantActive: boolean; grantId: string | null;
}
export interface SourceAuthority {
  /** Source/backend authenticates exact event and returns its persisted local mapping.
   * Must recheck current account/grant/Work ownership; never trust a body's owner/work fields. */
  admit(ownerId: string, source: AttentionEvent["source"]): Promise<Admission | null>;
  canRead(ownerId: string, source: AttentionEvent["source"]): Promise<boolean>;
}
export async function ingestAuthorized(inbox: UniversalInbox, value: unknown, authority: SourceAuthority) {
  const event = eventSchema.parse(value);
  const admitted = await authority.admit(inbox.ownerId, event.source);
  if (!admitted || !admitted.visible || !admitted.grantActive || admitted.ownerId !== inbox.ownerId || admitted.audienceOwnerId !== inbox.ownerId ||
      admitted.accountId !== event.source.accountId || admitted.system !== event.source.system || admitted.eventId !== event.source.eventId ||
      admitted.grantId !== event.source.grantId) throw new Error("SOURCE_NOT_ADMITTED");
  if (admitted.correlationId !== event.correlationId || admitted.workId !== event.workId || (admitted.episode ?? 1) !== event.episode ||
      admitted.sequence !== event.sequence || (admitted.workGeneration ?? null) !== event.workGeneration || (admitted.workVersion ?? null) !== event.workVersion)
    throw new Error("FORGED_SOURCE_LINKAGE");
  if (hash(admitted.goal ?? null) !== hash(event.goal)) throw new Error("FORGED_SOURCE_LINKAGE");
  if (admitted.projectionHash !== hash(event)) throw new Error("FORGED_SOURCE_PROJECTION");
  return inbox.ingest(event);
}
/** Bounded page; revoked/private source content is removed before any response serialization. */
export async function authorizedPage(inbox: UniversalInbox, query: InboxQuery, authority: SourceAuthority) {
  const page = await inbox.list(query);
  const checks = await Promise.all(page.items.map(item => mayReadHistory(inbox, item.id, authority)));
  return { ...page, items: page.items.filter((_, index) => checks[index]), visibilityFiltered: checks.some(value => !value) };
}
export async function authorizedItem(inbox: UniversalInbox, id: string, authority: SourceAuthority) {
  const item = await inbox.get(id);
  if (!await mayReadHistory(inbox, item.id, authority)) throw new Error("NOT_FOUND");
  return item;
}

async function mayReadHistory(inbox: UniversalInbox, id: string, authority: SourceAuthority) {
  const evidence = await inbox.repository.evidence(inbox.ownerId, id);
  // Fail closed for a longer history until the source owner provides a bounded entitlement summary.
  if (evidence.length === 0 || evidence.length >= 100) return false;
  return (await Promise.all(evidence.map(entry => authority.canRead(inbox.ownerId, entry.event.source)))).every(Boolean);
}
export function authorizedReader(inbox: UniversalInbox, authority: SourceAuthority) {
  return { list: (query = {}) => authorizedPage(inbox, query, authority) };
}
