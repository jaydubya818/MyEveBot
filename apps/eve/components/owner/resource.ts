"use client";
import { useEffect, useState } from "react";
import { ownerRequest } from "./data";

/** Read-only, memory-only projection. A changed query never retains previous results. */
export function useProductResource<T>(path: string | null, pollMs = 0) {
  const [state, setState] = useState<{
    path: string | null;
    data: T | null;
    loading: boolean;
    error: string | null;
  }>({ path: null, data: null, loading: true, error: null });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setState(old => pollMs && old.path === path && old.data ? old : { path, data: null, loading: Boolean(path), error: null });
    let running = false;
    async function load() {
      if (!path || running || abort.signal.aborted) return;
      running = true;
      await ownerRequest<T>(path, {
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15000)]),
      })
        .then((data) => {
          if (!abort.signal.aborted)
            setState({ path, data, loading: false, error: null });
        })
        .catch((error) => {
          if (!abort.signal.aborted)
            setState({
              path,
              data: null,
              loading: false,
              error:
                error instanceof Error
                  ? error.message
                  : "Could not read this source.",
            });
        }).finally(() => { running = false; });
    }
    void load();
    const refreshVisible = () => { if (document.visibilityState === "visible") void load(); };
    const timer = pollMs ? setInterval(refreshVisible, pollMs) : null;
    if (pollMs) { window.addEventListener("online", refreshVisible); document.addEventListener("visibilitychange", refreshVisible); }
    return () => { abort.abort(); if (timer) clearInterval(timer); window.removeEventListener("online", refreshVisible); document.removeEventListener("visibilitychange", refreshVisible); };
  }, [path, revision, pollMs]);
  return {
    ...(state.path === path
      ? state
      : { data: null, loading: Boolean(path), error: null }),
    refresh: () => setRevision((v) => v + 1),
  };
}
