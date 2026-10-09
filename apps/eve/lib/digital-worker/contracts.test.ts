import { describe, expect, it } from "vitest";
import {
  contextPackageSchema,
  digitalWorkContractSchema,
  legacyDigitalWorkContractV1Schema,
  mapLegacyExecutionRouteV1,
  proofLinkProblems,
  proofOfWorkSchema,
} from "./contracts.ts";
import {
  ENGINEERING_COMPOSITION_V1,
  POTATO_MODE_V1,
  modeSchema,
} from "./packs.ts";
import { decideExecutionRoute, routeFactsSchema, routePolicySchema, routeRequestSchema } from "./routing.ts";

const now = Date.parse("2026-09-25T12:00:00.000Z");
const workId = "00000000-0000-4000-8000-000000000001";
const criterionId = "00000000-0000-4000-8000-000000000002";
const scope = { kind: "personal" as const, id: "owner-1" };
const hash = `sha256:${"a".repeat(64)}`;
const providers = {
  DIRECT: { id: "direct-tools", version: 1 },
  DEEP_AGENT: { id: "deep-agent-harness", version: 1 },
  EXECUTOR: { id: "bounded-executor", version: 1 },
  MYFACTORY: { id: "myfactory-adapter", version: 1 },
  RELAY: { id: "relay-client", version: 1 },
};
const routes = ["DIRECT", "DEEP_AGENT", "EXECUTOR", "MYFACTORY", "RELAY"] as const;

function qualified(provider: { id: string; version: number }) {
  return { provider, scope, status: "QUALIFIED", health: "HEALTHY", evidenceRef: `qualification:${provider.id}`,
    observedAt: "2026-09-25T11:59:50.000Z", expiresAt: "2026-09-25T13:00:00.000Z" };
}

function fixture() {
  const work = digitalWorkContractSchema.parse({
    contractVersion: 2,
    workId,
    workVersion: 3,
    criteriaVersion: 2,
    scope,
    humanOwnerId: "owner-1",
    coordinatingAgentId: "agent-sofie",
    objective: "Deliver one verified change.",
    criteria: [{ id: criterionId, statement: "The behavior passes the admitted test.", evidence: "deterministic" }],
    resourceRefs: ["repository:example/project"],
    allowedOperations: ["workspace.read", "workspace.write", "deep-agent.start", "executor.start", "factory.submit", "peer.request"],
    allowedRoutes: routes,
    budgetUsd: 8,
    deadline: "2026-09-25T13:00:00.000Z",
    policyVersion: 7,
    composition: ENGINEERING_COMPOSITION_V1,
    routingProfile: { profileVersion: 1, workShape: "exploratory", decomposition: "single-thread",
      interaction: "interactive", parallelism: "low", verification: "standard", duration: "medium",
      ambiguity: "high", externalExpertise: "none", humanJudgment: "possible", risk: "medium" },
    routePolicy: { id: "engineering-policy", version: 3 },
    definitionOfDone: ["Independent evidence covers the current result revision."],
  });
  const context = contextPackageSchema.parse({
    contractVersion: 2,
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
    currentCriteriaVersion: 2,
    currentPolicyVersion: 7,
    workActive: true,
    scope,
    agentId: "agent-sofie",
    authority: "ALLOW",
    remainingBudgetUsd: 5,
    allowedRoutes: routes,
    allowedOperations: work.allowedOperations,
    allowedResourceRefs: work.resourceRefs,
    routePolicy: routePolicySchema.parse({ id: "engineering-policy", version: 3, allowedRoutes: routes, providers }),
    qualifications: {
      DIRECT: qualified(providers.DIRECT), DEEP_AGENT: qualified(providers.DEEP_AGENT),
      EXECUTOR: qualified(providers.EXECUTOR), MYFACTORY: qualified(providers.MYFACTORY),
      RELAY: qualified(providers.RELAY),
    },
    writerState: "NONE",
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

  it.each(["DEEP_AGENT", "EXECUTOR", "MYFACTORY", "RELAY"] as const)("requires a qualified %s route", route => {
    const { work, context, facts, request } = fixture();
    request.route = route;
    request.requiredOperations = [{ DEEP_AGENT: "deep-agent.start", EXECUTOR: "executor.start",
      MYFACTORY: "factory.submit", RELAY: "peer.request" }[route]];
    expect(decideExecutionRoute(work, context, request, facts, now).selected).toBe(route);
    facts.qualifications[route]!.status = "UNKNOWN";
    expect(decideExecutionRoute(work, context, request, facts, now)).toMatchObject({ selected: "HUMAN", admitted: false });
  });

  it("requires both a Relay grant and peer policy, and separate Factory admission", () => {
    const { work, context, facts, request } = fixture();
    request.route = "RELAY";
    request.requiredOperations = ["peer.request"];
    facts.relayGrant = "UNKNOWN";
    expect(decideExecutionRoute(work, context, request, facts, now).selected).toBe("HUMAN");
    facts.relayGrant = "ALLOW";
    facts.peerPolicy = "DENY";
    expect(decideExecutionRoute(work, context, request, facts, now).selected).toBe("HUMAN");
    request.route = "MYFACTORY";
    request.requiredOperations = ["factory.submit"];
    facts.factoryAdmission = "UNKNOWN";
    expect(decideExecutionRoute(work, context, request, facts, now).selected).toBe("HUMAN");
  });

  it("keeps behavior packs out of authority, including high initiative mode", () => {
    const { work, context, facts, request } = fixture();
    request.route = "MYFACTORY";
    request.requiredOperations = ["factory.submit"];
    work.allowedRoutes = ["DIRECT"];
    expect(decideExecutionRoute(work, context, request, facts, now).selected).toBe("HUMAN");
    work.composition.mode = { id: POTATO_MODE_V1.id, version: POTATO_MODE_V1.version };
    expect(decideExecutionRoute(work, context, request, facts, now).selected).toBe("HUMAN");
    expect(modeSchema.safeParse({ ...POTATO_MODE_V1, allowedOperations: ["factory.submit"] }).success).toBe(false);
  });

  it("keeps the qualitative routing profile out of authority", () => {
    const { work, context, facts, request } = fixture();
    work.routingProfile.parallelism = "high";
    work.routingProfile.ambiguity = "none";
    facts.routePolicy.allowedRoutes = ["DIRECT"];
    request.route = "MYFACTORY";
    request.requiredOperations = ["factory.submit"];
    expect(decideExecutionRoute(work, context, request, facts, now).reasons)
      .toContain("The route policy does not allow this route.");
  });

  it("requires a current matching provider binding, evidence, health and scope", () => {
    const { work, context, facts, request } = fixture();
    request.route = "EXECUTOR";
    request.requiredOperations = ["executor.start"];
    const qualifiedExecutor = facts.qualifications.EXECUTOR!;
    facts.routePolicy.providers.EXECUTOR = { id: "unexpected-provider", version: 1 };
    expect(decideExecutionRoute(work, context, request, facts, now).reasons)
      .toContain("The route has no matching qualified provider binding.");
    facts.routePolicy.providers.EXECUTOR = providers.EXECUTOR;
    qualifiedExecutor.evidenceRef = null;
    expect(decideExecutionRoute(work, context, request, facts, now).admitted).toBe(false);
    qualifiedExecutor.evidenceRef = "qualification:bounded-executor";
    qualifiedExecutor.health = "UNKNOWN";
    expect(decideExecutionRoute(work, context, request, facts, now).admitted).toBe(false);
    qualifiedExecutor.health = "HEALTHY";
    qualifiedExecutor.scope.id = "other-owner";
    expect(decideExecutionRoute(work, context, request, facts, now).reasons)
      .toContain("Provider qualification is outside Work scope.");
    qualifiedExecutor.scope.id = scope.id;
    qualifiedExecutor.expiresAt = "2026-09-25T11:59:59.000Z";
    expect(decideExecutionRoute(work, context, request, facts, now).admitted).toBe(false);
  });

  it("rejects an active or unknown writer even with an otherwise qualified route", () => {
    const { work, context, facts, request } = fixture();
    facts.writerState = "ACTIVE";
    expect(decideExecutionRoute(work, context, request, facts, now).reasons)
      .toContain("An active writer exists or current writer state is unknown.");
    facts.writerState = "UNKNOWN";
    expect(decideExecutionRoute(work, context, request, facts, now).admitted).toBe(false);
  });

  it("requires the exact Work criteria and route policy revisions", () => {
    const { work, context, facts, request } = fixture();
    facts.currentCriteriaVersion++;
    expect(decideExecutionRoute(work, context, request, facts, now).admitted).toBe(false);
    facts.currentCriteriaVersion = work.criteriaVersion;
    facts.routePolicy.version++;
    expect(decideExecutionRoute(work, context, request, facts, now).reasons)
      .toContain("The route policy changed.");
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
    request.route = "MYFACTORY";
    request.requiredOperations = ["workspace.write"];
    expect(decideExecutionRoute(work, context, request, facts, now).reasons).toContain("Route MYFACTORY needs its dispatch operation in the request.");
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

describe("Digital Worker contract versioning", () => {
  it("parses legacy Work separately and requires explicit v1 route label conversion", () => {
    const { work, context, facts } = fixture();
    const legacy = structuredClone(work) as Record<string, unknown>;
    legacy.contractVersion = 1;
    legacy.allowedRoutes = ["DIRECT", "FACTORY", "PEER"];
    delete legacy.routingProfile;
    delete legacy.routePolicy;
    expect(legacyDigitalWorkContractV1Schema.safeParse(legacy).success).toBe(true);
    expect(digitalWorkContractSchema.safeParse(legacy).success).toBe(false);
    expect(mapLegacyExecutionRouteV1("FACTORY", 1)).toBe("MYFACTORY");
    expect(mapLegacyExecutionRouteV1("PEER", 1)).toBe("RELAY");
    expect(mapLegacyExecutionRouteV1("DEEP_AGENT", 1)).toBeNull();
    expect(mapLegacyExecutionRouteV1("FACTORY", 2)).toBeNull();
    expect(decideExecutionRoute(legacy, context, { route: "MYFACTORY", requiredOperations: ["factory.submit"],
      resourceRefs: work.resourceRefs }, facts, now).admitted).toBe(false);
  });
});

describe("Proof of Work links", () => {
  it("requires independent PASS evidence for the exact current result and criteria revision", () => {
    const { work } = fixture();
    const proof = proofOfWorkSchema.parse({
      contractVersion: 2,
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
