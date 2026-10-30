import { afterEach, expect, it, vi } from "vitest";
import { qualificationConversation } from "./conversation-model.ts";

const request = "Run the approved dashboard qualification";
const user = { role: "user", content: [{ type: "text", text: request }] };
const tools = [{ type: "function", name: "qualification_journey", inputSchema: { type: "object", properties: {} } }];
const options = (prompt: unknown[] = [user], extra = {}) => ({ prompt, tools, ...extra }) as any;
const completed = { status: "COMPLETED_UNCLAIMED", readiness: "NOT_CLAIMED", authority: "NONE",
  stages: [1, 2, 3, 4].map(stage => ({ stage })), verdictSha256: "a".repeat(64), deliverySha256: "b".repeat(64) };
const first = await qualificationConversation({ ownerId: "owner:Q1", approvedRequest: request, revalidate: async () => true })
  .model({ sessionId: "session", stepKey: "session:0" }).doGenerate(options());
const generatedId = first.content[0].toolCallId;
const call = (id = generatedId) => ({ role: "assistant", content: [{ type: "tool-call", toolCallId: id, toolName: "qualification_journey", input: {} }] });
const output = (value: unknown = completed, id = generatedId) => ({ role: "tool", content: [{ type: "tool-result", toolCallId: id, toolName: "qualification_journey", output: { type: "json", value } }] });
function setup() {
  const revalidate = vi.fn(async () => true);
  const source = { ownerId: "owner:Q1", approvedRequest: request, revalidate, deliveryUrl: "https://dashboard.example.test/app" };
  const conversation = qualificationConversation(source);
  const model = conversation.model({ sessionId: "session", stepKey: "session:0" });
  return { source, revalidate, model, conversation };
}
const text = (result: any) => result.content.map((p: any) => p.text ?? "").join("");
afterEach(() => vi.unstubAllGlobals());

it("the explicit approved request proposes only the no-argument journey tool, with stable identity and zero usage", async () => {
  const { model, revalidate } = setup();
  const fetch = vi.fn(() => { throw Error("PROVIDER_REACHED"); }); vi.stubGlobal("fetch", fetch);
  const first = await model.doGenerate(options()), repeat = await model.doGenerate(options());
  expect(first.content).toEqual([{ type: "tool-call", toolName: "qualification_journey", toolCallId: expect.stringMatching(/^qdev-[a-f0-9]{32}$/), input: "{}" }]);
  expect(repeat.content).toEqual(first.content);
  expect(first.usage.inputTokens.total).toBe(0); expect(first.usage.outputTokens.total).toBe(0);
  expect(first.providerMetadata).toEqual({ qdev: { kind: "DETERMINISTIC", paidModelOperations: 0 } });
  expect(revalidate).toHaveBeenCalledWith({ ownerId: "owner:Q1", sessionId: "session", stepKey: "session:0" });
  expect(fetch).not.toHaveBeenCalled();
});

it("other requests, missing user messages and new attachments do not select an execution tool", async () => {
  const { model } = setup();
  for (const prompt of [[], [{ role: "user", content: [{ type: "text", text: "Build a different app" }] }],
    [{ role: "user", content: [{ type: "text", text: request }, { type: "file", data: new Uint8Array(), mediaType: "application/pdf" }] }]]) {
    const result = await model.doGenerate(options(prompt)); expect(result.finishReason.unified).toBe("stop"); expect(text(result)).toContain(request);
  }
});

it("the advertised authenticated tool is required before a proposal", async () => {
  await expect(setup().model.doGenerate(options([user], { tools: [] }))).rejects.toThrow("QDEV_CONVERSATION_TOOL_UNAVAILABLE");
});

it("only the linked completed presentation can show the configured delivery link, without claiming release readiness", async () => {
  const { model } = setup(); const result = await model.doGenerate(options([user, call(), output()]));
  expect(result.content).toHaveLength(1); expect(result.finishReason.unified).toBe("stop");
  expect(text(result)).toContain("completed all four stages"); expect(text(result)).toContain("https://dashboard.example.test/app");
  expect(text(result)).toContain("tester activation still require"); expect(result.usage.outputTokens.total).toBe(0);
});

it("a halted UNKNOWN presentation retains uncertainty and emits no new call or delivery link", async () => {
  const halted = { status: "HALTED", readiness: "NOT_CLAIMED", authority: "NONE", stages: [{ stage: 1 }], haltedAt: 2, code: "QDEV_EXPOSURE_UNKNOWN" };
  const result = await setup().model.doGenerate(options([user, call(), output(halted)]));
  expect(text(result)).toContain("QDEV_EXPOSURE_UNKNOWN"); expect(text(result)).toContain("no automatic retry");
  expect(text(result)).not.toContain("https://"); expect(result.finishReason.unified).toBe("stop");
});

it("a call awaiting acknowledgment never proposes another execution", async () => {
  const result = await setup().model.doGenerate(options([user, call()]));
  expect(text(result)).toContain("pending or unavailable"); expect(text(result)).toContain("no automatic retry");
  expect(result.finishReason.unified).toBe("stop");
});

it("foreign, duplicate, reordered and unlinked tool history is refused without an implicit retry", async () => {
  const { model } = setup();
  const foreign = output(); foreign.content[0].toolName = "foreign_tool";
  const changed = call(); changed.content[0].input = { workId: "model-supplied" } as any;
  for (const history of [[output()], [call(), output(completed, "wrong-id")], [output(), call()], [call(), output(), output()],
    [call(), call(), output()], [call(), foreign], [changed, output()]]) {
    const result = await model.doGenerate(options([user, ...history]));
    expect(text(result)).toContain("could not be verified"); expect(text(result)).toContain("no automatic retry");
    expect(text(result)).not.toContain("https://"); expect(result.finishReason.unified).toBe("stop");
  }
});

it("raw tool errors and forged readiness or extra fields never enter the owner response", async () => {
  const { model } = setup();
  for (const value of [{ ...completed, readiness: "READY", secret: "PRIVATE_DIAGNOSTIC" },
    { ...completed, stages: [{ stage: 4 }] }, { ...completed, deliverySha256: undefined }, "PRIVATE_DIAGNOSTIC"]) {
    const result = await model.doGenerate(options([user, call(), output(value)]));
    expect(text(result)).toContain("could not be verified"); expect(text(result)).not.toContain("PRIVATE_DIAGNOSTIC");
    expect(text(result)).not.toContain("https://");
  }
  const error = output(); error.content[0].output = { type: "error-text", value: "PRIVATE_DIAGNOSTIC" } as any;
  expect(text(await model.doGenerate(options([user, call(), error])))).not.toContain("PRIVATE_DIAGNOSTIC");
});

it("a new explicit turn cannot display an earlier turn's delivery evidence", async () => {
  const result = await setup().model.doGenerate(options([user, call(), output(), { role: "user", content: [{ type: "text", text: "hello" }] }]));
  expect(text(result)).not.toContain("https://"); expect(text(result)).not.toContain("completed all four");
});

it("a valid linked result copied from another session cannot be presented as current", async () => {
  const { conversation } = setup();
  const other = conversation.model({ sessionId: "another-session", stepKey: "another-session:0" });
  const result = await other.doGenerate(options([user, call(), output()]));
  expect(text(result)).toContain("could not be verified"); expect(text(result)).not.toContain("https://");
  expect(result.finishReason.unified).toBe("stop");
});

it("every generation and stream revalidates current enrollment and suppresses private failures", async () => {
  const { model, revalidate } = setup();
  await model.doGenerate(options()); revalidate.mockResolvedValue(false);
  await expect(model.doGenerate(options([user, call(), output()]))).rejects.toThrow("QDEV_CONVERSATION_UNAVAILABLE");
  await expect(model.doStream(options())).rejects.toThrow("QDEV_CONVERSATION_UNAVAILABLE");
  revalidate.mockRejectedValue(Error("PRIVATE_CREDENTIAL"));
  await expect(model.doGenerate(options())).rejects.toThrow(/^QDEV_CONVERSATION_UNAVAILABLE$/);
  expect(revalidate).toHaveBeenCalledTimes(4);
});

it("streaming emits the same proposal and safe presentation with zero provider usage", async () => {
  const { model } = setup();
  for (const prompt of [[user], [user, call(), output()]]) {
    const { stream } = await model.doStream(options(prompt)), parts: any[] = [];
    const reader = stream.getReader();
    try { for (;;) { const next = await reader.read(); if (next.done) break; parts.push(next.value); } }
    finally { reader.releaseLock(); }
    expect(parts[0].type).toBe("stream-start"); expect(parts.at(-1).usage.outputTokens.total).toBe(0);
    expect(parts.at(-1).providerMetadata.qdev.paidModelOperations).toBe(0);
    expect(parts.filter(p => p.type === "tool-call")).toHaveLength(prompt.length === 1 ? 1 : 0);
  }
});

it("abort, oversized history and invalid delivery addresses fail closed", async () => {
  const { model, revalidate, source } = setup();
  const controller = new AbortController(); controller.abort();
  await expect(model.doGenerate(options([user], { abortSignal: controller.signal }))).rejects.toThrow();
  expect(revalidate).not.toHaveBeenCalled();
  await expect(model.doGenerate(options([{ role: "user", content: [{ type: "text", text: "x".repeat(1_000_001) }] }]))).rejects.toThrow("QDEV_CONVERSATION_BOUND");
  for (const deliveryUrl of ["http://example.test", "https://secret@example.test", "https://example.test/#fragment"])
    expect(() => qualificationConversation({ ...source, deliveryUrl })).toThrow("QDEV_CONVERSATION_DELIVERY_URL");
});
