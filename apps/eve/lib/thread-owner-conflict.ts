/** A foreign-owned server row cannot be overwritten by this browser's local cache. */
const blockedThreadIds = new Set<string>();
const listeners = new Set<(id: string) => void>();

export function threadApiPath(id: string): string | null {
  // URL parsers normalize these segments even after encodeURIComponent.
  if (!id || id === "." || id === "..") return null;
  try {
    return `/api/threads/${encodeURIComponent(id)}`;
  } catch {
    return null;
  }
}

export function threadHasOwnerConflict(id: string): boolean {
  return blockedThreadIds.has(id);
}

export function subscribeToThreadOwnerConflicts(listener: (id: string) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function saveThreadForCurrentOwner(id: string, body: unknown): Promise<boolean> {
  if (threadHasOwnerConflict(id)) return false;
  const url = threadApiPath(id);
  if (!url) return false;
  try {
    const response = await fetch(url, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response.ok) return true;
    if (response.status !== 409) return false;
    const result = (await response.json().catch(() => null)) as { error?: { code?: string } } | null;
    if (result?.error?.code !== "thread_owner_conflict" || blockedThreadIds.has(id)) return false;
    blockedThreadIds.add(id);
    for (const listener of listeners) listener(id);
  } catch {
    // A transient failure is handled by the next server reconciliation sweep.
  }
  return false;
}
