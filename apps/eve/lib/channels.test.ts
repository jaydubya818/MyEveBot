import { describe, expect, it } from "vitest";

import { channelSearchQuery, matchesChannelSearch } from "./channels";

describe("channel search", () => {
  it("normalizes bounded owner queries", () => {
    expect(channelSearchQuery("  quarterly   invoice ")).toBe("quarterly invoice");
    expect(channelSearchQuery("x")).toBeNull();
    expect(channelSearchQuery("x".repeat(121))).toBeNull();
  });

  it("matches provider fields without case sensitivity", () => {
    expect(matchesChannelSearch("invoice", ["Q3 Invoice", null, "report.pdf"])).toBe(true);
    expect(matchesChannelSearch("REPORT.PDF", ["Q3 Invoice", null, "report.pdf"])).toBe(true);
    expect(matchesChannelSearch("secret", ["Q3 Invoice", null, "report.pdf"])).toBe(false);
  });
});
