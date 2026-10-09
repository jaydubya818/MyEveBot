import { createGateway } from "ai";
import { describe, expect, it, vi } from "vitest";
import { knowledgeRequest, OUTCOMES } from "./contract.ts";
import {
  JevDecisionProvider,
  jevConfigured,
  jevMetadata,
} from "./jev-provider.ts";

function mockedGateway(body: unknown, status = 200) {
  const fetch = vi.fn(
    async (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
  );
  const gateway = createGateway({
    apiKey: "synthetic-fixture-credential",
    fetch,
  });
  return {
    fetch,
    provider: new JevDecisionProvider({
      configured: () => true,
      model: () => gateway.evaluationModel(jevMetadata.model),
    }),
  };
}
function response(choice: string, probabilities?: Record<string, number>) {
  return {
    answers: {
      classification: {
        type: "choice",
        choice,
        ...(probabilities ? { probabilities } : {}),
      },
    },
  };
}
const request = knowledgeRequest("A shorter form might improve completion.");
const signal = () => new AbortController().signal;

describe("real AI SDK evaluation through a mocked Gateway transport", () => {
  it.each(OUTCOMES)(
    "normalizes %s and its complete distribution without label leakage",
    async (outcome) => {
      const probabilities = Object.fromEntries(
        OUTCOMES.map((key) => [key, key === outcome ? 1 : 0]),
      );
      const { provider, fetch } = mockedGateway({
        ...response(outcome, probabilities),
        usage: { inputTokens: 42, outputTokens: 0 },
      });
      expect(await provider.evaluate(request, signal())).toMatchObject({
        outcome,
        probabilities,
        confidence: 1,
        inputTokens: 42,
        costUsd: null,
        model: jevMetadata.model,
        provider: "Jev",
      });
      expect(fetch).toHaveBeenCalledTimes(1);
      const [url, init] = fetch.mock.calls[0]!;
      expect(String(url)).toContain("/evaluation-model");
      const body = JSON.parse(init!.body as string);
      expect(body.state).toBe(request.state);
      expect(body.questions.classification).toEqual({
        type: "choice",
        instructions: request.question,
        criteria: request.definitions,
      });
      expect(body).not.toHaveProperty("expected");
    },
  );
  it("preserves a supported tie choice rather than selecting another label", async () => {
    const distribution = Object.fromEntries(
      OUTCOMES.map((key) => [
        key,
        key === "fact" || key === "hypothesis" ? 0.5 : 0,
      ]),
    );
    const { provider } = mockedGateway(response("hypothesis", distribution));
    expect((await provider.evaluate(request, signal())).outcome).toBe(
      "hypothesis",
    );
  });
  it("accepts declared rounding precision", async () => {
    const { provider } = mockedGateway({
      ...response(
        "fact",
        Object.fromEntries(OUTCOMES.map((key) => [key, 0.17])),
      ),
      rounding: { probabilityDecimals: 2 },
    });
    expect((await provider.evaluate(request, signal())).confidence).toBe(0.17);
  });
  it("does not invent missing confidence, usage or cost", async () => {
    const { provider } = mockedGateway({
      ...response("fact"),
      providerMetadata: { typesafe: { confidence: { classification: 0.97 } } },
    });
    expect(await provider.evaluate(request, signal())).toMatchObject({
      confidence: null,
      probabilities: null,
      inputTokens: null,
      costUsd: null,
    });
  });
  it.each([
    response("authorization"),
    response("fact", { fact: 1 }),
    response("fact", Object.fromEntries(OUTCOMES.map((key) => [key, -1]))),
    response("fact", Object.fromEntries(OUTCOMES.map((key) => [key, 1]))),
    response(
      "fact",
      Object.fromEntries(
        OUTCOMES.map((key) => [key, key === "hypothesis" ? 1 : 0]),
      ),
    ),
    { answers: {} },
    { answers: { classification: { type: "boolean", probability: 1 } } },
    { ...response("fact"), usage: { inputTokens: -1 } },
  ])("rejects malformed typed results", async (body) => {
    const { provider } = mockedGateway(body);
    await expect(provider.evaluate(request, signal())).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });
  it.each([
    [429, "RATE_LIMITED"],
    [401, "PROVIDER_UNAVAILABLE"],
    [403, "PROVIDER_UNAVAILABLE"],
    [503, "GATEWAY_FAILURE"],
    [504, "TIMEOUT"],
  ] as const)(
    "normalizes HTTP %s without retry or diagnostics",
    async (status, code) => {
      const { provider, fetch } = mockedGateway(
        {
          error: {
            message: "SYNTHETIC_SECRET_PROVIDER_BODY",
            type: "api_error",
          },
        },
        status,
      );
      await expect(provider.evaluate(request, signal())).rejects.toMatchObject({
        code,
        message: code,
      });
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );
  it("cancels a blocked Gateway call", async () => {
    const controller = new AbortController();
    const transport = createGateway({
      apiKey: "synthetic-fixture",
      fetch: async (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
          queueMicrotask(() => controller.abort());
        }),
    });
    const provider = new JevDecisionProvider({
      configured: () => true,
      model: () => transport.evaluationModel(jevMetadata.model),
    });
    await expect(
      provider.evaluate(request, controller.signal),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
  });
  it("requires explicit enablement and existing Gateway credentials", async () => {
    expect(jevConfigured({})).toBe(false);
    expect(jevConfigured({ AI_GATEWAY_API_KEY: "synthetic-fixture" })).toBe(
      false,
    );
    expect(
      jevConfigured({
        MYEVE_DECISION_INTELLIGENCE_ENABLED: "invalid",
        AI_GATEWAY_API_KEY: "synthetic-fixture",
      }),
    ).toBe(false);
    expect(
      jevConfigured({
        MYEVE_DECISION_INTELLIGENCE_ENABLED: "true",
        AI_GATEWAY_API_KEY: "synthetic-fixture",
      }),
    ).toBe(true);
    const model = vi.fn();
    await expect(
      new JevDecisionProvider({ configured: () => false, model }).evaluate(
        request,
        signal(),
      ),
    ).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    expect(model).not.toHaveBeenCalled();
  });
});
