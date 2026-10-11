import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { EnterpriseMissionCard } from "./enterprise-mission-card";
import { explainEnterpriseResult } from "../lib/missioncontrol/consumer";
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
  const html = render({ ...result(), observedAt: Date.now() - 10000, freshUntil: Date.now() - 1 });
  expect(html).toContain("observation has expired");
  expect(html).not.toContain("Current observed Quality Gate: PASS");
});
function availableResult() {
  return { ...result(), status: "AVAILABLE", enterpriseQualityGate: "PASS", reasons: [],
    workOrders: [{ workOrderId: "work", revisionId: "revision", revision: 1, sourceAttemptId: "producer-attempt", verificationAttemptId: "verifier-attempt",
      candidate: "candidate", producerInvocationId: "producer-invocation", provider: "isolated-container", factoryVersion: "factory", factoryDefinitionVersionId: "definition",
      verifierFactoryDefinitionVersionId: "verifier-definition", verifierFactoryVersion: "verifier-factory", verifierInvocationId: "verifier-invocation", runtimeImage: digest,
      qualityContractDigest: digest, verificationContractDigest: digest, verificationRunId: "run", verificationReceiptId: "receipt", verificationPlanDigest: digest,
      evidenceSetDigest: digest, evidenceIds: ["evidence"], reservationDigest: digest, settlementDigest: digest, proofDigest: digest,
      verifierSettlementDigest: digest, handoffId: "handoff", artifactIds: [], gate: "PASS", independentlyVerified: true }],
    assertions: [{ assertionId: "assertion", workOrderId: "work", verificationReceiptId: "assertion-receipt", verificationAttemptId: "verifier-attempt" }] };
}
it("labels consistent saved proof as a recorded observation requiring canonical verification", () => {
  const html = render(availableResult());
  expect(html).toContain("Recorded Quality Gate: PASS");
  expect(html).toContain("Saved conversation observations are not current verified proof");
  expect(html).toContain("Recorded owner acceptance");
  expect(html).not.toContain("Current observed Quality Gate: PASS");
});
it.each([
  ["contradictory gate", (r: ReturnType<typeof availableResult>) => ({ ...r, enterpriseQualityGate: "NOT_ESTABLISHED" })],
  ["empty evidence", (r: ReturnType<typeof availableResult>) => ({ ...r, workOrders: [] })],
  ["missing assertions", (r: ReturnType<typeof availableResult>) => ({ ...r, assertions: [] })],
  ["blocking reason", (r: ReturnType<typeof availableResult>) => ({ ...r, reasons: ["CURRENT_INDEPENDENT_VERIFICATION_REQUIRED"] })],
  ["foreign Plan Mission", (r: ReturnType<typeof availableResult>) => ({ ...r, plan: { ...r.plan, missionId: "foreign" } })],
  ["wrong quality revision", (r: ReturnType<typeof availableResult>) => ({ ...r, qualityContract: { ...r.qualityContract, revision: 2 } })],
  ["duplicate WorkOrder", (r: ReturnType<typeof availableResult>) => ({ ...r, workOrders: [...r.workOrders, ...r.workOrders] })],
  ["foreign assertion WorkOrder", (r: ReturnType<typeof availableResult>) => ({ ...r, assertions: [{ ...r.assertions[0], workOrderId: "foreign" }] })],
  ["foreign verifier attempt", (r: ReturnType<typeof availableResult>) => ({ ...r, assertions: [{ ...r.assertions[0], verificationAttemptId: "foreign" }] })],
  ["duplicate assertion", (r: ReturnType<typeof availableResult>) => ({ ...r, assertions: [...r.assertions, ...r.assertions] })],
  ["producer as verifier", (r: ReturnType<typeof availableResult>) => ({ ...r, workOrders: [{ ...r.workOrders[0], verificationAttemptId: "producer-attempt" }] })],
  ["missing native runtime", (r: ReturnType<typeof availableResult>) => ({ ...r, workOrders: [{ ...r.workOrders[0], runtimeImage: null }] })],
  ["wrong quality contract", (r: ReturnType<typeof availableResult>) => ({ ...r, workOrders: [{ ...r.workOrders[0], qualityContractDigest: "sha256:" + "2".repeat(64) }] })],
] as const)("rejects %s in saved proof and server explanation", (_name, mutate) => {
  const response = mutate(availableResult());
  expect(render(response)).toBe("");
  expect(() => explainEnterpriseResult(response)).toThrow("ENTERPRISE_RESULT_BINDING");
});
it("does not advertise future-dated or foreign-workspace observations", () => {
  expect(render({ ...availableResult(), observedAt: Date.now() + 10000, freshUntil: Date.now() + 20000 })).toBe("");
  expect(renderToStaticMarkup(<EnterpriseMissionCard input={input} output={{ receipt: { projectId: "foreign", response: availableResult() } }} />)).toBe("");
});
it("presents proposal workstreams, stop condition and explicit draft-only decision", () => {
  const proposal = { title: "Agentic HR platform", objective: "Recruiting and onboarding", workstreams: ["Recruiting", "Onboarding"], milestones: ["Review scope"], stopCondition: "Draft only", budgetMicrousd: 0 };
  const html = renderToStaticMarkup(<EnterpriseMissionCard input={{ operation: "enterprise.propose", intentKey: "hr", proposal }} output={{ receipt: { response: { proposalId: "proposal", digest, proposal, needsYou: "Authorize the exact proposal in MissionControl.", executionAuthority: "NONE" } } }} onRefresh={vi.fn()} />);
  for (const text of ["Recruiting", "Onboarding", "Stop condition", "Needs You", "does not authorize execution", "Refresh from MissionControl"]) expect(html).toContain(text);
});
