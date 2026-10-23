import { describe, expect, it } from "vitest";
import { nextProductResourceOnError } from "./product-resource-state";

describe("nextProductResourceOnError — QA-21", () => {
  it("retains last-good data for the same path and marks it stale", () => {
    const next = nextProductResourceOnError(
      { path: "/api/today", data: { x: 42 } },
      "/api/today",
      "Could not read this source.",
    );
    expect(next.data).toEqual({ x: 42 });
    expect(next.stale).toBe(true);
    expect(next.error).toBe("Could not read this source.");
    expect(next.loading).toBe(false);
  });

  it("does not inherit data from a different path", () => {
    const next = nextProductResourceOnError(
      { path: "/api/today", data: { x: 42 } },
      "/api/work",
      "Could not read this source.",
    );
    expect(next.data).toBeNull();
    expect(next.stale).toBe(false);
  });
});
