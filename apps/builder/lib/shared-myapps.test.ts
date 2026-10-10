import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { assembleDeployment, templateRoot } from "./assemble";
import { FEATURE_IDS } from "./config";
import { SHARED_MYAPPS_FILES, assertUniqueOutputPaths, readSharedMyAppsFile, relocateMyAppsReferences } from "./shared-myapps";

for (const features of [[], [...FEATURE_IDS]]) {
  test(`canonical shared packaging is closed and gates are preserved (${features.length} features)`, async () => {
    const root = await templateRoot();
    const files = await assembleDeployment({ projectName: "myapps-packaging-fixture", features, instructions: "offline fixture", schedules: [] });
    const byPath = new Map(files.map(({ file, data }) => [file, Buffer.from(data, "base64")]));
    assert.equal(byPath.size, files.length);
    assert.deepEqual([...byPath.keys()].filter((file) => file.startsWith("packages/")).sort(), [...SHARED_MYAPPS_FILES].sort());
    for (const file of SHARED_MYAPPS_FILES) assert.deepEqual(byPath.get(file), await readFile(path.resolve(root, "../..", file)));
    for (const file of ["agent/tools/installed_apps.ts", "app/apps/installed/page.tsx", "app/api/myapps/[...path]/route.ts"]) {
      assert.deepEqual(byPath.get(file), await readFile(path.join(root, file)), `unchanged authority boundary: ${file}`);
    }
    for (const name of ["api", "hosting", "runtime", "workflow"]) {
      const file = `lib/myapps/${name}.ts`;
      const original = await readFile(path.join(root, file), "utf8");
      assert.equal(byPath.get(file)?.toString(), original.replaceAll("../../../../packages/myapps/", "../../packages/myapps/"));
    }
    for (const [file, bytes] of byPath) {
      if (!/\.[cm]?[jt]sx?$/.test(file)) continue;
      const source = bytes.toString();
      assert.ok(!source.includes("../../../../packages/myapps/"), `no unresolved shared reference: ${file}`);
      for (const [, reference] of source.matchAll(/(?:from\s*|import\s*)["']([^"']*packages\/myapps\/[^"']+)["']/g)) {
        assert.ok(byPath.has(path.posix.normalize(path.posix.join(path.posix.dirname(file), reference))), `closed import ${file}: ${reference}`);
      }
    }
    const hosting = byPath.get("lib/myapps/hosting.ts")!.toString();
    assert.match(hosting, /NODE_ENV !== "production"/);
    assert.match(hosting, /!process.env.VERCEL/);
    assert.match(hosting, /MYAPPS_LOCAL_INTEGRATION === "1"/);
    for (const asset of ["index.html", "app.js", "app.css"]) assert.ok(byPath.has(`packages/myapps/prototype/${asset}`));
    assert.ok(!files.some(({ file }) => /(^|\/)\.env|packages\/myapps\/(test|prototype\/server)|public\/.*myapps/.test(file)));
  });
}

test("unknown shared consumers and references fail closed", () => {
  assert.throws(() => relocateMyAppsReferences("lib/unexpected.ts", Buffer.from('import "../../../../packages/myapps/src/store.ts"')), /Unexpected/);
  assert.throws(() => relocateMyAppsReferences("lib/myapps/api.ts", Buffer.from('import "../../../../packages/myapps/test/secrets.ts"')), /Unowned/);
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
  const { default: config } = await import("../next.config");
  for (const route of ["/api/deploy", "/api/update", "/api/template-version"]) {
    const includes = config.outputFileTracingIncludes![route];
    assert.deepEqual(includes.filter((file) => file.includes("packages/myapps")), SHARED_MYAPPS_FILES.map((file) => `../../${file}`));
    assert.ok(includes.includes("../eve/scripts/**"));
    assert.ok(includes.includes("../eve/types/**"));
  }
});
