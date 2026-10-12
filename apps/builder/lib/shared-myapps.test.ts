import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { assembleDeployment, templateRoot } from "./assemble";
import { FEATURE_IDS } from "./config";
import { MYAPPS_TRACE_METADATA, SHARED_MYAPPS_FILES, SHARED_CAPABILITY_FILES, STANDALONE_SHARED_FILES, STANDALONE_SOURCE_INPUTS, readStandaloneSourceFile, relocateCapabilityReferences, standalonePackageManifest, assertUniqueOutputPaths, readSharedMyAppsFile, relocateMyAppsReferences } from "./shared-myapps";

for (const features of [[], [...FEATURE_IDS]]) {
  test(`canonical shared packaging is closed and gates are preserved (${features.length} features)`, async () => {
    const root = await templateRoot();
    const files = await assembleDeployment({ projectName: "myapps-packaging-fixture", features, instructions: "offline fixture", schedules: [] });
    const byPath = new Map(files.map(({ file, data }) => [file, Buffer.from(data, "base64")]));
    assert.equal(byPath.size, files.length);
    assert.deepEqual([...byPath.keys()].filter((file) => file.startsWith("packages/")).sort(), [...SHARED_MYAPPS_FILES, ...SHARED_CAPABILITY_FILES].sort());
    for (const file of STANDALONE_SHARED_FILES) assert.deepEqual(byPath.get(file), await readFile(path.resolve(root, "../..", file)));
    for (const file of ["agent/tools/installed_apps.ts", "app/apps/installed/page.tsx", "app/api/myapps/[...path]/route.ts"]) {
      assert.deepEqual(byPath.get(file), await readFile(path.join(root, file)), `unchanged authority boundary: ${file}`);
    }
    for (const name of ["api", "hosting", "runtime", "workflow"]) {
      const file = `lib/myapps/${name}.ts`;
      const original = await readFile(path.join(root, file), "utf8");
      assert.equal(byPath.get(file)?.toString(), original.replaceAll("../../../../packages/myapps/", "../../packages/myapps/"));
    }
    for (const name of ["store", "runtime"]) {
      const file = `lib/capability-control/${name}.ts`;
      assert.equal(byPath.get(file)?.toString(), (await readFile(path.join(root, file), "utf8"))
        .replaceAll("../../../../packages/capability-", "../../packages/capability-"));
    }
    const repository = JSON.parse(await readFile(path.resolve(root, "../../package.json"), "utf8"));
    const application = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
    const packaged = JSON.parse(byPath.get("package.json")!.toString());
    assert.ok(!byPath.has(MYAPPS_TRACE_METADATA), "trace context is never exported or installed");
    assert.deepEqual(packaged.workspaces, ["packages/capability-control", "packages/capability-enforcement"]);
    assert.deepEqual(packaged.overrides, repository.overrides);
    assert.deepEqual(packaged.dependencies, application.dependencies);
    assert.equal(packaged.scripts.postinstall, repository.scripts.postinstall);
    assert.equal(packaged.scripts["security:patches"], repository.scripts["security:patches"]);
    assert.equal(packaged.scripts.build, `${repository.scripts.postinstall} && ${repository.scripts["security:patches"]} && ${application.scripts.build}`);
    for (const [file, bytes] of byPath) {
      if (!/\.[cm]?[jt]sx?$/.test(file)) continue;
      const source = bytes.toString();
      assert.ok(!/\.\.\/\.\.\/\.\.\/\.\.\/packages\/(myapps|capability-)/.test(source), `no unresolved shared reference: ${file}`);
      for (const [, reference] of source.matchAll(/(?:from\s*|import\s*)["']([^"']*packages\/(?:myapps|capability-control|capability-enforcement)\/[^"']+)["']/g)) {
        assert.ok(byPath.has(path.posix.normalize(path.posix.join(path.posix.dirname(file), reference))), `closed import ${file}: ${reference}`);
      }
      if (file.startsWith("packages/")) {
        for (const [, reference] of source.matchAll(/(?:from\s*|import\s*)["'](\.[^"']+)["']/g)) {
          assert.ok(byPath.has(path.posix.normalize(path.posix.join(path.posix.dirname(file), reference))), `closed shared import ${file}: ${reference}`);
        }
      }
    }
    const hosting = byPath.get("lib/myapps/hosting.ts")!.toString();
    assert.match(hosting, /NODE_ENV !== "production"/);
    assert.match(hosting, /!process.env.VERCEL/);
    assert.match(hosting, /MYAPPS_LOCAL_INTEGRATION === "1"/);
    for (const asset of ["index.html", "app.js", "app.css"]) assert.ok(byPath.has(`packages/myapps/prototype/${asset}`));
    assert.ok(!files.some(({ file }) => file.startsWith("scripts/qualify-capability-")), "qualification fixture authorities do not ship");
    assert.ok(!files.some(({ file }) => /(^|\/)\.env|packages\/myapps\/(test|prototype\/server)|public\/.*myapps/.test(file)));
  });
}

test("unknown shared consumers and references fail closed", () => {
  assert.throws(() => relocateMyAppsReferences("lib/unexpected.ts", Buffer.from('import "../../../../packages/myapps/src/store.ts"')), /Unexpected/);
  assert.throws(() => relocateMyAppsReferences("lib/myapps/api.ts", Buffer.from('import "../../../../packages/myapps/test/secrets.ts"')), /Unowned/);
  assert.throws(() => relocateMyAppsReferences("lib/myapps/remote-admission.ts", Buffer.from('import "../../../../packages/myapps/src/alpha-tasks/remote-http.ts"')), /Unowned/);
});

test("output collisions and noncanonical paths fail closed", () => {
  for (const files of [["."], [".."], ["packages/myapps/src/store.ts", "packages/myapps/src/store.ts"], ["../secret"], ["a/../b"], ["a\\b"], ["/absolute"]]) {
    assert.throws(() => assertUniqueOutputPaths(files.map((file) => ({ file }))), /deployment path/);
  }
});

test("shared file and parent symlinks cannot expand the source boundary", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "myapps-packaging-paths-"));
  try {
    const eve = path.join(root, "apps/eve");
    await mkdir(eve, { recursive: true });
    await mkdir(path.join(root, "packages/myapps/src"), { recursive: true });
    const file = SHARED_MYAPPS_FILES[0];
    await writeFile(path.join(root, "private-fixture"), "must not ship");
    await symlink(path.join(root, "private-fixture"), path.join(root, file));
    await assert.rejects(readSharedMyAppsFile(eve, file), /Invalid shared/);
    await rm(path.join(root, "packages"), { recursive: true });
    await mkdir(path.join(root, "outside/myapps/src"), { recursive: true });
    await writeFile(path.join(root, "outside/myapps/src/contracts.ts"), "must not ship");
    await symlink(path.join(root, "outside"), path.join(root, "packages"));
    await assert.rejects(readSharedMyAppsFile(eve, file), /Invalid shared/);
    await assert.rejects(readSharedMyAppsFile(eve, "private-fixture"), /Unowned/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("builder tracing uses the same narrow shared inventory", async () => {
  const { default: configure } = await import("../next.config");
  const config = await configure();
  for (const route of ["/api/deploy", "/api/update", "/api/template-version"]) {
    const includes = config.outputFileTracingIncludes![route];
    assert.deepEqual(includes.filter((file) => file.includes("packages/myapps")), [...SHARED_MYAPPS_FILES, MYAPPS_TRACE_METADATA].map((file) => `../../${file}`));
    assert.deepEqual(includes.filter((file) => file.startsWith("../../")), STANDALONE_SOURCE_INPUTS.map((file) => `../../${file}`));
    assert.ok(includes.includes("../eve/.builder-template-source.json"));
    assert.ok(includes.includes("../eve/agent/agent.ts"));
    assert.ok(!includes.some(file => file.includes("**")), "template traces contain exact files only");

  }
});


test("capability imports and root metadata cannot expand the packaging boundary", async () => {
  assert.throws(() => relocateCapabilityReferences("lib/unexpected.ts", Buffer.from('import "../../../../packages/capability-enforcement/src/postgres.ts"')), /Unexpected/);
  assert.throws(() => relocateCapabilityReferences("lib/capability-control/runtime.ts", Buffer.from('import "../../../../packages/capability-control/test/policy.test.mjs"')), /Unowned/);
  const root = await mkdtemp(path.join(os.tmpdir(), "standalone-security-paths-"));
  try {
    const eve = path.join(root, "apps/eve");
    await mkdir(eve, { recursive: true });
    await writeFile(path.join(root, "private-fixture"), "must not ship");
    await symlink(path.join(root, "private-fixture"), path.join(root, "package.json"));
    await assert.rejects(readStandaloneSourceFile(eve, "package.json"), /Invalid shared/);
    await assert.rejects(readStandaloneSourceFile(eve, "patches/private-fixture"), /Unowned/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("changed security script contracts and competing root configuration require reconciliation", async () => {
  const root = await templateRoot();
  const repository = JSON.parse(await readFile(path.resolve(root, "../../package.json"), "utf8"));
  assert.throws(() => standalonePackageManifest({ scripts: { build: "next build" } }, { ...repository, scripts: { ...repository.scripts, postinstall: "echo skipped" } }), /Unrecognized/);
  for (const conflict of [{ workspaces: [] }, { overrides: {} }, { scripts: { build: "next build", postinstall: "echo override" } }]) {
    assert.throws(() => standalonePackageManifest({ scripts: { build: "next build" }, ...conflict }, repository), /reconciliation/);
  }
});


test("Builder-only MyApps metadata is digest-bound and cannot acquire install hooks", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "myapps-trace-metadata-"));
  try {
    const eve = path.join(root, "apps/eve");
    await mkdir(eve, { recursive: true });
    await mkdir(path.join(root, "packages/myapps"), { recursive: true });
    const canonical = await readStandaloneSourceFile(await templateRoot(), MYAPPS_TRACE_METADATA);
    await writeFile(path.join(root, MYAPPS_TRACE_METADATA), canonical);
    assert.deepEqual(await readStandaloneSourceFile(eve, MYAPPS_TRACE_METADATA), canonical);
    const changed = JSON.parse(canonical.toString());
    changed.scripts.postinstall = "node private-fixture.js";
    await writeFile(path.join(root, MYAPPS_TRACE_METADATA), JSON.stringify(changed));
    await assert.rejects(readStandaloneSourceFile(eve, MYAPPS_TRACE_METADATA), /trace metadata changed/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("AlphaTasks packaging preserves exact tracked adapter bytes and its runtime identity", async () => {
  const root = await templateRoot();
  const repository = path.resolve(root, "../..");
  const files = await assembleDeployment({ projectName: "adapter-closure-fixture", features: [], instructions: "offline fixture", schedules: [] });
  const out = await mkdtemp(path.join(os.tmpdir(), "adapter-export-"));
  try {
    for (const file of SHARED_MYAPPS_FILES) {
      const bytes = Buffer.from(files.find(entry => entry.file === file)!.data, "base64");
      assert.deepEqual(bytes, execFileSync("git", ["show", `HEAD:${file}`], { cwd: repository }), `exact tracked source: ${file}`);
      await mkdir(path.dirname(path.join(out, file)), { recursive: true });
      await writeFile(path.join(out, file), bytes);
    }
    const adapter = "packages/myapps/src/alpha-tasks/isolation.ts";
    const original = await import(pathToFileURL(path.join(repository, adapter)).href);
    const packaged = await import(pathToFileURL(path.join(out, adapter)).href);
    assert.equal(await packaged.localAlphaTasksAdapterDigest(), await original.localAlphaTasksAdapterDigest());
    const protocol = await import(pathToFileURL(path.join(out, "packages/myapps/src/alpha-tasks/remote-isolation.ts")).href);
    assert.equal(typeof protocol.RemoteAlphaTasksIsolation, "function", "protocol resolves its exported dependency closure without repository files");
    assert.ok(!files.some(entry => /\/remote-(http\.ts|isolation\.sql)$/.test(entry.file)), "unregistered host transport and host database setup stay outside the application export");
    for (const file of ["lib/myapps/local-bootstrap.ts", "lib/myapps/alpha-tasks-host.ts", "lib/myapps/local-configuration.ts", "lib/myapps/alpha-tasks.ts", "lib/myapps/remote-admission.ts", "lib/missioncontrol/admit-execution.ts", "lib/missioncontrol/permit-store.ts"]) {
      const expected = (await readFile(path.join(root, file), "utf8")).replaceAll("../../../../packages/", "../../packages/");
      assert.equal(Buffer.from(files.find(entry => entry.file === file)!.data, "base64").toString(), expected, `only imports relocated; authority unchanged: ${file}`);
    }
  } finally { await rm(out, { recursive: true, force: true }); }
});
