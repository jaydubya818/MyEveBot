import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

test("raw export verifier rejects changed bytes, extra files and source substitution", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "myapps-export-verifier-"));
  const source = { commit: "a".repeat(40), tree: "b".repeat(40), assemblyTimestamp: "2026-10-09T00:00:00.000Z", timestampSource: "git-committer-time" };
  const metadata = JSON.stringify({ deployedAt: source.assemblyTimestamp });
  const hashes = { "eve-builder.json": createHash("sha256").update(metadata).digest("hex") };
  const left = path.join(root, "left"), right = path.join(root, "right");
  const receipt = (destination: string) => ({ destination, source, hashes, files: 1, shared: [] });
  const verify = () => execFileSync(process.execPath, [fileURLToPath(new URL("../scripts/qualification-reproducible.mjs", import.meta.url)), left, right, path.join(root, "result.json")], { stdio: "pipe" });
  try {
    for (const destination of [left, right]) {
      await mkdir(destination);
      await writeFile(path.join(destination, "eve-builder.json"), metadata);
      await writeFile(`${destination}.json`, JSON.stringify(receipt(destination)));
    }
    verify();
    await rm(path.join(root, "result.json"));
    await writeFile(path.join(right, "eve-builder.json"), metadata + "\n");
    assert.throws(verify, /Actual raw export bytes/);
    await writeFile(path.join(right, "eve-builder.json"), metadata);
    await writeFile(path.join(right, "extra.txt"), "unrecorded");
    assert.throws(verify);
    await rm(path.join(right, "extra.txt"));
    await writeFile(`${right}.json`, JSON.stringify({ ...receipt(right), source: { ...source, commit: "c".repeat(40) } }));
    assert.throws(verify, /Exact source identities/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
