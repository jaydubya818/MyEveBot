import type { HandleMessageStreamEvent } from "eve/client";

export function latestTurnContextLimit(events: readonly HandleMessageStreamEvent[]): boolean {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.type === "turn.failed") return /\bEXTERNAL_ALPHA_CONTEXT_BOUND\b/.test(event.data.message);
    if (["turn.started", "message.received", "turn.completed", "turn.cancelled"].includes(event.type)) return false;
  }
  return false;
}

/** A recoverable failed turn remains visible after Eve returns to session.waiting. */
export function latestTurnFailed(events: readonly HandleMessageStreamEvent[]): boolean {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.type === "turn.failed") return true;
    if (
      event.type === "turn.started" ||
      event.type === "message.received" ||
      event.type === "turn.completed" ||
      event.type === "turn.cancelled"
    ) return false;
  }
  return false;
}
