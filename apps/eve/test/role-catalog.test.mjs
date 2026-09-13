import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { BUILTIN_ROLE_CATALOG, BUILTIN_ROLE_PACKS, DECLARED_QA_ROLE_IDS } from "../lib/builtin-role-catalog.ts";
import { CAPABILITY_DEFINITIONS } from "../lib/capability-registry.ts";
import { DELEGATION_BUDGETS } from "../lib/delegation-policy.ts";
import { createRoleCatalog, roleAgentDefaults } from "../lib/role-catalog.ts";
import { MARKETING_ENGINEERING_ROLE_PACK } from "../lib/role-packs/marketing-engineering.ts";
import { SOFTWARE_DEVELOPMENT_ROLE_PACK } from "../lib/role-packs/software-development.ts";

const roleIds = BUILTIN_ROLE_CATALOG.roles.map((role) => role.id);

test("built-in catalog exposes canonical Role Packs, including the internal Founder OS pack", () => {
  assert.deepEqual(BUILTIN_ROLE_PACKS.map((pack) => pack.id), [
    "general",
    "software-development",
    "marketing-engineering",
    "founder-os-core",
    "verification",
  ]);
  assert.equal(new Set(roleIds).size, roleIds.length);
  assert.equal(BUILTIN_ROLE_CATALOG.roles.length, 40);
});

test("shared roles are deduplicated and conflicting definitions are rejected", () => {
  const researcherEntries = BUILTIN_ROLE_PACKS.flatMap((pack) => pack.roles)
    .filter(({ role }) => role.id === "researcher");
  assert.equal(researcherEntries.length, 3);
  assert.equal(researcherEntries[0].role, researcherEntries[1].role);

  assert.throws(() => createRoleCatalog([
    { id: "one", name: "One", description: "First test pack.", roles: [{ role: researcherEntries[0].role }] },
    { id: "two", name: "Two", description: "Second test pack.", roles: [{ role: { ...researcherEntries[0].role } }] },
  ]), /conflicting definitions/);
});

test("Marketing Engineering reuses canonical shared roles by reference", () => {
  for (const roleId of ["researcher", "writer", "analyst", "scheduler"]) {
    const entries = BUILTIN_ROLE_PACKS.flatMap((pack) => pack.roles)
      .filter(({ role }) => role.id === roleId);
    assert.ok(entries.length > 1, `${roleId} should be shared across packs`);
    assert.ok(entries.every((entry) => entry.role === entries[0].role), `${roleId} should use one canonical definition`);
  }
});

test("software development pack covers every lifecycle stage", () => {
  const lifecycleIds = SOFTWARE_DEVELOPMENT_ROLE_PACK.lifecycle.stages.map((stage) => stage.id);
  const assignedIds = new Set(SOFTWARE_DEVELOPMENT_ROLE_PACK.roles.flatMap((entry) => entry.lifecycleStages ?? []));
  assert.deepEqual(lifecycleIds, ["direction", "discovery", "design", "build", "verify", "release", "operate", "learn"]);
  assert.deepEqual([...assignedIds].sort(), [...lifecycleIds].sort());
});

test("marketing engineering pack covers its complete lifecycle", () => {
  const lifecycleIds = MARKETING_ENGINEERING_ROLE_PACK.lifecycle.stages.map((stage) => stage.id);
  const assignedIds = new Set(MARKETING_ENGINEERING_ROLE_PACK.roles.flatMap((entry) => entry.lifecycleStages ?? []));
  assert.deepEqual(lifecycleIds, ["direction", "research", "create", "build", "verify", "launch", "measure", "optimize"]);
  assert.deepEqual([...assignedIds].sort(), [...lifecycleIds].sort());
});

test("all role lifecycle references and recommended capabilities are valid", () => {
  const capabilityIds = new Set(CAPABILITY_DEFINITIONS.map((capability) => capability.id));
  for (const pack of BUILTIN_ROLE_PACKS) {
    const lifecycleIds = new Set(pack.lifecycle?.stages.map((stage) => stage.id) ?? []);
    for (const { role, lifecycleStages = [] } of pack.roles) {
      for (const stage of lifecycleStages) assert.ok(lifecycleIds.has(stage), `${pack.id}:${role.id} references ${stage}`);
      for (const capabilityId of role.recommendedCapabilities) {
        assert.ok(capabilityIds.has(capabilityId), `${role.id} recommends unknown capability ${capabilityId}`);
      }
    }
  }
});

test("Verification remains the fixed three declared QA specialists", () => {
  assert.deepEqual(DECLARED_QA_ROLE_IDS, ["functional-state", "ux-accessibility", "trust-resilience"]);
  const declared = BUILTIN_ROLE_CATALOG.roles.filter((role) => role.executionMode === "declared-specialist");
  assert.deepEqual(declared.map((role) => role.id), DECLARED_QA_ROLE_IDS);
  assert.ok(declared.every((role) => role.verificationRole));
  assert.ok(MARKETING_ENGINEERING_ROLE_PACK.roles.every(({ role }) => role.executionMode === "on-demand"));
});

test("marketing launch roles retain approval and independent-review boundaries", () => {
  const marketingEngineer = BUILTIN_ROLE_CATALOG.roles.find((role) => role.id === "marketing-engineer");
  const lifecycleEngineer = BUILTIN_ROLE_CATALOG.roles.find((role) => role.id === "lifecycle-marketing-engineer");
  const reviewer = BUILTIN_ROLE_CATALOG.roles.find((role) => role.id === "marketing-qa-compliance-reviewer");
  assert.ok(marketingEngineer?.boundaries.some((boundary) => /explicit approval/i.test(boundary)));
  assert.ok(lifecycleEngineer?.boundaries.some((boundary) => /explicit approval/i.test(boundary)));
  assert.equal(reviewer?.verificationRole, true);
  assert.ok(reviewer?.boundaries.some((boundary) => /independent/i.test(boundary)));
  assert.equal(reviewer?.executionMode, "on-demand");
});

test("creating a persistent Agent from a Role produces editable configuration defaults", () => {
  const role = BUILTIN_ROLE_CATALOG.roles.find((candidate) => candidate.id === "software-developer");
  assert.ok(role);
  const defaults = roleAgentDefaults(role);
  assert.equal(defaults.name, role.name);
  assert.equal(defaults.role, role.name);
  assert.deepEqual(defaults.capabilityIds, [...role.recommendedCapabilities]);
  assert.match(defaults.instructions, /Safety boundaries:/);
  assert.equal(Object.hasOwn(defaults, "memory"), false);
  assert.equal(Object.hasOwn(defaults, "conversation"), false);
  assert.equal(Object.hasOwn(defaults, "privateState"), false);
});

test("general-purpose delegation is available while the QA panel stays specialized", () => {
  const delegation = CAPABILITY_DEFINITIONS.find((capability) => capability.id === "tool.agent");
  const roleCatalog = CAPABILITY_DEFINITIONS.find((capability) => capability.id === "tool.list_roles");
  assert.equal(delegation?.source.reference, "eve:agent");
  assert.equal(roleCatalog?.source.reference, "agent/tools/list_roles.ts");
  assert.equal(DELEGATION_BUDGETS.hardCeiling, 16);
  assert.deepEqual(DELEGATION_BUDGETS.simple, { minWorkers: 1, maxWorkers: 2 });
  assert.deepEqual(DELEGATION_BUDGETS.structured, { minWorkers: 2, maxWorkers: 5 });
});

test("generic Role Catalog primitives contain no product, owner, or software assumptions", async () => {
  const source = await readFile(new URL("../lib/role-catalog.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /Sofie|Jay|SellerFi|software|SDLC/i);
});

test("workflow consumes the shared 16-worker guardrail", async () => {
  const source = await readFile(new URL("../agent/tools/workflow.ts", import.meta.url), "utf8");
  assert.match(source, /maxSubagents:\s*DELEGATION_BUDGETS\.hardCeiling/);
});
