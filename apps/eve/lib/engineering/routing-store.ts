import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  executionRouteSchema,
  routingProfileSchema,
  type ExecutionRoute,
  type RoutingProfile,
} from "../digital-worker/contracts.ts";
import { WorkStore } from "./store.ts";
import { WorkError } from "./types.ts";

const sourceSchema = z.enum([
  "RULE", "SOFIE_RECOMMENDATION", "OWNER_PREFERENCE", "POLICY", "RECOVERY", "LEARNING_RECOMMENDATION",
]);
const routeListSchema = z.array(executionRouteSchema).max(6).refine(
  routes => new Set(routes).size === routes.length,
  "Routes must not repeat.",
);
export const routingProposalSchema = z.object({
  expectedWorkVersion: z.number().int().positive(),
  selectedRoute: executionRouteSchema,
  reason: z.string().trim().min(1).max(2000),
  source: sourceSchema,
  profile: routingProfileSchema,
  eligibleRoutes: routeListSchema,
  rejectedRoutes: z.array(z.object({
    route: executionRouteSchema,
    reason: z.string().trim().min(1).max(500),
  }).strict()).max(6).refine(items => new Set(items.map(item => item.route)).size === items.length),
  constraints: z.array(z.string().trim().min(1).max(500)).max(30),
  providerId: z.string().trim().min(1).max(160).nullable(),
  providerVersion: z.string().trim().min(1).max(160).nullable(),
}).strict().refine(
  input => (input.providerId === null) === (input.providerVersion === null),
  "Provider ID and version must be supplied together.",
).refine(
  input => !input.rejectedRoutes.some(item => input.eligibleRoutes.includes(item.route)),
  "A route cannot be both eligible and rejected.",
).refine(
  input => input.eligibleRoutes.includes(input.selectedRoute),
  "The selected route must be eligible, including a HUMAN fallback.",
);
export type RoutingProposal = z.infer<typeof routingProposalSchema>;

export interface PersistedRoutingDecision {
  id: string;
  workId: string;
  workVersion: number;
  selectedRoute: ExecutionRoute;
  reason: string;
  source: z.infer<typeof sourceSchema>;
  profile: RoutingProfile;
  eligibleRoutes: ExecutionRoute[];
  rejectedRoutes: { route: ExecutionRoute; reason: string }[];
  constraints: string[];
  providerId: string | null;
  providerVersion: string | null;
  status: "PROPOSED" | "ADMITTED" | "STALE";
  admission: {
    reason: string;
    policyId: string;
    policyVersion: number;
    request: { route: ExecutionRoute; requiredOperations: string[]; resourceRefs: string[] };
    contextHash: string;
    authorityHash: string;
    admittedAt: string;
  } | null;
  createdAt: string;
}
export interface RoutingSnapshot {
  decision: PersistedRoutingDecision | null;
  transitions: {
    id: string; fromRoute: ExecutionRoute; toRoute: ExecutionRoute;
    reason: string; trigger: string; decisionId: string | null;
    contextSnapshotRef: string | null; authoritySnapshotRef: string | null;
    createdAt: string;
  }[];
  runs: {
    id: string; route: ExecutionRoute; providerId: string | null;
    providerVersion: string | null; status: string; decisionId: string | null;
    workVersion: number | null; workGeneration: number | null; updatedAt: string;
  }[];
}

/** Reconcile independently read Work and routing snapshots before presenting either. */
export function routingForWorkVersion(snapshot: RoutingSnapshot, workVersion: number): RoutingSnapshot {
  const current = snapshot.decision;
  if (!current || current.status === "STALE" || current.workVersion === workVersion) return snapshot;
  return { ...snapshot, decision: { ...current, status: "STALE" } };
}

const iso = (value: unknown) => value instanceof Date ? value.toISOString() : String(value);
function decision(row: Record<string, any>, currentWorkVersion: number, active: boolean): PersistedRoutingDecision {
  return {
    id: row.id,
    workId: row.work_id,
    workVersion: Number(row.work_version),
    selectedRoute: row.selected_route,
    reason: row.reason,
    source: row.source,
    profile: row.profile,
    eligibleRoutes: row.eligible_routes,
    rejectedRoutes: row.rejected_routes,
    constraints: row.constraints,
    providerId: row.provider_id,
    providerVersion: row.provider_version,
    status: Number(row.work_version) !== currentWorkVersion || !active ? "STALE" : row.status,
    admission: row.status === "ADMITTED" ? {
      reason: row.admission_reason,
      policyId: row.admission_policy_id,
      policyVersion: Number(row.admission_policy_version),
      request: row.admission_request,
      contextHash: row.admission_context_hash,
      authorityHash: row.admission_authority_hash,
      admittedAt: iso(row.admitted_at),
    } : null,
    createdAt: iso(row.created_at),
  };
}

/** Server-side scoped route history only. Caller-supplied reasoning is an unqualified proposal,
 * not a current policy fact, authority grant, admission or provider dispatch. */
export class RoutingStore {
  constructor(readonly workStore: WorkStore) {}

  private scope(id: string) {
    const { scopeId, scopeKind } = this.workStore.principal;
    return [scopeId, scopeKind, id];
  }

  async snapshot(id: string): Promise<RoutingSnapshot> {
    await this.workStore.get(id);
    const scope = this.scope(id);
    const [decisionRows, transitionRows, runRows] = await Promise.all([
      this.workStore.database.query(
        `SELECT d.*,w.version AS current_work_version,w.lifecycle AS current_lifecycle
         FROM engineering_work w
         JOIN LATERAL (
           SELECT * FROM engineering_routing_decisions
           WHERE scope_id=w.scope_id AND scope_kind=w.scope_kind AND work_id=w.id
           ORDER BY work_version DESC,id DESC LIMIT 1
         ) d ON true
         WHERE w.scope_id=$1 AND w.scope_kind=$2 AND w.id=$3`, scope,
      ),
      this.workStore.database.query(
        `SELECT id,from_route,to_route,reason,trigger,decision_id,context_snapshot_ref,authority_snapshot_ref,created_at
         FROM engineering_route_transitions
         WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3
         ORDER BY created_at DESC,id DESC LIMIT 100`, scope,
      ),
      this.workStore.database.query(
        `SELECT id,route,provider_id,provider_version,status,decision_id,work_version,work_generation,updated_at
         FROM engineering_route_runs
         WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3
         ORDER BY updated_at DESC,id DESC LIMIT 100`, scope,
      ),
    ]);
    const current = decisionRows[0];
    return {
      decision: current ? decision(current, Number(current.current_work_version), current.current_lifecycle === "active") : null,
      transitions: transitionRows.map(row => ({
        id: row.id, fromRoute: row.from_route, toRoute: row.to_route,
        reason: row.reason, trigger: row.trigger, decisionId: row.decision_id,
        contextSnapshotRef: row.context_snapshot_ref, authoritySnapshotRef: row.authority_snapshot_ref,
        createdAt: iso(row.created_at),
      })),
      runs: runRows.map(row => ({
        id: row.id, route: row.route, providerId: row.provider_id,
        providerVersion: row.provider_version, status: row.status, decisionId: row.decision_id,
        workVersion: row.work_version === null ? null : Number(row.work_version),
        workGeneration: row.work_generation === null ? null : Number(row.work_generation),
        updatedAt: iso(row.updated_at),
      })),
    };
  }

  /** One proposal per Work revision. The database rechecks scope, version and writer state under the Work row lock. */
  async recordProposal(id: string, value: unknown): Promise<PersistedRoutingDecision> {
    const input = routingProposalSchema.parse(value);
    await this.workStore.get(id);
    const rows = await this.workStore.database.query(
      `WITH locked_work AS MATERIALIZED (
         SELECT w.scope_id,w.scope_kind,w.id,w.version
         FROM engineering_work w
         WHERE w.scope_id=$1 AND w.scope_kind=$2 AND w.id=$3 AND w.version=$4
           AND w.lifecycle='active' AND w.control<>'stopping'
           -- The legacy Golden execution path has no unified route handoff.
           -- Fail closed for *any* execution row, even one that looks idle.
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
       )
       INSERT INTO engineering_routing_decisions (
         id,scope_id,scope_kind,work_id,work_version,selected_route,reason,source,profile,
         eligible_routes,rejected_routes,constraints,provider_id,provider_version,status,actor_id
       )
       SELECT $5,w.scope_id,w.scope_kind,w.id,w.version,$6,$7,$8,$9::jsonb,
         $10::jsonb,$11::jsonb,$12::jsonb,$13,$14,'PROPOSED',$15
       FROM locked_work w
       ON CONFLICT(scope_id,scope_kind,work_id,work_version) DO NOTHING
       RETURNING *`,
      [
        ...this.scope(id), input.expectedWorkVersion, randomUUID(), input.selectedRoute,
        input.reason, input.source, JSON.stringify(input.profile), JSON.stringify(input.eligibleRoutes),
        JSON.stringify(input.rejectedRoutes), JSON.stringify(input.constraints), input.providerId,
        input.providerVersion, this.workStore.principal.actorId,
      ],
    );
    if (!rows.length) throw new WorkError(
      "routing_changed",
      "Work, route assessment, or writer state changed. Reload before proposing a route.",
    );
    return decision(rows[0], input.expectedWorkVersion, true);
  }
}
