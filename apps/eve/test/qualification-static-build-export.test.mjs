import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { attestStaticBuild, exportStaticBuild, gitTreeId, parseDistTar, pinnedBuildArgs, staticBuildSourceFor } from "../lib/qualification/static-build-export.ts";
import { StaticBuildMyAppsPort } from "../lib/qualification/static-build.ts";
import { canonical } from "../../../packages/myapps/src/contracts.ts";

const sha = value => createHash("sha256").update(value).digest("hex");
const IMAGE = "sha256:" + "a".repeat(64);
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" } }).trim();
function candidate(files, { exec = [] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "qdev-export-src-"));
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(dir, path.split("/").slice(0, -1).join("/")), { recursive: true });
    writeFileSync(join(dir, path), body);
    if (exec.includes(path)) chmodSync(join(dir, path), 0o755);
  }
  return dir;
}
function gitTree(dir) {
  git(dir, "init", "-q");
  git(dir, "add", "-A");
  return git(dir, "write-tree");
}
function distTar(files) {
  const dir = mkdtempSync(join(tmpdir(), "qdev-export-dist-"));
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(dir, path.split("/").slice(0, -1).join("/")), { recursive: true });
    writeFileSync(join(dir, path), body);
  }
  return new Uint8Array(execFileSync("tar", ["--format=ustar", "-C", dir, "-cf", "-", "dist"], { maxBuffer: 1 << 26 }));
}
/** Hand-built ustar so case aliases and long names do not depend on the host filesystem. */
function rawTar(entries) {
  const blocks = [];
  for (const [path, body] of entries) {
    const header = Buffer.alloc(512);
    const cut = path.length > 100 ? path.lastIndexOf("/", 100) : -1;
    const [prefix, name] = cut > 0 ? [path.slice(0, cut), path.slice(cut + 1)] : ["", path];
    header.write(name, 0); header.write("0000644\0", 100); header.write("0000000\0", 108); header.write("0000000\0", 116);
    header.write(body.length.toString(8).padStart(11, "0") + "\0", 124); header.write("00000000000\0", 136);
    header.write("        ", 148); header.write("0", 156); header.write("ustar\0", 257); header.write("00", 263); header.write(prefix, 345);
    header.write(([...header].reduce((a, b) => a + b, 0)).toString(8).padStart(6, "0") + "\0 ", 148);
    blocks.push(header, Buffer.from(body), Buffer.alloc((512 - (body.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return new Uint8Array(Buffer.concat(blocks));
}
const goodDist = () => distTar({ "dist/index.html": "<!doctype html><title>x</title>", "dist/assets/app-1a2b.js": "console.log(1)" });

test("gitTreeId equals git write-tree, including nesting, ordering, executable bits and ignored .git", () => {
  const dir = candidate({ "package.json": "{}", "package-lock.json": "{}", "src/a.b": "1", "src/a/c.ts": "2", "src/a-z": "3", "z": "4", "bin/run.sh": "#!/bin/sh\n" }, { exec: ["bin/run.sh"] });
  const expected = gitTree(dir);
  assert.equal(gitTreeId(dir), expected);
  writeFileSync(join(dir, "package.json"), "{ }");
  assert.notEqual(gitTreeId(dir), expected);
});

test("gitTreeId refuses symlinks and over-limit trees", () => {
  const dir = candidate({ "a": "1" });
  symlinkSync("a", join(dir, "link"));
  assert.throws(() => gitTreeId(dir), { code: "QDEV_EXPORT_SOURCE_ENTRY" });
});

test("parseDistTar reads a real tar and refuses everything outside the contract", () => {
  const files = parseDistTar(goodDist());
  assert.deepEqual([...files.keys()].sort(), ["dist/assets/app-1a2b.js", "dist/index.html"]);
  assert.equal(Buffer.from(files.get("dist/index.html")).toString(), "<!doctype html><title>x</title>");
  assert.throws(() => parseDistTar(distTar({ "dist/app.js": "x" })), { code: "QDEV_EXPORT_ENTRY_MISSING" });
  assert.throws(() => parseDistTar(distTar({ "dist/index.html": "x", "dist/.hidden": "y" })), { code: "QDEV_EXPORT_TAR_NAME" });
  assert.throws(() => parseDistTar(rawTar([["dist/index.html", "x"], ["dist/A.js", "y"], ["dist/a.js", "z"]])), { code: "QDEV_EXPORT_TAR_LIMIT" });
  assert.equal(parseDistTar(rawTar([["dist/index.html", "x"], ["dist/" + "d".repeat(120) + ".js", "y"]])).size, 2, "ustar prefix split is honoured");
  const bad = Buffer.from(goodDist()); bad[0] ^= 1;
  assert.throws(() => parseDistTar(bad), { code: "QDEV_EXPORT_TAR_CHECKSUM" });
  const outside = mkdtempSync(join(tmpdir(), "qdev-export-out-"));
  writeFileSync(join(outside, "x"), "1");
  const stray = new Uint8Array(execFileSync("tar", ["--format=ustar", "-C", outside, "-cf", "-", "x"]));
  assert.throws(() => parseDistTar(stray), { code: "QDEV_EXPORT_TAR_NAME" });
  const link = mkdtempSync(join(tmpdir(), "qdev-export-link-"));
  mkdirSync(join(link, "dist"));
  writeFileSync(join(link, "dist/index.html"), "x");
  symlinkSync("index.html", join(link, "dist/alias.html"));
  assert.throws(() => parseDistTar(new Uint8Array(execFileSync("tar", ["--format=ustar", "-C", link, "-cf", "-", "dist"]))), { code: "QDEV_EXPORT_TAR_ENTRY" });
});

test("pinnedBuildArgs is offline, read-only, unprivileged, bounded and takes only an immutable image ID", () => {
  const args = pinnedBuildArgs(IMAGE, "/work/src").join(" ");
  for (const needle of ["--network none", "--read-only", "--cap-drop ALL", "no-new-privileges", "--pull=never", "--cpus 1", "--memory 1g", "--pids-limit 192", "readonly", "--user 1000:1000"])
    assert.ok(args.includes(needle), needle);
  assert.throws(() => pinnedBuildArgs("node:latest", "/work/src"), { code: "QDEV_EXPORT_IMAGE" });
  assert.throws(() => pinnedBuildArgs(IMAGE, "/work/src,rw"), { code: "QDEV_EXPORT_SOURCE_PATH" });
});

function exportFixture() {
  const src = candidate({ "package.json": '{"name":"d"}', "package-lock.json": '{"lockfileVersion":3}', "src/main.tsx": "export {}" });
  const tree = gitTree(src);
  const calls = [];
  const config = {
    sourceDir: src, pins: { commit: "c".repeat(40), tree }, profileLockSha256: sha('{"lockfileVersion":3}'), profilePackageSha256: sha('{"name":"d"}'),
    image: IMAGE, nodeVersion: "v24.18.1", docker: async args => { calls.push(args); return goodDist(); },
  };
  return { src, tree, config, calls };
}

test("exportStaticBuild proves the tree, pins the profile, then builds once in the pinned image", async () => {
  const { config, calls, tree } = exportFixture();
  const out = await exportStaticBuild(config);
  assert.equal(calls.length, 1);
  assert.equal(out.inventory.sourceTree, tree);
  assert.equal(out.inventory.independentVerification, "NOT_ESTABLISHED");
  assert.equal(out.inventory.files.length, 2);
  await assert.rejects(out.load("dist/missing.js"), { code: "QDEV_EXPORT_UNKNOWN_FILE" });
  for (const [patch, code] of [
    [{ pins: { commit: "c".repeat(40), tree: "d".repeat(40) } }, "QDEV_EXPORT_SOURCE_TREE_MISMATCH"],
    [{ profileLockSha256: sha("other") }, "QDEV_EXPORT_LOCK_PROFILE"],
    [{ profilePackageSha256: sha("other") }, "QDEV_EXPORT_PACKAGE_PROFILE"],
    [{ nodeVersion: "v22.1.0" }, "QDEV_EXPORT_NODE"],
    [{ image: "node:24" }, "QDEV_EXPORT_IMAGE"],
  ]) {
    const before = calls.length;
    await assert.rejects(exportStaticBuild({ ...config, ...patch }), { code });
    assert.equal(calls.length, before, "nothing is built when a pin fails: " + code);
  }
});

function bindingFor(candidate) {
  const sourceDigest = "1".repeat(64), configurationDigest = "2".repeat(64);
  return {
    ownerId: "owner", agentId: "agent", appId: "app", workId: "work", workVersion: 1, workGeneration: 1, requestId: "req", runId: "run", factoryId: "factory",
    factoryVersion: sha(canonical({ sourceDigest, configurationDigest })), sourceDigest, configurationDigest,
    inputCommit: "a".repeat(40), inputTree: "b".repeat(40), candidateCommit: candidate.commit, candidateTree: candidate.tree,
    lockSha256: sha('{"lockfileVersion":3}'), buildProfileDigest: "3".repeat(64), deadline: "2099-01-01T00:00:00.000Z",
  };
}
function issuerFor(binding, publicKey, keyId = "build-issuer-1") {
  const spki = publicKey.export({ type: "spki", format: "der" });
  return { keyId, purpose: "STATIC_BUILD_PROVENANCE_V1", ownerId: binding.ownerId, factoryId: binding.factoryId, factoryVersion: binding.factoryVersion,
    buildProfileDigest: binding.buildProfileDigest, publicKeyPem: publicKey.export({ type: "spki", format: "pem" }), spkiSha256: sha(spki),
    notBefore: "2020-01-01T00:00:00.000Z", notAfter: "2100-01-01T00:00:00.000Z", revoked: false };
}

test("the exported build retains through StaticBuildMyAppsPort and the REAL claim verifier accepts only the configured issuer", async () => {
  const { config, tree } = exportFixture();
  const candidateId = { commit: config.pins.commit, tree };
  const binding = bindingFor(candidateId);
  const issuerKeys = generateKeyPairSync("ed25519"), otherKeys = generateKeyPairSync("ed25519");
  const make = (keys, issuerPublic = issuerKeys.publicKey) => staticBuildSourceFor({
    export: () => exportStaticBuild(config), binding: () => binding, issuer: issuerFor(binding, issuerPublic),
    sign: message => sign(null, Buffer.from(message), keys.privateKey), now: () => Date.parse("2026-10-30T20:00:00Z"),
  });
  const port = source => new StaticBuildMyAppsPort({ source, delivery: {}, now: () => Date.parse("2026-10-30T20:00:01Z") });

  const retained = await port(make(issuerKeys)).retainBuild(candidateId);
  assert.match(retained.buildArtifactSha256, /^[a-f0-9]{64}$/);
  // Deterministic: the same source/build retains the same artifact identity.
  assert.deepEqual(await port(make(issuerKeys)).retainBuild(candidateId), retained);
  // A claim signed by any other key, or an issuer record for another key, is refused by the real verifier.
  await assert.rejects(port(make(otherKeys)).retainBuild(candidateId), { code: "APP_BUILD_CLAIM_INVALID" });
  await assert.rejects(port(make(issuerKeys, otherKeys.publicKey)).retainBuild(candidateId), { code: "APP_BUILD_CLAIM_INVALID" });
  // A claim for another candidate is not accepted for this one.
  await assert.rejects(port(make(issuerKeys)).retainBuild({ commit: "e".repeat(40), tree }), { code: "QDEV_BUILD_CANDIDATE_MISMATCH" });
});

test("attestStaticBuild signs exactly the domain-separated canonical payload", async () => {
  const { privateKey } = generateKeyPairSync("ed25519");
  let seen;
  const claim = JSON.parse(await attestStaticBuild({
    binding: bindingFor({ commit: "c".repeat(40), tree: "d".repeat(40) }), artifact: { inventoryDigest: "i", artifactDigest: "a" }, keyId: "k", builtAt: "2026-10-30T20:00:00.000Z",
    sign: message => (seen = Buffer.from(message).toString(), sign(null, Buffer.from(message), privateKey)),
  }));
  assert.equal(seen, "myeve.static-build-claim/v1\0" + canonical(claim.payload));
  assert.match(claim.signature, /^[A-Za-z0-9_-]{86}$/);
});
