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

const RELOCATED_CONSUMERS = new Set([
  "lib/myapps/api.ts", "lib/myapps/hosting.ts",
  "lib/myapps/runtime.ts", "lib/myapps/workflow.ts",
]);
const REPOSITORY_PREFIX = "../../../../packages/myapps/";

export async function readSharedMyAppsFile(eveRoot: string, file: string): Promise<Buffer> {
  if (!(SHARED_MYAPPS_FILES as readonly string[]).includes(file)) {
    throw new Error(`Unowned shared MyApps source: ${file}`);
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
  return readFile(/* turbopackIgnore: true */ source);
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
