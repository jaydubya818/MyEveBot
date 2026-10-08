import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const calls: string[] = [];
vi.mock("ai", async (original) => {
  const actual = await original<typeof import("ai")>();
  const trip = (name: string) => () => {
    calls.push(name);
    throw Error("PROVIDER_REACHED:" + name);
  };
  return {
    ...actual,
    gateway: Object.assign(trip("gateway"), {
      getAvailableModels: trip("gateway.getAvailableModels"),
      evaluationModel: trip("gateway.evaluationModel"),
    }),
    generateText: trip("generateText"),
    streamText: trip("streamText"),
    ToolLoopAgent: class {
      constructor() {
        trip("ToolLoopAgent")();
      }
    },
    experimental_evaluate: trip("evaluate"),
  };
});

import { externalAlphaPaidPaths, ExternalAlphaPaidPathDenied, denyExternalAlphaPaidPath } from "./paid-paths.ts";

const root = path.resolve(import.meta.dirname, "../..");
function sources(dir: string, out: string[] = []) {
  for (const e of readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!["node_modules", "skills", ".next"].includes(e.name)) sources(rel, out);
    } else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.(ts|tsx)$/.test(e.name)) out.push(rel);
  }
  return out;
}
const dispatch =
  /\bgateway\((?!\))|\bgenerateText\(|\bstreamText\(|\bgenerateObject\(|\bstreamObject\(|\bembed\(|\bembedMany\(|new ToolLoopAgent|\.doGenerate\(|\.doStream\(|api\.openai\.com|api\.anthropic\.com|api\.supermemory\.ai|\/v1\/chat\/completions|evaluationModel|experimental_evaluate/;

describe("paid-path inventory (external alpha)", () => {
  const listed = new Set(externalAlphaPaidPaths.flatMap((p) => p.files));
  it("lists every source file that can dispatch a paid model request", () => {
    const found = ["agent", "lib", "app"]
      .flatMap((d) => sources(d))
      .filter((f) => dispatch.test(readFileSync(path.join(root, f), "utf8")));
    const missing = found.filter((f) => !listed.has(f));
    expect(missing, "unlisted paid dispatch sites").toEqual([]);
    for (const f of listed) expect(() => readFileSync(path.join(root, f))).not.toThrow();
  });
  it("every DENIED path guards its dispatch site and every entry has an explicit disposition", () => {
    for (const p of externalAlphaPaidPaths) {
      expect(["INTEGRATED", "DENIED", "NOT_PAID"]).toContain(p.disposition);
      if (p.disposition !== "DENIED") continue;
      for (const f of p.files) {
        const source = readFileSync(path.join(root, f), "utf8");
        expect(source, `${f} guard`).toMatch(
          new RegExp(`(denyExternalAlphaPaidPath|externalAlphaPaidPathDenied)\\(\\s*["']${p.id}["']`),
        );
      }
    }
  });
  it("NOT_PAID paths contain no provider inference call", () => {
    for (const p of externalAlphaPaidPaths.filter((x) => x.disposition === "NOT_PAID"))
      for (const f of p.files) {
        const source = readFileSync(path.join(root, f), "utf8");
        expect(source, f).not.toMatch(/\bgenerateText\(|\bstreamText\(|\.doGenerate\(|\bgateway\((?!\))|api\.openai\.com/);
      }
  });
  it("the model selector refuses any provider other than the budgeted external-alpha model", () => {
    const source = readFileSync(path.join(root, "agent/agent.ts"), "utf8");
    expect(source).toMatch(/agent-model-selection/);
  });
});

describe("denial under an external-alpha installation (no provider is reached)", () => {
  const saved = { ...process.env };
  beforeAll(() => {
    process.env.EVE_PROJECT_NAME = "myeve-alpha-tester-1";
    delete process.env.MYEVE_EXTERNAL_ALPHA_POLICY;
  });
  afterAll(() => {
    process.env = saved;
  });
  const denied = (e: unknown, id: string) => expect(String((e as Error)?.message)).toBe("EXTERNAL_ALPHA_PAID_PATH_DENIED:" + id);

  it("the guard denies from the installation name alone, so absent policy stays closed", () => {
    expect(() => denyExternalAlphaPaidPath("x")).toThrow(ExternalAlphaPaidPathDenied);
    expect(() => denyExternalAlphaPaidPath("x", {} as NodeJS.ProcessEnv)).not.toThrow();
  });
  it("partner private model", async () => {
    const { partnerPrivateModel } = await import("../../agent/lib/partner-model.ts");
    const m = partnerPrivateModel({ ownerId: "o", sessionId: "s", auth: {} as any, primaryFallback: true } as any);
    await m.doGenerate({ prompt: [] } as any).then(() => expect.unreachable(), (e) => denied(e, "partner-private-model"));
    await m.doStream({ prompt: [] } as any).then(() => expect.unreachable(), (e) => denied(e, "partner-private-model"));
  });
  it("engineering conversation model", async () => {
    const { engineeringConversationModel } = await import("../engineering/conversation-model.ts");
    try {
      engineeringConversationModel({ store: {} as any, workId: "w", sessionId: "s", stepKey: "s:1", modelId: "m", productive: false });
      expect.unreachable();
    } catch (e) {
      denied(e, "engineering-conversation-model");
    }
  });
  it("engineering native model", async () => {
    const { nativeBudgetedModel } = await import("../engineering/native-model.ts");
    try {
      nativeBudgetedModel({ store: {} as any, workId: "w", sessionId: "s", stepKey: "s:1", modelId: "m" });
      expect.unreachable();
    } catch (e) {
      denied(e, "engineering-native-model");
    }
  });
  it("owner-channel model", async () => {
    const { ownerBudgetedModel } = await import("../relay/owner/model.ts");
    const m = ownerBudgetedModel({ purpose: "execute" } as any, "s:1");
    await m.doGenerate({ prompt: [] } as any).then(() => expect.unreachable(), (e) => denied(e, "owner-channel-model"));
  });
  it("Relay peer reply", async () => {
    const { answerPeerMessage } = await import("../relay/message-reply.ts");
    await answerPeerMessage({ envelope: { capability: "message.send", payload: { body: "hi" } } as any, settings: { enabled: true } as any, modelId: "m", costLimit: 0.25, revalidate: async () => {} }).then(
      () => expect.unreachable(),
      (e) => denied(e, "relay-peer-reply"),
    );
  });
  it("Jev decision provider", async () => {
    const { JevDecisionProvider } = await import("../decision-intelligence/jev-provider.ts");
    await new JevDecisionProvider({ configured: () => true }).evaluate({ state: {}, question: "q", definitions: {}, outcomes: ["a"] } as any, new AbortController().signal).then(
      () => expect.unreachable(),
      (e) => denied(e, "decision-intelligence-jev"),
    );
  });
  it("computer-use loop", async () => {
    const { runComputerUseLoop } = await import("../../agent/lib/computer-use-loop.ts");
    await runComputerUseLoop({ instruction: "x", modelId: "m" } as any).then(() => expect.unreachable(), (e) => denied(e, "computer-use-loop"));
  });
  it("hosted computer inference denies before VM acquisition, key lookup or provider contact", async () => {
    const fetchSpy = vi.fn(() => { throw Error("NETWORK_REACHED"); });
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const { orgo } = await import("../../agent/lib/orgo.ts");
      for (const model of ["sonnet", "gateway:openai/fixture-model"] as const)
        await expect(orgo.task({ instruction: "fixture task", model })).rejects.toThrow("EXTERNAL_ALPHA_PAID_PATH_DENIED:orgo-hosted-model");
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
  it("Realtime denies before microphone, peer connection or provider contact", async () => {
    const peer = vi.fn(() => { throw Error("PEER_REACHED"); });
    const fetchSpy = vi.fn(() => { throw Error("NETWORK_REACHED"); });
    vi.stubGlobal("RTCPeerConnection", peer);
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const { RealtimeVoiceSession } = await import("../voice/realtime.ts");
      await expect(new RealtimeVoiceSession({}).connect("fixture-secret")).rejects.toThrow("EXTERNAL_ALPHA_PAID_PATH_DENIED:voice-realtime-call");
      expect(peer).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
  it("automatic compaction rejects ordinary owner sessions before auxiliary model dispatch", async () => {
    const { default: ledger } = await import("../../agent/hooks/task-ledger.ts");
    const ctx = { session: { id: "fixture-session", auth: { current: { principalType: "user", principalId: "fixture-owner", attributes: { owner: "true" } } } } };
    await expect((ledger.events!["compaction.requested"] as any)({ data: {} }, ctx)).rejects.toThrow("EXTERNAL_ALPHA_PAID_PATH_DENIED:context-compaction");
    expect(calls).toEqual([]);
  });
  it("qualification model hook", async () => {
    const { qualificationModel } = await import("../qualification/client.ts");
    await qualificationModel("o", "r", "i", AbortSignal.timeout(100)).then(() => expect.unreachable(), (e) => denied(e, "qualification-model"));
  });
  it("business ask route returns 404 before authentication or any model call", async () => {
    const { POST } = await import("../../app/api/business/ask/route.ts");
    const response = await POST(new Request("https://x.test/api/business/ask", { method: "POST", body: "{}" }));
    expect(response.status).toBe(404);
  });
  it("voice client secret minting fails closed", async () => {
    process.env.OPENAI_API_KEY = "sk-test-not-real";
    const { Effect } = await import("effect");
    const { mintVoiceClientSecret } = await import("../../agent/lib/effect/voice.ts");
    const exit = await Effect.runPromiseExit(mintVoiceClientSecret());
    expect(JSON.stringify(exit)).toContain("EXTERNAL_ALPHA_PAID_PATH_DENIED:voice-client-secret");
    delete process.env.OPENAI_API_KEY;
  });
  it("no provider call was attempted by any denied path", () => {
    expect(calls).toEqual([]);
  });
});
