import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceManifestPath = join(appRoot, "agent", "skill-sources.json");
const skillsDirectory = join(appRoot, "agent", "skills");
const portableOnlyFields = new Set(["allowed-tools", "compatibility", "user-invocable"]);

function topLevelField(line) {
  return /^([A-Za-z][A-Za-z0-9_-]*):/.exec(line)?.[1] ?? null;
}

function metadataBlock(field, lines) {
  const [first, ...rest] = lines;
  const value = first.slice(field.length + 1).trim();
  const normalizedFirst = field === "user-invocable" ? `${field}: ${JSON.stringify(value)}` : first;
  return [`  ${normalizedFirst}`, ...rest.map((line) => `  ${line}`)];
}

export function normalizeSkillFrontmatter(markdown) {
  const normalized = markdown.replaceAll("\r\n", "\n");
  if (!normalized.startsWith("---\n")) throw new Error("SKILL.md is missing frontmatter");
  const end = normalized.indexOf("\n---\n", 4);
  if (end === -1) throw new Error("SKILL.md has unclosed frontmatter");

  const lines = normalized.slice(4, end).split("\n");
  const kept = [];
  const moved = [];
  for (let index = 0; index < lines.length; index++) {
    const field = topLevelField(lines[index]);
    if (field === null || !portableOnlyFields.has(field)) {
      kept.push(lines[index]);
      continue;
    }

    const block = [lines[index]];
    while (index + 1 < lines.length && topLevelField(lines[index + 1]) === null) {
      block.push(lines[++index]);
    }
    moved.push(...metadataBlock(field, block));
  }

  if (moved.length === 0) return normalized;
  const metadataIndex = kept.findIndex((line) => line === "metadata:");
  if (metadataIndex === -1) throw new Error("Imported SKILL.md is missing metadata");
  let insertAt = metadataIndex + 1;
  while (insertAt < kept.length && topLevelField(kept[insertAt]) === null) insertAt++;
  kept.splice(insertAt, 0, ...moved);

  return `---\n${kept.join("\n")}\n---\n${normalized.slice(end + 5)}`;
}

export async function normalizeImportedSkills() {
  const sources = JSON.parse(await readFile(sourceManifestPath, "utf8"));
  let changed = 0;
  for (const source of sources.imports) {
    for (const name of source.skills) {
      const path = join(skillsDirectory, name, "SKILL.md");
      const current = await readFile(path, "utf8");
      const normalized = normalizeSkillFrontmatter(current);
      if (normalized === current) continue;
      await writeFile(path, normalized);
      changed++;
    }
  }
  return changed;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const changed = await normalizeImportedSkills();
  console.log(`Normalized ${changed} imported skills for Eve.`);
}
