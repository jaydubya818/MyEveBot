"use client";
import { useState } from "react";

/**
 * Extracted hook for the mid-turn reattach incomplete notice (QA-04).
 * Reads the `reattachIncomplete` flag from the saved chat on mount and
 * exposes a `clear()` function that the caller invokes on next send.
 */
export function useReattachNotice(reattachIncomplete?: boolean): {
  show: boolean;
  clear: () => void;
} {
  const [show, setShow] = useState(reattachIncomplete === true);
  return { show, clear: () => setShow(false) };
}
