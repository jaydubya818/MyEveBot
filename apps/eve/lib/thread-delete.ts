/**
 * Extracted server-delete helper so the thread-restore-on-failure path (QA-19)
 * can be imported and tested independently of the full ChatApp component.
 */
import { threadApiPath } from "./thread-owner-conflict.ts";

export async function deleteThreadOnServer(id: string): Promise<boolean> {
  const url = threadApiPath(id);
  if (!url) return false;
  try {
    const response = await fetch(url, { method: "DELETE" });
    return response.ok;
  } catch {
    return false;
  }
}
