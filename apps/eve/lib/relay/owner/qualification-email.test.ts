import { describe, expect, it, vi } from "vitest";
import type { ActionAdapter, AuthorizedAction } from "../../action-gateway.ts";
import { assertPinnedDraft, pinnedQualificationEmail, qualificationDraftSha256, qualificationEmailPin } from "./qualification-email.ts";

const env = { MYEVE_OWNER_LOCAL_EMAIL_RECIPIENT: "owner@example.test", MYEVE_OWNER_LOCAL_EMAIL_SUBJECT: "Sofie qualification test", MYEVE_OWNER_LOCAL_EMAIL_TEXT: "Exact body.\n- Sofie", MYEVE_OWNER_LOCAL_EMAIL_MAX_SENDS: "1", MYEVE_OWNER_LOCAL_EMAIL_PIN_ID: "email-pin-2" };
const pin = qualificationEmailPin(env)!;
const draft = { to: ["owner@example.test"], subject: "Sofie qualification test", text: "Exact body.\n- Sofie", html: undefined, cc: undefined, bcc: undefined };
function fixture(consumed = true) {
  const inner: ActionAdapter<string> = { resolveTarget: vi.fn(async () => ({ provider: "agentmail", account: "inbox", resource: "[]" })), execute: vi.fn(async () => "sent"), verify: vi.fn(async () => ({ verified: true, receipt: {} })) };
  const query = vi.fn(async (_sql: string, _params?: unknown[]) => consumed ? [{ pin_id: "email-pin-2" }] : []);
  return { inner, query, adapter: pinnedQualificationEmail(inner, pin, () => ({ query })) };
}
const context = { idempotencyKey: "act_current" } as unknown as AuthorizedAction;

describe("owner-authorized qualification email", () => {
  it("parses only a complete single-send pin with an id", () => {
    expect(pin).toEqual({ pinId: "email-pin-2", recipient: "owner@example.test", subject: "Sofie qualification test", text: "Exact body.\n- Sofie", maxSends: 1, draftSha256: qualificationDraftSha256(pin) });
    expect(pin.draftSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(qualificationEmailPin({})).toBeNull();
    for (const bad of [{ MYEVE_OWNER_LOCAL_EMAIL_RECIPIENT: "a@b.test, c@d.test" }, { MYEVE_OWNER_LOCAL_EMAIL_RECIPIENT: "not-an-address" }, { MYEVE_OWNER_LOCAL_EMAIL_SUBJECT: "two\nlines" }, { MYEVE_OWNER_LOCAL_EMAIL_TEXT: "" }, { MYEVE_OWNER_LOCAL_EMAIL_MAX_SENDS: "2" }, { MYEVE_OWNER_LOCAL_EMAIL_MAX_SENDS: undefined }, { MYEVE_OWNER_LOCAL_EMAIL_PIN_ID: undefined }, { MYEVE_OWNER_LOCAL_EMAIL_PIN_ID: "pin-2" }])
      expect(() => qualificationEmailPin({ ...env, ...bad })).toThrow();
  });
  it("derives the pin identity from the exact draft, not from time or process", () => {
    expect(qualificationEmailPin({ ...env, MYEVE_OWNER_LOCAL_EMAIL_ISSUED_AT: "2030-01-01T00:00:00.000Z" })!.draftSha256).toBe(pin.draftSha256);
    expect(qualificationEmailPin({ ...env, MYEVE_OWNER_LOCAL_EMAIL_TEXT: "Exact body." })!.draftSha256).not.toBe(pin.draftSha256);
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
  it("consumes the durable pin before the provider call and sends nothing when it is exhausted", async () => {
    const first = fixture(true); await expect(first.adapter.execute(draft, context)).resolves.toBe("sent");
    const [sql, params] = first.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/UPDATE owner_qualification_email_pins/); expect(sql).toMatch(/attempts<max_sends/);
    expect(params).toEqual(["email-pin-2", pin.draftSha256, "act_current"]);
    expect(first.query.mock.invocationCallOrder[0]).toBeLessThan((first.inner.execute as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]);
    const spent = fixture(false); await expect(spent.adapter.execute(draft, context)).rejects.toThrow("send limit");
    expect(spent.inner.execute).not.toHaveBeenCalled();
  });
  it("refuses all email in a qualification process without a pin", async () => {
    const inner = fixture().inner; const adapter = pinnedQualificationEmail(inner, null, () => ({ query: async () => [] }));
    await expect(adapter.resolveTarget(draft)).rejects.toThrow("not authorized"); await expect(adapter.execute(draft, context)).rejects.toThrow("not authorized");
    expect(inner.execute).not.toHaveBeenCalled();
  });
});
