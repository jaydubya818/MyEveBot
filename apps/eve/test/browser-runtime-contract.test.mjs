import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("browser research is available on demand and has a complete lifecycle", async () => {
  const [instructions, policy, hook] = await Promise.all([
    readFile(new URL("agent/instructions/computer-runtime.ts", root), "utf8"),
    readFile(new URL("agent/tools/persistent-agent-policy.ts", root), "utf8"),
    readFile(new URL("agent/hooks/computer-runtime.ts", root), "utf8"),
  ]);
  assert.match(instructions, /browse this site/);
  assert.match(instructions, /available on demand/);
  assert.match(instructions, /return cited findings/);
  assert.match(instructions, /stop the ephemeral session/);
  assert.doesNotMatch(policy, /Start a computer session before using browser tools/);
  assert.match(hook, /ensureComputerForBrowserAction/);
});

test("lazy browser provisioning preserves owner takeover denial", async () => {
  const provisioning = await readFile(new URL("agent/lib/computer-provisioning.ts", root), "utf8");
  assert.match(provisioning, /session\?\.status === "paused"/);
  assert.match(provisioning, /paused for owner takeover/);
  assert.match(provisioning, /session\.agentId !== input\.agent\.id/);
});
