import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildInstalledSkillCatalog,
  buildRuntimeSkillPackageCatalog,
} from "../scripts/generate-skill-catalog.mjs";
import { checkImportedSkillRouting } from "../scripts/check-imported-skill-routing.mjs";
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
  assert.equal(generated.length, 78);
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

test("curated agent-skills import preserves provenance, evals, and package references", async () => {
  const catalog = await buildInstalledSkillCatalog();
  const packages = await buildRuntimeSkillPackageCatalog();
  const sources = JSON.parse(
    await readFile(join(appRoot, "agent", "skill-sources.json"), "utf8"),
  );
  const source = sources.imports.find(
    (entry) => entry.repository === "addyosmani/agent-skills",
  );
  const catalogByName = new Map(catalog.map((skill) => [skill.name, skill]));
  const packagesByName = new Map(packages.map((skill) => [skill.name, skill]));

  assert.equal(source.revision, "be4e44a9fbc5e8df0beaefadbb28bd22ee61cc39");
  assert.equal(source.license, "MIT");
  assert.equal(source.skills.length, 12);
  assert.equal(new Set(source.skills).size, 12);

  for (const name of source.skills) {
    const skill = catalogByName.get(name);
    const skillPackage = packagesByName.get(name);
    assert.ok(skill, `${name} is not cataloged`);
    assert.ok(skillPackage, `${name} is not packaged`);
    assert.equal(skill.repository, source.repository);
    assert.equal(skill.revision, source.revision);
    assert.equal(skill.license, "MIT");
    assert.match(skill.sourceEvalPath, new RegExp(`/${name}\\.json$`));
    assert.ok(skill.routingPrompts.length >= 3, `${name} needs positive routing prompts`);
    assert.ok(skill.negativeRoutingPrompts.length >= 2, `${name} needs negative routing prompts`);
    assert.ok(skill.behavioralEvalCount >= 1, `${name} needs a behavioral eval`);
    assert.ok(skillPackage.files["LICENSE"], `${name} is missing its license`);

    for (const reference of skillPackage.markdown.matchAll(/`references\/([^`]+\.md)`/g)) {
      const path = `references/${reference[1]}`;
      assert.ok(skillPackage.files[path], `${name} references missing ${path}`);
    }
  }
});

test("approved awesome-llm-apps skills preserve provenance, evals, and activation policy", async () => {
  const catalog = await buildInstalledSkillCatalog();
  const packages = await buildRuntimeSkillPackageCatalog();
  const sources = JSON.parse(
    await readFile(join(appRoot, "agent", "skill-sources.json"), "utf8"),
  );
  const source = sources.imports.find(
    (entry) => entry.repository === "Shubhamsaboo/awesome-llm-apps",
  );
  const catalogByName = new Map(catalog.map((skill) => [skill.name, skill]));
  const packagesByName = new Map(packages.map((skill) => [skill.name, skill]));

  assert.equal(source.revision, "6272f8bd1fdeb75153d1a95d7fc761e26e477116");
  assert.equal(source.path, "agent_skills");
  assert.equal(source.license, "Apache-2.0");
  assert.deepEqual(source.skills, [
    "dependency-doctor",
    "scope-creep-detector",
    "thinking-out-loud",
  ]);

  for (const name of source.skills) {
    const skill = catalogByName.get(name);
    const skillPackage = packagesByName.get(name);
    assert.ok(skill, `${name} is not cataloged`);
    assert.ok(skillPackage, `${name} is not packaged`);
    assert.equal(skill.repository, source.repository);
    assert.equal(skill.repositoryPath, `${source.path}/${name}`);
    assert.equal(skill.revision, source.revision);
    assert.equal(skill.license, "Apache-2.0");
    assert.match(skill.sourceEvalPath, new RegExp(`/${name}\\.json$`));
    assert.ok(skill.routingPrompts.length >= 3, `${name} needs positive routing prompts`);
    assert.ok(skill.negativeRoutingPrompts.length >= 2, `${name} needs negative routing prompts`);
    assert.ok(skill.behavioralEvalCount >= 1, `${name} needs a behavioral eval`);
    assert.ok(skillPackage.files["LICENSE"], `${name} is missing its license`);
  }

  assert.equal(catalogByName.get("thinking-out-loud").activationExplicit, true);
  assert.equal(catalogByName.get("dependency-doctor").activationExplicit, false);
  assert.ok(DEFAULT_SPECIALIST_SKILLS["functional-state"].includes("scope-creep-detector"));
  assert.ok(DEFAULT_SPECIALIST_SKILLS["trust-resilience"].includes("dependency-doctor"));
  assert.ok(
    Object.values(DEFAULT_SPECIALIST_SKILLS).every(
      (skills) => !skills.includes("thinking-out-loud"),
    ),
    "thinking-out-loud stays Sofie-only",
  );
});

test("curated agent-skills pass combined-catalog routing checks", async () => {
  const result = await checkImportedSkillRouting();
  assert.deepEqual(result.messages, []);
  assert.equal(result.errors, 0);
  assert.equal(result.checks, 93);
  assert.ok(result.rankOnePercent >= 85);
});
