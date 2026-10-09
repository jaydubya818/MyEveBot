import { expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
vi.mock("@neondatabase/serverless", () => ({ neon: () => query }));

import { ThreadOwnerConflictError, upsertThread, upsertThreadMeta } from "./threads-db";

it("rejects a foreign-owned row before writing and permits a new thread", async () => {
  query.mockImplementation(async (parts: TemplateStringsArray, ...values: unknown[]) => {
    const statement = parts.join("?");
    if (statement.includes("SELECT owner_id FROM web_chat_threads")) {
      return values[0] === "older" ? [{ owner_id: "different-owner" }] : [];
    }
    if (statement.includes("INSERT INTO web_chat_threads")) return [{ id: values[0] }];
    return [];
  });
  const meta = { title: "Chat", updatedAt: 1, pinned: false, renamed: false };

  await expect(upsertThread("current-owner", "older", meta, { events: [] }))
    .rejects.toBeInstanceOf(ThreadOwnerConflictError);
  expect(query.mock.calls.some(([parts]) => parts.join("?").includes("INSERT INTO web_chat_threads"))).toBe(false);

  await upsertThread("current-owner", "new", meta, { events: [] });
  const insert = query.mock.calls.find(([parts]) => parts.join("?").includes("INSERT INTO web_chat_threads"));
  expect(insert).toBeDefined();
  expect(insert?.slice(1)).toContain("current-owner");
});

it("rejects ownership races when the guarded write affects no row", async () => {
  query.mockReset();
  query.mockImplementation(async () => []);
  const meta = { title: "Chat", updatedAt: 1, pinned: false, renamed: false };

  await expect(upsertThread("current-owner", "raced-chat", meta, { events: [] }))
    .rejects.toBeInstanceOf(ThreadOwnerConflictError);
  await expect(upsertThreadMeta("current-owner", "raced-meta", meta))
    .rejects.toBeInstanceOf(ThreadOwnerConflictError);

  const writes = query.mock.calls.filter(([parts]) => parts.join("?").includes("INSERT INTO web_chat_threads"));
  expect(writes).toHaveLength(2);
  expect(writes.every(([parts]) => parts.join("?").includes("RETURNING id"))).toBe(true);
});
