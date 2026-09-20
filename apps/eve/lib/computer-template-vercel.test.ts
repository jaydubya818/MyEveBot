import { beforeEach, describe, expect, it, vi } from "vitest";
const sdk = vi.hoisted(() => ({ get: vi.fn(), snapshot: vi.fn(), create: vi.fn(), install: vi.fn() }));
vi.mock("@vercel/sandbox", () => ({ Sandbox: { get: sdk.get, create: sdk.create }, Snapshot: { get: sdk.snapshot } }));
vi.mock("eve/sandbox/vercel", () => ({ vercel: () => ({ create: sdk.create }) }));
vi.mock("@agent-browser/eve/sandbox", () => ({ installAgentBrowser: sdk.install }));
import { preparationResourceName, vercelTemplateProvider as provider } from "./computer-template-vercel.ts";
import type { Preparation } from "./computer-template-lifecycle.ts";
const row: Preparation = { id: "uuid", scope: "scope", fingerprint: "fingerprint", provider: "vercel", state: "PREPARING", deadline: Date.now() + 1000, retryAfter: 0, templateId: null, failure: null };
const signal = () => AbortSignal.timeout(1000);
function resource() {
  return { name: preparationResourceName(row), status: "stopped", currentSnapshotId: "snap",
    tags: { application: "myeve-template-v1", preparation: row.id, scope: row.scope, fingerprint: row.fingerprint },
    stop: vi.fn().mockResolvedValue(undefined), delete: vi.fn().mockResolvedValue(undefined),
  };
}
beforeEach(() => { vi.resetAllMocks(); sdk.snapshot.mockResolvedValue({ status: "created" }); });
describe("Vercel preparation adapter with no provider calls", () => {
  it("requires matching ownership AND a live snapshot", async () => {
    const sandbox = resource(); sdk.get.mockResolvedValue(sandbox);
    expect((await provider.inspect(row, signal())).state).toBe("READY");
    sandbox.tags.fingerprint = "other";
    expect((await provider.inspect(row, signal())).state).toBe("STALE");
    sandbox.tags.fingerprint = row.fingerprint; sdk.snapshot.mockRejectedValue({ status: 404 });
    expect((await provider.inspect(row, signal())).state).toBe("MISSING");
  });
  it.each([true, false])("deletes and verifies even when stop failure=%s", async stopFails => {
    const sandbox = resource(); if (stopFails) sandbox.stop.mockRejectedValue(new Error("provider-secret"));
    sdk.get.mockResolvedValueOnce(sandbox).mockRejectedValue({ status: 404 });
    sdk.snapshot.mockRejectedValue({ status: 404 });
    expect(await provider.cleanup(row, signal())).toBe(true);
    expect(sandbox.delete).toHaveBeenCalledOnce(); expect(sdk.get).toHaveBeenCalledTimes(2);
  });
  it.each([true, false])("retains recovery work when delete fails; stop failure=%s", async stopFails => {
    const sandbox = resource(); if (stopFails) sandbox.stop.mockRejectedValue(new Error("stop failed"));
    sandbox.delete.mockRejectedValue(new Error("delete failed")); sdk.get.mockResolvedValue(sandbox);
    expect(await provider.cleanup(row, signal())).toBe(false);
    expect(sandbox.delete).toHaveBeenCalledOnce();
  });
  it("never stops or deletes a resource without ownership proof", async () => {
    const sandbox = resource(); sandbox.tags.scope = "another-owner"; sdk.get.mockResolvedValue(sandbox);
    expect(await provider.cleanup(row, signal())).toBe(false); expect(sandbox.stop).not.toHaveBeenCalled(); expect(sandbox.delete).not.toHaveBeenCalled();
  });
  it("can clean an owned incompatible template without confusing compatibility with ownership", async () => {
    const sandbox = resource(); sandbox.tags.fingerprint = "old-contract";
    sdk.get.mockResolvedValueOnce(sandbox).mockRejectedValue({ status: 404 }); sdk.snapshot.mockRejectedValue({ status: 404 });
    expect(await provider.cleanup(row, signal())).toBe(true); expect(sandbox.delete).toHaveBeenCalledOnce();
  });
  it("persists a snapshot identity and keeps cleanup pending until snapshot deletion is verified", async () => {
    const sandbox = resource(), identify = vi.fn().mockResolvedValue(undefined);
    sdk.get.mockResolvedValueOnce(sandbox).mockRejectedValue({ status: 404 });
    expect(await provider.cleanup(row, signal(), identify)).toBe(false);
    expect(identify).toHaveBeenCalledWith("snap");
    expect(sandbox.delete).toHaveBeenCalledWith(expect.objectContaining({ deleteOrphanSnapshots: true }));
    sdk.snapshot.mockResolvedValue({ status: "deleted" });
    expect(await provider.cleanup({ ...row, templateId: "snap" }, signal())).toBe(true);
  });
  it("uses exclusive creation and carries cancellation into bootstrap commands", async () => {
    const sandbox = { ...resource(), runCommand: vi.fn().mockResolvedValue({ exitCode: 0 }), update: vi.fn().mockResolvedValue(undefined), snapshot: vi.fn().mockResolvedValue({ snapshotId: "new" }) };
    sdk.create.mockResolvedValue(sandbox);
    expect(await provider.prepare(row, signal())).toEqual({ templateId: "new" });
    expect(sdk.get).not.toHaveBeenCalled();
    expect(sdk.create).toHaveBeenCalledWith(expect.objectContaining({ name: preparationResourceName(row), persistent: false, signal: expect.any(AbortSignal) }));
    expect(sandbox.runCommand).toHaveBeenCalledWith(expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(sandbox.update).toHaveBeenCalledWith({ networkPolicy: "deny-all" }, expect.anything());
  });
  it("classifies provider errors without exposing provider bodies", () => {
    expect([401, 402, 429, 503].map(status => provider.classify({ status, text: "secret" }))).toEqual(["authentication", "quota", "rate_limit", "provider_unavailable"]);
  });
});
