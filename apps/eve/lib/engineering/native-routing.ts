import { nativeBehavior } from "./native-behavior.ts";
import { digitalWorkContractSchema, contextPackageSchema, type RoutingProfile } from "../digital-worker/contracts.ts";
import { decideExecutionRoute, routeFactsSchema } from "../digital-worker/routing.ts";
import { digest } from "./contract.ts";
import { engineeringConfig } from "./runtime.ts";
import { RouteAdmissionService, type CurrentRouteAuthority } from "./route-admission.ts";
import { RoutingStore } from "./routing-store.ts";
import { WorkStore } from "./store.ts";
import { WorkError, type Work } from "./types.ts";

export { NATIVE_PROVIDER } from "./native-qualification.ts";
import { NATIVE_PROVIDER } from "./native-qualification.ts";
export const NATIVE_OPERATIONS = ["deep-agent.start", "repository.read", "sandbox.write", "candidate.create", "verification.request"];
const profile: RoutingProfile = {
  profileVersion: 1, workShape: "bounded repository change", decomposition: "one candidate at a time",
  interaction: "owner-selected chat", parallelism: "single writer", verification: "independent protected checks",
  duration: "bounded by Work", ambiguity: "approved objective and criteria", externalExpertise: "none",
  humanJudgment: "owner controls Work; publication is separate", risk: "isolated source changes",
};
const emptyProviders = { DIRECT: null, DEEP_AGENT: null, EXECUTOR: null, MYFACTORY: null, RELAY: null };
export const nativeProfileHash = (config: Awaited<ReturnType<typeof engineeringConfig>>) =>
  digest({ profile: config.profile, approvedBase: config.approvedBase });

/** Re-read the configuration on every boundary. Persisted decisions are evidence, not current grants. */
export class NativeRouteAuthority implements CurrentRouteAuthority {
  constructor(readonly store: WorkStore, readonly readConfig = engineeringConfig) {}

  async read(expected: Work) {
    const config = await this.readConfig();
    const principal = this.store.principal;
    const work = await this.store.get(expected.id);
    if (principal.scopeKind !== "personal" || principal.actorId !== principal.scopeId ||
        principal.scopeId !== config.ownerId || work.version !== expected.version || work.generation !== expected.generation ||
        work.repository !== config.profile.repository || work.objective !== config.objective ||
        digest(work.criteria) !== digest(config.criteria) || work.criteria.some(criterion=>criterion.method!=="test" ||
          !config.profile.checks.some(check=>check.criterionIds.includes(criterion.id))))
      throw new WorkError("native_scope", "Current Work must match the owner-approved repository, objective and criteria.", 403);
    const [row] = await this.store.database.query(
      `SELECT id,status,is_primary,max_steps,max_runtime_seconds,max_estimated_cost_usd,updated_at::text AS revision
       FROM agents WHERE owner_id=$1 AND id=$2`, [principal.scopeId,config.agentId]);
    if (!row?.is_primary || row.status !== "active")
      throw new WorkError("native_agent", "The active owner-bound primary Agent is required.", 403);
    const agent={id:String(row.id),revision:String(row.revision),limits:{maxSteps:Number(row.max_steps),
      maxEstimatedCostUsd:Number(row.max_estimated_cost_usd),maxRuntimeSeconds:Number(row.max_runtime_seconds)}};
    const now = Date.now(), observedAt = new Date(now).toISOString();
    const qualification = config.nativeQualification;
    const hash = nativeProfileHash(config);
    const qualified = !!qualification && qualification.scopeId === principal.scopeId && qualification.profileHash === hash && qualification.modelId === `anthropic/${config.model}` &&
      Date.parse(qualification.qualifiedAt) <= now && Date.parse(qualification.expiresAt) > now;
    const scope = { kind: "personal" as const, id: principal.scopeId };
    const request = { route: "DEEP_AGENT" as const, requiredOperations: NATIVE_OPERATIONS,
      resourceRefs: [`repository:${work.repository}`, `engineering-profile:sha256:${hash}`] };
    const policy = { id: "native-engineering", version: config.profile.policyVersion,
      allowedRoutes: ["DEEP_AGENT" as const], providers: { ...emptyProviders, DEEP_AGENT: NATIVE_PROVIDER } };
    const contract = digitalWorkContractSchema.parse({
      contractVersion: 2, workId: work.id, workVersion: work.version, criteriaVersion: work.criteriaVersion,
      scope, humanOwnerId: principal.scopeId, coordinatingAgentId: agent.id, objective: work.objective,
      criteria: work.criteria.map(item => ({ id: item.id, statement: item.statement, evidence: item.method === "test" ? "deterministic" : "human" })),
      resourceRefs: request.resourceRefs, allowedOperations: NATIVE_OPERATIONS,
      budgetUsd: Math.min(work.maxCostUsd, agent.limits.maxEstimatedCostUsd),
      deadline: new Date(now + Math.min(work.maxDurationSeconds, agent.limits.maxRuntimeSeconds) * 1000).toISOString(),
      policyVersion: config.profile.policyVersion, routePolicy: { id: policy.id, version: policy.version },
      allowedRoutes: ["DEEP_AGENT"], routingProfile: profile,
      composition: nativeBehavior(config.nativeMode).composition,
      definitionOfDone: ["Frozen candidate independently verified against all current criteria", "Publication and acceptance require separate authority"],
    });
    const context = contextPackageSchema.parse({
      contractVersion: 2, workId: work.id, workVersion: work.version, scope, agentId: agent.id, assembledAt: observedAt,
      maxTokens: 12000, estimatedTokens: Math.ceil(JSON.stringify({ work, profile: config.profile, approvedBase: config.approvedBase }).length / 3),
      items: [{ id: `work:${work.id}`, kind: "work", scope, sourceRef: `engineering-work:${work.id}`,
        sourceRevision: String(work.version), contentHash: `sha256:${digest(work)}`, observedAt, expiresAt: contract.deadline, status: "CURRENT", trust: "owner" },
      { id: "approved-profile", kind: "file", scope, sourceRef: request.resourceRefs[1], sourceRevision: String(config.profile.version),
        contentHash: `sha256:${hash}`, observedAt, expiresAt: contract.deadline, status: "CURRENT", trust: "system" }],
    });
    const routing = await new RoutingStore(this.store).snapshot(work.id);
    const [budget] = await this.store.database.query(
      `SELECT reserved_microusd,spent_microusd,usage_unknown FROM engineering_native_runtime WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3`,
      [principal.scopeId,principal.scopeKind,work.id]);
    const remaining=Math.max(0,contract.budgetUsd-Number(budget?.reserved_microusd??0)/1_000_000-Number(budget?.spent_microusd??0)/1_000_000);
    const facts = routeFactsSchema.parse({
      currentWorkVersion: work.version, currentCriteriaVersion: work.criteriaVersion, currentPolicyVersion: config.profile.policyVersion,
      workActive: work.lifecycle === "active" && work.control === "agent", scope, agentId: agent.id,
      authority: budget?.usage_unknown ? "DENY" : "ALLOW", remainingBudgetUsd: remaining, allowedRoutes: policy.allowedRoutes,
      allowedOperations: NATIVE_OPERATIONS, allowedResourceRefs: request.resourceRefs, routePolicy: policy,
      qualifications: { ...emptyProviders, DEEP_AGENT: { provider: NATIVE_PROVIDER, scope,
        status: qualified ? "QUALIFIED" : "UNQUALIFIED", health: "HEALTHY", evidenceRef: qualification?.evidenceRef ?? null,
        observedAt, expiresAt: qualification?.expiresAt ?? null } },
      writerState: routing.runs.some(run => !["COMPLETED", "FAILED", "CANCELLED"].includes(run.status)) ? "ACTIVE" : "NONE",
      factoryAdmission: "DENY", relayGrant: "DENY", peerPolicy: "DENY", observedAt,
    });
    return { contract, context, facts, binding: { agentId: agent.id, agentRevision: agent.revision,
      configurationHash: digest(config), workGeneration: work.generation } };
  }

  async assess(id: string) {
    const snapshot = await this.read(await this.store.get(id));
    const request = { route: "DEEP_AGENT" as const, requiredOperations: NATIVE_OPERATIONS, resourceRefs: snapshot.contract.resourceRefs };
    return { snapshot, request, decision: decideExecutionRoute(snapshot.contract, snapshot.context, request, snapshot.facts) };
  }

  /** Existing admission must match fresh policy, Agent revision and qualification before every effect. */
  async assertEffect(id: string) {
    const snapshot = await this.read(await this.store.get(id));
    const [admitted] = await this.store.database.query(
      `SELECT d.admission_authority_snapshot,d.admission_request,r.id AS run_id
       FROM engineering_routing_decisions d JOIN engineering_route_runs r ON r.decision_id=d.id
       WHERE d.scope_id=$1 AND d.scope_kind=$2 AND d.work_id=$3 AND d.work_version=$4
         AND d.status='ADMITTED' AND r.work_generation=$5 AND r.status IN ('QUEUED','RUNNING')`,
      [this.store.principal.scopeId, this.store.principal.scopeKind, id, snapshot.contract.workVersion, snapshot.binding.workGeneration]);
    const prior = admitted?.admission_authority_snapshot;
    if (!prior?.binding || digest(prior.binding) !== digest(snapshot.binding) ||
        digest(prior.contract.resourceRefs) !== digest(snapshot.contract.resourceRefs))
      throw new WorkError("native_authority_changed", "Execution authority changed; a fresh Work admission is required.", 403);
    // Admission owns this one writer. Its original deadline and budget never slide forward on a recheck.
    const contract = digitalWorkContractSchema.parse(prior.contract);
    const result = decideExecutionRoute(contract, snapshot.context, admitted.admission_request,
      { ...snapshot.facts, writerState: "NONE", remainingBudgetUsd: Math.min(contract.budgetUsd, snapshot.facts.remainingBudgetUsd) });
    if (!result.admitted) throw new WorkError("native_effect_denied", result.reasons.join(" "), 403);
    return { runId: String(admitted.run_id), contract, binding: snapshot.binding };
  }
}

export async function admitNativeWork(store: WorkStore, id: string, expectedVersion: number, authority = new NativeRouteAuthority(store)) {
  const work = await store.get(id);
  if (work.version !== expectedVersion) throw new WorkError("routing_changed", "Reload the current Work before admission.");
  const routingStore = new RoutingStore(store);
  const existing = (await routingStore.snapshot(id)).decision;
  if (existing?.status === "ADMITTED") {
    await authority.assertEffect(id);
    return { decisionId: existing.id, alreadyAdmitted: true };
  }
  const assessment = await authority.assess(id);
  if (!assessment.decision.admitted) throw new WorkError("route_denied", assessment.decision.reasons.join(" "), 403);
  const proposal = existing?.status === "PROPOSED" ? existing : await routingStore.recordProposal(id, {
    expectedWorkVersion: work.version, selectedRoute: "DEEP_AGENT", source: "POLICY", profile,
    reason: "Bounded source development requires the qualified native Sofie provider and independent protected verification.",
    eligibleRoutes: ["DEEP_AGENT", "HUMAN"], rejectedRoutes: [
      { route: "DIRECT", reason: "Exploratory source development needs an Agent loop." },
      ...(["EXECUTOR", "MYFACTORY", "RELAY"] as const).map(route => ({ route, reason: "This native Work authorization does not admit another provider." })),
    ], constraints: ["One writer", "Approved source paths only", "No publication or Ready authority"],
    providerId: NATIVE_PROVIDER.id, providerVersion: String(NATIVE_PROVIDER.version),
  });
  return new RouteAdmissionService(store, authority).admit(id, { decisionId: proposal.id, expectedWorkVersion: work.version, request: assessment.request });
}
