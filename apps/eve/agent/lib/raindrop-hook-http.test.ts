import type { HookContext } from "eve/hooks";
import { createServer } from "node:http";
import { afterEach, expect, it, vi } from "vitest";
import { RaindropTurnClient, type RaindropTurnSnapshot } from "./raindrop-client";

const fixture = vi.hoisted(() => ({
  client: null as { publish(snapshot: RaindropTurnSnapshot, deadline?: number): Promise<void> } | null,
  durable: undefined as unknown,
}));
vi.mock("eve/context", () => ({ defineState: <T>(_name: string, initial: () => T) => ({
  get: () => { fixture.durable ??= initial(); return fixture.durable as T; },
  update: (update: (current: T) => T) => { fixture.durable ??= initial(); fixture.durable = update(fixture.durable as T); },
}) }));
vi.mock("../instrumentation/telemetry", async importOriginal => {
  const actual = await importOriginal<typeof import("../instrumentation/telemetry")>();
  const { shouldRecordTelemetryIo } = await import("./telemetry-privacy");
  // Vitest caches mock factories across resetModules. Live fixture bindings
  // ensure each case/restart uses its own owned server and privacy setting.
  return { ...actual, get raindrop() { return fixture.client; },
    get RECORD_IO() { return shouldRecordTelemetryIo(); } };
});
afterEach(() => { fixture.client = null; fixture.durable = undefined; vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.resetModules(); });
const context = {
  agent: { name: "eve-agent" }, channel: { kind: "http" },
  session: { id: "synthetic-durable-session", turn: { sequence: 0 }, auth: {
    current: { principalId: "authenticated-owner-1" }, initiator: { principalId: "different-initiator" },
  } },
} as unknown as HookContext;
const start = "2026-10-23T16:00:00.000Z";
const meta = (at = start) => ({ id: crypto.randomUUID(), at });
interface WireEvent {
  event_id: string; user_id: string; timestamp: string; is_pending: boolean;
  ai_data: { input?: string; output?: string; convo_id: string };
  properties: Record<string, unknown>;
}
async function loadEvents() {
  const hook = (await import("../hooks/raindrop")).default;
  if (hook.events === undefined) throw new Error("Missing hook events");
  return hook.events;
}
async function withIngest(run: (requests: WireEvent[], restartClient: () => void) => Promise<void>, failTerminal = false) {
  const requests: WireEvent[] = [];
  let terminalAttempts = 0;
  const server = createServer(async (req, res) => {
    let text = ""; for await (const chunk of req) text += chunk;
    const body = JSON.parse(text) as WireEvent; requests.push(body);
    const fail = failTerminal && body.properties.status === "completed" && ++terminalAttempts <= 3;
    res.writeHead(fail ? 500 : 204, { "retry-after": "0" }); res.end();
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Missing owned ingest address");
  const restartClient = () => { fixture.client = new RaindropTurnClient("synthetic-key", { endpoint: `http://127.0.0.1:${address.port}/v1/` }); };
  restartClient();
  try { await run(requests, restartClient); }
  finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
}
async function received(events: Awaited<ReturnType<typeof loadEvents>>) {
  await events["message.received"]?.({ type: "message.received", meta: meta(), data: {
    turnId: "turn_0", sequence: 0, message: "Contact fixture@example.invalid", parts: [{ type: "text", text: "Contact fixture@example.invalid" }],
  } }, context);
}
async function complete(events: Awaited<ReturnType<typeof loadEvents>>) {
  await events["message.completed"]?.({ type: "message.completed", meta: meta("2026-10-23T16:00:02.000Z"), data: {
    turnId: "turn_0", sequence: 0, stepIndex: 1, finishReason: "stop", message: "Draft sent to nobody: fixture@example.invalid",
  } }, context);
  const step = { type: "step.completed" as const, meta: meta("2026-10-23T16:00:02.500Z"), data: {
    turnId: "turn_0", sequence: 0, stepIndex: 1, finishReason: "stop" as const,
    usage: { inputTokens: 12, outputTokens: 8, cacheReadTokens: 2, cacheWriteTokens: 3, costUsd: 0.01 },
  } };
  await events["step.completed"]?.(step, context);
  await events["step.completed"]?.(step, context); // same durable step must not double-count
  await events["turn.completed"]?.({ type: "turn.completed", meta: meta("2026-10-23T16:00:03.000Z"),
    data: { turnId: "turn_0", sequence: 0 } }, context);
}

it("retries a real rejected terminal POST after a durable restart with full redacted state and no duplicate usage", async () => {
  vi.stubEnv("OTEL_RECORD_IO", "true");
  const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  await withIngest(async (requests, restartClient) => {
    await received(await loadEvents());
    restartClient(); vi.resetModules();
    await complete(await loadEvents());
    expect(requests).toHaveLength(5); // running + three rejected sends + next hook attempt
    expect(requests[0]?.properties.status).toBe("running");
    const terminal = requests.slice(1);
    expect(new Set(requests.map(event => event.event_id)).size).toBe(1);
    expect(new Set(terminal.map(event => JSON.stringify(event))).size).toBe(1);
    for (const event of terminal) {
      expect(event.user_id).toBe("authenticated-owner-1");
      expect(event.timestamp).toBe(start);
      expect(event.is_pending).toBe(false);
      expect(event.ai_data).toEqual({ input: "Contact <REDACTED EMAIL>",
        output: "Draft sent to nobody: <REDACTED EMAIL>", convo_id: context.session.id });
      expect(event.properties).toMatchObject({ status: "completed", input_tokens: 12, output_tokens: 8,
        cache_read_tokens: 2, cache_write_tokens: 3, cost_usd: 0.01, latency_ms: 3000,
        turn_started_at: start, turn_finished_at: "2026-10-23T16:00:03.000Z",
        usage_by_step: { "1": { input_tokens: 12, output_tokens: 8, cost_usd: 0.01 } } });
    }
    expect(fixture.durable).toEqual({});
    expect(warning).toHaveBeenCalledTimes(1);
    expect(warning.mock.calls.flat().join(" ")).not.toContain("fixture@example.invalid");
  }, true);
});

it.each(["explicit-off", "agentcard"])("keeps manual event bodies disabled under the %s privacy ceiling", async mode => {
  vi.stubEnv("OTEL_RECORD_IO", mode === "explicit-off" ? "false" : "true");
  if (mode === "agentcard") {
    vi.stubEnv("AGENTCARD_CLIENT_ID", "synthetic-client");
    vi.stubEnv("AGENTCARD_CLIENT_SECRET", "synthetic-secret");
  }
  await withIngest(async requests => {
    const events = await loadEvents(); await received(events); await complete(events);
    expect(requests).toHaveLength(2);
    for (const event of requests) {
      expect(event.ai_data.input).toBeUndefined();
      expect(event.ai_data.output).toBe("Content recording disabled by OTEL_RECORD_IO.");
      expect(event.properties.record_io).toBe(false);
    }
    expect(JSON.stringify(requests)).not.toContain("fixture@example.invalid");
    expect(fixture.durable).toEqual({});
  });
});

it("releases terminal state within one shared network budget with no background retry after timeout", async () => {
  vi.useFakeTimers(); vi.stubEnv("OTEL_RECORD_IO", "true");
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const send = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new Error("synthetic timeout")), { once: true });
  }));
  fixture.client = new RaindropTurnClient("synthetic-key", { endpoint: "http://127.0.0.1:1/v1/", fetchRequest: send });
  fixture.durable = { turn_0: { startedAt: start, inputAttachmentCount: 0, usageByStep: {} } };
  const events = await loadEvents();
  let settled = false;
  const completion = Promise.resolve(events["turn.completed"]?.({ type: "turn.completed", meta: meta(),
    data: { turnId: "turn_0", sequence: 0 } }, context)).then(() => { settled = true; });
  await vi.advanceTimersByTimeAsync(4_999); expect(settled).toBe(false);
  await vi.advanceTimersByTimeAsync(1); await completion;
  expect(fixture.durable).toEqual({}); expect(send).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(send).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
});
