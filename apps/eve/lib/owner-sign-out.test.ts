import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/owner-browser-storage", () => ({
  invalidateOwnerBrowserSession: vi.fn(),
}));

import { confirmOwnerSignOut } from "./owner-sign-out";
import { invalidateOwnerBrowserSession } from "@/lib/owner-browser-storage";

describe("confirmOwnerSignOut — QA-31", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(invalidateOwnerBrowserSession).mockReset();
  });

  it("returns false and does not clear the browser session when logout fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 })),
    );
    await expect(confirmOwnerSignOut()).resolves.toBe(false);
    expect(invalidateOwnerBrowserSession).not.toHaveBeenCalled();
  });

  it("clears the browser session only after a confirmed logout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 204 })),
    );
    await expect(confirmOwnerSignOut()).resolves.toBe(true);
    expect(invalidateOwnerBrowserSession).toHaveBeenCalledOnce();
  });
});
