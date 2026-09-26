import { describe, expect, it } from "vitest";
import {
  contextPackageSchema,
  digitalWorkContractSchema,
  proofLinkProblems,
  proofOfWorkSchema,
} from "./contracts.ts";
import {
  ENGINEERING_COMPOSITION_V1,
  POTATO_MODE_V1,
  modeSchema,
} from "./packs.ts";
import { decideExecutionRoute, routeFactsSchema, routeRequestSchema } from "./routing.ts";

const now = Date.parse("2026-09-25T12:00:00.000Z");
const workId = "00000000-0000-4000-8000-000000000001";
const criterionId = "00000000-0000-4000-8000-000000000002";
const scope = { kind: "personal" as const, id: "owner-1" };
const hash = `sha256:${"a".repeat(64)}`;

function fixture() {
  const work = digitalWorkContractSchema.parse({
    contractVersion: 1,
    workId,
    workVersion: 3,
    criteriaVersion: 2,
    scope,
    humanOwnerId: "owner-1",
    coordinatingAgentId: "agent-sofie",
    objective: "Deliver one verified change.",
    criteria: [{ id: criterionId, statement: "The behavior passes the admitted test.", evidence: "deterministic" }],
    resourceRefs: ["repository:example/project"],
    allowedOperations: ["workspace.read", "workspace.write", "executor.start", "factory.submit", "peer.request"],
    allowedRoutes: ["DIRECT", "EXECUTOR", "FACTORY", "PEER"],
    budgetUsd: 8,
    deadline: "2026-09-25T13:00:00.000Z",
    policyVersion: 7,
    composition: ENGINEERING_COMPOSITION_V1,
    definitionOfDone: ["Independent evidence covers the current result revision."],
  });
  const context = contextPackageSchema.parse({
    contractVersion: 1,
    workId,
    workVersion: 3,
    scope,
    agentId: "agent-sofie",
    assembledAt: "2026-09-25T11:59:00.000Z",
    maxTokens: 2000,
    estimatedTokens: 300,
    items: [{ id: "knowledge-1", kind: "knowledge", scope, sourceRef: "knowledge:1", sourceRevision: "v2",
      contentHash: hash, observedAt: "2026-09-25T11:50:00.000Z", expiresAt: "2026-09-25T13:00:00.000Z",
      status: "CURRENT", trust: "owner" }],
  });
  const facts = routeFactsSchema.parse({
    currentWorkVersion: 3,
    currentPolicyVersion: 7,
    workActive: true,
    scope,
    agentId: "agent-sofie",
    authority: "ALLOW",
    remainingBudgetUsd: 5,
    allowedRoutes: ["DIRECT", "EXECUTOR", "FACTORY", "PEER"],
    allowedOperations: work.allowedOperations,
    allowedResourceRefs: work.resourceRefs,
    availability: { DIRECT: "QUALIFIED", EXECUTOR: "QUALIFIED", FACTORY: "QUALIFIED", PEER: "QUALIFIED" },
    factoryAdmission: "ALLOW",
    relayGrant: "ALLOW",
    peerPolicy: "ALLOW",
    observedAt: "2026-09-25T11:59:50.000Z",
  });
  const request = routeRequestSchema.parse({ route: "DIRECT", requiredOperations: ["workspace.write"], resourceRefs: work.resourceRefs });
  return { work, context, facts, request };
}

describe("Digital Worker route boundary", () => {
  it("admits an explicitly authorized direct route and never returns an action grant", () => {
    const { work, context, facts, request } = fixture();
    expect(decideExecutionRoute(work, context, request, facts, now)).toEqual({
      requested: "DIRECT", selected: "DIRECT", admitted: true, reasons: [],
    });
  });

  it.each(["EXECUTOR", "FACTORY", "PEER"] as const)("requires a qualified %s route", route => {
    const { work, context, facts, request } = fixture();
    request.route = route;
    request.requiredOperations = [{ EXECUTOR: "executor.start", FACTORY: "factory.submit", PEER: "peer.request" }[route]];
    expect(decideExecutionRoute(work, context, request, facts, now).selected).toBe(route);
    facts.availability[route] = "UNKNOWN";
    expect(decideExecutionRoute(work, context, request, facts, now)).toMatchObject({ selected: "HUMAN", admitted: false });
  });

  it("requires both a Relay grant and peer policy, and separate Factory admission", () => {
    const { work, context, facts, request } = fixture();
    request.route = "PEER";
    request.requiredOperations = ["peer.request"];
    facts.relayGrant = "UNKNOWN";
    expect(decideExecutionRoute(work, context, request, facts, now).selected).toBe("HUMAN");
    facts.relayGrant = "ALLOW";
    facts.peerPolicy = "DENY";
    expect(decideExecutionRoute(work, context, request, facts, now).selected).toBe("HUMAN");
    request.route = "FACTORY";
    request.requiredOperations = ["factory.submit"];
    facts.factoryAdmission = "UNKNOWN";
    expect(decideExecutionRoute(work, context, request, facts, now).selected).toBe("HUMAN");
  });

  it("keeps behavior packs out of authority, including high initiative mode", () => {
    const { work, context, facts, request } = fixture();
    request.route = "FACTORY";
    request.requiredOperations = ["factory.submit"];
    work.allowedRoutes = ["DIRECT"];
    expect(decideExecutionRoute(work, context, request, facts, now).selected).toBe("HUMAN");
    work.composition.mode = { id: POTATO_MODE_V1.id, version: POTATO_MODE_V1.version };
    expect(decideExecutionRoute(work, context, request, facts, now).selected).toBe("HUMAN");
    expect(modeSchema.safeParse({ ...POTATO_MODE_V1, allowedOperations: ["factory.submit"] }).success).toBe(false);
  });

  it("rejects stale context, cross-scope context, and missing provenance", () => {
    const { work, context, facts, request } = fixture();
    context.items[0]!.status = "STALE";
    expect(decideExecutionRoute(work, context, request, facts, now).selected).toBe("HUMAN");
    context.items[0]!.status = "CURRENT";
    context.items[0]!.scope.id = "other-owner";
    expect(decideExecutionRoute(work, context, request, facts, now).reasons).toContain("Context knowledge-1 is outside Work scope.");
    const unproven = structuredClone(context) as Record<string, unknown>;
    (unproven.items as Array<Record<string, unknown>>)[0]!.sourceRef = "";
    expect(contextPackageSchema.safeParse(unproven).success).toBe(false);
  });

  it("reassembles context after its freshness window even when each item claims current", () => {
    const { work, context, facts, request } = fixture();
    context.assembledAt = "2026-09-25T11:58:00.000Z";
    expect(decideExecutionRoute(work, context, request, facts, now)).toMatchObject({selected:"HUMAN",admitted:false});
  });

  it("rejects stale policy, expired Work, exhausted budget, and unknown authority", () => {
    const { work, context, facts, request } = fixture();
    facts.currentPolicyVersion++;
    expect(decideExecutionRoute(work, context, request, facts, now).selected).toBe("HUMAN");
    facts.currentPolicyVersion = work.policyVersion;
    facts.remainingBudgetUsd = 0;
    expect(decideExecutionRoute(work, context, request, facts, now).selected).toBe("HUMAN");
    facts.remainingBudgetUsd = 5;
    facts.authority = "UNKNOWN";
    expect(decideExecutionRoute(work, context, request, facts, now).selected).toBe("HUMAN");
    facts.authority = "ALLOW";
    expect(decideExecutionRoute(work, context, request, facts, Date.parse(work.deadline)).selected).toBe("HUMAN");
  });

  it("rejects resources and operations outside both the frozen Work and current policy", () => {
    const { work, context, facts, request } = fixture();
    request.resourceRefs = ["repository:another/project"];
    expect(decideExecutionRoute(work, context, request, facts, now).selected).toBe("HUMAN");
    request.resourceRefs = work.resourceRefs;
    request.requiredOperations = ["production.deploy"];
    expect(decideExecutionRoute(work, context, request, facts, now).selected).toBe("HUMAN");
    request.route = "FACTORY";
    request.requiredOperations = ["workspace.write"];
    expect(decideExecutionRoute(work, context, request, facts, now).reasons).toContain("Route FACTORY needs its dispatch operation in the request.");
  });

  it("permits human escalation without treating it as execution", () => {
    const { work, context, facts } = fixture();
    facts.workActive = false;
    facts.authority = "DENY";
    const decision = decideExecutionRoute(work, context, { route: "HUMAN", requiredOperations: [], resourceRefs: [] }, facts, now);
    expect(decision).toEqual({ requested: "HUMAN", selected: "HUMAN", admitted: true, reasons: [] });
    expect(decideExecutionRoute(work, context, { route: "DIRECT", requiredOperations: ["workspace.write"], resourceRefs: work.resourceRefs }, facts, now).admitted).toBe(false);
  });

  it("fails closed on malformed current facts", () => {
    const { work, context, request, facts } = fixture();
    expect(decideExecutionRoute(work, context, request, { ...facts, authority: "maybe" }, now)).toEqual({
      requested: "DIRECT", selected: "HUMAN", admitted: false, reasons: ["A route input or current policy fact is invalid."],
    });
  });
});

describe("Proof of Work links", () => {
  it("requires independent PASS evidence for the exact current result and criteria revision", () => {
    const { work } = fixture();
    const proof = proofOfWorkSchema.parse({
      contractVersion: 1,
      workId,
      workVersion: 3,
      criteriaVersion: 2,
      outcome: "COMPLETED",
      resultRevision: "candidate-v3",
      createdAt: "2026-09-25T12:00:00.000Z",
      evidence: [{ criterionId, resultRevision: "candidate-v3", state: "PASS", producer: "trusted-verifier",
        sourceRef: "verifier-run-1", contentHash: hash, observedAt: "2026-09-25T11:59:00.000Z" }],
      artifactRefs: ["artifact:patch-v3"],
      limitations: [],
    });
    expect(proofLinkProblems(work, proof)).toEqual([]);
    proof.evidence[0]!.producer = "executor";
    expect(proofLinkProblems(work, proof)).toContain(`Current independent evidence is missing for criterion ${criterionId}.`);
    proof.evidence[0]!.producer = "trusted-verifier";
    proof.resultRevision = "candidate-v4";
    expect(proofLinkProblems(work, proof)).toContain(`Current independent evidence is missing for criterion ${criterionId}.`);
    proof.resultRevision = "candidate-v3";
    proof.criteriaVersion = 3;
    expect(proofLinkProblems(work, proof)).toContain("Proof is for a different Work or criteria revision.");
  });
});
