import { defineState } from "eve/context";
import type { QdevTurnRecord } from "../../lib/qualification/turn-route.ts";

/**
 * The route of the owner's latest message in a QDEV installation, decided once at `message.received` (agent/hooks/owner-chat-run.ts) and
 * read by the model selection, the journey tool and the budget/accounting hooks of every step of that turn. Durable per session, never
 * shared with subagents. Absent (null) means "not recorded": every reader then treats the turn as a JOURNEY turn (free, isolated).
 */
const turn = defineState<{ record: QdevTurnRecord | null }>("myeve.qdev.turn-route", () => ({ record: null }));

/** Never throws: without an active eve context nothing is recorded, and an unrecorded turn is a JOURNEY turn. */
export function recordQdevTurn(record: QdevTurnRecord | null): void {
  try { turn.update(() => ({ record })); } catch { /* unrecorded => JOURNEY */ }
}
/** The recorded turn, or null when nothing was recorded or no eve context is active (never throws). */
export function recordedQdevTurn(): QdevTurnRecord | null {
  try { return turn.get().record ?? null; } catch { return null; }
}
/** True when this QDEV turn was positively recorded as ordinary chat. Only then do the ordinary run budget and accounting apply. */
export const qdevChatTurn = (): boolean => recordedQdevTurn()?.route === "CHAT";
