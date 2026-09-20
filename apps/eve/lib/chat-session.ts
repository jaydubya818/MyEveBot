import type { HandleMessageStreamEvent, SessionState } from "eve/client";

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item,
  );
}

/** Keep a persisted transcript and its next unread stream position together. */
export function reconcileChatSession<T extends {
  events?: readonly HandleMessageStreamEvent[];
  session?: SessionState;
}>(chat: T): T {
  if (!chat.session?.sessionId || !chat.events?.length) return chat;
  const seen = new Set<string>();
  const events = chat.events.filter(event => {
    // Only deduplicate replayed wire events, never identical user submissions.
    if (!event.meta?.at) return true;
    const key = stableJson(event);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const start = events.findLastIndex(event => event.type === "session.started");
  // A partial transcript cannot establish an absolute stream position.
  if (start < 0) return chat;
  const waiting = events.slice(start).findLast(event => event.type === "session.waiting");
  return {
    ...chat,
    events,
    session: {
      ...chat.session,
      streamIndex: events.length - start,
      ...(waiting?.type === "session.waiting" ? { continuationToken: waiting.data.continuationToken } : {}),
    },
  };
}
