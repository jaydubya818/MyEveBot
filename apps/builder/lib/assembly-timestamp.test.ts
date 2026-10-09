import assert from "node:assert/strict";
import { test } from "node:test";
import { assembleDeployment, BUILDER_MANIFEST_FILE } from "./assemble";

const input = { projectName: "timestamp-qualification", features: [], instructions: "Offline fixture", schedules: [] };

test("normal assembly retains current-time metadata and ignores timestamp fields in request input", async () => {
  const before = Date.now();
  const files = await assembleDeployment({ ...input, timestamp: "2000-01-01T00:00:00.000Z" } as typeof input);
  const after = Date.now();
  const metadata = JSON.parse(Buffer.from(files.find(file => file.file === BUILDER_MANIFEST_FILE)!.data, "base64").toString());
  assert.ok(Date.parse(metadata.deployedAt) >= before && Date.parse(metadata.deployedAt) <= after);
});

test("explicit internal timestamp makes every raw export byte reproducible", async () => {
  const timestamp = "2026-10-09T00:00:00.000Z";
  const first = await assembleDeployment(input, { timestamp });
  const second = await assembleDeployment(input, { timestamp });
  assert.deepEqual(first, second);
  const metadata = JSON.parse(Buffer.from(first.find(file => file.file === BUILDER_MANIFEST_FILE)!.data, "base64").toString());
  assert.equal(metadata.deployedAt, timestamp);
});

test("invalid or noncanonical explicit timestamps are denied", async () => {
  for (const timestamp of ["", "invalid", "2026-10-09", "2026-10-09T00:00:00Z", "2026-10-09T00:00:00.000+00:00", "2026-02-30T00:00:00.000Z", "2026-10-09T00:00:60.000Z", null, 0]) {
    await assert.rejects(assembleDeployment(input, { timestamp } as never), /Invalid assembly timestamp/);
  }
});
