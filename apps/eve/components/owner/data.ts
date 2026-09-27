"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { GoalDetailView } from "@/lib/goal-types";
import {
  emptySnapshot,
  type OwnerSnapshot,
} from "@/components/owner/projection";
import {
  readPreview,
  savePreview,
  type PreviewSnapshot,
} from "@/components/owner/preview";

export class OwnerRequestError extends Error {
  constructor(public status: number) {
    super(
      status === 401 || status === 403
        ? "Your session needs attention. Sign in again before continuing."
        : status === 404
          ? "This capability or record is not available in this environment."
          : status === 409
            ? "This record changed or the decision expired. Refresh before trying again."
            : "The service could not confirm this request. Refresh to check its latest state before trying again.",
    );
  }
}
export async function ownerRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      cache: "no-store",
      signal: init?.signal ?? AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error(
      "The connection could not be confirmed. Refresh to check the latest state before trying again.",
    );
  }
  if (!response.ok) throw new OwnerRequestError(response.status);
  return response.json() as Promise<T>;
}
export const resources = [
  { key: "goals", path: "/api/goals?limit=100", field: "goals", label: "Work" },
  {
    key: "tasks",
    path: "/api/task-runs",
    field: "tasks",
    label: "Work activity",
  },
  {
    key: "outcomes",
    path: "/api/outcomes?limit=100",
    field: "outcomes",
    label: "Results",
  },
  {
    key: "approvals",
    path: "/api/approvals",
    field: "approvals",
    label: "Decisions",
  },
  {
    key: "brief",
    path: "/api/reviews?kind=daily",
    field: "review",
    label: "Daily Brief",
  },
] as const;
export function useOwnerData(preview: boolean) {
  const [dataMode, setDataMode] = useState(preview);
  const [snapshot, setSnapshot] = useState<OwnerSnapshot>(emptySnapshot);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, GoalDetailView>>({});
  const active = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (active.current) return;
    if (preview) {
      const data = readPreview();
      setSnapshot(data);
      setDataMode(preview);
      setDetails(data.details);
      setLoading(false);
      setCheckedAt(new Date().toISOString());
      return;
    }
    active.current = true;
    const abort = new AbortController();
    controller.current = abort;
    const results = await Promise.allSettled(
      resources.map(async (resource) => {
        const body = await ownerRequest<Record<string, unknown>>(
          resource.path,
          {
            signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15000)]),
          },
        );
        const value = body[resource.field];
        if (
          resource.key === "brief"
            ? !value || (value as { kind?: string }).kind !== "daily"
            : !Array.isArray(value)
        )
          throw new Error(
            "The service returned incomplete data. Try refreshing.",
          );
        return value;
      }),
    );
    if (abort.signal.aborted) {
      active.current = false;
      return;
    }
    const nextErrors: Record<string, string> = {};
    // Never display a failed read as an authoritative empty state or actionable stale data.
    const next = { ...emptySnapshot };
    results.forEach((result, index) => {
      const resource = resources[index]!;
      if (result.status === "fulfilled")
        Object.assign(next, { [resource.key]: result.value });
      else
        nextErrors[resource.key] =
          `${resource.label}: ${result.reason instanceof Error ? result.reason.message : "Unavailable. Try refreshing."}`;
    });
    setSnapshot(next);
    setDataMode(preview);
    setErrors(nextErrors);
    setCheckedAt(new Date().toISOString());
    setLoading(false);
    active.current = false;
  }, [preview]);
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 30000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      controller.current?.abort();
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);
  function updatePreview(next: PreviewSnapshot) {
    savePreview(next);
    setSnapshot(next);
    setDetails(next.details);
  }
  return {
    snapshot: dataMode === preview ? snapshot : emptySnapshot,
    errors: dataMode === preview ? errors : {},
    loading: dataMode !== preview || loading,
    checkedAt,
    refresh,
    details,
    updatePreview,
  };
}
