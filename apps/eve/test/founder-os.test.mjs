import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

import { BUILTIN_ROLE_CATALOG } from "../lib/builtin-role-catalog.ts";
import { BUILTIN_SOLUTION_PACKS, BUILTIN_SOLUTION_PACK_CATALOG } from "../lib/builtin-solution-packs.ts";
import { CAPABILITY_DEFINITIONS } from "../lib/capability-registry.ts";
import {
  FOUNDER_ARTIFACT_DEFINITIONS,
  FOUNDER_BUSINESS_REVIEW_WORKFLOW,
  FOUNDER_CHIEF_OF_STAFF_ROLE,
  FOUNDER_GOAL_TEMPLATES,
  FOUNDER_METRIC_DEFINITIONS,
  FOUNDER_OS_DOMAINS,
  FOUNDER_OS_ROLE_PACK,
  FOUNDER_OS_SOLUTION_PACK,
  diagnoseRevenueConstraint,
} from "../lib/role-packs/founder-os.ts";
import {
  LANDING_PAGE_CRO_ROLE,
  LIFECYCLE_EMAIL_ROLE,
  MARKETING_ENGINEER_ROLE,
  PRODUCT_MARKETER_ROLE,
} from "../lib/role-packs/marketing-engineering.ts";

test("one built-in catalog exposes one valid Founder OS Solution Pack", () => {
  assert.deepEqual(BUILTIN_SOLUTION_PACKS, [FOUNDER_OS_SOLUTION_PACK]);
  assert.deepEqual(BUILTIN_SOLUTION_PACK_CATALOG.packs, [FOUNDER_OS_SOLUTION_PACK]);
  assert.deepEqual(FOUNDER_OS_SOLUTION_PACK.rolePackIds, ["founder-os-core", "marketing-engineering"]);
  assert.equal(new Set(BUILTIN_SOLUTION_PACK_CATALOG.packs.map((pack) => pack.id)).size, 1);
  assert.deepEqual(FOUNDER_OS_DOMAINS.map((domain) => domain.id), ["strategy", "traffic", "leads", "conversion", "sales", "offer", "delivery", "finance", "systems"]);
  assert.ok(FOUNDER_OS_DOMAINS.every((domain) => domain.health === "unknown" && domain.healthBasis === "unavailable"));
});

test("Founder OS has 21 native Roles and 29 distinct domain Roles", () => {
  assert.equal(FOUNDER_OS_ROLE_PACK.roles.length, 21);
  const domainRoleIds = new Set(FOUNDER_OS_DOMAINS.flatMap((domain) => domain.roleIds));
  assert.equal(domainRoleIds.size, 29);
  assert.equal(FOUNDER_OS_SOLUTION_PACK.roles.length, 32);
  assert.equal(new Set(FOUNDER_OS_SOLUTION_PACK.roles.map((selection) => selection.roleId)).size, 32);
});

test("Founder OS reuses canonical Marketing Engineering Roles by identity", () => {
  const reused = [PRODUCT_MARKETER_ROLE, MARKETING_ENGINEER_ROLE, LIFECYCLE_EMAIL_ROLE, LANDING_PAGE_CRO_ROLE];
  for (const role of reused) {
    assert.equal(BUILTIN_ROLE_CATALOG.roles.find((candidate) => candidate.id === role.id), role);
    assert.ok(FOUNDER_OS_SOLUTION_PACK.roles.some((selection) => selection.packId === "marketing-engineering" && selection.roleId === role.id));
  }
});

test("Founder OS ships 11 Goal Templates with three ready templates", () => {
  assert.equal(FOUNDER_GOAL_TEMPLATES.length, 11);
  assert.deepEqual(FOUNDER_GOAL_TEMPLATES.filter((goal) => goal.maturity === "working").map((goal) => goal.id), ["grow-revenue", "launch-product", "quarterly-business-review"]);
  for (const goal of FOUNDER_GOAL_TEMPLATES) {
    assert.ok(goal.inputs.length > 0, `${goal.id} needs inputs`);
    assert.ok(goal.outputs.length > 0, `${goal.id} needs outputs`);
    assert.ok(goal.guardrails.some((guardrail) => /fabricate missing metrics/i.test(guardrail)));
  }
});

test("constraint diagnosis follows the Leads and Conversion revenue golden path", () => {
  const diagnosis = diagnoseRevenueConstraint([
    { metricId: "traffic-volume", assessment: "strong", evidence: "Traffic is above target." },
    { metricId: "qualified-leads", assessment: "acceptable", evidence: "Lead volume is sufficient." },
    { metricId: "lead-conversion-rate", assessment: "weak", evidence: "Lead conversion is below target." },
    { metricId: "sales-close-rate", assessment: "strong", evidence: "Close rate is above target." },
  ]);
  assert.deepEqual(diagnosis.primaryDomainIds, ["leads", "conversion"]);
  assert.deepEqual(diagnosis.evidence, ["Lead conversion is below target."]);
  assert.ok(diagnosis.missingMetricIds.includes("average-deal-value"));
});

test("Founder Business Review spans all domains and stops before consequential action", () => {
  assert.equal(FOUNDER_BUSINESS_REVIEW_WORKFLOW.coordinatorRoleId, FOUNDER_CHIEF_OF_STAFF_ROLE.id);
  assert.deepEqual(FOUNDER_BUSINESS_REVIEW_WORKFLOW.domainIds, FOUNDER_OS_DOMAINS.map((domain) => domain.id));
  assert.match(FOUNDER_BUSINESS_REVIEW_WORKFLOW.outputs.join(" "), /Current constraint/);
  assert.match(FOUNDER_BUSINESS_REVIEW_WORKFLOW.checks.join(" "), /remain unexecuted/);
});

test("Founder OS ships 31 artifacts, six templates, and 10 metrics", async () => {
  assert.equal(FOUNDER_ARTIFACT_DEFINITIONS.length, 31);
  assert.equal(FOUNDER_METRIC_DEFINITIONS.length, 10);
  const templated = FOUNDER_ARTIFACT_DEFINITIONS.filter((artifact) => artifact.templateRef);
  assert.deepEqual(templated.map((artifact) => artifact.id), ["ideal-customer-profile", "campaign-brief", "sales-call-script", "offer-architecture", "client-onboarding-plan", "quarterly-business-review"]);
  for (const artifact of templated) await access(new URL(`../../../${artifact.templateRef}`, import.meta.url));
});

test("approval defaults preserve Relay and deny implicit authority", () => {
  const rules = new Map(FOUNDER_OS_SOLUTION_PACK.approvalPolicies.flatMap((policy) => policy.rules).map((rule) => [rule.action, rule.requirement]));
  for (const action of ["research", "analysis", "drafting", "forecasting", "create_artifact"]) assert.equal(rules.get(action), "allowed");
  for (const action of ["send_external_communication", "publish", "spend_money", "change_prices", "make_payment", "modify_live_system", "hire_or_fire", "deploy_code"]) assert.equal(rules.get(action), "approval_required");
  const capabilityRisks = new Map(CAPABILITY_DEFINITIONS.map((capability) => [capability.id, capability.risk.level]));
  assert.ok(FOUNDER_CHIEF_OF_STAFF_ROLE.recommendedCapabilities.every((id) => capabilityRisks.get(id) !== "high" && capabilityRisks.get(id) !== "critical"));
});

test("Eve discovery and progressive-disclosure UI use the canonical catalog", async () => {
  const [tool, panel, card, chat] = await Promise.all([
    readFile(new URL("../agent/tools/list_solution_packs.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/agents-panel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/solution-pack-catalog-card.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/chat.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(tool, /BUILTIN_SOLUTION_PACK_CATALOG/);
  assert.match(tool, /does not create Agents, grant capabilities, or execute actions/);
  assert.match(panel, /BUILTIN_SOLUTION_PACKS/);
  assert.match(card, /Operating domains/);
  assert.match(card, /Goal templates/);
  assert.match(card, /Approval boundaries/);
  assert.match(card, /Use Founder OS/);
  assert.match(card, /Create Founder Agent/);
  assert.match(chat, /setPendingDraft/);
});
