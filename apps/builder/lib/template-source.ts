import { execFile } from "node:child_process";
import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { isExcluded } from "./manifest";

const exec = promisify(execFile);
const BUNDLE_DIRECTORIES = new Set(["agent", "app", "components", "lib", "migrations", "public", "scripts", "types"]);
const BUNDLE_FILES = new Set([".eve-template-release", ".vercelignore", "components.json", "next-env.d.ts", "next.config.ts", "package.json", "postcss.config.mjs", "proxy.ts", "skills-lock.json", "tsconfig.json", "vercel.json"]);

async function sourceRepository(root: string): Promise<string> {
  const repository = await realpath(path.resolve(root, "../.."));
  for (const directory of [path.join(repository, "apps"), path.join(repository, "apps/eve")]) {
    const entry = await lstat(directory);
    if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error("Invalid template source root");
  }
  if (await realpath(root) !== path.join(repository, "apps/eve")) throw new Error("Invalid template source root");
  return repository;
}

/** Developer checkouts use tracked source; serverless traces have no Git metadata. */
export async function templateSourceFiles(root: string): Promise<string[]> {
  const repository = await sourceRepository(root);
  let hasGit = false;
  try { await lstat(path.join(repository, ".git")); hasGit = true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  if (hasGit) {
    const { stdout: top } = await exec("git", ["rev-parse", "--show-toplevel"], { cwd: repository });
    if (await realpath(top.trim()) !== repository) throw new Error("Template repository identity mismatch");
    const { stdout } = await exec("git", ["ls-files", "--cached", "-z", "--", "apps/eve/"], { cwd: repository, maxBuffer: 16 * 1024 * 1024 });
    return [...new Set(stdout.split("\0").filter(Boolean).map(file => file.slice("apps/eve/".length)))].filter(file => !isExcluded(file)).sort();
  }
  const files: string[] = [];
  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(path.join(root, dir), { withFileTypes: true })) {
      const relative = dir ? `${dir}/${entry.name}` : entry.name;
      if (isExcluded(relative)) continue;
      if (!dir && !(entry.isDirectory() ? BUNDLE_DIRECTORIES : BUNDLE_FILES).has(entry.name)) continue;
      if (entry.isSymbolicLink()) throw new Error(`Invalid template source: ${relative}`);
      if (entry.isDirectory()) await walk(relative);
      else if (entry.isFile()) files.push(relative);
    }
  }
  await walk("");
  return files.sort();
}

export async function readTemplateSource(root: string, relative: string): Promise<Buffer> {
  if (!relative || relative.startsWith("/") || relative.includes("\\") || relative.split("/").some(part => !part || part === "." || part === "..") || isExcluded(relative)) {
    throw new Error(`Invalid template source: ${relative}`);
  }
  let source = path.join(await sourceRepository(root), "apps/eve");
  const parts = relative.split("/");
  for (const [index, part] of parts.entries()) {
    source = path.join(source, part);
    const entry = await lstat(/* turbopackIgnore: true */ source);
    if (entry.isSymbolicLink() || (index < parts.length - 1 ? !entry.isDirectory() : !entry.isFile())) throw new Error(`Invalid template source: ${relative}`);
  }
  return readFile(/* turbopackIgnore: true */ source);
}
