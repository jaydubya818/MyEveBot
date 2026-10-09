import {
  createGateway,
  generateText,
  streamText,
  Output,
  tool,
  isStepCount,
  wrapLanguageModel,
} from "ai";
import { MockLanguageModelV4, convertArrayToReadableStream } from "ai/test";
import { z } from "zod";
import { describe, expect, it, vi } from "vitest";

const usage = {
  inputTokens: { total: 12, noCache: 12, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
};
const finishReason = { unified: "stop" as const, raw: "stop" };
const response = (text: string) => ({
  content: [{ type: "text" as const, text }],
  finishReason,
  usage,
  warnings: [],
});

describe("existing language-model paths after the SDK patch", () => {
  it("preserves Gateway model routing, text output, usage and reasoning middleware", async () => {
    const fetch = vi.fn(async () =>
      Response.json(response("Local fixture response")),
    );
    const gateway = createGateway({ apiKey: "synthetic-fixture", fetch });
    const model = wrapLanguageModel({
      model: gateway("anthropic/claude-sonnet-5"),
      middleware: {
        specificationVersion: "v4",
        transformParams: async ({ params }) => ({
          ...params,
          reasoning: "low",
          providerOptions: {
            ...params.providerOptions,
            gateway: { caching: "auto" },
          },
        }),
      },
    });
    const result = await generateText({
      model,
      prompt: "Synthetic request",
      maxRetries: 0,
    });
    expect(result.text).toBe("Local fixture response");
    expect(result.usage.inputTokens).toBe(12);
    expect(result.usage.outputTokens).toBe(5);
    const call = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(call[0])).toContain("/language-model");
    expect(new Headers(call[1].headers).get("ai-language-model-id")).toBe(
      "anthropic/claude-sonnet-5",
    );
    expect(JSON.parse(call[1].body as string)).toMatchObject({
      reasoning: "low",
      providerOptions: { gateway: { caching: "auto" } },
    });
  });
  it("streams text to completion and accounts for usage", async () => {
    const model = new MockLanguageModelV4({
      doStream: {
        stream: convertArrayToReadableStream([
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "t" },
          { type: "text-delta", id: "t", delta: "Local " },
          { type: "text-delta", id: "t", delta: "stream" },
          { type: "text-end", id: "t" },
          { type: "finish", finishReason, usage },
        ]),
      },
    });
    const result = streamText({ model, prompt: "Synthetic request" });
    let text = "";
    for await (const chunk of result.textStream) text += chunk;
    expect(text).toBe("Local stream");
    expect((await result.usage).totalTokens).toBe(17);
  });
  it("validates structured output", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: response('{"label":"ok"}'),
    });
    const result = await generateText({
      model,
      prompt: "Synthetic request",
      output: Output.object({ schema: z.object({ label: z.literal("ok") }) }),
    });
    expect(result.output).toEqual({ label: "ok" });
  });
  it("executes a bounded tool and continues the Agent loop", async () => {
    const execute = vi.fn(async ({ value }: { value: number }) => value * 2);
    const model = new MockLanguageModelV4({
      doGenerate: [
        {
          content: [
            {
              type: "tool-call",
              toolCallId: "call-1",
              toolName: "double",
              input: '{"value":3}',
            },
          ],
          finishReason: { unified: "tool-calls", raw: "tool_calls" },
          usage,
          warnings: [],
        },
        response("6"),
      ],
    });
    const result = await generateText({
      model,
      prompt: "Synthetic request",
      tools: {
        double: tool({ inputSchema: z.object({ value: z.number() }), execute }),
      },
      stopWhen: isStepCount(2),
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(result.text).toBe("6");
    expect(result.steps).toHaveLength(2);
  });
  it("retains Gateway error behavior without adding retry loops", async () => {
    const fetch = vi.fn(async () =>
      Response.json(
        { error: { message: "fixture unavailable" } },
        { status: 503 },
      ),
    );
    const gateway = createGateway({ apiKey: "synthetic-fixture", fetch });
    await expect(
      generateText({
        model: gateway("anthropic/claude-sonnet-5"),
        prompt: "Synthetic request",
        maxRetries: 0,
      }),
    ).rejects.toBeDefined();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
