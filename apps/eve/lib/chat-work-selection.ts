import type { Work } from "./engineering/types";

/** Browser context only. Server-side owner, Work and grant checks remain authoritative. */
export interface ChatWorkSelection {
  workId: string;
  title: string;
  intent: "observe" | "continue";
}

const workIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

export function chatWorkHeaders(selection: ChatWorkSelection | undefined): Record<string, string> {
  if (selection === undefined) return {};
  if (!workIdPattern.test(selection.workId) || !["observe", "continue"].includes(selection.intent)) {
    throw new Error("Saved Work context is invalid. Open a new conversation.");
  }
  return {
    "x-myeve-engineering-work-id": selection.workId,
    "x-myeve-engineering-intent": selection.intent,
  };
}

/** Once a conversation has started, its history must not cross a Work boundary. */
export function changeChatWork(
  current: ChatWorkSelection | undefined,
  next: ChatWorkSelection | undefined,
  locked: boolean,
): ChatWorkSelection | undefined {
  chatWorkHeaders(next);
  if (locked && current?.workId !== next?.workId) {
    throw new Error("Open a new conversation to select different Work.");
  }
  return next;
}

export type ChatWorkOption = Pick<Work, "id" | "title" | "lifecycle" | "control">;
export function chatWorkOptions(value: unknown): ChatWorkOption[] {
  if (!Array.isArray(value)) throw new Error("Work list unavailable");
  return value.map(work => {
    if (!work || typeof work.id !== "string" || !workIdPattern.test(work.id) ||
      typeof work.title !== "string" || typeof work.lifecycle !== "string" || typeof work.control !== "string") {
      throw new Error("Work list unavailable");
    }
    return { id: work.id, title: work.title, lifecycle: work.lifecycle, control: work.control };
  });
}

export function chatWorkOptionLabel(work: ChatWorkOption): string {
  return `${work.title} · ${work.control === "paused" ? "Paused" : work.lifecycle}`;
}
