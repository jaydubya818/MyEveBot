import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

import { BUILTIN_ROLE_CATALOG, BUILTIN_SOLUTION_PACKS } from "../lib/builtin-role-catalog.ts";
import { CAPABILITY_DEFINITIONS } from "../lib/capability-registry.ts";
import {
  FOUNDER_ARTIFACT_DEFINITIONS,
  FOUNDER_BUSINESS_REVIEW_WORKFLOW,
  FOUNDER_CHIEF_OF_STAFF_ROLE,
  FOUNDER_GOAL_TEMPLATES,
  FOUNDER_OS_DOMAINS,
  FOUNDER_OS_SOLUTION_PACK,
  FINANCIAL_ANALYST_ROLE,
  diagnoseRevenueConstraint,
} from "../lib/role-packs/founder-os.ts";
import { LANDING_PAGE_CRO_ROLE, PRODUCT_MARKETER_ROLE } from "../lib/role-packs/marketing-engineering.ts";
import { validateSolutionPacks } from "../lib/solution-pack.ts";

test("Founder OS is a valid Solution Pack with nine ordered operating domains", () => {
  assert.deepEqual(BUILTIN_SOLUTION_PACKS, [FOUNDER_OS_SOLUTION_PACK]);
  assert.doesNotThrow(() => validateSolutionPacks(BUILTIN_ROLE_CATALOG, BUILTIN_SOLUTION_PACKS));
  assert.deepEqual(FOUNDER_OS_DOMAINS.map((domain) => domain.id), ["strategy", "traffic", "leads", "conversion", "sales", "offer", "delivery", "finance", "systems"]);
  assert.ok(FOUNDER_OS_DOMAINS.every((domain) => domain.health === "unknown" && domain.healthBasis === "unavailable"));
});

test("Founder / Chief of Staff coordinates without inheriting high-risk capabilities", () => {
  assert.equal(BUILTIN_ROLE_CATALOG.roles.find((role) => role.id === FOUNDER_CHIEF_OF_STAFF_ROLE.id), FOUNDER_CHIEF_OF_STAFF_ROLE);
  const risks = new Map(CAPABILITY_DEFINITIONS.map((capability) => [capability.id, capability.risk.level]));
  assert.ok(FOUNDER_CHIEF_OF_STAFF_ROLE.recommendedCapabilities.every((id) => risks.get(id) !== "high" && risks.get(id) !== "critical"));
  assert.equal(FOUNDER_CHIEF_OF_STAFF_ROLE.recommendedRiskCeiling, "medium");
});

test("Founder OS reuses Marketing Engineering RoleDefinitions by identity", () => {
  const traffic = FOUNDER_OS_DOMAINS.find((domain) => domain.id === "traffic");
  const conversion = FOUNDER_OS_DOMAINS.find((domain) => domain.id === "conversion");
  assert.ok(traffic?.roleIds.includes(PRODUCT_MARKETER_ROLE.id));
  assert.ok(conversion?.roleIds.includes(LANDING_PAGE_CRO_ROLE.id));
  assert.equal(BUILTIN_ROLE_CATALOG.roles.find((role) => role.id === PRODUCT_MARKETER_ROLE.id), PRODUCT_MARKETER_ROLE);
  assert.equal(BUILTIN_ROLE_CATALOG.roles.filter((role) => role.id === PRODUCT_MARKETER_ROLE.id).length, 1);
});

test("three working Goal Templates are complete and conservative", () => {
  assert.deepEqual(FOUNDER_GOAL_TEMPLATES.filter((goal) => goal.maturity === "working").map((goal) => goal.id), ["grow-revenue", "launch-product", "quarterly-business-review"]);
  for (const goal of FOUNDER_GOAL_TEMPLATES) {
    assert.ok(goal.inputs.length > 0, `${goal.id} needs inputs`);
    assert.ok(goal.outputs.length > 0, `${goal.id} needs outputs`);
    assert.ok(goal.guardrails.some((guardrail) => /fabricate missing metrics/i.test(guardrail)));
  }
});

test("Founder Business Review covers the golden path and stops before consequential action", () => {
  assert.equal(FOUNDER_BUSINESS_REVIEW_WORKFLOW.coordinatorRoleId, FOUNDER_CHIEF_OF_STAFF_ROLE.id);
  assert.deepEqual(FOUNDER_BUSINESS_REVIEW_WORKFLOW.domainIds, FOUNDER_OS_DOMAINS.map((domain) => domain.id));
  assert.match(FOUNDER_BUSINESS_REVIEW_WORKFLOW.outputs.join(" "), /Current constraint/);
  assert.match(FOUNDER_BUSINESS_REVIEW_WORKFLOW.checks.join(" "), /remain unexecuted/);

  const diagnosis = diagnoseRevenueConstraint([
    { metricId: "traffic-volume", assessment: "strong", evidence: "Traffic is increasing." },
    { metricId: "lead-conversion-rate", assessment: "weak", evidence: "Visitor-to-qualified-lead conversion is below target." },
    { metricId: "sales-close-rate", assessment: "strong", evidence: "Qualified-opportunity close rate is above target." },
    { metricId: "delivery-capacity", assessment: "acceptable", evidence: "Delivery has available capacity." },
    { metricId: "cash-runway", assessment: "acceptable", evidence: "Runway is within the owner's accepted range." },
  ]);
  assert.deepEqual(diagnosis.primaryDomainIds, ["leads", "conversion"]);
  assert.deepEqual(diagnosis.evidence, ["Visitor-to-qualified-lead conversion is below target."]);
  assert.ok(diagnosis.missingMetricIds.includes("average-deal-value"));
});

test("Artifact Definitions resolve and six representative templates exist", async () => {
  const templated = FOUNDER_ARTIFACT_DEFINITIONS.filter((artifact) => artifact.templateRef);
  assert.deepEqual(templated.map((artifact) => artifact.id), ["ideal-customer-profile", "campaign-brief", "sales-call-script", "offer-architecture", "client-onboarding-plan", "quarterly-business-review"]);
  for (const artifact of templated) await access(new URL(`../../../${artifact.templateRef}`, import.meta.url));
});

test("approval defaults separate preparation from consequential actions", () => {
  const rules = new Map(FOUNDER_OS_SOLUTION_PACK.approvalPolicies.flatMap((policy) => policy.rules).map((rule) => [rule.action, rule.requirement]));
  for (const action of ["research", "analysis", "drafting", "forecasting", "create_artifact"]) assert.equal(rules.get(action), "allowed");
  for (const action of ["send_external_communication", "publish", "spend_money", "change_prices", "make_payment", "commit_contract", "hire_or_fire", "deploy_code"]) assert.equal(rules.get(action), "approval_required");
  assert.doesNotMatch(FINANCIAL_ANALYST_ROLE.recommendedCapabilities.join(" "), /payment|transfer|billing|bank/i);
});

test("Role Catalog UI exposes the Founder OS progressive-disclosure card", async () => {
  const panel = await readFile(new URL("../components/agents-panel.tsx", import.meta.url), "utf8");
  const card = await readFile(new URL("../components/solution-pack-catalog-card.tsx", import.meta.url), "utf8");
  assert.match(panel, /BUILTIN_SOLUTION_PACKS/);
  assert.match(card, /Operating domains/);
  assert.match(card, /Goal templates/);
  assert.match(card, /Approval boundaries/);
  assert.match(card, /Create Founder Agent/);
});
