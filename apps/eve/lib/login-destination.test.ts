import { describe, expect, it } from "vitest";
import { safeLoginDestination } from "./login-destination.ts";

const origin = "https://myeve.example";
describe("post-login destination boundary", () => {
  it.each(["/%5Cevil.example", "/%09/evil.example", "/%0A/evil.example", "/%0D/evil.example", "/\\evil.example", "//evil.example", "https://evil.example", "javascript:alert(1)"])("rejects external navigation from returnTo=%s", value => {
    const destination = safeLoginDestination("?returnTo=" + value, origin);
    expect(destination).toBe("/today");
    expect(new URL(destination, origin).origin).toBe(origin);
  });
  it.each(["/today", "/settings?tab=capabilities#mission-control", "/work/abc?view=proof", "/?query=hello%20world", "/files/%E2%9C%93"])("preserves a local destination %s", value => {
    expect(new URL(safeLoginDestination("?" + new URLSearchParams({ returnTo: value }), origin), origin).href).toBe(new URL(value, origin).href);
  });
  it("returns an absolute same-origin URL after dot-segment normalization", () => {
    const destination = safeLoginDestination("?returnTo=" + encodeURIComponent("/a/..//evil.example"), origin);
    expect(new URL(destination, origin).origin).toBe(origin);
    expect(destination).toBe(origin + "//evil.example");
  });
  it.each(["", "?returnTo=", "?returnTo=relative", "?returnTo=%20//evil.example"])("falls back for missing or non-rooted input %s", search => {
    expect(safeLoginDestination(search, origin)).toBe("/today");
  });
});
