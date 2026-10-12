// Local build artifact qualification only. Never deploys or invokes a provider.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile, rm, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { assembleDeployment, templateRoot } from "../lib/assemble";
import { TEMPLATE_SOURCE_MANIFEST } from "../lib/template-source";
import { STANDALONE_SOURCE_INPUTS } from "../lib/shared-myapps";
import { FEATURE_IDS } from "../lib/config";

const root = await templateRoot(), repository = path.resolve(root, "../..");
const tripwire = path.join(root, "lib/synthetic-private-custody.json");
const marker = "SYNTHETIC_UNTRACKED_BUILD_TRIPWIRE";
if (process.argv[2] === "--prepare") {
  await writeFile(tripwire, marker, { flag: "wx" });
  console.log("Prepared synthetic untracked Builder trace fixture");
  process.exit(0);
}
assert.equal(await readFile(tripwire, "utf8"), marker, "Run --prepare before the Builder build");
const inventory = JSON.parse(await readFile(path.join(root, TEMPLATE_SOURCE_MANIFEST), "utf8"));
const inputs = [...Object.keys(inventory.files), TEMPLATE_SOURCE_MANIFEST];
await import("./verify-template-trace");
const routes = ["deploy", "update", "template-version"];
const tracePath = path.join(repository, "apps/builder/.next/server/app/api/deploy/route.js.nft.json");
const originalTrace = await readFile(tracePath);
try {
  const tampered = JSON.parse(originalTrace.toString());
  tampered.files.push(path.relative(path.dirname(tracePath), tripwire));
  await writeFile(tracePath, JSON.stringify(tampered));
  const denied = spawnSync(process.execPath, ["--import", "tsx", "apps/builder/scripts/verify-template-trace.ts"], { cwd: repository, encoding: "utf8" });
  assert.notEqual(denied.status, 0, "An untracked file added after tracing must fail the mandatory build gate");
  assert.match(denied.stderr, /exact template inventory only/);
} finally { await writeFile(tracePath, originalTrace); }
const input = { projectName: "sealed-bundle-fixture", features: [...FEATURE_IDS], instructions: "Synthetic offline packaging fixture", schedules: [] };
const options = { timestamp: "2026-10-12T00:00:00.000Z" };
const expected = await assembleDeployment(input, options);
const bundle = await mkdtemp(path.join(tmpdir(), "sealed-builder-bundle-")), cwd = process.cwd();
try {
  for (const file of [...inputs.map(file => `apps/eve/${file}`), ...STANDALONE_SOURCE_INPUTS]) {
    const target = path.join(bundle, file); await mkdir(path.dirname(target), { recursive: true });
    await copyFile(path.join(repository, file), target);
  }
  await writeFile(path.join(bundle, "apps/eve/lib/synthetic-private-custody.json"), "SYNTHETIC_UNTRACKED_BUILD_TRIPWIRE");
  process.chdir(bundle);
  const actual = await assembleDeployment(input, options);
  assert.deepEqual(actual, expected, "No-Git bundle must preserve every export byte and exclude unrelated local files");
  const changed = "apps/eve/lib/eve-template-stamp.ts";
  await writeFile(path.join(bundle, changed), "SYNTHETIC_CHANGED_BYTES");
  await assert.rejects(assembleDeployment(input, options), /Builder source inventory mismatch/);
  console.log(JSON.stringify({ status: "PASS", routes, templateInputs: inputs.length, exportedFiles: actual.length,
    inventorySha256: createHash("sha256").update(await readFile(path.join(root, TEMPLATE_SOURCE_MANIFEST))).digest("hex"),
    exactTraceInventory: true, injectedTraceDenied: true, noGitByteParity: true, changedSourceDenied: true, syntheticOnly: true, deployment: "NOT_RUN" }, null, 2));
} finally { process.chdir(cwd); await rm(bundle, { recursive: true, force: true }); await rm(tripwire); }
