import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { BUILTIN_ROLE_CATALOG } from "../lib/builtin-role-catalog.ts";
import {
  CAMPAIGN_RESEARCH_BRIEF_WORKFLOW,
  MARKETING_CAMPAIGN_SECTIONS,
  MARKETING_ENGINEER_ROLE,
  MARKETING_ENGINEERING_ROLE_PACK,
  MARKETING_KNOWLEDGE_DOCUMENTS,
} from "../lib/role-packs/marketing-engineering.ts";

const expectedRoleIds = [
  "marketing-engineer",
  "marketing-market-researcher",
  "marketing-product-marketer",
  "marketing-content-strategist",
  "marketing-creative-brand-designer",
  "marketing-growth-performance",
  "marketing-seo-aeo",
  "marketing-lifecycle-email",
  "marketing-landing-page-cro",
  "marketing-operations",
  "marketing-analyst",
];

test("Marketing Engineering pack is complete and discoverable", () => {
  assert.equal(BUILTIN_ROLE_CATALOG.packs.find((pack) => pack.id === "marketing-engineering"), MARKETING_ENGINEERING_ROLE_PACK);
  assert.deepEqual(MARKETING_ENGINEERING_ROLE_PACK.roles.map(({ role }) => role.id), expectedRoleIds);
  assert.equal(new Set(expectedRoleIds).size, expectedRoleIds.length);
  assert.equal(MARKETING_ENGINEER_ROLE.executionMode, "on-demand");
  assert.match(MARKETING_ENGINEER_ROLE.description, /Coordinates/);
  assert.ok(MARKETING_ENGINEERING_ROLE_PACK.roles.every(({ role }) => role.executionMode === "on-demand"));
});

test("Marketing Engineering covers the complete operating lifecycle", () => {
  const lifecycle = MARKETING_ENGINEERING_ROLE_PACK.lifecycle;
  assert.ok(lifecycle);
  assert.deepEqual(lifecycle.stages.map((stage) => stage.id), [
    "understand", "research", "plan", "produce", "verify", "approve", "execute", "measure", "learn",
  ]);
  const assigned = new Set(MARKETING_ENGINEERING_ROLE_PACK.roles.flatMap((entry) => entry.lifecycleStages));
  assert.deepEqual([...assigned].sort(), lifecycle.stages.map((stage) => stage.id).sort());
});

test("marketing knowledge and campaign seams are explicit without a second store", () => {
  assert.deepEqual(MARKETING_KNOWLEDGE_DOCUMENTS.map((document) => document.filename), [
    "company.md", "customer.md", "offer.md", "positioning.md", "voice.md", "proof.md",
  ]);
  assert.deepEqual(MARKETING_CAMPAIGN_SECTIONS, ["brief", "research", "decisions", "tasks", "production", "assets", "approvals", "results"]);
});

test("Campaign Research to Brief is a bounded, checked owner-review workflow", () => {
  assert.equal(CAMPAIGN_RESEARCH_BRIEF_WORKFLOW.coordinatorRoleId, "marketing-engineer");
  assert.deepEqual(CAMPAIGN_RESEARCH_BRIEF_WORKFLOW.contributorRoleIds, ["marketing-market-researcher", "marketing-product-marketer"]);
  assert.equal(CAMPAIGN_RESEARCH_BRIEF_WORKFLOW.skillId, "campaign-research-brief");
  assert.ok(CAMPAIGN_RESEARCH_BRIEF_WORKFLOW.checks.some((check) => check.kind === "deterministic"));
  assert.ok(CAMPAIGN_RESEARCH_BRIEF_WORKFLOW.checks.some((check) => check.kind === "judgment"));
  assert.match(CAMPAIGN_RESEARCH_BRIEF_WORKFLOW.approvalBoundary, /Relay/);
  assert.match(CAMPAIGN_RESEARCH_BRIEF_WORKFLOW.stopCondition, /Ready for Owner Review/);
});

test("campaign skill enforces evidence, approval, and stop boundaries", async () => {
  const skill = await readFile(new URL("../agent/skills/campaign-research-brief/SKILL.md", import.meta.url), "utf8");
  assert.match(skill, /evidence, assumption, hypothesis, or recommendation/);
  assert.match(skill, /Ready for Owner Review/);
  assert.match(skill, /Relay is authoritative/);
  assert.match(skill, /Stop before publishing/);
});

test("Role Catalog UI exposes both on-demand and persistent actions", async () => {
  const source = await readFile(new URL("../components/agents-panel.tsx", import.meta.url), "utf8");
  assert.match(source, />Role Catalog</);
  assert.match(source, />Use Role</);
  assert.match(source, />Create Agent</);
  assert.match(source, /Typical inputs/);
  assert.match(source, /Typical outputs/);
});

test("on-demand Role execution is attributed on canonical Agent Runs", async () => {
  const sessionSource = await readFile(new URL("../agent/lib/session-settings.ts", import.meta.url), "utf8");
  const migration = await readFile(new URL("../migrations/0012_role_run_attribution.sql", import.meta.url), "utf8");
  assert.match(sessionSource, /on-demand-role/);
  assert.match(sessionSource, /INSERT INTO agent_runs/);
  assert.match(migration, /role_id/);
  assert.match(migration, /0008_persistent_agents\.sql/);
  assert.doesNotMatch(migration, /ALTER TABLE task_runs/);
  assert.doesNotMatch(migration, /computer_sessions/);
  assert.doesNotMatch(migration, /knowledge_/);
  assert.doesNotMatch(migration, /CREATE TABLE[^;]*role_runs/i);
});
