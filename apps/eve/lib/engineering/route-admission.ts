import {cloudRoutingEvidenceSchema,assertCloudRoutingWork} from './cloud-environment-routing.ts';
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  contextPackageSchema,
  digitalWorkContractSchema,
  type DigitalWorkContract,
} from "../digital-worker/contracts.ts";
import {
  decideExecutionRoute,
  routeFactsSchema,
  routeRequestSchema,
} from "../digital-worker/routing.ts";
import { RoutingStore } from "./routing-store.ts";
import { WorkStore } from "./store.ts";
import { WorkError, type Work } from "./types.ts";

const admissionInputSchema = z.object({
  decisionId: z.string().uuid(),
  expectedWorkVersion: z.number().int().positive(),
  expectedWorkGeneration: z.number().int().positive().optional(),
  request: routeRequestSchema,
}).strict();

const authoritySnapshotSchema = z.object({
  environment:cloudRoutingEvidenceSchema.optional(),
  contract: digitalWorkContractSchema,
  context: contextPackageSchema,
  facts: routeFactsSchema,
  factory: z.object({requestId:z.string().uuid(),repository:z.string(),baseSha:z.string().regex(/^[a-f0-9]{40}$/),profileHash:z.string().regex(/^[a-f0-9]{64}$/),allowedPaths:z.array(z.string().min(1)).min(1).max(100),deadline:z.string().datetime()}).strict().optional(),
  binding: z.object({agentId:z.string().min(1),agentRevision:z.string().min(1).max(100),
    configurationHash:z.string().regex(/^[a-f0-9]{64}$/),workGeneration:z.number().int().positive()}).strict().optional(),
}).strict();

/** Implementations must read current server-side Work policy, context, spend and provider evidence.
 * A request body, agent output or stored proposal is never an implementation of this interface. */
export interface CurrentRouteAuthority {
  read(work: Work): Promise<unknown>;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, item]) => [key, canonical(item)]));
  return value;
}

function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex")}`;
}

function matchesCurrentWork(work: Work, contract: DigitalWorkContract, scopeKind: string): boolean {
  const criteriaMatch = contract.criteria.length === work.criteria.length &&
    contract.criteria.every(({ id, statement, evidence }) => work.criteria.some(item =>
      item.id === id && item.statement === statement &&
      item.method === (evidence === "deterministic" ? "test" : "human")));
  return scopeKind === "personal" && contract.scope.kind === scopeKind &&
    contract.scope.id === work.scopeId && contract.humanOwnerId === work.scopeId &&
    contract.workId === work.id && contract.workVersion === work.version &&
    contract.criteriaVersion === work.criteriaVersion && contract.objective === work.objective &&
    contract.resourceRefs.includes(`repository:${work.repository}`) &&
    criteriaMatch &&
    contract.budgetUsd <= work.maxCostUsd;
}

export interface RouteAdmissionReceipt {
  decisionId: string;
  transitionId: string;
  runId: string;
  workVersion: number;
  workGeneration: number;
  route: Exclude<z.infer<typeof routeRequestSchema>["route"], "HUMAN">;
  status: "QUEUED";
}

/** Records admission and a single queued writer. It never dispatches a provider.
 * A dispatcher must recheck Work generation, authority and provider health before an effect. */
export class RouteAdmissionService {
  constructor(
    readonly workStore: WorkStore,
    readonly authority: CurrentRouteAuthority,
  ) {}

  async admit(id: string, value: unknown, completion?: Record<string, unknown>): Promise<RouteAdmissionReceipt> {
    const input = admissionInputSchema.parse(value);
    if (input.request.route === "HUMAN")
      throw new WorkError("route_not_productive", "Human review is not a provider run.");
    if (this.workStore.principal.scopeKind !== "personal" ||
        this.workStore.principal.actorId !== this.workStore.principal.scopeId)
      throw new WorkError("route_scope_unqualified", "Current owner authority is required for route admission.", 403);
    const work = await this.workStore.get(id);
    if (work.version !== input.expectedWorkVersion ||
        (input.expectedWorkGeneration !== undefined && work.generation !== input.expectedWorkGeneration) || work.lifecycle !== "active" || work.control !== "agent")
      throw new WorkError("routing_changed", "Work or control changed. Reload before admitting a route.");
    const proposal = (await new RoutingStore(this.workStore).snapshot(id)).decision;
    if (!proposal || proposal.id !== input.decisionId || proposal.status !== "PROPOSED" ||
        proposal.workVersion !== work.version || proposal.selectedRoute !== input.request.route)
      throw new WorkError("routing_changed", "The current route proposal changed. Reload before admission.");

    // The authority source is supplied by trusted server code, never by the request or proposal.
    const snapshot = authoritySnapshotSchema.parse(await this.authority.read(work));
    const { contract, context, facts } = snapshot;
    if(snapshot.environment){
      if(input.request.route!=='MYFACTORY')throw new WorkError('cloud_environment_route','Cloud qualification requires Factory admission.',403);
      assertCloudRoutingWork(snapshot.environment,work,facts.routePolicy.providers.MYFACTORY?.version);
    }
    if (snapshot.binding && (input.expectedWorkGeneration === undefined ||
        input.expectedWorkGeneration !== work.generation || snapshot.binding.workGeneration !== input.expectedWorkGeneration))
      throw new WorkError("routing_changed", "Native admission requires the current observed Work generation.");
    if (!matchesCurrentWork(work, contract, this.workStore.principal.scopeKind))
      throw new WorkError("route_contract_changed", "The route contract does not match current scoped Work.");
    const now = Date.now();
    if (Date.parse(contract.deadline) > now + work.maxDurationSeconds * 1000)
      throw new WorkError("route_deadline_outside_work", "The route deadline exceeds the Work limit.");
    const result = decideExecutionRoute(contract, context, input.request, facts, now);
    if (!result.admitted || result.selected !== input.request.route)
      throw new WorkError("route_denied", result.reasons.join(" ") || "Current route authority denied admission.", 403);

    const binding = facts.routePolicy.providers[input.request.route];
    const qualification = facts.qualifications[input.request.route];
    if (!binding || !qualification || proposal.providerId !== binding.id ||
        proposal.providerVersion !== String(binding.version))
      throw new WorkError("route_provider_changed", "The proposed provider no longer matches current qualification.");

    const admissionReason = "Current scoped Work, context, budget, policy and qualified provider passed admission. Provider execution has not started.";
    const runId = randomUUID();
    const authoritySnapshot = { contract, facts, ...(snapshot.environment?{environment:snapshot.environment}:{}), ...(snapshot.factory ? {factory:snapshot.factory} : {}), ...(snapshot.binding ? { binding: snapshot.binding } : {}),
      ...(completion ? {completion:{...completion,id:runId,runId}} : {}) };
    const decisionId = input.decisionId;
    const transitionId = randomUUID();
    const { scopeId, scopeKind } = this.workStore.principal;
    const rows = await this.workStore.database.query(
      `WITH locked_work AS MATERIALIZED (
         SELECT w.scope_id,w.scope_kind,w.id,w.version,w.generation
         FROM engineering_work w
         WHERE w.scope_id=$1 AND w.scope_kind=$2 AND w.id=$3
           AND w.version=$4 AND w.criteria_version=$5 AND w.generation=$28
           AND ($29::text IS NULL OR NOT EXISTS (SELECT 1 FROM engineering_native_runtime n
             WHERE n.scope_id=w.scope_id AND n.scope_kind=w.scope_kind AND n.work_id=w.id
             AND (n.inflight OR n.usage_unknown OR NOT EXISTS(SELECT 1 FROM engineering_route_runs prior WHERE prior.id=n.route_run_id AND prior.fenced_at IS NOT NULL AND prior.quiescence IS NOT NULL))))
           AND w.lifecycle='active' AND w.control='agent'
           AND ($25::text IS NULL OR (w.generation=$27 AND EXISTS (SELECT 1 FROM agents a
             WHERE a.owner_id=w.scope_id AND a.id=$25 AND a.status='active' AND a.is_primary=true
               AND a.updated_at::text=$26::text)))
           AND w.max_cost_usd >= $10
           AND $11::timestamptz > clock_timestamp()
           AND $11::timestamptz <= clock_timestamp() + w.max_duration_seconds * interval '1 second'
           AND $12::timestamptz BETWEEN clock_timestamp() - interval '60 seconds' AND clock_timestamp() + interval '5 seconds'
           AND $14::timestamptz BETWEEN clock_timestamp() - interval '60 seconds' AND clock_timestamp() + interval '5 seconds'
           AND $13::timestamptz > clock_timestamp()
           -- Legacy execution has no safe route handoff, even when apparently idle.
           AND NOT EXISTS (
             SELECT 1 FROM engineering_execution e
             WHERE e.scope_id=w.scope_id AND e.scope_kind=w.scope_kind AND e.work_id=w.id
           )
           AND NOT EXISTS (
             SELECT 1 FROM engineering_route_runs r
             WHERE r.scope_id=w.scope_id AND r.scope_kind=w.scope_kind AND r.work_id=w.id
               AND r.status NOT IN ('COMPLETED','FAILED','CANCELLED')
           )
         FOR UPDATE OF w
       ), admitted AS (
         UPDATE engineering_routing_decisions d
         SET status='ADMITTED', admission_reason=$15, admission_policy_id=$16,
           admission_policy_version=$17, admission_request=$18::jsonb,
           admission_context_snapshot=$19::jsonb, admission_authority_snapshot=$20::jsonb,
           admission_context_hash=$21, admission_authority_hash=$22, admitted_at=clock_timestamp()
         FROM locked_work w
         WHERE d.scope_id=w.scope_id AND d.scope_kind=w.scope_kind AND d.work_id=w.id
           AND d.work_version=w.version AND d.id=$6 AND d.status='PROPOSED'
           AND d.selected_route=$7 AND d.provider_id=$8 AND d.provider_version=$9
         RETURNING d.id,d.scope_id,d.scope_kind,d.work_id,d.work_version,d.selected_route,d.provider_id,d.provider_version
       ), transition AS (
         INSERT INTO engineering_route_transitions
           (id,scope_id,scope_kind,work_id,work_version,from_route,to_route,reason,trigger,
            decision_id,context_snapshot_ref,authority_snapshot_ref)
         SELECT $23,a.scope_id,a.scope_kind,a.work_id,a.work_version,
           COALESCE((SELECT t.to_route FROM engineering_route_transitions t
             WHERE t.scope_id=a.scope_id AND t.scope_kind=a.scope_kind AND t.work_id=a.work_id
             ORDER BY t.created_at DESC,t.id DESC LIMIT 1),'HUMAN'),
           a.selected_route,$15,'policy-admission',a.id,$21,$22
         FROM admitted a RETURNING id
       ), queued AS (
         INSERT INTO engineering_route_runs
           (id,scope_id,scope_kind,work_id,route,provider_id,provider_version,status,
            decision_id,work_version,work_generation)
         SELECT $24,a.scope_id,a.scope_kind,a.work_id,a.selected_route,a.provider_id,a.provider_version,
           'QUEUED',a.id,a.work_version,w.generation
         FROM admitted a JOIN locked_work w ON w.id=a.work_id
         RETURNING id,work_version,work_generation,route,status
       ), writer AS (
         INSERT INTO engineering_native_runtime(scope_id,scope_kind,work_id,route_run_id,session_id)
         SELECT $1,$2,$3,q.id,$29 FROM queued q WHERE $29::text IS NOT NULL
         ON CONFLICT(scope_id,scope_kind,work_id) DO UPDATE SET route_run_id=EXCLUDED.route_run_id,session_id=EXCLUDED.session_id,updated_at=clock_timestamp()
         RETURNING route_run_id
       )
       SELECT a.id AS decision_id,t.id AS transition_id,q.id AS run_id,
         q.work_version,q.work_generation,q.route,q.status
       FROM admitted a JOIN transition t ON true JOIN queued q ON true`,
      [
        scopeId, scopeKind, id, input.expectedWorkVersion, work.criteriaVersion,
        decisionId, input.request.route, binding.id, String(binding.version), contract.budgetUsd,
        contract.deadline, facts.observedAt, qualification.expiresAt, context.assembledAt,
        admissionReason, facts.routePolicy.id, facts.routePolicy.version, JSON.stringify(input.request),
        JSON.stringify(context), JSON.stringify(authoritySnapshot),
        digest(context), digest(authoritySnapshot), transitionId, runId,
        snapshot.binding?.agentId ?? null, snapshot.binding?.agentRevision ?? null, snapshot.binding?.workGeneration ?? null, input.expectedWorkGeneration ?? work.generation, completion?.sessionId ?? null,
      ],
    ).catch((error: unknown) => {
      if (error && typeof error==="object" && "message" in error && String(error.message).startsWith("INSUFFICIENT_COMPLETION_BUDGET:"))
        throw new WorkError("INSUFFICIENT_COMPLETION_BUDGET",String(error.message),409);
      throw error;
    });
    if (!rows.length)
      throw new WorkError("routing_changed", "Work, provider, proposal or writer state changed. Reload before admission.");
    return {
      decisionId: rows[0].decision_id,
      transitionId: rows[0].transition_id,
      runId: rows[0].run_id,
      workVersion: Number(rows[0].work_version),
      workGeneration: Number(rows[0].work_generation),
      route: rows[0].route,
      status: rows[0].status,
    };
  }
}
