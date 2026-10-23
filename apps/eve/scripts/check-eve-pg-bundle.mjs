import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Run after `VERCEL=1 eve build`. This checks the actual workflow artifact,
// where a successful Next.js build alone cannot detect an untraced driver.
const output = path.resolve(process.argv[2] ?? fileURLToPath(new URL("../.vercel/output", import.meta.url)));
const functions = path.join(output, "functions");
const flow = path.join(functions, ".well-known/workflow/v1/flow.func");
const runtime = path.join(functions, "__server.func");
const targets = [flow];
try { await readFile(path.join(runtime, ".vc-config.json")); targets.push(runtime); }
catch (error) { if (error.code !== "ENOENT") throw error; }

for (const directory of targets) {
  const config = JSON.parse(await readFile(path.join(directory, ".vc-config.json"), "utf8"));
  assert.equal(config.runtime, "nodejs24.x", "Qualify the expected hosted Node runtime");
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  const sources = entries.filter(entry => entry.isFile() && /\.[cm]?js$/.test(entry.name)
    && !path.join(entry.parentPath, entry.name).includes(`${path.sep}node_modules${path.sep}`));
  let driverBundled = false;
  const untraced = [];
  for (const entry of sources) {
    const file = path.join(entry.parentPath, entry.name);
    const source = await readFile(file, "utf8");
    if (source.includes("pg-protocol") && source.includes("SCRAM-SERVER-FIRST-MESSAGE")) driverBundled = true;
    if (/\(\s*["']pg["']\s*\)|\bfrom\s*["']pg["']|\bimport\s*["']pg["']/.test(source)) {
      untraced.push(path.relative(directory, file));
    }
  }
  assert.deepEqual(untraced, [], "The hosted function must not depend on an untraced runtime pg load");
  assert.ok(driverBundled, "The hosted function must include the pg protocol and SCRAM implementation");
  const handler = await readFile(path.join(directory, config.handler));
  console.log(JSON.stringify({ function: path.relative(output, directory), pgBundled: true,
    unresolvedPgLoads: 0, handlerSha256: createHash("sha256").update(handler).digest("hex") }));
}
