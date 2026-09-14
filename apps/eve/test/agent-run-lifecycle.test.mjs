import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("persistent Agent runs use Eve's durable turn id", async () => {
  const source = await readFile(
    new URL("../agent/instructions/persistent-agent.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /bindExecutorRun\(ctx\.session\.id, durableTurnId\(event\),/);
  assert.match(source, /typeof turnId !== "string"/);
  assert.doesNotMatch(source, /bindExecutorRun\(ctx\.session\.id, String\(ctx\.messages\.length\),/);
});
