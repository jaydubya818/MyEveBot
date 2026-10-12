import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { isExcluded } from "./manifest";

const exec = promisify(execFile);
export const TEMPLATE_SOURCE_MANIFEST = ".builder-template-source.json";

export async function sourceRepository(root: string): Promise<string> {
  const repository = await realpath(/* turbopackIgnore: true */ path.resolve(root, "../.."));
  for (const directory of [path.join(repository, "apps"), path.join(repository, "apps/eve")]) {
    const entry = await lstat(/* turbopackIgnore: true */ directory);
    if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error("Invalid template source root");
  }
  if (await realpath(/* turbopackIgnore: true */ root) !== path.join(repository, "apps/eve")) throw new Error("Invalid template source root");
  return repository;
}

export async function templateHasGit(root: string): Promise<boolean> {
  const repository = await sourceRepository(root);
  try { await lstat(/* turbopackIgnore: true */ path.join(repository, ".git")); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; return false; }
}

/** A missing Git checkout requires the inventory sealed by the trusted Builder build. */
export async function templateSourceFiles(root: string): Promise<string[]> {
  if (!(await templateHasGit(root))) return Object.keys(await bundleInventory(root)).sort();
  const repository = await sourceRepository(root);
  const { stdout: top } = await exec("git", ["rev-parse", "--show-toplevel"], { cwd: repository });
  if (await realpath(/* turbopackIgnore: true */ top.trim()) !== repository) throw new Error("Template repository identity mismatch");
  const { stdout } = await exec("git", ["ls-files", "--cached", "-z", "--", "apps/eve/"], { cwd: repository, maxBuffer: 16 * 1024 * 1024 });
  return [...new Set(stdout.split("\0").filter(Boolean).map(file => file.slice("apps/eve/".length)))].filter(file => !isExcluded(file)).sort();
}

function validSourcePath(relative: string): boolean {
  return !!relative && !relative.startsWith("/") && !relative.includes("\\") && !relative.split("/").some(part => !part || part === "." || part === "..") && !isExcluded(relative);
}

async function bundleInventory(root: string): Promise<Record<string, string>> {
  const value = JSON.parse((await readSourceBytes(root, TEMPLATE_SOURCE_MANIFEST)).toString("utf8"));
  if (value?.format !== "myeve.builder-source.v1" || !value.files || typeof value.files !== "object" || Array.isArray(value.files) ||
    Object.keys(value.files).length === 0 || Object.keys(value.files).length > 10000 ||
    Object.entries(value.files).some(([file, hash]) => !validSourcePath(file) || typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash))) {
    throw new Error("Invalid Builder source inventory");
  }
  return value.files;
}

export async function readTemplateSource(root: string, relative: string): Promise<Buffer> {
  if (!validSourcePath(relative)) throw new Error(`Invalid template source: ${relative}`);
  const inventory = await templateHasGit(root) ? null : await bundleInventory(root);
  if (inventory && !Object.hasOwn(inventory, relative)) throw new Error(`Builder source inventory mismatch: ${relative}`);
  const bytes = await readSourceBytes(root, relative);
  if (inventory) {
    if (createHash("sha256").update(bytes).digest("hex") !== inventory[relative]) {
      throw new Error(`Builder source inventory mismatch: ${relative}`);
    }
  }
  return bytes;
}

async function readSourceBytes(root: string, relative: string): Promise<Buffer> {
  let source = path.join(await sourceRepository(root), "apps/eve");
  const parts = relative.split("/");
  for (const [index, part] of parts.entries()) {
    source = path.join(source, part);
    const entry = await lstat(/* turbopackIgnore: true */ source);
    if (entry.isSymbolicLink() || (index < parts.length - 1 ? !entry.isDirectory() : !entry.isFile())) throw new Error(`Invalid template source: ${relative}`);
  }
  return readFile(/* turbopackIgnore: true */ source);
}
