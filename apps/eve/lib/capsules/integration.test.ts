import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { digest } from "./format";
import { integrationAcceptance, type AcceptanceFactory } from "../../test/capsules/integration/acceptance";
import { ActivationFixture, phases, request } from "../../test/capsules/integration/fixture";

integrationAcceptance({ mode: "fixture", disposable: true, async open() {
  const dir = mkdtempSync(join(tmpdir(), "capsule-activation-"));
  return { driver: new ActivationFixture(join(dir, "fixture.sqlite")),
    policy: { async canExport(item, context) { return { allowed: true, policyRevision: "fixture-only-v1", reason: "Explicit synthetic source", itemDigest: digest(item), contextDigest: digest(context) }; } },
    async cleanup() { rmSync(dir, { recursive: true, force: true }); } };
} });
if (process.env.CAPSULE_CANONICAL_ACCEPTANCE === "1") {
  const path = process.env.CAPSULE_CANONICAL_DRIVER;
  if (!path || !path.startsWith("/")) throw new Error("Set an absolute CAPSULE_CANONICAL_DRIVER path to a disposable canonical driver");
  const factory = (await import(/* @vite-ignore */ pathToFileURL(path).href)).default as AcceptanceFactory;
  if (factory.mode !== "canonical" || factory.disposable !== true) throw new Error("Canonical disposable target required");
  integrationAcceptance(factory);
} else describe.skip("Canonical Memory acceptance: INTEGRATION PENDING (no canonical driver)", () => { it("runs the same acceptance suite against canonical hooks", () => {}); });

describe("Activation process-loss durability", () => {
  it.each(phases)("SIGKILL at %s leaves all or none, and recovery is idempotent", async phase => {
    const dir = mkdtempSync(join(tmpdir(), "capsule-activation-crash-")); const path = join(dir, "fixture.sqlite");
    try {
      const child = spawnSync(process.execPath, ["--import", "tsx", resolve("test/capsules/integration/process-loss.ts"), path, phase], { cwd: process.cwd(), encoding: "utf8" });
      expect(child.signal, child.stderr).toBe("SIGKILL");
      const fixture = new ActivationFixture(path);
      try {
        const current = (await fixture.snapshot()).current;
        const committed = ["activate_commit", "rollback_row", "rollback_receipt"].includes(phase);
        expect(current).toHaveLength(committed ? 2 : 0);
        const receipt = await fixture.recover("acceptance-batch");
        expect(receipt?.result ?? null).toBe(phase === "rollback_commit" ? "rolled_back" : committed ? "active" : null);
        if (!receipt) { const batch = request(); await fixture.stage(batch); await fixture.validate(batch.id); await fixture.activate(batch.id, (await fixture.preview(batch.id)).reviewDigest); }
        if ((await fixture.recover("acceptance-batch"))?.result === "active") await fixture.rollback("acceptance-batch");
        await fixture.restart(); expect((await fixture.snapshot()).current).toHaveLength(0);
      } finally { await fixture.close(); }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
