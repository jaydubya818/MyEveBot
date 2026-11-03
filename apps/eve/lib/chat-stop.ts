/**
 * Extracted cancellation helper so the stopTurn error-surfacing path (QA-03)
 * can be imported and tested independently of the full ChatThread component.
 */
export async function performCancelTurn(
  cancel: () => Promise<unknown>,
  onError: (message: string) => void,
): Promise<void> {
  try {
    await cancel();
  } catch {
    onError("Stop could not be confirmed — the turn may still be running.");
  }
}
