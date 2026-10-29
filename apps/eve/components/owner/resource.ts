"use client";
import { useEffect, useRef, useState } from "react";
import { ownerRequest, OwnerRequestError } from "./data";

/** Actionable resources fail closed. Display-only callers may opt into labeled
 * stale data after transient failures; owner/record denials always clear it. */
export function useProductResource<T>(path: string | null, pollMs = 0, retainOnError = false) {
  const [state, setState] = useState<{ path: string | null; data: T | null; loading: boolean; error: string | null; stale: boolean }>({ path: null, data: null, loading: true, error: null, stale: false });
  const [revision, setRevision] = useState(0);
  const lastGoodRef = useRef<{ path: string | null; data: T | null }>({ path: null, data: null });
  useEffect(() => {
    const abort = new AbortController();
    if (lastGoodRef.current.path !== path) lastGoodRef.current = { path, data: null };
    setState(old => pollMs && old.path === path && old.data ? old : {
      path, data: retainOnError ? lastGoodRef.current.data : null,
      loading: Boolean(path), error: null, stale: retainOnError && lastGoodRef.current.data !== null,
    });
    let running = false;
    async function load() {
      if (!path || running || abort.signal.aborted) return;
      running = true;
      try {
        const data = await ownerRequest<T>(path, { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15000)]) });
        if (!abort.signal.aborted) {
          lastGoodRef.current = { path, data };
          setState({ path, data, loading: false, error: null, stale: false });
        }
      } catch (error) {
        if (!abort.signal.aborted) {
          const denied = error instanceof OwnerRequestError && [401, 403, 404].includes(error.status);
          const retained = retainOnError && !denied && lastGoodRef.current.path === path ? lastGoodRef.current.data : null;
          if (retained === null) lastGoodRef.current = { path, data: null };
          setState({ path, data: retained, loading: false, error: error instanceof Error ? error.message : "Could not read this source.", stale: retained !== null });
        }
      } finally { running = false; }
    }
    void load();
    const refreshVisible = () => { if (document.visibilityState === "visible") void load(); };
    const timer = pollMs ? setInterval(refreshVisible, pollMs) : null;
    if (pollMs) { window.addEventListener("online", refreshVisible); document.addEventListener("visibilitychange", refreshVisible); }
    return () => { abort.abort(); if (timer) clearInterval(timer); window.removeEventListener("online", refreshVisible); document.removeEventListener("visibilitychange", refreshVisible); };
  }, [path, revision, pollMs, retainOnError]);
  return { ...(state.path === path ? state : { data: null, loading: Boolean(path), error: null, stale: false }), refresh: () => setRevision(v => v + 1) };
}
