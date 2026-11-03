/**
 * Extracted fetch helpers from OwnerCandidateDecision (QA-34).
 * Both functions check response.ok BEFORE calling .json() so that
 * HTML error pages (e.g. Vercel 504) surface a readable status-based
 * message rather than a raw SyntaxError.
 *
 * Exported for independent testing; the component imports from here.
 */
import type { OwnerPublication } from "@/lib/engineering/owner-publication";
import type { OwnerAction } from "@/lib/engineering/publication-contract";

type View = Awaited<ReturnType<OwnerPublication["view"]>>;

export async function fetchOwnerDecision(workId: string): Promise<View> {
  const r = await fetch(
    `/api/beta/owner-decision?workId=${encodeURIComponent(workId)}`,
    { cache: "no-store" },
  );
  if (!r.ok) {
    const body = (await r.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `Request failed (${r.status})`);
  }
  return r.json() as Promise<View>;
}

export async function postOwnerDecision(payload: {
  workId: string;
  bindingHash: string;
  previousId: string | null;
  action: OwnerAction;
  confirmed: boolean;
}): Promise<void> {
  const response = await fetch("/api/beta/owner-decision", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `Request failed (${response.status})`);
  }
}
