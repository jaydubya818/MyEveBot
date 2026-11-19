import { expect, it } from "vitest";
import { initialInboxRefresh, nextInboxRefresh } from "./work-inbox-refresh.ts";

const view = { works: [1] }, newer = { works: [1, 2] };
it("first load: success shows the view; failure shows the blocking error", () => {
  expect(nextInboxRefresh(initialInboxRefresh<typeof view>(), { ok: true, data: view })).toEqual({ data: view, error: null, stale: false });
  expect(nextInboxRefresh(initialInboxRefresh<typeof view>(), { ok: false, status: 503 })).toEqual({ data: null, error: "failed", stale: false });
  expect(nextInboxRefresh(initialInboxRefresh<typeof view>(), { ok: false })).toEqual({ data: null, error: "failed", stale: false });
});
it("a failed or timed-out poll never replaces Work that is already shown", () => {
  const shown = nextInboxRefresh(initialInboxRefresh<typeof view>(), { ok: true, data: view });
  for (const failure of [{ ok: false as const, status: 503 }, { ok: false as const, status: 500 }, { ok: false as const }]) {
    const next = nextInboxRefresh(shown, failure);
    expect(next).toEqual({ data: view, error: null, stale: true });
    expect(nextInboxRefresh(next, failure)).toEqual({ data: view, error: null, stale: true });   // repeated failures keep it
  }
});
it("the next successful poll clears the stale mark and any earlier error", () => {
  const stale = { data: view, error: null, stale: true } as const;
  expect(nextInboxRefresh(stale, { ok: true, data: newer })).toEqual({ data: newer, error: null, stale: false });
  expect(nextInboxRefresh({ data: null, error: "failed", stale: false }, { ok: true, data: newer })).toEqual({ data: newer, error: null, stale: false });
});
it("an ended session is reported as signed out and stops showing owner data", () => {
  expect(nextInboxRefresh({ data: view, error: null, stale: false }, { ok: false, status: 401 })).toEqual({ data: null, error: "signed-out", stale: false });
});
