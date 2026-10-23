import { afterEach, describe, expect, it, vi } from "vitest";
import { trace } from "@opentelemetry/api";
import { RaindropTurnClient, mergeRaindropProvenance, raindropDeploymentProvenance, raindropExplicitProvenanceKeys, redactRaindropText, type RaindropTurnSnapshot } from "./raindrop-client";

const snapshot: RaindropTurnSnapshot = {
  eventId: "synthetic-owner-1-turn", event: "sofie_agent_turn", userId: "authenticated-owner-1",
  convoId: "synthetic-conversation", timestamp: "2026-10-23T16:00:00.000Z",
  input: "Contact fixture@example.invalid", output: "A concise answer.",
  properties: { status: "completed", input_tokens: 12, output_tokens: 8, cost_usd: 0.01,
    usage_by_step: { "0": { input_tokens: 12, output_tokens: 8, cost_usd: 0.01 } } },
};
const endpoint = "http://127.0.0.1:1/v1/";
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.useRealTimers(); vi.doUnmock("@doist/piiranha"); vi.resetModules(); });

describe("manual Raindrop full-snapshot transport", () => {
  it("preserves validated deployment/explicit provenance and refuses unsupported identity guesses", () => {
    const sha = "a".repeat(40), explicit = "b".repeat(64);
    expect(raindropDeploymentProvenance({ VERCEL: "1", VERCEL_GIT_COMMIT_SHA: sha, VERCEL_GIT_COMMIT_REF: "main" }))
      .toEqual({ "raindrop.app.commit_sha": sha });
    expect(raindropDeploymentProvenance({ VERCEL: "1", VERCEL_GIT_COMMIT_SHA: sha, RAINDROP_COMMIT_SHA: explicit,
      RAINDROP_BRANCH: "reviewed-branch", RAINDROP_COMMIT_DIRTY: "false" })).toEqual({
      "raindrop.app.commit_sha": explicit, "raindrop.app.branch": "reviewed-branch", "raindrop.app.commit_dirty": false,
    });
    expect(raindropDeploymentProvenance({ VERCEL: "1", VERCEL_GIT_COMMIT_SHA: sha,
      VERCEL_GIT_COMMIT_REF: "main", RAINDROP_GIT_DETECT_BRANCH: "1" }))
      .toEqual({ "raindrop.app.commit_sha": sha, "raindrop.app.branch": "main" });
    for (const env of [{ VERCEL_GIT_COMMIT_SHA: sha },
      { VERCEL: "1", VERCEL_GIT_COMMIT_SHA: sha, RAINDROP_COMMIT_SHA: "invalid" },
      { VERCEL: "1", VERCEL_GIT_COMMIT_SHA: sha, RAINDROP_GIT_AUTO_DETECT: "false" },
      { VERCEL: "1", VERCEL_GIT_COMMIT_SHA: sha, RAINDROP_GIT_SOURCE_DIRECTORY: "/another/repository" }]) {
      expect(raindropDeploymentProvenance(env)).toEqual({});
    }
  });

  it("keeps the server deployment snapshot in manual events while retaining explicit operation metadata", async () => {
    const sha = "a".repeat(40);
    vi.stubEnv("VERCEL", "1"); vi.stubEnv("VERCEL_GIT_COMMIT_SHA", sha);
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    const client = new RaindropTurnClient("synthetic-key", { endpoint, fetchRequest: send });
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "b".repeat(40));
    await client.publish(snapshot);
    expect(JSON.parse(String(send.mock.calls[0]?.[1]?.body)).properties["raindrop.app.commit_sha"]).toBe(sha);
    const explicit = "c".repeat(40);
    await client.publish({ ...snapshot, properties: { ...snapshot.properties, "raindrop.app.commit_sha": explicit } });
    expect(JSON.parse(String(send.mock.calls[1]?.[1]?.body)).properties["raindrop.app.commit_sha"]).toBe(explicit);
  });

  it("does not attach another source's automatic dirty/branch to explicit operation or aliased span identities", () => {
    const source = "a".repeat(40), explicit = "b".repeat(40);
    const automatic = { "raindrop.app.commit_sha": source, "raindrop.app.commit_dirty": true, "raindrop.app.branch": "deployment" };
    expect(mergeRaindropProvenance({ "raindrop.app.commit_sha": explicit }, automatic))
      .toEqual({ "raindrop.app.commit_sha": explicit });
    for (const prefix of ["", "ai.telemetry.metadata.", "traceloop.association.properties."]) {
      const field = `${prefix}raindrop.app.commit_sha`;
      expect(mergeRaindropProvenance({ [field]: explicit }, automatic, true)).toEqual({ [field]: explicit });
    }
    expect(mergeRaindropProvenance({ "raindrop.app.commit_sha": explicit, "raindrop.app.commit_dirty": false }, automatic))
      .toEqual({ "raindrop.app.commit_sha": explicit, "raindrop.app.commit_dirty": false });
    const serverExplicit = raindropExplicitProvenanceKeys({ RAINDROP_BRANCH: "operator-branch", RAINDROP_COMMIT_DIRTY: "false" });
    expect(mergeRaindropProvenance({ "raindrop.app.commit_sha": explicit }, {
      ...automatic, "raindrop.app.branch": "operator-branch", "raindrop.app.commit_dirty": false,
    }, false, serverExplicit)).toEqual({
      "raindrop.app.commit_sha": explicit, "raindrop.app.branch": "operator-branch", "raindrop.app.commit_dirty": false,
    });
  });
  it("sends a complete cold-start snapshot with canonical identities and locally redacted I/O", async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    const client = new RaindropTurnClient("synthetic-key", { endpoint, fetchRequest: send });
    await client.publish(snapshot);
    expect(send).toHaveBeenCalledTimes(1);
    const [url, init] = send.mock.calls[0]!;
    expect(String(url)).toBe(`${endpoint}events/track_partial`);
    expect(init?.redirect).toBe("error");
    expect(init?.headers).toEqual({ "content-type": "application/json", authorization: "Bearer synthetic-key" });
    expect(JSON.parse(String(init?.body))).toEqual({
      event_id: snapshot.eventId, user_id: snapshot.userId, event: snapshot.event,
      timestamp: snapshot.timestamp, is_pending: false,
      ai_data: { input: "Contact <REDACTED EMAIL>", output: snapshot.output, convo_id: snapshot.convoId },
      properties: { ...snapshot.properties, $context: {
        library: { name: "myeve-http", version: "1" }, metadata: { jsRuntime: "node", nodeVersion: process.version },
      } },
    });
  });

  it("orders the same event's terminal request after the running request without merging owners", async () => {
    const first = Promise.withResolvers<Response>();
    const send = vi.fn<typeof fetch>().mockImplementationOnce(() => first.promise)
      .mockResolvedValue(new Response(null, { status: 204 }));
    const client = new RaindropTurnClient("synthetic-key", { endpoint, fetchRequest: send });
    const running = client.publish({ ...snapshot, properties: { status: "running" } });
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    const terminal = client.publish(snapshot);
    const otherOwner = client.publish({ ...snapshot, eventId: "synthetic-owner-2-turn", userId: "authenticated-owner-2" });
    await otherOwner;
    expect(send).toHaveBeenCalledTimes(2);
    first.resolve(new Response(null, { status: 204 }));
    await Promise.all([running, terminal]);
    const events = send.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
    expect(events.map(event => [event.user_id, event.properties.status])).toEqual([
      ["authenticated-owner-1", "running"], ["authenticated-owner-2", "completed"], ["authenticated-owner-1", "completed"],
    ]);
    expect(events[2].event_id).toBe(events[0].event_id);
    expect(events[2].timestamp).toBe(snapshot.timestamp);
  });

  it("joins the manual event to the caller's trusted active trace without registering a provider", async () => {
    const traceId = "11111111111111111111111111111111";
    vi.spyOn(trace, "getActiveSpan").mockReturnValue(trace.wrapSpanContext({ traceId, spanId: "2222222222222222", traceFlags: 1 }));
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    await new RaindropTurnClient("synthetic-key", { endpoint, fetchRequest: send }).publish(snapshot);
    expect(JSON.parse(String(send.mock.calls[0]?.[1]?.body)).properties.trace_id).toBe(traceId);
  });

  it("retries the identical full snapshot and accepts a real HTTP success only", async () => {
    vi.useFakeTimers();
    const send = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("synthetic", { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = new RaindropTurnClient("synthetic-key", { endpoint, fetchRequest: send });
    const sent = client.publish(snapshot);
    await vi.advanceTimersByTimeAsync(1500); await sent;
    expect(send).toHaveBeenCalledTimes(3);
    expect(new Set(send.mock.calls.map(([, init]) => init?.body)).size).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects exhausted HTTP failure without leaking the response body and permits the hook's next attempt", async () => {
    vi.useFakeTimers();
    const send = vi.fn<typeof fetch>().mockImplementation(async () => new Response("private echo fixture@example.invalid", { status: 500 }));
    const client = new RaindropTurnClient("synthetic-key", { endpoint, fetchRequest: send });
    const result = client.publish(snapshot).catch(error => error as Error);
    await vi.advanceTimersByTimeAsync(1500);
    expect((await result)?.message).toBe("Raindrop event export failed after 3 attempts (HTTP 500)");
    send.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await client.publish(snapshot);
    expect(send).toHaveBeenCalledTimes(4);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("aborts a hung request at the overall five-second publication deadline", async () => {
    vi.useFakeTimers();
    const send = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("private transport details")), { once: true });
    }));
    const result = new RaindropTurnClient("synthetic-key", { endpoint, fetchRequest: send }).publish(snapshot).catch(error => error as Error);
    await vi.advanceTimersByTimeAsync(5_000);
    expect((await result)?.message).toBe("Raindrop event export deadline exceeded");
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls.every(([, init]) => init?.signal?.aborted)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("includes a long Retry-After in the same deadline without a late POST", async () => {
    vi.useFakeTimers();
    const send = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null, { status: 429, headers: { "retry-after": "999999" } }))
      .mockResolvedValue(new Response(null, { status: 204 }));
    const result = new RaindropTurnClient("synthetic-key", { endpoint, fetchRequest: send }).publish(snapshot).catch(error => error as Error);
    await vi.advanceTimersByTimeAsync(4_999); expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect((await result)?.message).toBe("Raindrop event export deadline exceeded");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(send).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("includes queue wait in the deadline and releases an expired queued event before transport", async () => {
    vi.useFakeTimers();
    const send = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("synthetic hang")), { once: true });
    }));
    const client = new RaindropTurnClient("synthetic-key", { endpoint, fetchRequest: send });
    const running = client.publish({ ...snapshot, properties: { status: "running" } }).catch(error => error as Error);
    const terminal = client.publish(snapshot).catch(error => error as Error);
    await vi.advanceTimersByTimeAsync(5_000);
    expect((await running)?.message).toBe("Raindrop event export deadline exceeded");
    expect((await terminal)?.message).toBe("Raindrop event export deadline exceeded");
    expect(send).toHaveBeenCalledTimes(1);
    send.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await client.publish(snapshot);
    expect(send).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("fails closed before network if the public redactor fails, with a safe error", async () => {
    vi.doMock("@doist/piiranha", () => ({ SyncRedactor: class {
      redact() { throw new Error("fixture@example.invalid private echo"); }
    } }));
    const { RaindropTurnClient: FreshClient } = await import("./raindrop-client");
    const send = vi.fn<typeof fetch>();
    await expect(new FreshClient("synthetic-key", { endpoint, fetchRequest: send }).publish(snapshot))
      .rejects.toThrow("Raindrop local redaction failed");
    expect(send).not.toHaveBeenCalled();
  });

  it("retains the exact local category labels/order and leaves disabled categories intact across repeated calls", () => {
    const text = "4242 4242 4242 4242; 123 Example Street apt 4; 202-555-0100; 000-12-3456; fixture@example.invalid; password: fake-only; credentials: fake-user / fake-pass";
    const expected = "<REDACTED CREDIT CARD NUMBER>; <REDACTED ADDRESS>; <REDACTED PHONE NUMBER>; <REDACTED SOCIAL SECURITY NUMBER>; <REDACTED EMAIL>; <REDACTED SECRET> <REDACTED CREDENTIALS>";
    expect(redactRaindropText(text)).toBe(expected);
    expect(redactRaindropText(text)).toBe(expected);
    const disabled = "Ada Lovelace username: fixture-user 12345 https://example.invalid 192.0.2.1";
    expect(redactRaindropText(disabled)).toBe(disabled);
    expect(redactRaindropText("")).toBe("");
  });
});
