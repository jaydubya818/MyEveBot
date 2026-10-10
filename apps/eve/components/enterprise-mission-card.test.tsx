import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { EnterpriseMissionCard } from "./enterprise-mission-card";
const digest = "sha256:" + "1".repeat(64);
const input = { operation: "enterprise.result", missionId: "mission", expectedPlanDigest: digest };
function result() {
  return { schema: "enterprise-result-projection/v1", scope: "ISOLATED_DETERMINISTIC", missionId: "mission", ownerId: "owner", tenantId: "tenant", projectId: "project",
    plan: { missionId: "mission", planId: "plan", planRevision: 1, planDigest: digest }, qualityContract: { revision: 1, digest }, status: "NOT_AVAILABLE", enterpriseQualityGate: "NOT_ESTABLISHED", ownerAcceptance: "PENDING",
    observedAt: Date.now(), freshUntil: Date.now() + 10000, assertions: [], reasons: ["CURRENT_INDEPENDENT_VERIFICATION_REQUIRED"], workOrders: [], executionAuthority: "NONE", explanation: "Factory narrative says success." };
}
const render = (response: unknown) => renderToStaticMarkup(<EnterpriseMissionCard input={input} output={{ receipt: { response } }} />);
it("does not promote narrative or unavailable evidence into PASS", () => {
  const html = render(result());
  expect(html).toContain("No enterprise PASS is established");
  expect(html).not.toContain("Factory narrative says success");
  expect(html).not.toContain("Quality Gate: PASS");
});
it("rejects a different Mission or Plan and malformed output", () => {
  expect(render({ ...result(), missionId: "foreign" })).toBe("");
  expect(render({ ...result(), plan: { ...result().plan, planDigest: "sha256:" + "2".repeat(64) } })).toBe("");
  expect(render({ summary: "PASS" })).toBe("");
});
it("expires the observed proof rather than advertising current success", () => {
  const html = render({ ...result(), freshUntil: Date.now() - 1 });
  expect(html).toContain("observation has expired");
  expect(html).not.toContain("Current observed Quality Gate: PASS");
});
it("presents proposal workstreams, stop condition and explicit draft-only decision", () => {
  const proposal = { title: "Agentic HR platform", objective: "Recruiting and onboarding", workstreams: ["Recruiting", "Onboarding"], milestones: ["Review scope"], stopCondition: "Draft only", budgetMicrousd: 0 };
  const html = renderToStaticMarkup(<EnterpriseMissionCard input={{ operation: "enterprise.propose", intentKey: "hr", proposal }} output={{ receipt: { response: { proposalId: "proposal", digest, proposal, needsYou: "Authorize the exact proposal in MissionControl.", executionAuthority: "NONE" } } }} onRefresh={vi.fn()} />);
  for (const text of ["Recruiting", "Onboarding", "Stop condition", "Needs You", "does not authorize execution", "Refresh from MissionControl"]) expect(html).toContain(text);
});
