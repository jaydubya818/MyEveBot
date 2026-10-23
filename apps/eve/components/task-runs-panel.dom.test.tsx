// @vitest-environment happy-dom
/**
 * QA-20: TaskRunsPanel shows a stale-data banner when poll errors after the
 * first successful load; and shows a hard error (not stale) on first-load failure.
 *
 * Uses React 19 createRoot + fake timers against the REAL TaskRunsPanel.
 *
 * Revert-check: removing the staleWarning JSX from task-runs-panel.tsx causes
 * the "stale banner appears" assertion to fail. Removing the document.hidden
 * guard causes the visibility-gate test to fail.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";

vi.mock("@cloudflare/kumo", () => ({
  Badge: ({ children }: { children?: React.ReactNode }) => React.createElement("span", null, children),
  Button: ({ children, onClick, disabled }: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) =>
    React.createElement("button", { onClick, disabled }, children),
  Loader: () => React.createElement("div", { "data-testid": "loader" }),
}));

vi.mock("@phosphor-icons/react", () => new Proxy({}, {
  get: (_t, name) => () => React.createElement("span", { "data-icon": String(name) }),
}));

import { TaskRunsPanel } from "./task-runs-panel";

function mount(onOpenThread = vi.fn()) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: ReturnType<typeof createRoot>;
  act(() => {
    root = createRoot(container);
    root.render(React.createElement(TaskRunsPanel, { onOpenThread }));
  });
  return {
    get html() { return container.innerHTML; },
    unmount() {
      act(() => root!.unmount());
      document.body.removeChild(container);
    },
  };
}

/** Settle microtasks without advancing fake timers. */
async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("TaskRunsPanel stale-data banner — QA-20", () => {
  it("shows stale-data banner when poll fails after first successful load", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ tasks: [] }), { status: 200 }))
      .mockRejectedValueOnce(new Error("poll failed"));

    const panel = mount();

    // Let initial fetch settle.
    await flush();
    // First load succeeded: no stale banner yet.
    expect(panel.html).not.toContain("Activity data may be stale");

    // Advance timer past poll interval (4000ms) to trigger the next load.
    await act(async () => { vi.advanceTimersByTime(4001); });
    await flush();

    // After poll failure, stale banner should appear (tasks !== null, error !== null).
    expect(panel.html).toContain("Activity data may be stale");

    panel.unmount();
    void fetchMock;
  });

  it("shows hard error (NOT stale banner) on first-load failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("down"));

    const panel = mount();
    await flush();

    expect(panel.html).not.toContain("Activity data may be stale");
    expect(panel.html).toContain("could not be loaded");

    panel.unmount();
  });

  it("does NOT fire poll when document.hidden is true (QA-20 visibility guard)", async () => {
    Object.defineProperty(document, "hidden", { value: true, configurable: true, writable: true });

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ tasks: [] }), { status: 200 }));

    const panel = mount();
    await flush();

    const callsAfterMount = fetchMock.mock.calls.length;

    // Advance past the poll interval — load should NOT be called because hidden.
    await act(async () => { vi.advanceTimersByTime(5000); });
    await flush();

    expect(fetchMock.mock.calls.length).toBe(callsAfterMount);

    Object.defineProperty(document, "hidden", { value: false, configurable: true, writable: true });
    panel.unmount();
  });
});
