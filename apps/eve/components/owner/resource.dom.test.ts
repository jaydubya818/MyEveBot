// @vitest-environment happy-dom
/**
 * QA-21: useProductResource must retain previous good data on a transient
 * fetch error and expose a `stale` flag rather than blanking the view.
 *
 * Revert-check: removing the `lastGoodRef` / `stale` logic from resource.ts
 * causes the "retains stale data on error" and "stale flag is set" cases
 * to fail.
 */
import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useProductResource } from "./resource";

// Mock ownerRequest to control success / failure.
vi.mock("./data", () => ({ ownerRequest: vi.fn() }));
import { ownerRequest } from "./data";
const mockRequest = vi.mocked(ownerRequest);

beforeEach(() => { vi.clearAllMocks(); });

describe("useProductResource — QA-21", () => {
  it("returns data and stale:false on success", async () => {
    mockRequest.mockResolvedValue({ x: 1 });
    const { result } = renderHook(() => useProductResource<{ x: number }>("/test"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({ x: 1 });
    expect(result.current.error).toBeNull();
    expect(result.current.stale).toBe(false);
  });

  it("retains previous good data on a transient error and sets stale:true", async () => {
    // First request succeeds.
    mockRequest.mockResolvedValueOnce({ x: 1 });
    const { result } = renderHook(() => useProductResource<{ x: number }>("/test"));
    await waitFor(() => expect(result.current.data).toEqual({ x: 1 }));

    // Second request (refresh) fails.
    mockRequest.mockRejectedValueOnce(new Error("network offline"));
    act(() => { result.current.refresh(); });
    await waitFor(() => expect(result.current.error).toBeTruthy());

    // Data must NOT be wiped — the previous good value is retained.
    expect(result.current.data).toEqual({ x: 1 });
    expect(result.current.stale).toBe(true);
  });

  it("clears stale flag and replaces data after recovery", async () => {
    mockRequest.mockResolvedValueOnce({ x: 1 });
    const { result } = renderHook(() => useProductResource<{ x: number }>("/test"));
    await waitFor(() => expect(result.current.data).toEqual({ x: 1 }));

    mockRequest.mockRejectedValueOnce(new Error("err"));
    act(() => { result.current.refresh(); });
    await waitFor(() => expect(result.current.stale).toBe(true));

    mockRequest.mockResolvedValueOnce({ x: 2 });
    act(() => { result.current.refresh(); });
    await waitFor(() => expect(result.current.data).toEqual({ x: 2 }));
    expect(result.current.stale).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("blanks data when the path changes (no cross-path bleed)", async () => {
    mockRequest.mockResolvedValueOnce({ x: 1 });
    const { result, rerender } = renderHook(
      ({ path }: { path: string }) => useProductResource<{ x: number }>(path),
      { initialProps: { path: "/a" } },
    );
    await waitFor(() => expect(result.current.data).toEqual({ x: 1 }));

    // Deliberately make the new path fail with no previous data.
    mockRequest.mockRejectedValueOnce(new Error("err"));
    rerender({ path: "/b" });
    await waitFor(() => expect(result.current.error).toBeTruthy());

    // No data from /a should appear for /b.
    expect(result.current.data).toBeNull();
    expect(result.current.stale).toBe(false);
  });
});
