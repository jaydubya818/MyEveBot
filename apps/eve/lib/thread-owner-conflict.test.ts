import { afterEach, beforeEach, expect, it, vi } from "vitest";

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

it.each(["", ".", "..", "\uD800"])("rejects unsafe thread identifier %j without a request", async (id) => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const { threadApiPath, saveThreadForCurrentOwner } = await import("./thread-owner-conflict");
  expect(threadApiPath(id)).toBeNull();
  expect(await saveThreadForCurrentOwner(id, {})).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
});

it.each(["ordinary-id", "%2e%2e", "a/b?c#d"])("keeps thread identifier %j in one URL segment", async (id) => {
  const { threadApiPath } = await import("./thread-owner-conflict");
  const path = threadApiPath(id);
  expect(path).toBe(`/api/threads/${encodeURIComponent(id)}`);
  expect(new URL(path!, "https://example.test").pathname).toBe(path);
});

it("keeps path and query syntax inside the thread identifier", async () => {
  const fetch = vi.fn(async (_url: string) => Response.json({ ok: true }));
  vi.stubGlobal("fetch", fetch);
  const { saveThreadForCurrentOwner } = await import("./thread-owner-conflict");
  expect(await saveThreadForCurrentOwner("../../api/agents?owner=other#fragment", {})).toBe(true);
  expect(fetch.mock.calls[0]?.[0]).toBe("/api/threads/..%2F..%2Fapi%2Fagents%3Fowner%3Dother%23fragment");
});

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

  await saveThreadForCurrentOwner("older", body);
  await saveThreadForCurrentOwner("older", body);
  await saveThreadForCurrentOwner("new", { title: "New chat", chat: {} });

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

  await saveThreadForCurrentOwner("retry", { title: "Retry" });
  await saveThreadForCurrentOwner("retry", { title: "Retry" });

  expect(fetch).toHaveBeenCalledTimes(2);
  expect(threadHasOwnerConflict("retry")).toBe(false);
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
