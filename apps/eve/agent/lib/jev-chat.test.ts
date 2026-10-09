import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { DecisionFailure } from "../../lib/decision-intelligence/contract.ts";
const mocks = vi.hoisted(() => ({ configured: vi.fn(), evaluate: vi.fn() }));
vi.mock("../../lib/decision-intelligence/jev-provider.ts", () => ({
  jevConfigured: mocks.configured,
  jevMetadata: { name: "Jev", gateway: "Vercel AI Gateway", model: "typesafe-ai/jev" },
  JevDecisionProvider: class { evaluate = mocks.evaluate; },
}));
import tool from "../tools/evaluate_with_jev.ts";
import { jevChatApproval, jevChatInput, evaluateWithJev } from "./jev-chat.ts";
const owner = { principalType: "user", principalId: "owner", attributes: { owner: "true" } };
const context = () => ({ session: { id: "session", auth: { current: owner, initiator: owner } }, abortSignal: new AbortController().signal }) as any;
const input = { operation: "evaluate", statements: ["I prefer concise answers."] } as const;
const result = { outcome: "preference", probabilities: { preference: 0.8 }, confidence: 0.8,
  provider: "Jev", model: "typesafe-ai/jev", latencyMs: 12, inputTokens: 22, costUsd: null, evaluatedAt: "2026-09-23T12:00:00.000Z" };
beforeEach(() => { vi.resetAllMocks(); mocks.configured.mockReturnValue(true); mocks.evaluate.mockResolvedValue(result); });
describe("explicit Jev chat evaluation", () => {
  it("exports a provider-compatible root object while retaining operation validation", () => {
    expect(z.toJSONSchema(jevChatInput)).toMatchObject({ type: "object", additionalProperties: false });
    expect(jevChatInput.safeParse({ operation: "evaluate" }).success).toBe(false);
    expect(jevChatInput.safeParse({ operation: "status", statements: ["Unapproved text"] }).success).toBe(false);
    expect(jevChatInput.safeParse({ operation: "status" }).success).toBe(true);
    expect(jevChatInput.safeParse(input).success).toBe(true);
  });
  it("registers a real callable tool and gates text transmission on native approval", () => {
    expect(tool.description).toContain("not a person");
    expect(tool.approval).toBe(jevChatApproval);
    expect(jevChatApproval({ ...context(), toolInput: input })).toBe("user-approval");
    expect(mocks.evaluate).not.toHaveBeenCalled();
  });
  it("status checks do not claim authentication or call the provider", async () => {
    expect(jevChatApproval({ ...context(), toolInput: { operation: "status" } })).toBe("not-applicable");
    expect(await evaluateWithJev({ operation: "status" }, context())).toMatchObject({ status: "configured", usedJev: false });
    expect(mocks.evaluate).not.toHaveBeenCalled();
  });
  it("disabled configuration needs no approval and never falls back", async () => {
    mocks.configured.mockReturnValue(false);
    expect(jevChatApproval({ ...context(), toolInput: input })).toBe("not-applicable");
    expect(await evaluateWithJev({ ...input, statements: [...input.statements] }, context())).toMatchObject({ status: "unavailable", usedJev: false });
    expect(mocks.evaluate).not.toHaveBeenCalled();
  });
  it.each(["anonymous", "peer", "delegated", "different-owner"])("rejects %s in approval and execution", async kind => {
    const ctx = context();
    if (kind === "anonymous") ctx.session.auth.current = null;
    if (kind === "peer") ctx.session.auth.current = { ...owner, principalType: "agent" };
    if (kind === "delegated") ctx.session.parent = { id: "parent" };
    if (kind === "different-owner") ctx.session.auth.initiator = { ...owner, principalId: "other" };
    expect(jevChatApproval({ ...ctx, toolInput: input })).toMatchObject({ type: "denied" });
    expect(await evaluateWithJev({ ...input, statements: [...input.statements] }, ctx)).toMatchObject({ status: "denied", usedJev: false });
    expect(mocks.evaluate).not.toHaveBeenCalled();
  });
  it("transmits only supplied statements and preserves provider evidence", async () => {
    const ctx = context(); ctx.messages = [{ content: "DO NOT SEND HISTORY" }];
    const out = await evaluateWithJev({ ...input, statements: [...input.statements] }, ctx);
    expect(mocks.evaluate).toHaveBeenCalledTimes(1);
    expect(mocks.evaluate.mock.calls[0][0].state).toBe(input.statements[0]);
    expect(JSON.stringify(mocks.evaluate.mock.calls)).not.toContain("DO NOT SEND HISTORY");
    expect(out).toMatchObject({ status: "evaluated", usedJev: true, automaticKnowledgeWrites: false, excluded: ["insight"], results: [{ index: 1, result }] });
  });
  it("stops on provider failure without retry, fallback, or leaking diagnostics", async () => {
    mocks.evaluate.mockRejectedValue(new Error("sensitive provider diagnostic"));
    const out = await evaluateWithJev({ operation: "evaluate", statements: ["one", "two"] }, context());
    expect(out).toMatchObject({ status: "incomplete", usedJev: false, results: [{ index: 1, code: "GATEWAY_FAILURE" }] });
    expect(JSON.stringify(out)).not.toContain("sensitive");
    expect(mocks.evaluate).toHaveBeenCalledTimes(1);
  });
  it("reports partial success honestly", async () => {
    mocks.evaluate.mockResolvedValueOnce(result).mockRejectedValueOnce(new DecisionFailure("TIMEOUT"));
    const out = await evaluateWithJev({ operation: "evaluate", statements: ["one", "two", "three"] }, context());
    expect(out).toMatchObject({ status: "incomplete", usedJev: true, requestedCount: 3, results: [{ index: 1, status: "evaluated" }, { index: 2, code: "TIMEOUT" }] });
    expect(mocks.evaluate).toHaveBeenCalledTimes(2);
  });
  it("does not call the provider after cancellation", async () => {
    const ctx = context(); ctx.abortSignal = AbortSignal.abort();
    expect(await evaluateWithJev({ ...input, statements: [...input.statements] }, ctx)).toMatchObject({ status: "incomplete", usedJev: false });
    expect(mocks.evaluate).not.toHaveBeenCalled();
  });
  it("rejects secret-bearing text before approval and execution", async () => {
    const value = { operation: "evaluate" as const, statements: ["api_key=synthetic-not-a-real-key"] };
    expect(jevChatApproval({ ...context(), toolInput: value })).toMatchObject({ type: "denied" });
    expect(await evaluateWithJev(value, context())).toMatchObject({ code: "PRIVACY_EXCLUDED", usedJev: false });
    expect(mocks.evaluate).not.toHaveBeenCalled();
  });
  it("bounds input and rejects extra context fields", () => {
    for (const value of [{ operation: "evaluate", statements: [] }, { operation: "evaluate", statements: Array(6).fill("x") },
      { operation: "evaluate", statements: ["x".repeat(2001)] }, { ...input, history: "private" }]) {
      expect(jevChatInput.safeParse(value).success).toBe(false);
    }
  });
});
