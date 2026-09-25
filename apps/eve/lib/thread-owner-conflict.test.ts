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
