import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";

// Packaging inventory only. Source and application contracts remain owned by
// packages/myapps; no server, test fixture, credential or package script ships.
export const SHARED_MYAPPS_FILES = [
  "packages/myapps/src/contracts.ts",
  "packages/myapps/src/crm.ts",
  "packages/myapps/src/intent.ts",
  "packages/myapps/src/preview.ts",
  "packages/myapps/src/resolver.ts",
  "packages/myapps/src/store.ts",
  "packages/myapps/prototype/index.html",
  "packages/myapps/prototype/app.js",
  "packages/myapps/prototype/app.css",
] as const;

// These are the canonical capability packages already required by Eve. Keep
// their runtime closure explicit; tests, private fixtures and tooling stay out.
export const SHARED_CAPABILITY_FILES = [
  "packages/capability-control/package.json",
  "packages/capability-control/src/index.ts",
  "packages/capability-control/src/registry.ts",
  "packages/capability-control/src/types.ts",
  "packages/capability-control/src/resolver.ts",
  "packages/capability-enforcement/package.json",
  "packages/capability-enforcement/src/postgres.ts",
  "packages/capability-enforcement/src/decisions.ts",
  "packages/capability-enforcement/src/ordering-source.ts",
  "packages/capability-enforcement/src/ordering-wire.ts",
  "packages/capability-enforcement/src/ordering-transport.ts",
  "packages/capability-enforcement/src/lifecycle-wire.ts",
  "packages/capability-enforcement/src/lifecycle-source.ts",
  "packages/capability-enforcement/src/lifecycle-transport.ts",
  "packages/capability-enforcement/src/recovery-witness.ts",
] as const;

export const DEPENDENCY_SECURITY_FILES = [
  "scripts/security/apply-dependency-patches.mjs",
  "patches/sprintf-js-1.1.3.json",
  "patches/sprintf-js-1.1.3.js",
  "patches/sprintf-js-LICENSE",
] as const;

export const STANDALONE_SHARED_FILES = [
  ...SHARED_MYAPPS_FILES, ...SHARED_CAPABILITY_FILES, ...DEPENDENCY_SECURITY_FILES,
] as const;
// Next 16.3.8 adds the package context to its Builder traces. This exact
// reviewed metadata is a trace input only; it is never exported or installed.
export const MYAPPS_TRACE_METADATA = "packages/myapps/package.json";
const MYAPPS_TRACE_METADATA_SHA256 = "f0ff911cea6f533b8c63f4539b86c3160a9ef4b93ab7f99f52f6ec704b4f744c";

// Root package metadata supplies overrides and security scripts, but is not
// copied over Eve's application manifest.
export const STANDALONE_SOURCE_INPUTS = [...STANDALONE_SHARED_FILES, MYAPPS_TRACE_METADATA, "package.json"] as const;

const RELOCATED_CONSUMERS = new Set([
  "lib/myapps/api.ts", "lib/myapps/hosting.ts",
  "lib/myapps/runtime.ts", "lib/myapps/workflow.ts",
]);
const REPOSITORY_PREFIX = "../../../../packages/myapps/";

export async function readSharedMyAppsFile(eveRoot: string, file: string): Promise<Buffer> {
  if (!(SHARED_MYAPPS_FILES as readonly string[]).includes(file)) {
    throw new Error(`Unowned shared MyApps source: ${file}`);
  }
  return readStandaloneSourceFile(eveRoot, file);
}

export async function readStandaloneSourceFile(eveRoot: string, file: string): Promise<Buffer> {
  if (!(STANDALONE_SOURCE_INPUTS as readonly string[]).includes(file)) {
    throw new Error(`Unowned standalone source: ${file}`);
  }
  // Resolve the checkout root once (macOS /tmp itself is a symlink), then reject
  // symlinks in every source component, including packages/ and myapps/.
  let source = await realpath(path.resolve(eveRoot, "../.."));
  const parts = file.split("/");
  for (const [index, part] of parts.entries()) {
    source = path.join(source, part);
    const entry = await lstat(/* turbopackIgnore: true */ source);
    if (entry.isSymbolicLink() || (index < parts.length - 1 ? !entry.isDirectory() : !entry.isFile())) {
      throw new Error(`Invalid shared MyApps source: ${file}`);
    }
  }
  const data = await readFile(/* turbopackIgnore: true */ source);
  if (file === MYAPPS_TRACE_METADATA && createHash("sha256").update(data).digest("hex") !== MYAPPS_TRACE_METADATA_SHA256) {
    throw new Error("MyApps trace metadata changed; canonical packaging review required");
  }
  return data;
}

export function relocateMyAppsReferences(file: string, data: Buffer): Buffer {
  const source = data.toString("utf8");
  if (!source.includes(REPOSITORY_PREFIX)) return data;
  if (!RELOCATED_CONSUMERS.has(file)) throw new Error(`Unexpected shared MyApps consumer: ${file}`);
  const relocated = source.replace(/\.\.\/\.\.\/\.\.\/\.\.\/packages\/myapps\/([^"'`\s]*)/g, (reference, suffix: string) => {
    const shared = `packages/myapps/${suffix}`;
    if (!(SHARED_MYAPPS_FILES as readonly string[]).includes(shared) &&
      !(file === "lib/myapps/hosting.ts" && suffix === "prototype/")) {
      throw new Error(`Unowned shared MyApps reference: ${file}: ${reference}`);
    }
    return `../../packages/myapps/${suffix}`;
  });
  if (relocated.includes(REPOSITORY_PREFIX)) throw new Error(`Unresolved shared MyApps reference: ${file}`);
  return Buffer.from(relocated);
}

export function relocateCapabilityReferences(file: string, data: Buffer): Buffer {
  const source = data.toString("utf8");
  const prefix = "../../../../packages/capability-";
  if (!source.includes(prefix)) return data;
  if (file !== "lib/capability-control/store.ts" && file !== "lib/capability-control/runtime.ts") {
    throw new Error(`Unexpected shared capability consumer: ${file}`);
  }
  const relocated = source.replace(/\.\.\/\.\.\/\.\.\/\.\.\/packages\/(capability-[^"'`\s]*)/g, (reference, suffix: string) => {
    if (!(SHARED_CAPABILITY_FILES as readonly string[]).includes(`packages/${suffix}`)) {
      throw new Error(`Unowned shared capability reference: ${file}: ${reference}`);
    }
    return `../../packages/${suffix}`;
  });
  if (relocated.includes(prefix)) throw new Error(`Unresolved shared capability reference: ${file}`);
  return Buffer.from(relocated);
}

/** Carry the repository's existing dependency mitigations into the new root. */
export function standalonePackageManifest(application: Record<string, unknown>, repository: Record<string, unknown>): void {
  const scripts = application.scripts as Record<string, string>;
  const repositoryScripts = repository.scripts as Record<string, string>;
  const apply = "node scripts/security/apply-dependency-patches.mjs";
  const check = `${apply} --check`;
  if (repositoryScripts.postinstall !== apply || repositoryScripts["security:patches"] !== check ||
    !repository.overrides || typeof repository.overrides !== "object" || Array.isArray(repository.overrides)) {
    throw new Error("Unrecognized canonical dependency security contract");
  }
  if (application.workspaces !== undefined || application.overrides !== undefined ||
    scripts.postinstall !== undefined || scripts["security:patches"] !== undefined || !scripts.build) {
    throw new Error("Standalone package contract requires explicit reconciliation");
  }
  application.workspaces = ["packages/capability-control", "packages/capability-enforcement"];
  application.overrides = repository.overrides;
  application.packageManager = repository.packageManager;
  scripts.postinstall = apply;
  scripts["security:patches"] = check;
  // Explicit build commands still run with npm --ignore-scripts. Apply and
  // verify the canonical patch even when install lifecycle hooks were skipped.
  scripts.build = `${apply} && ${check} && ${scripts.build}`;
}

export function assertUniqueOutputPaths(files: readonly { file: string }[]): void {
  const seen = new Set<string>();
  for (const { file } of files) {
    const normalized = path.posix.normalize(file.replaceAll("\\", "/"));
    if (file === "." || file === ".." || normalized !== file || file.startsWith("/") || file.startsWith("../") || seen.has(normalized)) {
      throw new Error(`Invalid or duplicate deployment path: ${file}`);
    }
    seen.add(normalized);
  }
}
