/** A foreign-owned server row cannot be overwritten by this browser's local cache. */
const blockedThreadIds = new Set<string>();
const listeners = new Set<(id: string) => void>();

export function threadHasOwnerConflict(id: string): boolean {
  return blockedThreadIds.has(id);
}

export function subscribeToThreadOwnerConflicts(listener: (id: string) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function saveThreadForCurrentOwner(id: string, body: unknown): Promise<void> {
  if (threadHasOwnerConflict(id)) return;
  try {
    const response = await fetch(`/api/threads/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response.status !== 409) return;
    const result = (await response.json().catch(() => null)) as { error?: { code?: string } } | null;
    if (result?.error?.code !== "thread_owner_conflict" || blockedThreadIds.has(id)) return;
    blockedThreadIds.add(id);
    for (const listener of listeners) listener(id);
  } catch {
    // A transient failure is handled by the next server reconciliation sweep.
  }
}
