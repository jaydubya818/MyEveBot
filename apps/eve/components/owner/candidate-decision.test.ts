import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchOwnerDecision,
  postOwnerDecision,
} from "@/lib/candidate-decision-fetch";

describe("fetchOwnerDecision — QA-34", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws status-code message for HTML error page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>gateway timeout</html>", { status: 504 })),
    );
    await expect(fetchOwnerDecision("work-1")).rejects.toThrow("Request failed (504)");
  });

  it("returns JSON when the response is ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ bindingHash: "abc" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    await expect(fetchOwnerDecision("work-1")).resolves.toEqual({ bindingHash: "abc" });
  });
});

describe("postOwnerDecision — QA-34", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws status-code message when the body is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>bad gateway</html>", { status: 502 })),
    );
    await expect(
      postOwnerDecision({
        workId: "work-1",
        bindingHash: "abc",
        previousId: null,
        action: "keep_private",
        confirmed: true,
      }),
    ).rejects.toThrow("Request failed (502)");
  });
});
