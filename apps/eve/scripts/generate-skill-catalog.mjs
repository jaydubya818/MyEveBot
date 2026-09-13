import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const skillsDirectory = join(appRoot, "agent", "skills");
const catalogPath = join(appRoot, "lib", "installed-skills.generated.json");
const runtimeCatalogPath = join(
  appRoot,
  "lib",
  "installed-skill-packages.generated.json",
);
const sourcesPath = join(appRoot, "agent", "skill-sources.json");

function parseInlineScalar(value) {
  if (value.startsWith('"')) return JSON.parse(value);
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replaceAll("''", "'");
  }
  return value;
}

function frontmatterField(markdown, field) {
  const normalized = markdown.replaceAll("\r\n", "\n");
  if (!normalized.startsWith("---\n")) throw new Error("SKILL.md is missing frontmatter");

  const end = normalized.indexOf("\n---\n", 4);
  if (end === -1) throw new Error("SKILL.md has unclosed frontmatter");

  const lines = normalized.slice(4, end).split("\n");
  const fieldIndex = lines.findIndex((line) => line.startsWith(`${field}:`));
  if (fieldIndex === -1) throw new Error(`SKILL.md is missing ${field}`);

  const rawValue = lines[fieldIndex].slice(field.length + 1).trim();
  if (![">", ">-", "|", "|-"].includes(rawValue)) return parseInlineScalar(rawValue);

  const block = [];
  for (let index = fieldIndex + 1; index < lines.length; index++) {
    const line = lines[index];
    if (line.length > 0 && !/^\s/.test(line)) break;
    block.push(line.replace(/^ {2}/, ""));
  }

  const text = block.join("\n").trim();
  return rawValue.startsWith(">") ? text.replace(/\s*\n\s*/g, " ") : text;
}

function metadataField(markdown, field) {
  const normalized = markdown.replaceAll("\r\n", "\n");
  const end = normalized.indexOf("\n---\n", 4);
  const lines = normalized.slice(4, end).split("\n");
  const prefix = `  ${field}:`;
  const line = lines.find((candidate) => candidate.startsWith(prefix));
  return line === undefined ? null : parseInlineScalar(line.slice(prefix.length).trim());
}

async function walkFiles(directory, root = directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(path, root)));
    } else if (entry.isFile()) {
      files.push({
        absolutePath: path,
        relativePath: relative(root, path).split(sep).join("/"),
      });
    }
  }
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

async function sourceBySkill() {
  const sources = JSON.parse(await readFile(sourcesPath, "utf8"));
  const index = new Map();
  for (const entry of sources.imports ?? []) {
    for (const skill of entry.skills ?? []) {
      const sourceEvalPath =
        typeof entry.evalPath === "string" ? `${entry.evalPath}/${skill}.json` : null;
      let sourceEval = null;
      if (sourceEvalPath !== null) {
        sourceEval = JSON.parse(await readFile(join(appRoot, sourceEvalPath), "utf8"));
        if (sourceEval.skill_name !== skill) {
          throw new Error(`${sourceEvalPath} declares ${sourceEval.skill_name}; expected ${skill}`);
        }
      }
      index.set(skill, {
        repository: entry.repository,
        revision: entry.revision,
        license: entry.license ?? null,
        sourceEvalPath,
        routingPrompts: (sourceEval?.trigger?.positive ?? []).map((item) => item.prompt),
        negativeRoutingPrompts: sourceEval?.trigger?.negative ?? [],
        behavioralEvalCount: sourceEval?.evals?.length ?? 0,
      });
    }
  }
  return index;
}

export async function buildInstalledSkillCatalog(directory = skillsDirectory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const sources = await sourceBySkill();
  const skills = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillPath = join(directory, entry.name, "SKILL.md");
    let markdown;
    try {
      markdown = await readFile(skillPath, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }

    const name = frontmatterField(markdown, "name");
    const description = frontmatterField(markdown, "description");
    const userInvocable = metadataField(markdown, "user-invocable") !== "false";
    if (name !== entry.name) {
      throw new Error(`${skillPath} declares name ${name}; expected ${entry.name}`);
    }
    if (description.length === 0) throw new Error(`${skillPath} has an empty description`);
    const files = await walkFiles(join(directory, entry.name));
    const contents = await Promise.all(files.map((file) => readFile(file.absolutePath)));
    const contentHash = createHash("sha256");
    files.forEach((file, index) => {
      contentHash.update(file.relativePath);
      contentHash.update("\0");
      contentHash.update(contents[index]);
      contentHash.update("\0");
    });
    const source = sources.get(name);
    skills.push({
      name,
      description,
      userInvocable,
      fileCount: files.length,
      sizeBytes: contents.reduce((total, file) => total + file.byteLength, 0),
      contentHash: contentHash.digest("hex"),
      sourcePath: `agent/skills/${name}/SKILL.md`,
      repository: source?.repository ?? null,
      revision: source?.revision ?? null,
      license: source?.license ?? null,
      sourceEvalPath: source?.sourceEvalPath ?? null,
      routingPrompts: source?.routingPrompts ?? [],
      negativeRoutingPrompts: source?.negativeRoutingPrompts ?? [],
      behavioralEvalCount: source?.behavioralEvalCount ?? 0,
    });
  }

  return skills.sort((left, right) => left.name.localeCompare(right.name));
}

export async function buildRuntimeSkillPackageCatalog(directory = skillsDirectory) {
  const catalog = await buildInstalledSkillCatalog(directory);
  return Promise.all(
    catalog.map(async (skill) => {
      const root = join(directory, skill.name);
      const markdown = await readFile(join(root, "SKILL.md"), "utf8");
      const packageFiles = (await walkFiles(root)).filter(
        (file) => file.relativePath !== "SKILL.md",
      );
      const files = Object.fromEntries(
        await Promise.all(
          packageFiles.map(async (file) => [
            file.relativePath,
            (await readFile(file.absolutePath)).toString("base64"),
          ]),
        ),
      );
      return { name: skill.name, description: skill.description, markdown, files };
    }),
  );
}

export async function writeInstalledSkillCatalog() {
  const catalog = await buildInstalledSkillCatalog();
  const runtimeCatalog = await buildRuntimeSkillPackageCatalog();
  await Promise.all([
    writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`),
    writeFile(runtimeCatalogPath, `${JSON.stringify(runtimeCatalog)}\n`),
  ]);
  return catalog;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const catalog = await writeInstalledSkillCatalog();
  console.log(`Cataloged ${catalog.length} installed skills.`);
}
