import assert from "node:assert/strict";
import { readFile, lstat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { templateRoot } from "../lib/assemble";
import { TEMPLATE_SOURCE_MANIFEST } from "../lib/template-source";
import { STANDALONE_SOURCE_INPUTS } from "../lib/shared-myapps";
import qualifiedMetadata from "../lib/template-dependency-metadata.json";

const root = await templateRoot(), repository = path.resolve(root, "../..");
const inventory = JSON.parse(await readFile(path.join(root, TEMPLATE_SOURCE_MANIFEST), "utf8"));
const inputs = [...Object.keys(inventory.files), TEMPLATE_SOURCE_MANIFEST];
const lockBytes = await readFile(path.join(repository, "package-lock.json"));
assert.equal(createHash("sha256").update(lockBytes).digest("hex"), qualifiedMetadata.packageLockSha256, "Dependency lock changed; packaging qualification required");
const lock = JSON.parse(lockBytes.toString());
const metadata: Record<string, { package: string; version: string; integrity: string; sha256: string }> = {};
// Next 16.3.8 adds these package-context files after trace excludes, when Eve
// is built alongside Builder. They are generated metadata, never template source.
const generatedPaths = [".next/package.json", ".next/build/package.json"].map(file => path.join(root, file));
const generatedMetadata: Record<string, string> = {};
async function regularFileBytes(file: string): Promise<Buffer> {
  const relative = path.relative(repository, file);
  assert.ok(!relative.startsWith("..") && !path.isAbsolute(relative), "Trace metadata must remain inside the repository");
  let component = repository;
  for (const part of relative.split(path.sep)) {
    component = path.join(component, part);
    assert.ok(!(await lstat(component)).isSymbolicLink(), "Trace metadata cannot follow a symlink");
  }
  assert.ok((await lstat(file)).isFile(), "Trace metadata must be a regular file");
  return readFile(file);
}
async function verifyDependencyMetadata(file: string): Promise<void> {
  const relative = path.relative(repository, file).split(path.sep).join("/");
  assert.ok(relative.startsWith("apps/eve/node_modules/") && relative.endsWith("/package.json"), "Unexpected source outside template inventory");
  const qualified = (qualifiedMetadata.files as Record<string, {package:string;version:string;integrity:string;sha256:string}>)[relative];
  assert.ok(qualified, "Unqualified dependency metadata path");
  const owner = qualified.package;
  const locked = lock.packages[owner];
  assert.ok(locked && typeof locked.version === "string" && /^sha512-/.test(locked.integrity), "Unqualified dependency metadata identity");
  const bytes = await regularFileBytes(file), sha256 = createHash("sha256").update(bytes).digest("hex");
  const packageJson = JSON.parse(await readFile(path.join(repository, owner, "package.json"), "utf8"));
  assert.equal(packageJson.version, locked.version);
  assert.equal(packageJson.name, owner.split("node_modules/").at(-1));
  assert.equal(locked.version, qualified.version); assert.equal(locked.integrity, qualified.integrity);
  assert.equal(sha256, qualified.sha256, "Dependency metadata changed; packaging qualification required");
  metadata[relative] = { package: owner, version: locked.version, integrity: locked.integrity, sha256 };
}
const routes = ["deploy", "update", "template-version"];
for (const route of routes) {
  const tracePath = path.join(repository, `apps/builder/.next/server/app/api/${route}/route.js.nft.json`);
  const trace = JSON.parse(await readFile(tracePath, "utf8"));
  const traced = [...new Set<string>(trace.files.map((file: string) => path.resolve(path.dirname(tracePath), file)))];
  const source = traced.filter(file => file.startsWith(root + path.sep) && !file.startsWith(path.join(root, "node_modules") + path.sep) && !generatedPaths.includes(file));
  assert.deepEqual(source.sort(), inputs.map(file => path.join(root, file)).sort(), `${route}: exact template inventory only`);
  for (const file of traced.filter(file => generatedPaths.includes(file))) {
    const bytes = await regularFileBytes(file);
    assert.equal(bytes.toString(), '{"type": "commonjs"}', "Generated Next metadata changed; packaging qualification required");
    generatedMetadata[path.relative(repository, file)] = createHash("sha256").update(bytes).digest("hex");
  }
  for (const file of traced.filter(file => file.startsWith(path.join(root, "node_modules") + path.sep))) await verifyDependencyMetadata(file);
  for (const file of STANDALONE_SOURCE_INPUTS) assert.ok(traced.includes(path.join(repository, file)), `${route}: missing shared input ${file}`);
}
await writeFile(path.join(repository, "apps/builder/.next/template-trace-verification.json"), JSON.stringify({status:"PASS",routes,templateInputs:inputs.length,exactTraceInventory:true,dependencyMetadata:metadata,generatedMetadata}, null, 2));
console.log(JSON.stringify({status:"PASS",routes,templateInputs:inputs.length,exactTraceInventory:true,dependencyMetadataCount:Object.keys(metadata).length,generatedMetadataCount:Object.keys(generatedMetadata).length}));
