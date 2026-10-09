import { describe, expect, it } from "vitest";
import { peerMessageDraft } from "./message-draft";

describe("peer message proposals", () => {
  it("preserves exact reply correlation without accepting an internal resource override", () => {
    const input = { target: "relay://owner/agent", body: "Hello", conversationId: "conversation", replyTo: "request" };
    const draft = peerMessageDraft(input, "unique-request", 0);
    expect(draft.payload).toEqual({ body: "Hello", replyTo: "request" });
    expect(draft.conversationId).toBe("conversation");
    expect(draft).not.toHaveProperty("resource");
    expect(() => peerMessageDraft({ ...input, resource: "substituted" }, "unique-request")).toThrow();
  });
  it("rejects blank messages and noncanonical peer addresses", () => {
    for (const input of [{ target: "Atlas", body: "Hello", conversationId: "c" }, { target: "relay://owner/agent", body: "  ", conversationId: "c" }])
      expect(() => peerMessageDraft(input, "unique-request")).toThrow();
  });
});
