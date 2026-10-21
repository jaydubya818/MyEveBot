import { createHash, randomUUID } from "node:crypto";
import { writeFile, rename, rm, readdir } from "node:fs/promises";
import path from "node:path";
import { TEMPLATE_SOURCE_MANIFEST, templateHasGit, templateSourceFiles, readTemplateSource } from "./template-source";

export const traceLiteral = (file: string): string => file.replace(/[*?\[\]{}()]/g, character => `[${character}]`);

/** Next also traces dynamic reads. Exclude every on-disk path outside the sealed inventory. */
export async function templateTraceExcludes(root: string, files: readonly string[]): Promise<string[]> {
  const allowed = new Set(files), directories = new Set<string>();
  for (const file of files) {
    const parts = file.split("/");
    for (let index = 1; index < parts.length; index++) directories.add(parts.slice(0, index).join("/"));
  }
  const excluded: string[] = [];
  async function walk(directory: string): Promise<void> {
    for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
      const relative = directory ? `${directory}/${entry.name}` : entry.name;
      if (entry.isDirectory() && directories.has(relative)) await walk(relative);
      else if (!allowed.has(relative)) excluded.push(`../eve/${traceLiteral(relative)}${entry.isDirectory() ? "/**" : ""}`);
    }
  }
  await walk("");
  return excluded.sort();
}

/** Build metadata only: every entry comes from tracked source, never a directory glob. */
export async function prepareTemplateTrace(root: string): Promise<string[]> {
  if (!(await templateHasGit(root))) throw new Error("Builder build requires tracked template source");
  const files = await templateSourceFiles(root);
  const inventory: Record<string, string> = {};
  for (const file of files) inventory[file] = createHash("sha256").update(await readTemplateSource(root, file)).digest("hex");
  const temporary = path.join(root, `.builder-template-source.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, JSON.stringify({ format: "myeve.builder-source.v1", files: inventory }), { flag: "wx" });
    await rename(temporary, path.join(root, TEMPLATE_SOURCE_MANIFEST));
  } finally { await rm(temporary, { force: true }); }
  return [...files, TEMPLATE_SOURCE_MANIFEST];
}
