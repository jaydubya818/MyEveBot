import { beforeEach, expect, it, vi } from "vitest";
import { messageReplySettings, saveMessageReplySettings } from "./message-reply-settings";
const query = vi.fn();
const owner = (ownerId: string) => ({ ownerId, database: { query } });
beforeEach(() => vi.resetAllMocks());
it("defaults to receipts only when unconfigured and reads each owner's saved profile", async () => {
  query.mockResolvedValue([]);
  expect(await messageReplySettings(owner("alice"))).toEqual({ enabled: false, publicProfile: "" });
  const settings = { enabled: true, publicProfile: "I summarize supplied text." };
  await saveMessageReplySettings(owner("alice"), settings);
  expect(query).toHaveBeenLastCalledWith(expect.stringContaining("INSERT INTO app_settings"), ["relay-message-replies:alice", JSON.stringify(settings)]);
  query.mockResolvedValue([{ value: JSON.stringify(settings) }]);
  expect(await messageReplySettings(owner("alice"))).toEqual(settings);
  await messageReplySettings(owner("bob"));
  expect(query).toHaveBeenLastCalledWith(expect.stringContaining("SELECT value"), ["relay-message-replies:bob"]);
});
it("does not disguise database failures as disabled replies", async () => {
  query.mockRejectedValue(new Error("permission denied"));
  await expect(messageReplySettings(owner("alice"))).rejects.toThrow("permission denied");
});
it("rejects enabling empty profiles and model or owner overrides", async () => {
  for (const value of [{ enabled: true, publicProfile: " " }, { enabled: true, publicProfile: "Public", ownerId: "other" }, { enabled: true, publicProfile: "Public", tools: ["read_private"] }])
    await expect(saveMessageReplySettings(owner("alice"), value)).rejects.toThrow();
  expect(query).not.toHaveBeenCalled();
});
