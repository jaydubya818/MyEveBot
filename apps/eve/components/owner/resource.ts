"use client";
import { useEffect, useRef, useState } from "react";
import { ownerRequest } from "./data";

/** Read-only, memory-only projection. A changed query never retains previous results. */
export function useProductResource<T>(path: string | null) {
  const [state, setState] = useState<{
    path: string | null;
    data: T | null;
    loading: boolean;
    error: string | null;
    /** True when a transient failure occurred but the previous good data is retained. */
    stale: boolean;
  }>({ path: null, data: null, loading: true, error: null, stale: false });
  const [revision, setRevision] = useState(0);
  // Retain last known-good data per path so transient failures don't blank the view.
  const lastGoodRef = useRef<{ path: string | null; data: T | null }>({
    path: null,
    data: null,
  });
  useEffect(() => {
    const abort = new AbortController();
    // On a path change, reset the retained data; on a revision bump (manual
    // refresh of the same path), show the previous data while reloading.
    if (lastGoodRef.current.path !== path) {
      lastGoodRef.current = { path, data: null };
    }
    setState({ path, data: lastGoodRef.current.data, loading: Boolean(path), error: null, stale: false });
    if (path)
      void ownerRequest<T>(path, {
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15000)]),
      })
        .then((data) => {
          if (!abort.signal.aborted) {
            lastGoodRef.current = { path, data };
            setState({ path, data, loading: false, error: null, stale: false });
          }
        })
        .catch((error) => {
          if (!abort.signal.aborted) {
            const retained = lastGoodRef.current.path === path ? lastGoodRef.current.data : null;
            setState({
              path,
              // Keep the last good data so the view stays populated.
              data: retained,
              loading: false,
              error:
                error instanceof Error
                  ? error.message
                  : "Could not read this source.",
              stale: retained !== null,
            });
          }
        });
    return () => abort.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, revision]);
  return {
    ...(state.path === path
      ? state
      : { data: null, loading: Boolean(path), error: null, stale: false }),
    refresh: () => setRevision((v) => v + 1),
  };
}
