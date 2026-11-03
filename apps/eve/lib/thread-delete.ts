/**
 * Extracted server-delete helper so the thread-restore-on-failure path (QA-19)
 * can be imported and tested independently of the full ChatApp component.
 */
export async function deleteThreadOnServer(id: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/threads/${id}`, { method: "DELETE" });
    return response.ok;
  } catch {
    return false;
  }
}
