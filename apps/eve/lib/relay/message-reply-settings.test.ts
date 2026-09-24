import { beforeEach, expect, it, vi } from "vitest";
const store = vi.hoisted(() => ({ getFresh: vi.fn(), set: vi.fn() }));
vi.mock("../../agent/lib/settings-db.ts", () => ({ settingsStore: store }));
import { messageReplySettings, saveMessageReplySettings } from "./message-reply-settings";
beforeEach(() => vi.clearAllMocks());
it("defaults to receipts and separates each owner's public profile", async () => {
  store.getFresh.mockResolvedValue(null);
  expect(await messageReplySettings("alice")).toEqual({ enabled: false, publicProfile: "" });
  await saveMessageReplySettings("alice", { enabled: true, publicProfile: "I summarize supplied text." });
  expect(store.set).toHaveBeenCalledWith("relay-message-replies:alice", JSON.stringify({ enabled: true, publicProfile: "I summarize supplied text." }));
  await messageReplySettings("bob");
  expect(store.getFresh).toHaveBeenLastCalledWith("relay-message-replies:bob");
});
it("rejects enabling empty profiles and model or owner overrides", async () => {
  for (const value of [{ enabled: true, publicProfile: " " }, { enabled: true, publicProfile: "Public", ownerId: "other" }, { enabled: true, publicProfile: "Public", tools: ["read_private"] }])
    await expect(saveMessageReplySettings("alice", value)).rejects.toThrow();
  expect(store.set).not.toHaveBeenCalled();
});
