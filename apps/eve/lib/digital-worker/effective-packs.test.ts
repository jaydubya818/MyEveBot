import { describe, expect, it } from "vitest";
import { resolveEffectiveEngineeringRunConfiguration, recommendEngineeringRecovery } from "./effective-packs.ts";
import { ENGINEERING_COMPOSITION_V1, POTATO_MODE_V1 } from "./packs.ts";

const now = Date.parse("2026-09-26T12:00:00.000Z");
const scope = { kind: "personal", id: "owner-1" };

function fixture() {
  const work = {
    contractVersion: 2,
    workId: "00000000-0000-4000-8000-000000000001",
    workVersion: 3,
    criteriaVersion: 2,
    scope,
    humanOwnerId: "owner-1",
    coordinatingAgentId: "agent-sofie",
    objective: "Repair one bounded test failure.",
    criteria: [{ id: "00000000-0000-4000-8000-000000000002", statement: "The fixed test passes.", evidence: "deterministic" }],
    resourceRefs: ["repository:example/project", "repository:other/project"],
    allowedOperations: ["workspace.read", "workspace.write", "publisher.push"],
    budgetUsd: 8,
    deadline: "2026-09-26T13:00:00.000Z",
    policyVersion: 7,
    composition: structuredClone(ENGINEERING_COMPOSITION_V1),
    allowedRoutes: ["DIRECT", "HUMAN"],
    routingProfile: {
      profileVersion: 1, workShape: "localized bug", decomposition: "single", interaction: "interactive",
      parallelism: "none", verification: "test", duration: "short", ambiguity: "low",
      externalExpertise: "none", humanJudgment: "possible", risk: "low",
    },
    routePolicy: { id: "engineering-policy", version: 3 },
    definitionOfDone: ["Independent evidence covers the candidate."],
  };
  const authority = {
    workId: work.workId,
    workVersion: work.workVersion,
    criteriaVersion: work.criteriaVersion,
    policyVersion: work.policyVersion,
    scope,
    agentId: work.coordinatingAgentId,
    decision: "ALLOW",
    allowedOperations: ["workspace.read", "workspace.write", "factory.submit"],
    allowedResourceRefs: ["repository:example/project", "repository:unrelated/project"],
    remainingBudgetUsd: 5,
    observedAt: "2026-09-26T11:59:50.000Z",
  };
  const routine = {
    kind: "routine",
    operation: "workspace.write",
    resourceRef: "repository:example/project",
    attemptsRemaining: 1,
    estimatedCostUsd: 1,
    candidateRetained: true,
  };
  return { work, authority, routine };
}

describe("effective engineering packs", () => {
  it("changes routine initiative while preserving identical Work-and-policy authority", () => {
    const { work, authority, routine } = fixture();
    const normal = resolveEffectiveEngineeringRunConfiguration(work, authority, now);
    work.composition.mode = { id: POTATO_MODE_V1.id, version: POTATO_MODE_V1.version };
    const potato = resolveEffectiveEngineeringRunConfiguration(work, authority, now);

    expect(normal.authority).toEqual(potato.authority);
    expect(normal.authority).toMatchObject({
      status: "CURRENT",
      allowedOperations: ["workspace.read", "workspace.write"],
      allowedResourceRefs: ["repository:example/project"],
    });
    expect(recommendEngineeringRecovery(normal, routine).recommendation).toBe("ASK_HUMAN");
    expect(recommendEngineeringRecovery(potato, routine).recommendation).toBe("RECOVER_WITHIN_SCOPE");
    expect(potato.work.composition.mode).toEqual({ id: "potato-mode", version: 1 });
    expect(potato.role.source).toContain("software-engineer-v1");
    expect(potato.capabilityPacks[0]?.source).toContain("a4bb4914");
    expect(potato.mode.source).toContain("potato-mode-v1");
  });

  it("escalates scope, authority and irreversible changes in both modes", () => {
    const { work, authority, routine } = fixture();
    for (const mode of [ENGINEERING_COMPOSITION_V1.mode, { id: POTATO_MODE_V1.id, version: POTATO_MODE_V1.version }]) {
      work.composition.mode = mode;
      const config = resolveEffectiveEngineeringRunConfiguration(work, authority, now);
      for (const kind of ["scope-change", "authority-change", "irreversible"])
        expect(recommendEngineeringRecovery(config, { ...routine, kind }).recommendation).toBe("ASK_HUMAN");
      expect(recommendEngineeringRecovery(config, { ...routine, operation: "publisher.push" }).recommendation).toBe("BLOCKED");
      expect(recommendEngineeringRecovery(config, { ...routine, resourceRef: "repository:other/project" }).recommendation).toBe("BLOCKED");
    }
  });

  it("requires retained candidate, bounded attempts and available budget even in potato mode", () => {
    const { work, authority, routine } = fixture();
    work.composition.mode = { id: POTATO_MODE_V1.id, version: POTATO_MODE_V1.version };
    const config = resolveEffectiveEngineeringRunConfiguration(work, authority, now);
    for (const change of [{ candidateRetained: false }, { attemptsRemaining: 0 }, { estimatedCostUsd: 6 }])
      expect(recommendEngineeringRecovery(config, { ...routine, ...change }).recommendation).toBe("ASK_HUMAN");
  });

  it("blocks when Work, policy, scope, authority or freshness changes", () => {
    const cases = [
      { workVersion: 4 },
      { policyVersion: 8 },
      { scope: { kind: "personal", id: "other-owner" } },
      { decision: "UNKNOWN" },
      { observedAt: "2026-09-26T11:58:00.000Z" },
      { remainingBudgetUsd: 0 },
    ];
    for (const change of cases) {
      const { work, authority, routine } = fixture();
      work.composition.mode = { id: POTATO_MODE_V1.id, version: POTATO_MODE_V1.version };
      const config = resolveEffectiveEngineeringRunConfiguration(work, { ...authority, ...change }, now);
      expect(config.authority.status).toBe("BLOCKED");
      expect(config.authority.allowedOperations).toEqual([]);
      expect(recommendEngineeringRecovery(config, routine).recommendation).toBe("BLOCKED");
    }
  });

  it("rejects unrecognized or incompatible manifest versions rather than falling back", () => {
    const { work, authority } = fixture();
    work.composition.mode.version = 99;
    expect(() => resolveEffectiveEngineeringRunConfiguration(work, authority, now)).toThrow("Mode version is unavailable");
    work.composition.mode = ENGINEERING_COMPOSITION_V1.mode;
    work.composition.capabilityPacks = [{ id: "jstack", version: 99 }];
    expect(() => resolveEffectiveEngineeringRunConfiguration(work, authority, now)).toThrow("JStack Capability Pack version is unavailable");
  });

  it("does not accept a changed Mode behavior when a Run snapshot is reloaded", () => {
    const { work, authority, routine } = fixture();
    const config = resolveEffectiveEngineeringRunConfiguration(work, authority, now);
    const altered = structuredClone(config);
    altered.mode.routineRecovery = "autonomous";
    expect(() => recommendEngineeringRecovery(altered, routine)).toThrow("does not match the Work's pinned composition");
  });
});
