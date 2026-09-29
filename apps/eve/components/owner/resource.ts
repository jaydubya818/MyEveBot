"use client";
import { useEffect, useState } from "react";
import { ownerRequest } from "./data";

/** Read-only, memory-only projection. A changed query never retains previous results. */
export function useProductResource<T>(path: string | null) {
  const [state, setState] = useState<{
    path: string | null;
    data: T | null;
    loading: boolean;
    error: string | null;
  }>({ path: null, data: null, loading: true, error: null });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setState({ path, data: null, loading: Boolean(path), error: null });
    if (path)
      void ownerRequest<T>(path, {
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
        });
    return () => abort.abort();
  }, [path, revision]);
  return {
    ...(state.path === path
      ? state
      : { data: null, loading: Boolean(path), error: null }),
    refresh: () => setRevision((v) => v + 1),
  };
}
