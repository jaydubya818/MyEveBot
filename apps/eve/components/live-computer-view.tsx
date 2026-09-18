"use client";

import { Button, Loader } from "@cloudflare/kumo";
import { ArrowClockwiseIcon, EyeIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from "react";

import type { ComputerSessionView } from "@/lib/computer-types";

function freshness(observedAt: string | null, now: number): { label: string; delayed: boolean } {
  if (!observedAt) return { label: "Waiting for first frame", delayed: true };
  const seconds = Math.max(0, Math.round((now - new Date(observedAt).getTime()) / 1000));
  return seconds <= 5 ? { label: seconds <= 1 ? "Live · Updated now" : `Live · Updated ${seconds}s ago`, delayed: false }
    : { label: `View delayed · Last update ${seconds}s ago`, delayed: true };
}

export function LiveComputerView({ session, desktopInput }: { session: ComputerSessionView; desktopInput: boolean }) {
  const [watching, setWatching] = useState(session.control.controller === "OWNER");
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [observedAt, setObservedAt] = useState<string | null>(null);
  const [viewError, setViewError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(Date.now());
  const imageRef = useRef<HTMLImageElement | null>(null);
  const clickTimer = useRef<number | null>(null);
  const lastMove = useRef(0);
  const frameRequestInFlight = useRef(false);
  const ownerEnabled = session.control.controller === "OWNER" && session.control.ownerInputEnabled && desktopInput;

  useEffect(() => { if (session.control.controller === "OWNER") setWatching(true); }, [session.control.controller]);
  useEffect(() => () => { if (frameUrl) URL.revokeObjectURL(frameUrl); }, [frameUrl]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1_000); return () => window.clearInterval(timer); }, []);

  const loadFrame = useCallback(async () => {
    if (!session.runId || !session.browser?.id || !watching || frameRequestInFlight.current) return;
    frameRequestInFlight.current = true;
    setLoading(true);
    try {
      const params = new URLSearchParams({ runId: session.runId, browserSessionId: session.browser.id });
      const response = await fetch(`/api/computer-sessions/${session.id}/live-view?${params}`, { cache: "no-store" });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? "Live view is unavailable.");
      }
      const nextUrl = URL.createObjectURL(await response.blob());
      setFrameUrl((previous) => { if (previous) URL.revokeObjectURL(previous); return nextUrl; });
      setObservedAt(response.headers.get("x-live-observed-at") ?? new Date().toISOString());
      setViewError(null);
    } catch (error) {
      setViewError(error instanceof Error ? error.message : "Live view is unavailable.");
    } finally { frameRequestInFlight.current = false; setLoading(false); }
  }, [session.browser?.id, session.id, session.runId, watching]);

  useEffect(() => {
    if (!watching) return;
    void loadFrame();
    const timer = window.setInterval(() => void loadFrame(), 2_000);
    return () => window.clearInterval(timer);
  }, [loadFrame, watching]);

  async function send(input: Record<string, unknown>) {
    if (!ownerEnabled || !session.runId || !session.browser?.id) return;
    try {
      const response = await fetch(`/api/computer-sessions/${session.id}/owner-input`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: session.runId, browserSessionId: session.browser.id, controlVersion: session.control.version, input }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? "Owner input was rejected.");
      }
    } catch (error) { setViewError(error instanceof Error ? error.message : "Owner input was rejected."); }
  }

  function point(event: PointerEvent | WheelEvent): { x: number; y: number } | null {
    const image = imageRef.current; if (!image) return null;
    const rect = image.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return { x: Math.round((event.clientX - rect.left) * image.naturalWidth / rect.width), y: Math.round((event.clientY - rect.top) * image.naturalHeight / rect.height) };
  }

  function pointerUp(event: PointerEvent<HTMLDivElement>) {
    const position = point(event); if (!position || !ownerEnabled) return;
    if (clickTimer.current) { window.clearTimeout(clickTimer.current); clickTimer.current = null; void send({ type: "doubleClick", ...position, button: "left" }); return; }
    clickTimer.current = window.setTimeout(() => { clickTimer.current = null; void send({ type: "click", ...position, button: "left" }); }, 220);
  }

  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!ownerEnabled || Date.now() - lastMove.current < 80) return;
    const position = point(event); if (!position) return;
    lastMove.current = Date.now(); void send({ type: "pointerMove", ...position });
  }

  function wheel(event: WheelEvent<HTMLDivElement>) {
    const position = point(event); if (!position || !ownerEnabled) return;
    event.preventDefault(); void send({ type: "scroll", ...position, deltaX: event.deltaX, deltaY: event.deltaY });
  }

  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!ownerEnabled || event.repeat) return;
    event.preventDefault();
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) { void send({ type: "text", text: event.key }); return; }
    const modifiers = (event.altKey ? 1 : 0) | (event.ctrlKey ? 2 : 0) | (event.metaKey ? 4 : 0) | (event.shiftKey ? 8 : 0);
    void send({ type: "key", key: event.key, code: event.code, modifiers });
  }

  const status = freshness(observedAt, now);
  if (!session.control.capabilities.liveView) return null;
  return <section className="mt-6" aria-labelledby="live-computer-heading">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 id="live-computer-heading" className="text-xs font-semibold uppercase tracking-[0.12em] text-kumo-subtle">Live computer</h3><p className="mt-1 text-xs text-kumo-subtle" role="status" aria-live="polite">{watching ? status.label : "Watch is read-only and does not change control."}</p></div><div className="flex gap-2"><Button size="sm" variant="secondary" icon={watching ? ArrowClockwiseIcon : EyeIcon} onClick={() => watching ? void loadFrame() : setWatching(true)}>{watching ? "Refresh view" : "Watch Computer"}</Button>{watching && session.control.controller !== "OWNER" && <Button size="sm" variant="secondary" onClick={() => setWatching(false)}>Close view</Button>}</div></div>
    {watching && <div className="mt-3 overflow-hidden rounded-xl border border-kumo-hairline bg-black">
      <div className="flex min-h-72 items-center justify-center sm:min-h-96">
        {frameUrl ? <div className="relative w-full touch-none outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-kumo-interact" tabIndex={ownerEnabled ? 0 : -1} aria-label={ownerEnabled ? "Live Computer. Keyboard and pointer input control the remote browser." : "Read-only live Computer view."} onPointerMove={pointerMove} onPointerUp={pointerUp} onWheel={wheel} onKeyDown={keyDown} onPaste={(event) => { if (!ownerEnabled) return; event.preventDefault(); void send({ type: "text", text: event.clipboardData.getData("text").slice(0, 4_000) }); }}><img ref={imageRef} src={frameUrl} alt="Live view of the exact active Browser session" draggable={false} className="mx-auto max-h-[70vh] w-full object-contain" /></div> : loading ? <Loader size={20} /> : <p className="p-8 text-sm text-white/70">No live frame available.</p>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/15 px-3 py-2 text-xs text-white/70"><span className={status.delayed ? "text-amber-300" : "text-emerald-300"}>{status.label}</span><span>{ownerEnabled ? "You control this browser. Click the view, type, scroll, or paste." : "Read-only watch mode"}</span></div>
    </div>}
    {!desktopInput && session.control.capabilities.humanTakeover && <p className="mt-2 rounded-lg border border-kumo-hairline bg-kumo-tint px-3 py-2 text-sm">Live takeover is available on desktop. Watch, Pause, and Stop remain available here.</p>}
    {viewError && <p className="mt-2 rounded-lg border border-kumo-danger/25 bg-kumo-danger/5 px-3 py-2 text-sm" role="alert">{viewError}</p>}
  </section>;
}
