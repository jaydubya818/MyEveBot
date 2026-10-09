import { afterEach, describe, expect, it } from "vitest";

import type { ComputerSessionView } from "./computer-types.ts";
import {
  LiveSessionLostError,
  liveSessionCapabilitiesFor,
  liveSessionProviderFor,
  setLiveSessionProviderForTests,
  type LiveSessionCapabilities,
  type LiveSessionProvider,
  type OwnerInput,
} from "./live-session-provider.ts";

const capabilities: LiveSessionCapabilities = {
  liveView: true, humanTakeover: true, pause: true, resume: true,
  ownerInput: true, screenCapture: true, browserObservation: true, persistentProfile: false,
};

function session(overrides: Partial<ComputerSessionView> = {}): ComputerSessionView {
  return {
    id: "computer_a", ownerId: "owner_a", agentId: "agent_a", agentName: "Sofie",
    goalId: "goal_a", goalTitle: "Goal", taskId: "task_a", taskTitle: "Task",
    runId: "run_a", runTitle: "Run", runtimeSessionId: "runtime_a", sandboxId: "sandbox_a",
    status: "ready", environmentType: "vercel-sandbox", startedAt: "2026-09-18T00:00:00.000Z",
    lastActivityAt: "2026-09-18T00:00:00.000Z", completedAt: null, expiresAt: "2099-09-18T00:00:00.000Z",
    resourceLimits: { maxRuntimeSeconds: 1_800, maxBrowserActions: 100, maxFileBytes: 1_000_000, terminalTimeoutSeconds: 30 },
    networkPolicy: {}, failureCode: null, failureSummary: null,
    browser: { id: "browser_a", status: "ready", currentUrl: "https://example.com", startedAt: "2026-09-18T00:00:00.000Z", lastActivityAt: "2026-09-18T00:00:00.000Z", completedAt: null },
    actionCount: 0, artifacts: [],
    control: { controller: "AGENT", version: 1, provider: "fake", claimedAt: null, heartbeatAt: null, expiresAt: null, transitionReason: null, viewFreshAt: "2026-09-18T00:00:00.000Z", capabilities, ownerInputEnabled: false },
    ...overrides,
  };
}

class FakeProvider implements LiveSessionProvider {
  id = "fake-live";
  active = true;
  transport = true;
  controller: "AGENT" | "OWNER" = "AGENT";
  inputs = 0;
  lastInputType: OwnerInput["type"] | null = null;
  getCapabilities(_session: ComputerSessionView) { return capabilities; }
  async getLiveView(_session: ComputerSessionView) { if (!this.transport) throw new Error("transport lost"); return { bytes: new Uint8Array([1]), contentType: "image/png" as const, currentUrl: "https://example.com", observedAt: new Date().toISOString() }; }
  async acquireOwnerControl(_session: ComputerSessionView, _version: number) { if (!this.transport) throw new Error("transport lost"); this.controller = "OWNER"; }
  async sendOwnerInput(_session: ComputerSessionView, _version: number, input: OwnerInput) { if (!this.active) throw new LiveSessionLostError(); if (!this.transport || this.controller !== "OWNER") throw new Error("input unavailable"); this.inputs += 1; this.lastInputType = input.type; }
  async releaseOwnerControl(_session: ComputerSessionView, _version: number) { this.controller = "AGENT"; }
  async observe(value: ComputerSessionView) { if (!this.active) throw new LiveSessionLostError(); return { computerSessionId: value.id, browserSessionId: value.browser?.id ?? null, providerSessionId: value.sandboxId, currentUrl: value.browser?.currentUrl ?? null, browserStatus: value.browser?.status ?? null, sessionStatus: value.status, observedAt: new Date().toISOString() }; }
  async closeLiveView(_session: ComputerSessionView) { this.transport = false; }
  async getHealth(_session: ComputerSessionView) { return { available: this.active && this.transport, sessionExists: this.active, browserConnected: this.active && this.transport, checkedAt: new Date().toISOString() }; }
  async stopSession(_session: ComputerSessionView) { this.active = false; }
}

afterEach(() => setLiveSessionProviderForTests(null));

describe("LiveSessionProvider contract", () => {
  it("discovers capabilities without leaking provider logic into callers", () => { const provider = new FakeProvider(); setLiveSessionProviderForTests(provider); expect(liveSessionCapabilitiesFor(session())).toEqual(capabilities); });
  it("keeps watch read-only and reports a fresh frame", async () => { const provider = new FakeProvider(); const frame = await provider.getLiveView(session()); expect(provider.controller).toBe("AGENT"); expect(Date.now() - new Date(frame.observedAt).getTime()).toBeLessThan(1_000); });
  it("acquires control before accepting owner input and releases it explicitly", async () => { const provider = new FakeProvider(); await expect(provider.sendOwnerInput(session(), 2, { type: "click", x: 1, y: 1 })).rejects.toThrow("unavailable"); await provider.acquireOwnerControl(session(), 2); await provider.sendOwnerInput(session(), 2, { type: "doubleClick", x: 1, y: 1 }); expect(provider.inputs).toBe(1); expect(provider.lastInputType).toBe("doubleClick"); await provider.releaseOwnerControl(session(), 2); expect(provider.controller).toBe("AGENT"); });
  it("reports transport loss separately from provider session loss", async () => { const provider = new FakeProvider(); provider.transport = false; expect((await provider.getHealth(session())).sessionExists).toBe(true); provider.active = false; await expect(provider.observe(session())).rejects.toBeInstanceOf(LiveSessionLostError); });
  it("supports explicit view close and session stop", async () => { const provider = new FakeProvider(); await provider.closeLiveView(session()); expect((await provider.getHealth(session())).available).toBe(false); provider.transport = true; await provider.stopSession(session()); expect((await provider.getHealth(session())).sessionExists).toBe(false); });
  it("keeps takeover unsupported until exact Run, Browser, and provider bindings exist", () => { const production = liveSessionProviderFor("vercel-sandbox"); expect(production.getCapabilities(session({ runId: null })).humanTakeover).toBe(false); expect(production.getCapabilities(session({ browser: null })).liveView).toBe(false); expect(production.getCapabilities(session({ sandboxId: null })).ownerInput).toBe(false); expect(production.getCapabilities(session()).humanTakeover).toBe(true); });
  it("never stores synthetic sensitive input in provider contract state", async () => { const provider = new FakeProvider(); const marker = "MYEVE_TAKEOVER_SECRET_QUALIFICATION_123"; await provider.acquireOwnerControl(session(), 2); await provider.sendOwnerInput(session(), 2, { type: "text", text: marker }); expect(JSON.stringify(provider)).not.toContain(marker); });
});
