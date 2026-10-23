/**
 * Extracted server-delete helper so the thread-restore-on-failure path (QA-19)
 * can be imported and tested independently of the full ChatApp component.
 *
 * `url` is the authenticated thread path from threadApiPath. A null url is a
 * no-op that reports failure so the caller can restore optimistic UI.
 */
export async function deleteThreadOnServer(
  id: string,
  url?: string | null,
): Promise<boolean> {
  if (!url) return false;
  try {
    const response = await fetch(url, { method: "DELETE" });
    return response.ok;
  } catch {
    return false;
  }
}
