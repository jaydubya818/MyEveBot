import { afterEach, expect, it, vi } from "vitest";
import { WorkError } from "../engineering/types.ts";
import { readableWorks } from "./readable-works.ts";

afterEach(() => vi.restoreAllMocks());
const ids = ["a", "b", "c"];

it("returns every item in order when all are readable", async () => {
  expect(await readableWorks(ids, id => id, async id => id.toUpperCase(), "test")).toEqual({ works: ["A", "B", "C"], unavailableWorks: 0 });
});
it("one unreadable Work is omitted, counted and logged with its id and cause; the rest of the view survives", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const view = await readableWorks(ids, id => id, async id => { if (id === "b") throw Error("Factory spend binding or immutable Work ceiling mismatch"); return id.toUpperCase(); }, "agent-home");
  expect(view).toEqual({ works: ["A", "C"], unavailableWorks: 1 });
  expect(log).toHaveBeenCalledWith("work_projection_failed", { view: "agent-home", workId: "b", name: "Error", message: "Factory spend binding or immutable Work ceiling mismatch" });
});
it("every item unreadable yields an empty, fully counted view rather than an exception", async () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  expect(await readableWorks(ids, id => id, async () => { throw Error("x"); }, "test")).toEqual({ works: [], unavailableWorks: 3 });
});
it("a WorkError (not found, forbidden) still propagates: authorisation failures are never hidden as a shorter list", async () => {
  await expect(readableWorks(ids, id => id, async id => { if (id === "c") throw new WorkError("forbidden", "Not yours.", 403); return id; }, "test")).rejects.toBeInstanceOf(WorkError);
});
it("the logged message is bounded and printable", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  await readableWorks(["a"], id => id, async () => { throw Error("bad\u0000\n" + "x".repeat(1000)); }, "test");
  const message = (log.mock.calls[0][1] as { message: string }).message;
  expect(message.length).toBe(300); expect(/^[\x20-\x7e]*$/.test(message)).toBe(true);
});
