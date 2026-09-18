import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("persistent browser profiles preserve credential and Agent boundaries", async () => {
  const [migration, repository, tool, route] = await Promise.all([
    readFile(new URL("migrations/0014_persistent_browser_profiles.sql", root), "utf8"),
    readFile(new URL("lib/browser-profiles.ts", root), "utf8"),
    readFile(new URL("agent/tools/computer.ts", root), "utf8"),
    readFile(new URL("app/api/computer-profiles/route.ts", root), "utf8"),
  ]);
  assert.match(migration, /UNIQUE \(owner_id, agent_id\)/);
  assert.doesNotMatch(migration, /password|cookie|credential|vnc/i);
  assert.match(repository, /not shared with the current Agent/);
  assert.match(repository, /persistent_browser_profile_grants/);
  assert.match(tool, /authentication_failed/);
  assert.match(tool, /paused for owner takeover/);
  assert.match(route, /RESET \$\{profileId\}/);
  assert.match(route, /revokeBrowserProfileGrant/);
});
