// @vitest-environment happy-dom
/**
 * QA-04 — useReattachNotice must initialise show=true when reattachIncomplete
 * is set and clear it when clear() is called.
 *
 * Tests the REAL hook using React 19 createRoot (mirrors resource.dom.test.ts
 * pattern, avoids @testing-library/react version conflict).
 *
 * Revert-check: changing `useState(reattachIncomplete === true)` to
 * `useState(false)` in chat-reattach-notice.ts causes the
 * "show=true when reattachIncomplete:true" test to fail.
 */
import React from "react";
import { describe, it, expect } from "vitest";
import { act } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";
import { useReattachNotice } from "./chat-reattach-notice";

type HookResult = ReturnType<typeof useReattachNotice>;

function mountHook(reattachIncomplete?: boolean) {
  let snapshot: HookResult | undefined;
  const container = document.createElement("div");
  document.body.appendChild(container);

  function Component() {
    snapshot = useReattachNotice(reattachIncomplete);
    return null;
  }

  let root: ReturnType<typeof createRoot>;
  act(() => {
    root = createRoot(container);
    root.render(React.createElement(Component));
  });

  return {
    get state() { return snapshot!; },
    unmount() {
      act(() => root!.unmount());
      document.body.removeChild(container);
    },
  };
}

describe("useReattachNotice — QA-04", () => {
  it("show is true when reattachIncomplete is true", () => {
    const hook = mountHook(true);
    expect(hook.state.show).toBe(true);
    hook.unmount();
  });

  it("show is false when reattachIncomplete is false", () => {
    const hook = mountHook(false);
    expect(hook.state.show).toBe(false);
    hook.unmount();
  });

  it("show is false when reattachIncomplete is undefined", () => {
    const hook = mountHook(undefined);
    expect(hook.state.show).toBe(false);
    hook.unmount();
  });

  it("clear() sets show to false", () => {
    const hook = mountHook(true);
    expect(hook.state.show).toBe(true);

    act(() => { hook.state.clear(); });

    expect(hook.state.show).toBe(false);
    hook.unmount();
  });
});
