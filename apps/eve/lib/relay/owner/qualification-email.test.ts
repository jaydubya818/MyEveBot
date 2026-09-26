import { describe, expect, it, vi } from "vitest";
import type { ActionAdapter, AuthorizedAction } from "../../action-gateway.ts";
import { assertPinnedDraft, pinnedQualificationEmail, qualificationEmailPin } from "./qualification-email.ts";

const env = { MYEVE_OWNER_LOCAL_EMAIL_RECIPIENT: "owner@example.test", MYEVE_OWNER_LOCAL_EMAIL_SUBJECT: "Sofie qualification test", MYEVE_OWNER_LOCAL_EMAIL_TEXT: "Exact body.\n- Sofie", MYEVE_OWNER_LOCAL_EMAIL_MAX_SENDS: "1" };
const pin = qualificationEmailPin(env)!;
const draft = { to: ["owner@example.test"], subject: "Sofie qualification test", text: "Exact body.\n- Sofie", html: undefined, cc: undefined, bcc: undefined };
function fixture(otherAttempts = 0) {
  const inner: ActionAdapter<string> = { resolveTarget: vi.fn(async () => ({ provider: "agentmail", account: "inbox", resource: "[]" })), execute: vi.fn(async () => "sent"), verify: vi.fn(async () => ({ verified: true, receipt: {} })) };
  const query = vi.fn(async (_sql: string, _params?: unknown[]) => [{ n: otherAttempts }]);
  return { inner, query, adapter: pinnedQualificationEmail(inner, pin, () => ({ query })) };
}
const context = { idempotencyKey: "act_current" } as unknown as AuthorizedAction;

describe("owner-authorized qualification email", () => {
  it("parses only a complete single-send pin", () => {
    expect(pin).toEqual({ recipient: "owner@example.test", subject: "Sofie qualification test", text: "Exact body.\n- Sofie", maxSends: 1 });
    expect(qualificationEmailPin({})).toBeNull();
    for (const bad of [{ MYEVE_OWNER_LOCAL_EMAIL_RECIPIENT: "a@b.test, c@d.test" }, { MYEVE_OWNER_LOCAL_EMAIL_RECIPIENT: "not-an-address" }, { MYEVE_OWNER_LOCAL_EMAIL_SUBJECT: "two\nlines" }, { MYEVE_OWNER_LOCAL_EMAIL_TEXT: "" }, { MYEVE_OWNER_LOCAL_EMAIL_MAX_SENDS: "2" }, { MYEVE_OWNER_LOCAL_EMAIL_MAX_SENDS: undefined }])
      expect(() => qualificationEmailPin({ ...env, ...bad })).toThrow();
  });
  it("accepts only the exact draft", () => {
    expect(() => assertPinnedDraft(draft, pin)).not.toThrow();
    for (const change of [{ to: ["other@example.test"] }, { to: ["owner@example.test", "other@example.test"] }, { cc: ["cc@example.test"] }, { bcc: ["bcc@example.test"] }, { subject: "Different" }, { text: "Exact body." }, { html: "<p>x</p>" }, { labels: ["x"] }, { to: "owner@example.test", subject: "x" }])
      expect(() => assertPinnedDraft({ ...draft, ...change }, pin)).toThrow("owner-authorized draft");
  });
  it("rejects a changed draft before any approval target is resolved", async () => {
    const f = fixture();
    await expect(f.adapter.resolveTarget({ ...draft, to: ["attacker@example.test"] })).rejects.toThrow();
    expect(f.inner.resolveTarget).not.toHaveBeenCalled();
    await f.adapter.resolveTarget(draft); expect(f.inner.resolveTarget).toHaveBeenCalledTimes(1);
  });
  it("executes the first attempt once and refuses when another attempt exists", async () => {
    const first = fixture(0); await expect(first.adapter.execute(draft, context)).resolves.toBe("sent");
    expect(first.query.mock.calls[0][1]).toEqual(["qualification-owner", "act_current", ["executing", "verifying", "completed", "failed", "result_unknown", "recovering", "needs_you", "retryable"]]);
    const second = fixture(1); await expect(second.adapter.execute(draft, context)).rejects.toThrow("send limit");
    expect(second.inner.execute).not.toHaveBeenCalled();
  });
  it("refuses all email in a qualification process without a pin", async () => {
    const inner = fixture().inner; const adapter = pinnedQualificationEmail(inner, null, () => ({ query: async () => [] }));
    await expect(adapter.resolveTarget(draft)).rejects.toThrow("not authorized"); await expect(adapter.execute(draft, context)).rejects.toThrow("not authorized");
    expect(inner.execute).not.toHaveBeenCalled();
  });
});
