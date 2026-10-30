import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { attestStaticBuild, captureSource, createBoundedDockerRunner, createSourceLease, exportStaticBuild, gitTreeId, parseDistTar, pinnedBuildArgs, staticBuildSourceFor } from "../lib/qualification/static-build-export.ts";
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
/** Tree id by real git with the repository kept OUTSIDE the candidate directory, so the candidate carries no .git. */
function gitTree(dir) {
  const gitDir = mkdtempSync(join(tmpdir(), "qdev-export-gitdir-"));
  const run = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8", env: { ...process.env, GIT_DIR: gitDir, GIT_WORK_TREE: dir, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" } }).trim();
  run("init", "-q");
  run("add", "-A");
  return run("write-tree");
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
  mkdirSync(join(dir, ".git"));
  writeFileSync(join(dir, ".git/HEAD"), "ref: refs/heads/main");
  assert.equal(gitTreeId(dir), expected, "a root .git is ignored by the tree comparison");
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

// ---- Exact-source binding: capture once, build only from a private read-only lease, verify before and after ----
const mountSource = args => args.find(a => a.startsWith("type=bind,")).split(",")[1].slice("source=".length);
const readTree = (dir, base = dir, out = {}) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (lstatSync(path).isDirectory()) readTree(path, base, out); else out[path.slice(base.length + 1)] = readFileSync(path, "utf8");
  }
  return out;
};

test("a host write to the source directory while Docker runs cannot change the build: the container sees only the leased captured bytes", async () => {
  const { src, config, tree } = exportFixture();
  const original = readTree(src);
  let seen;
  const out = await exportStaticBuild({ ...config, docker: async args => {
    const lease = mountSource(args);
    // The container-side view starts exactly as the pinned tree, from a private read-only directory that is not the original path.
    assert.notEqual(lease, src);
    assert.ok(args.some(a => /^type=bind,.*,readonly$/.test(a)));
    assert.equal(lstatSync(lease).mode & 0o777, 0o555);
    assert.equal(lstatSync(join(lease, "src/main.tsx")).mode & 0o777, 0o444);
    assert.deepEqual(readTree(lease), original);
    // A host writer now changes the original in every way a mutable checkout allows; none of it reaches the lease.
    writeFileSync(join(src, "src/main.tsx"), "export const attacker = 1");
    writeFileSync(join(src, "src/extra.ts"), "export {}");
    seen = readTree(lease);
    return goodDist();
  } });
  assert.deepEqual(seen, original, "the leased bytes were unchanged by the host write");
  assert.equal(out.inventory.sourceTree, tree, "the claim names the pinned tree that was actually built");
  assert.notEqual(gitTreeId(src), tree, "the original did change, so a build from it would not match the claim");
});

test("a lease that is changed while the container runs refuses the build and is cleaned up", async () => {
  for (const [label, tamper] of [
    ["edit a file", lease => { chmodSync(join(lease, "src"), 0o755); chmodSync(join(lease, "src/main.tsx"), 0o644); writeFileSync(join(lease, "src/main.tsx"), "export const x = 1"); }],
    ["add a file", lease => { chmodSync(lease, 0o755); writeFileSync(join(lease, "extra.js"), "1"); }],
    ["replace by a symlink", lease => { chmodSync(join(lease, "src"), 0o755); rmSync(join(lease, "src/main.tsx")); symlinkSync("/etc/hosts", join(lease, "src/main.tsx")); }],
    ["loosen a mode", lease => { chmodSync(join(lease, "package.json"), 0o666); }],
  ]) {
    const { config } = exportFixture();
    let lease;
    await assert.rejects(exportStaticBuild({ ...config, docker: async args => { lease = mountSource(args); tamper(lease); return goodDist(); } }), { code: "QDEV_EXPORT_LEASE_CHANGED" }, label);
    assert.equal(existsSync(lease), false, "lease removed after refusal: " + label);
  }
});

test("the lease is released after success and after a failed build", async () => {
  const { config } = exportFixture();
  let lease;
  await exportStaticBuild({ ...config, docker: async args => { lease = mountSource(args); return goodDist(); } });
  assert.equal(existsSync(lease), false);
  await assert.rejects(exportStaticBuild({ ...config, docker: async args => { lease = mountSource(args); throw new Error("boom"); } }), /boom/);
  assert.equal(existsSync(lease), false);
});

test("createSourceLease verifies bytes, modes, ownership and the entry set", () => {
  const dir = candidate({ "package.json": "{}", "a/b.txt": "b", "bin/run.sh": "#!/bin/sh\n" }, { exec: ["bin/run.sh"] });
  const lease = createSourceLease(captureSource(dir));
  try {
    lease.verify();
    assert.equal(lstatSync(join(lease.dir, "bin/run.sh")).mode & 0o777, 0o555);
    chmodSync(join(lease.dir, "a"), 0o755); chmodSync(join(lease.dir, "a/b.txt"), 0o644);
    writeFileSync(join(lease.dir, "a/b.txt"), "B");
    assert.throws(() => lease.verify(), { code: "QDEV_EXPORT_LEASE_CHANGED" });
  } finally { lease.release(); }
  assert.equal(existsSync(lease.dir), false);
});

test("sources that are mutable, aliased or carry metadata are refused instead of captured", async () => {
  const bad = (code, mutate, label) => {
    const dir = candidate({ "package.json": "{}", "src/a.ts": "1" });
    mutate(dir);
    assert.throws(() => captureSource(dir), { code }, label);
    return dir;
  };
  bad("QDEV_EXPORT_SOURCE_ENTRY", dir => symlinkSync("package.json", join(dir, "link")), "symlink");
  bad("QDEV_EXPORT_SOURCE_ENTRY", dir => symlinkSync("src", join(dir, "dirlink")), "directory symlink");
  bad("QDEV_EXPORT_SOURCE_METADATA", dir => mkdirSync(join(dir, ".git")), "repository metadata");
  bad("QDEV_EXPORT_SOURCE_METADATA", dir => writeFileSync(join(dir, "src/.DS_Store"), "x"), "Finder metadata");
  bad("QDEV_EXPORT_SOURCE_METADATA", dir => writeFileSync(join(dir, "._package.json"), "x"), "AppleDouble metadata");
  bad("QDEV_EXPORT_SOURCE_LINKED", dir => linkSync(join(dir, "package.json"), join(dir, "alias.json")), "hard link");
  bad("QDEV_EXPORT_SOURCE_MODE", dir => chmodSync(join(dir, "package.json"), 0o4755), "setuid");
  bad("QDEV_EXPORT_SOURCE_ROOT", dir => { rmSync(dir, { recursive: true }); symlinkSync(tmpdir(), dir); }, "symlinked root");
  assert.throws(() => captureSource(join(tmpdir(), "qdev-export-does-not-exist")), { code: "QDEV_EXPORT_SOURCE_ROOT" });
  const aliased = candidate({ "package.json": "{}" });
  writeFileSync(join(aliased, "Readme.md"), "1");
  writeFileSync(join(aliased, "README.md"), "2");
  if (readdirSync(aliased).filter(n => n.toLowerCase() === "readme.md").length === 2) assert.throws(() => captureSource(aliased), { code: "QDEV_EXPORT_SOURCE_ALIAS" });
  // exportStaticBuild never builds a source it cannot capture, and a root .git is refused there although gitTreeId ignores it.
  const { config } = exportFixture();
  mkdirSync(join(config.sourceDir, ".git"));
  let built = 0;
  await assert.rejects(exportStaticBuild({ ...config, docker: async () => { built++; return goodDist(); } }), { code: "QDEV_EXPORT_SOURCE_METADATA" });
  assert.equal(built, 0);
  assert.equal(gitTreeId(config.sourceDir), config.pins.tree, "gitTreeId still ignores a root .git for tree comparison");
});

test("captureSource refuses trees over the file limit", () => {
  const dir = mkdtempSync(join(tmpdir(), "qdev-export-big-"));
  for (let i = 0; i < 4097; i++) writeFileSync(join(dir, "f" + i), "x");
  assert.throws(() => captureSource(dir), { code: "QDEV_EXPORT_SOURCE_LIMIT" });
});

// ---- The real bounded Docker runner, driven by a fake `docker` executable that records every invocation ----
function fakeDocker(script) {
  const dir = mkdtempSync(join(tmpdir(), "qdev-fake-docker-"));
  const bin = join(dir, "docker"), log = join(dir, "log");
  writeFileSync(bin, "#!/bin/sh\necho \"$@\" >> \"" + log + "\"\n" + script);
  chmodSync(bin, 0o755);
  const calls = () => existsSync(log) ? readFileSync(log, "utf8").trim().split("\n") : [];
  return { bin, calls, dir };
}
const runArgs = () => pinnedBuildArgs(IMAGE, "/work/src");
const nameOf = args => args[args.indexOf("--name") + 1];

test("pinnedBuildArgs names and labels the container so cleanup can find it", () => {
  const args = runArgs();
  assert.match(nameOf(args), /^qdev-build-[a-f0-9]{16}$/);
  assert.equal(args[args.indexOf("--label") + 1], "myeve.qdev=static-build");
  assert.notEqual(nameOf(runArgs()), nameOf(runArgs()));
  assert.throws(() => pinnedBuildArgs(IMAGE, "/work/src", "mine"), { code: "QDEV_EXPORT_CONTAINER_NAME" });
});

test("the bounded runner returns the tar stream and does not clean up a build that succeeded", async () => {
  const tar = join(mkdtempSync(join(tmpdir(), "qdev-fake-tar-")), "dist.tar");
  writeFileSync(tar, goodDist());
  const fake = fakeDocker("case \"$1\" in run) cat \"" + tar + "\";; esac\n");
  const out = await createBoundedDockerRunner({ docker: fake.bin })(runArgs());
  assert.deepEqual(parseDistTar(out).size, 2);
  assert.equal(fake.calls().length, 1);
});

test("the bounded runner force-removes the named container on timeout, output overflow and failure", async () => {
  const cases = [
    ["timeout", "case \"$1\" in run) exec sleep 30;; esac\n", { timeoutMs: 300 }, "QDEV_EXPORT_DOCKER_TIMEOUT"],
    ["overflow", "case \"$1\" in run) exec head -c 3000000 /dev/zero;; esac\n", { maxStdoutBytes: 1000 }, "QDEV_EXPORT_DOCKER_OUTPUT_LIMIT"],
    ["failure", "case \"$1\" in run) echo broken >&2; exit 3;; esac\n", {}, "QDEV_EXPORT_DOCKER_EXIT"],
  ];
  for (const [label, script, options, code] of cases) {
    const fake = fakeDocker(script), args = runArgs();
    await assert.rejects(createBoundedDockerRunner({ docker: fake.bin, ...options })(args), { code }, label);
    assert.ok(fake.calls().includes("rm -f " + nameOf(args)), label + ": container removed by name");
  }
});

test("the bounded runner reports a removal it cannot confirm, an unavailable docker, and refuses unnamed runs", async () => {
  const stuck = fakeDocker("case \"$1\" in run) exit 3;; rm) echo denied >&2; exit 1;; esac\n"), args = runArgs();
  await assert.rejects(createBoundedDockerRunner({ docker: stuck.bin })(args), error => error.code === "QDEV_EXPORT_CLEANUP_FAILED:" + nameOf(args));
  const gone = fakeDocker("case \"$1\" in run) exit 3;; rm) echo 'Error: No such container' >&2; exit 1;; esac\n");
  await assert.rejects(createBoundedDockerRunner({ docker: gone.bin })(runArgs()), { code: "QDEV_EXPORT_DOCKER_EXIT" });
  await assert.rejects(createBoundedDockerRunner({ docker: join(tmpdir(), "qdev-no-such-docker") })(runArgs()), { code: "QDEV_EXPORT_DOCKER_UNAVAILABLE" });
  await assert.rejects(createBoundedDockerRunner({ docker: stuck.bin })(["run", "--rm", IMAGE]), { code: "QDEV_EXPORT_RUNNER_UNNAMED" });
});

test("exportStaticBuild runs end to end through the bounded runner against the lease", async () => {
  const { config, tree } = exportFixture();
  const tar = join(mkdtempSync(join(tmpdir(), "qdev-fake-tar-")), "dist.tar");
  writeFileSync(tar, goodDist());
  const fake = fakeDocker("case \"$1\" in run) cat \"" + tar + "\";; esac\n");
  const out = await exportStaticBuild({ ...config, docker: createBoundedDockerRunner({ docker: fake.bin }) });
  assert.equal(out.inventory.sourceTree, tree);
  const [call] = fake.calls();
  assert.ok(call.includes("--network none") && call.includes("--read-only") && call.includes("readonly"));
  assert.ok(!call.includes(config.sourceDir), "the original directory is never mounted");
});
