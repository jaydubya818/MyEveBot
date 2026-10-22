// @vitest-environment happy-dom
/**
 * QA-21: useProductResource must retain previous good data on a transient
 * fetch error and expose a `stale` flag rather than blanking the view.
 *
 * Uses React 19 createRoot directly (avoids react-dom version conflict with
 * @testing-library/react in this monorepo). Each test mounts the real hook,
 * triggers a fetch sequence, and inspects the resulting state.
 *
 * Revert-check: reverting the catch branch in resource.ts to set
 * `data: null` and `stale: false` makes the first two tests fail.
 */
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";

vi.mock("./data", () => ({
  ownerRequest: vi.fn(),
  OwnerRequestError: class extends Error {
    constructor(public status: number) { super(`status ${status}`); }
  },
}));

import { ownerRequest } from "./data";
import { useProductResource } from "./resource";

const mockRequest = vi.mocked(ownerRequest);

/** Minimal hook harness — mounts the real useProductResource in a live React tree. */
function mountHook<T>(path: string | null) {
  let snapshot: ReturnType<typeof useProductResource<T>> | undefined;
  const container = document.createElement("div");
  document.body.appendChild(container);

  function Component() {
    snapshot = useProductResource<T>(path);
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

afterEach(() => {
  vi.clearAllMocks();
});

describe("useProductResource — real hook, QA-21", () => {
  it("retains last-good data (stale:true) on a transient fetch error", async () => {
    let resolve: (v: { x: number }) => void;
    let reject: (e: Error) => void;

    // First request: succeed.
    mockRequest.mockReturnValueOnce(new Promise<{ x: number }>((res) => { resolve = res; }));
    const hook = mountHook<{ x: number }>("/api/test");

    // Still loading.
    expect(hook.state.loading).toBe(true);

    await act(async () => { resolve!({ x: 42 }); });
    expect(hook.state.data).toEqual({ x: 42 });
    expect(hook.state.stale).toBe(false);
    expect(hook.state.loading).toBe(false);

    // Second request: fail — should retain { x: 42 }.
    mockRequest.mockReturnValueOnce(new Promise<{ x: number }>((_, rej) => { reject = rej; }));
    await act(async () => { hook.state.refresh(); });
    // Show stale data while loading the refresh.
    expect(hook.state.data).toEqual({ x: 42 });

    await act(async () => { reject!(new Error("Network error")); });
    expect(hook.state.data).toEqual({ x: 42 }); // retained
    expect(hook.state.stale).toBe(true);
    expect(hook.state.error).toBeTruthy();

    hook.unmount();
  });

  it("data:null and stale:false when there is no prior good data on first error", async () => {
    mockRequest.mockRejectedValueOnce(new Error("First fetch failed"));
    const hook = mountHook<{ x: number }>("/api/test");

    await act(async () => { await Promise.resolve(); });
    // Give the microtask queue a few turns to settle.
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });

    expect(hook.state.data).toBeNull();
    expect(hook.state.stale).toBe(false);
    expect(hook.state.error).toBeTruthy();

    hook.unmount();
  });

  it("clears stale flag on successful recovery", async () => {
    mockRequest
      .mockResolvedValueOnce({ x: 1 })
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce({ x: 2 });

    const hook = mountHook<{ x: number }>("/api/test");
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    expect(hook.state.data).toEqual({ x: 1 });

    await act(async () => { hook.state.refresh(); await new Promise((r) => setTimeout(r, 10)); });
    expect(hook.state.stale).toBe(true);

    await act(async () => { hook.state.refresh(); await new Promise((r) => setTimeout(r, 10)); });
    expect(hook.state.data).toEqual({ x: 2 });
    expect(hook.state.stale).toBe(false);
    expect(hook.state.error).toBeNull();

    hook.unmount();
  });
});
