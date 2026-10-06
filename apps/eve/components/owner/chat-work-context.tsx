"use client";

import { useEffect, useState } from "react";
import { chatWorkOptions, chatWorkOptionLabel, type ChatWorkSelection, type ChatWorkOption } from "@/lib/chat-work-selection";


export function ChatWorkContext({ selection, locked, busy, onChange }: {
  selection?: ChatWorkSelection;
  locked: boolean;
  busy: boolean;
  onChange: (selection: ChatWorkSelection | undefined) => void;
}) {
  const [works, setWorks] = useState<ChatWorkOption[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/chat-work", { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error("Work unavailable");
        const body = await response.json();
        if (body.selectionAvailable === false && selection) throw new Error("Saved Work unavailable");
        setWorks(chatWorkOptions(body.works));
        setStatus("ready");
      }).catch(() => { if (!controller.signal.aborted) setStatus("error"); });
    return () => controller.abort();
  // The thread is remounted when its durable context changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ordinary conversations remain unchanged when there is no existing Work.
  if (!selection && (locked || (status === "ready" && works.length === 0))) return null;
  return <section aria-label="Conversation Work" className="mx-10 mt-3 rounded-xl border border-kumo-line p-3 text-sm">
    {locked ? <p>{selection ? <>Work: <strong>{selection.title}</strong></> : "Conversation context is fixed."}</p> :
      <label className="flex flex-col gap-1">Discuss existing Work
        <select className="min-h-11 max-w-full rounded-md border border-kumo-line bg-kumo-base p-2"
          value={selection?.workId ?? ""} disabled={busy || status !== "ready"}
          onChange={event => {
            const work = works.find(item => item.id === event.target.value);
            onChange(work ? { workId: work.id, title: work.title, intent: "observe" } : undefined);
          }}>
          <option value="">No Work selected</option>
          {works.map(work => <option key={work.id} value={work.id}>{chatWorkOptionLabel(work)}</option>)}
        </select>
      </label>}
    {selection && <label className="mt-2 flex flex-col gap-1">Request type
      <select className="min-h-11 rounded-md border border-kumo-line bg-kumo-base p-2" value={selection.intent}
        disabled={busy} onChange={event => onChange({ ...selection, intent: event.target.value as ChatWorkSelection["intent"] })}>
        <option value="observe">Review progress and results</option>
        <option value="continue">Ask Sofie to continue this Work</option>
      </select>
    </label>}
    {status === "loading" && <p role="status" className="mt-2 text-kumo-subtle">Loading your Work…</p>}
    {status === "error" && <p role="alert" className="mt-2">Work could not be loaded. Refresh to try again.</p>}
    {selection && <p className="mt-2 text-xs text-kumo-subtle">Selecting Work does not start it or change its permissions. Sofie checks permission when you send a message.</p>}
    {locked && <p className="mt-2 text-xs text-kumo-subtle">Start a new conversation to discuss different Work.</p>}
  </section>;
}
