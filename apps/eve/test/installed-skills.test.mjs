import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildInstalledSkillCatalog,
  buildRuntimeSkillPackageCatalog,
} from "../scripts/generate-skill-catalog.mjs";
import { normalizeSkillFrontmatter } from "../scripts/normalize-imported-skills.mjs";
import {
  DEFAULT_SPECIALIST_SKILLS,
  SKILL_AGENTS,
} from "../lib/skill-manager-types.ts";

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test("generated skill catalog matches every packaged skill", async () => {
  const expected = await buildInstalledSkillCatalog();
  const generated = JSON.parse(
    await readFile(join(appRoot, "lib", "installed-skills.generated.json"), "utf8"),
  );

  assert.deepEqual(generated, expected);
  assert.ok(generated.some((skill) => skill.name === "product-qa"));
});

test("runtime skill packages preserve every installed skill and its supporting files", async () => {
  const expected = await buildRuntimeSkillPackageCatalog();
  const generated = JSON.parse(
    await readFile(
      join(appRoot, "lib", "installed-skill-packages.generated.json"),
      "utf8",
    ),
  );

  assert.deepEqual(generated, expected);
  assert.equal(generated.length, 62);
  assert.ok(generated.every((skill) => skill.markdown.includes("description:")));
  assert.ok(generated.find((skill) => skill.name === "architect").files["references/runner-prompt.md"]);
});

test("specialist assignment defaults reference real skills", async () => {
  const catalog = await buildInstalledSkillCatalog();
  const installed = new Set(catalog.map((skill) => skill.name));
  assert.deepEqual(SKILL_AGENTS.map((agent) => agent.id), [
    "sofie",
    "functional-state",
    "ux-accessibility",
    "trust-resilience",
  ]);
  for (const [agentId, names] of Object.entries(DEFAULT_SPECIALIST_SKILLS)) {
    assert.ok(names.length > 0, `${agentId} needs at least one default skill`);
    for (const name of names) assert.ok(installed.has(name), `${agentId} references ${name}`);
  }
});

test("Eve frontmatter normalization is idempotent", async () => {
  const catalog = await buildInstalledSkillCatalog();
  for (const skill of catalog) {
    const path = join(appRoot, "agent", "skills", skill.name, "SKILL.md");
    const markdown = await readFile(path, "utf8");
    assert.equal(normalizeSkillFrontmatter(markdown), markdown, `${skill.name} is not normalized`);
  }
});

test("every skill from the pinned skillz import is packaged", async () => {
  const catalog = await buildInstalledSkillCatalog();
  const sources = JSON.parse(
    await readFile(join(appRoot, "agent", "skill-sources.json"), "utf8"),
  );
  const skillz = sources.imports.find((entry) => entry.repository === "jaydubya818/skillz");
  const installedNames = new Set(catalog.map((skill) => skill.name));

  assert.equal(skillz.revision, "a4bb4914be14f0d529a5b3dd2d09eeb9e93bec16");
  assert.equal(skillz.skills.length, 61);
  for (const name of skillz.skills) assert.ok(installedNames.has(name), `${name} is not packaged`);
});
