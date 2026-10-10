// Offline source export for standalone build qualification; no deployment API.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { assembleDeployment, templateRoot, templateFiles } from "../lib/assemble";
import { FEATURE_IDS } from "../lib/config";
import { SHARED_MYAPPS_FILES } from "../lib/shared-myapps";

const root = await templateRoot();
const repository = path.resolve(root, "../..");
const git = (...args: string[]) => execFileSync("git", ["-C", repository, ...args], { encoding: "utf8" }).trim();
const assertClean = () => assert.equal(git("status", "--porcelain", "--untracked-files=normal"), "", "Qualification source must be committed and clean");
assertClean();
const sourceCommit = git("rev-parse", "HEAD");
const sourceTree = git("rev-parse", `${sourceCommit}^{tree}`);
assert.match(sourceCommit, /^[a-f0-9]{40}$/);
assert.match(sourceTree, /^[a-f0-9]{40}$/);
const commitSeconds = git("show", "-s", "--format=%ct", sourceCommit);
assert.match(commitSeconds, /^\d+$/);
const commitMillis = Number(commitSeconds) * 1000;
assert.ok(Number.isSafeInteger(commitMillis) && Number.isFinite(new Date(commitMillis).getTime()), "Invalid source commit time");
const assemblyTimestamp = new Date(commitMillis).toISOString();
const assertCommittedInputs = async () => {
  const tracked = new Set(git("ls-files", "-z").split("\0"));
  const selected = [...(await templateFiles(FEATURE_IDS)).map(file => `apps/eve/${file}`), ...SHARED_MYAPPS_FILES];
  for (const file of selected) assert.ok(tracked.has(file), `Export input is not committed: ${file}`);
};
await assertCommittedInputs();
const destination = process.argv[2];
assert.ok(destination && path.isAbsolute(destination), "Provide an absent absolute output directory");
if (process.argv[3] === "--check-traces") {
  const expected = [
    ...(await templateFiles(FEATURE_IDS)).map((file) => path.resolve(root, file)),
    ...SHARED_MYAPPS_FILES.map((file) => path.resolve(root, "../..", file)),
  ];
  for (const route of ["deploy", "update", "template-version"]) {
    const tracePath = path.resolve(root, `../builder/.next/server/app/api/${route}/route.js.nft.json`);
    const trace = JSON.parse(await readFile(tracePath, "utf8")) as { files: string[] };
    const traced = new Set(trace.files.map((file) => path.resolve(path.dirname(tracePath), file)));
    for (const file of expected) assert.ok(traced.has(file), `${route} trace is missing ${file}`);
    assert.deepEqual([...traced].filter((file) => file.includes("/packages/myapps/")).sort(),
      SHARED_MYAPPS_FILES.map((file) => path.resolve(root, "../..", file)).sort());
  }
}
await mkdir(destination); // Never overwrite an existing installation.
const files = await assembleDeployment({ projectName: "myapps-packaging-fixture", features: [...FEATURE_IDS], instructions: "Offline packaging qualification. No paid operations.", schedules: [] }, { timestamp: assemblyTimestamp });
const hashes: Record<string, string> = {};
for (const entry of files) {
  const target = path.join(destination, entry.file);
  const data = Buffer.from(entry.data, "base64");
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, data, { flag: "wx" });
  hashes[entry.file] = createHash("sha256").update(data).digest("hex");
}
for (const file of SHARED_MYAPPS_FILES) {
  assert.deepEqual(await readFile(path.join(destination, file)), await readFile(path.resolve(root, "../..", file)));
}
// The receipt lives beside the app, never inside its source or public assets.
assertClean();
await assertCommittedInputs();
assert.equal(git("rev-parse", "HEAD"), sourceCommit, "Qualification source changed during export");
assert.equal(git("rev-parse", "HEAD^{tree}"), sourceTree, "Qualification source tree changed during export");
await writeFile(`${destination}.json`, JSON.stringify({ destination, source: { commit: sourceCommit, tree: sourceTree, assemblyTimestamp, timestampSource: "git-committer-time" }, files: files.length, shared: SHARED_MYAPPS_FILES, hashes }, null, 2) + "\n", { flag: "wx" });
console.log(`Exported ${files.length} files; nine canonical shared files match exactly.`);
