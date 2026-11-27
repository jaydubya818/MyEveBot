import { afterEach, beforeEach, expect, it, vi } from "vitest";

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

it("keeps a conflicting local thread and stops repeat uploads while new threads still save", async () => {
  const fetch = vi.fn(async (url: string) => url.endsWith("/older")
    ? Response.json({ error: { code: "thread_owner_conflict" } }, { status: 409 })
    : Response.json({ ok: true }));
  vi.stubGlobal("fetch", fetch);
  const { saveThreadForCurrentOwner, subscribeToThreadOwnerConflicts, threadHasOwnerConflict } =
    await import("./thread-owner-conflict");
  const notices: string[] = [];
  const unsubscribe = subscribeToThreadOwnerConflicts((id) => notices.push(id));
  const localChat = { events: [{ type: "message.received", data: { message: "Keep me" } }] };
  const body = { title: "Older", chat: localChat };

  expect(await saveThreadForCurrentOwner("older", body)).toBe(false);
  expect(await saveThreadForCurrentOwner("older", body)).toBe(false);
  expect(await saveThreadForCurrentOwner("new", { title: "New chat", chat: {} })).toBe(true);

  expect(fetch.mock.calls.map(([url]) => url)).toEqual(["/api/threads/older", "/api/threads/new"]);
  expect(threadHasOwnerConflict("older")).toBe(true);
  expect(threadHasOwnerConflict("new")).toBe(false);
  expect(notices).toEqual(["older"]);
  expect(body.chat).toBe(localChat);
  expect(localChat.events[0].data.message).toBe("Keep me");
  unsubscribe();
});

it("does not quarantine a thread after a transient server error", async () => {
  const fetch = vi.fn(async () => new Response(null, { status: 503 }));
  vi.stubGlobal("fetch", fetch);
  const { saveThreadForCurrentOwner, threadHasOwnerConflict } = await import("./thread-owner-conflict");

  expect(await saveThreadForCurrentOwner("retry", { title: "Retry" })).toBe(false);
  expect(await saveThreadForCurrentOwner("retry", { title: "Retry" })).toBe(false);

  expect(fetch).toHaveBeenCalledTimes(2);
  expect(threadHasOwnerConflict("retry")).toBe(false);
});

it("reports a failed network save without quarantining the thread", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Offline")));
  const { saveThreadForCurrentOwner, threadHasOwnerConflict } = await import("./thread-owner-conflict");
  expect(await saveThreadForCurrentOwner("offline", { title: "Draft" })).toBe(false);
  expect(threadHasOwnerConflict("offline")).toBe(false);
});

it("does not report persistence before the authorized server response", async () => {
  let finish!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
  const { saveThreadForCurrentOwner } = await import("./thread-owner-conflict");
  let settled = false;
  const saved = saveThreadForCurrentOwner("delayed", {}).then(value => { settled = true; return value; });
  await Promise.resolve();
  expect(settled).toBe(false);
  finish(Response.json({ ok: true }));
  expect(await saved).toBe(true);
});

it.each([401, 403, 409, 503])("fails closed on HTTP %s so sending can retain the draft", async status => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: { code: "unavailable" } }, { status })));
  const { saveThreadForCurrentOwner } = await import("./thread-owner-conflict");
  expect(await saveThreadForCurrentOwner("unavailable", {})).toBe(false);
});

it("fails closed on a disconnected transport", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Disconnected"); }));
  const { saveThreadForCurrentOwner } = await import("./thread-owner-conflict");
  expect(await saveThreadForCurrentOwner("disconnected", {})).toBe(false);
});
