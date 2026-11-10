import { createHash, createPrivateKey, randomUUID, sign as edSign } from "node:crypto";
import { z } from "zod";
import { digest } from "../engineering/contract.ts";
import { factoryExecutionConfigurationHash } from "../engineering/factory-configuration-hash.ts";
import type { FactoryRuntime } from "../engineering/factory-routing.ts";
import type { WorkStore } from "../engineering/store.ts";
import type { Work } from "../engineering/types.ts";
import { canonicalPermitJson, ownerEnrollmentSchema } from "../missioncontrol/execution-permit.ts";
import { relayLeaseEnrollmentDigest } from "../missioncontrol/relay-lease-client.ts";
import { prepareMissionControlExecution } from "../missioncontrol/prepare-execution.ts";
import { requestOwnerFactoryAdmission } from "../missioncontrol/admit-execution.ts";
import { ownerFactoryWorkTuple } from "../missioncontrol/owner-factory-binding.ts";
import { PRIVATE_BETA_PROFILE } from "./journey-profile.ts";

/**
 * Private-beta OWNER-LOCAL profile only (myeve.private-beta.owner/v1): what the owner's authenticated Sofie `confirm <plan>` sets in motion before
 * any stage can be admitted. It reaches here only through the QDEV root, after the owner principal check and the re-derived plan digest check.
 *
 *  1. Work: the three stage Works of exactly this confirmed request (idempotent per plan digest). Their objective and criterion are the confirmed
 *     request, and the per-request engineering runtime pins that same objective, so the native scope check binds Work to the confirmation.
 *  2. Confirmation: MyEve signs the confirmation binding (owner, request, plan digest, the three Work tuples, repository and limits) with its
 *     owner-confirmation key and hands it to the local owner confirmation bridge, which turns that ONE fresh confirmation into MissionControl's
 *     owner decisions through MissionControl's real mutations (connect, authorize, approve Plan, then one permit per Work).
 *  3. MissionControl: MyEve records the operator-installed enrollment, prepares one permit request per Work through the canonical
 *     prepareMissionControlExecution (which persists the owner Work origin), then asks the bridge to approve exactly those requests.
 *
 * Loopback MissionControl and Relay transports exist ONLY here: `ownerLocalSend` maps the pinned https identity labels to 127.0.0.1 ports and is
 * constructed for the owner-local profile alone. Every other profile keeps https-only origins. No approval is ever created by MyEve itself.
 */
export class OwnerLocalConfirmationRefused extends Error { constructor(readonly code: string) { super(code); } }
const refuse = (code: string): never => { throw new OwnerLocalConfirmationRefused(code); };
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const loopback = z.string().refine(v => { try { const u = new URL(v); return u.origin === v && u.protocol === "http:" && u.hostname === "127.0.0.1" && !!u.port && !u.username && !u.password; } catch { return false; } });
const label = z.string().refine(v => { try { const u = new URL(v); return u.origin === v && u.protocol === "https:" && u.hostname.endsWith(".owner-local.invalid") && !u.port; } catch { return false; } });
const envName = z.string().regex(/^[A-Z][A-Z0-9_]{2,63}$/);

export const ownerLocalConfirmationSchema = z.object({
  bridgeOrigin: loopback, signerEnv: envName,
  /** Jay's confirm also authorizes (1) issuing the confirmed plan's accounting cohort and (2) the post-PASS local preview publication. */
  authorizations: z.object({ auditPath: z.string().startsWith("/").max(1024), accountingIssuerEnv: envName, approverEnv: envName }).strict(),
  stage: z.object({ maxCostUsd: z.number().positive().max(1.3), maxDurationSeconds: z.number().int().min(60).max(600), budgetMinutes: z.number().int().min(10).max(120),
    requestDeadlineSeconds: z.number().int().min(60).max(600) }).strict(),
  missionControl: z.object({
    issuer: label, audience: label, loopbackOrigin: loopback, installationId: z.string().min(1).max(200), secretEnv: envName,
    capabilityBackendId: z.string().min(1).max(200), propagationEnv: envName,
    relay: z.object({ label, loopbackOrigin: loopback, template: z.record(z.string(), z.unknown()), credentialEnv: envName, workloadTokenEnv: envName }).strict(),
    executionContractSha256: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict(),
}).strict().superRefine((profile, ctx) => {
  if (profile.missionControl.relay.template.origin !== profile.missionControl.relay.label)
    ctx.addIssue({ code: "custom", message: "Relay enrollment must use the pinned owner-local identity label" });
});
export type OwnerLocalConfirmationProfile = z.infer<typeof ownerLocalConfirmationSchema>;

/** Owner-local transport: exact https identity label origin -> pinned loopback origin. Refuses for any other profile. */
export function ownerLocalSend(profile: string, map: Record<string, string>, base: typeof fetch = fetch): typeof fetch {
  if (profile !== PRIVATE_BETA_PROFILE) return refuse("OWNER_LOCAL_TRANSPORT_PROFILE");
  for (const [from, to] of Object.entries(map)) if (!label.safeParse(from).success || !loopback.safeParse(to).success) refuse("OWNER_LOCAL_TRANSPORT_ORIGIN");
  const pinned = Object.freeze({ ...map });
  return (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const target = pinned[url.origin];
    if (!target || url.username || url.password || url.hash) return refuse("OWNER_LOCAL_TRANSPORT_ORIGIN");
    return base(target + url.pathname + url.search, { ...init, redirect: "error" });
  };
}

const STAGE_TITLES = { 1: "Stage 1/3: plan and implement the owner-confirmed request", 2: "Stage 2/3: complete the request and its Playwright tests",
  3: "Stage 3/3: final build and Playwright verification" } as const;
/** The objective and single criterion the owner confirmed. The criterion id is the profile's pinned check id. */
export function requestObjective(request: string, planSha256: string, repository: string) {
  return [`Owner-confirmed request (plan ${planSha256.slice(0, 12)}): ${request}`, "",
    `Repository ${repository}: a React + Vite + TypeScript app. Implement the request in src/ and cover it with Playwright tests in test/.`,
    "MyFactory checks every stage with: npm run build && npx playwright test. Keep the app self-contained (no network calls at runtime; use bundled sample data)."].join("\n");
}
/** Per-request engineering runtime: the reviewed profile with the confirmed objective/criterion. Every consumer of this request uses this one object. */
export function ownerLocalRequestRuntime(base: FactoryRuntime, input: { request: string; planSha256: string }): FactoryRuntime {
  const [criterion] = base.engineering.criteria;
  if (!criterion || base.engineering.criteria.length !== 1) return refuse("OWNER_LOCAL_PROFILE_CRITERIA");
  return { ...base, engineering: { ...base.engineering, objective: requestObjective(input.request, input.planSha256, base.engineering.profile.repository),
    criteria: [{ ...criterion, statement: `The delivered app satisfies the owner-confirmed request and npm run build && npx playwright test pass: ${input.request}`.slice(0, 1000) }] } };
}
const uuidFrom = (hex: string) => { const b = hex.slice(0, 32).split(""); b[12] = "5"; b[16] = ((parseInt(b[16], 16) & 3) | 8).toString(16); const s = b.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`; };

/** Claim the three stage Works once. An existing claim requires reconciliation; it never rotates enrollment or resumes Work on replay. */
/** Work tables a claim itself writes (history, immutable criteria, the model budget row). Any OTHER row naming the Work means something bound it. */
const CLAIM_TABLES = new Set(["engineering_work_events", "engineering_work_criteria", "engineering_work_model_budget"]);
/**
 * True only for a stage Work that an earlier confirmation of the SAME plan claimed and nothing ever used: still active, history exactly
 * `created` (paused, v1) or `created,resume` (agent, v2), and no row in any other table carrying its `work_id` (no MissionControl origin, binding or
 * permit, no Factory request/admission/result, no model call, no budget use). Such a Work may be confirmed again; anything else stays refused.
 */
export async function pristineClaimedWork(store: WorkStore, work: Work): Promise<boolean> {
  if (work.lifecycle !== "active") return false;
  const events = await store.database.query("SELECT kind, version FROM engineering_work_events WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3 ORDER BY version",
    [store.principal.scopeId, store.principal.scopeKind, work.id]);
  const history = events.map(e => `${e.kind}@${e.version}`).join(",");
  if (!((history === "created@1" && work.control === "paused" && work.version === 1) || (history === "created@1,resume@2" && work.control === "agent" && work.version === 2))) return false;
  // Row-level security could hide a binding row from this role: without BYPASSRLS on an RLS-protected table, the Work is never treated as pristine.
  const tables = await store.database.query(`SELECT col.table_name, (cls.relrowsecurity AND NOT (SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user)) AS hidden
    FROM information_schema.columns col JOIN pg_class cls ON cls.relname=col.table_name JOIN pg_namespace ns ON ns.oid=cls.relnamespace AND ns.nspname=col.table_schema
    WHERE col.table_schema='public' AND col.column_name='work_id' AND col.table_name <> 'engineering_work'`);
  if (!tables.length || tables.some(t => t.hidden === true)) return false;
  for (const { table_name } of tables) {
    const table = String(table_name);
    if (CLAIM_TABLES.has(table)) continue;
    if (!/^[a-z_][a-z0-9_]{0,62}$/.test(table)) return false;
    if ((await store.database.query(`SELECT 1 FROM "${table}" WHERE work_id::text=$1 LIMIT 1`, [work.id])).length) return false;
  }
  return true;
}

export async function ensureRequestStageWorks(store: WorkStore, runtime: FactoryRuntime, input: { planSha256: string; stage: OwnerLocalConfirmationProfile["stage"];
  /** Hosted only: a stage Work of this plan that a failed earlier confirmation claimed but nothing bound (`pristineClaimedWork`) is confirmed again. */
  reusePristine?: boolean }) {
  const works: Record<1 | 2 | 3, Work> = {} as never;
  for (const stage of [1, 2, 3] as const) {
    const { work, created } = await store.create({ title: STAGE_TITLES[stage], objective: runtime.engineering.objective, repository: runtime.engineering.profile.repository,
      criteria: runtime.engineering.criteria, maxCostUsd: input.stage.maxCostUsd, maxDurationSeconds: input.stage.maxDurationSeconds,
      idempotencyKey: uuidFrom(sha256(`owner-local-stage-work/v1:${input.planSha256}:${stage}`)) });
    // The canonical unique Work idempotency key arbitrates concurrent confirmations before either bridge mutation.
    // This also covers a restart/lost response after a prior claim: never create a fresh enrollment for retained or UNKNOWN Work.
    // The single exception (hosted, opt-in): the earlier claim never got past it, so the Work is exactly as claimed and unbound.
    if (!created && !(input.reusePristine && await pristineClaimedWork(store, work))) return refuse("OWNER_LOCAL_CONFIRMATION_ALREADY_CLAIMED_RECONCILE");
    // New Work starts paused; the owner's confirmation hands exactly this Work to the agent (one canonical `resume` command).
    works[stage] = work.control === "agent" ? work : await store.change(work.id, { operation: "resume", expectedVersion: work.version });
  }
  const [agent] = await store.database.query("SELECT updated_at::text AS revision, max_steps FROM agents WHERE owner_id=$1 AND id=$2 AND is_primary AND status='active'",
    [store.principal.scopeId, runtime.engineering.agentId]);
  if (!agent) return refuse("OWNER_LOCAL_AGENT");
  for (const work of Object.values(works)) await store.database.query(`INSERT INTO engineering_work_model_budget(scope_id,scope_kind,work_id,actor_id,agent_id,agent_revision,
      policy_hash,policy_version,ceiling_microusd,max_calls,deadline,status) VALUES($1,'personal',$2,$1,$3,$4,$5,$6,$7,$8,clock_timestamp()+make_interval(mins=>$9),'ACTIVE')
      ON CONFLICT DO NOTHING`, [store.principal.scopeId, work.id, runtime.engineering.agentId, agent.revision, factoryExecutionConfigurationHash(runtime),
    runtime.engineering.profile.policyVersion, Math.floor(work.maxCostUsd * 1e6), Math.min(3, Number(agent.max_steps)), input.stage.budgetMinutes]);
  return works;
}

export const confirmationSigningBytes = (binding: unknown) => Buffer.from("myeve-owner-confirmation/v1\n" + canonicalPermitJson(binding));
export const confirmationTupleSigningBytes = (document: unknown) => Buffer.from("myeve-owner-confirmation-tuples/v1\n" + canonicalPermitJson(document));
async function bridge(origin: string, path: "/confirm" | "/approve-permits", body: unknown, send: typeof fetch) {
  const response = await send(origin + path, { method: "POST", redirect: "error", signal: AbortSignal.timeout(120_000),
    headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const value = await response.json().catch(() => null) as Record<string, any> | null;
  if (!response.ok || !value) return refuse(`OWNER_LOCAL_BRIDGE_${path === "/confirm" ? "CONFIRM" : "PERMITS"}:${String(value?.error ?? response.status).slice(0, 120)}`);
  return value;
}

export type OwnerLocalConfirmed = { workIds: { stage1: string; stage2: string; stage3: string }; runtime: FactoryRuntime;
  /** The exact confirmed stage Work revisions (as signed in the confirmation). */
  works: Array<{ id: string; version: number; generation: number }>;
  /** The MissionControl connection and enrollment revision this confirmation installed (Relay lease enrollments bind to them). */
  connectionId: string; enrollmentRevision: number;
  /** The MissionControl Mission the owner approved; the Factory capability challenge must name exactly it. */
  missionId: string;
  /** sha256 of the canonical signed confirmation binding: every authorized action records it. */
  confirmationDigest: string;
  admission: (store: WorkStore, work: Work, config: FactoryRuntime) => ReturnType<typeof requestOwnerFactoryAdmission> };

export async function confirmOwnerLocalRequest(c: {
  profile: string; confirmation: OwnerLocalConfirmationProfile; store: WorkStore; base: FactoryRuntime;
  request: string; planSha256: string; credential(name: string): string | undefined; env?: NodeJS.ProcessEnv; send?: typeof fetch; now?: () => number;
}): Promise<OwnerLocalConfirmed> {
  if (c.profile !== PRIVATE_BETA_PROFILE) return refuse("OWNER_LOCAL_PROFILE");
  const p = ownerLocalConfirmationSchema.parse(c.confirmation), mc = p.missionControl, now = c.now ?? Date.now;
  const ownerId = c.store.principal.scopeId;
  if (c.store.principal.scopeKind !== "personal" || c.store.principal.actorId !== ownerId || !c.store.database.atomic) return refuse("OWNER_LOCAL_OWNER_STORE");
  const secret = (name: string) => c.credential(name) ?? refuse(`OWNER_LOCAL_CREDENTIAL:${name}`);
  const send = ownerLocalSend(c.profile, { [mc.issuer]: mc.loopbackOrigin, [mc.relay.label]: mc.relay.loopbackOrigin }, c.send ?? fetch);
  const runtime = ownerLocalRequestRuntime(c.base, c.request && c.planSha256 ? { request: c.request, planSha256: c.planSha256 } : refuse("OWNER_LOCAL_REQUEST"));
  const works = await ensureRequestStageWorks(c.store, runtime, { planSha256: c.planSha256, stage: p.stage });
  const conn = runtime.connection;
  if (!("repositoryPath" in conn)) return refuse("OWNER_LOCAL_CONNECTION");
  const adapter = { factoryId: conn.factoryId, sourceDigest: conn.sourceDigest, configurationDigest: conn.configurationDigest,
    configurationHash: factoryExecutionConfigurationHash(runtime), profileHash: digest(runtime.engineering.profile), repository: runtime.engineering.profile.repository,
    agentId: runtime.engineering.agentId };
  const [policy] = await c.store.database.atomic(async db => {
    await db.query("SELECT set_config('myeve.capability_owner',$1,true),set_config('myeve.capability_installation',$2,true)", [ownerId, mc.installationId]);
    return db.query("SELECT revision,policy_id,destinations FROM capability_control.policy_changes WHERE installation_id=$1 AND owner_id=$2 AND status='ACKNOWLEDGED' ORDER BY revision DESC LIMIT 1", [mc.installationId, ownerId]);
  });
  if (!policy) return refuse("OWNER_LOCAL_CAPABILITY_POLICY");
  // The enrollment row is append-only by revision (missioncontrol_binding_guard): each confirmation installs the next revision.
  const [prior] = await c.store.database.atomic(async db => {
    await db.query("SELECT set_config('myeve.missioncontrol_owner',$1,true)", [ownerId]);
    return db.query("SELECT revision FROM missioncontrol_owner_enrollments WHERE owner_id=$1", [ownerId]);
  });
  const revision = Number(prior?.revision ?? 0) + 1;
  const binding = { schema: "myeve-owner-confirmation/v1", profile: c.profile, ownerId, request: c.request, requestSha256: sha256(c.request), planSha256: c.planSha256,
    confirmCode: c.planSha256.slice(0, 12), confirmedAt: now(), nonce: randomUUID(), title: c.request.slice(0, 160), repository: runtime.engineering.profile.repository,
    works: ([1, 2, 3] as const).map(stage => ({ stage, id: works[stage].id, version: works[stage].version, generation: works[stage].generation,
      maxCostUsd: works[stage].maxCostUsd, maxDurationSeconds: works[stage].maxDurationSeconds })),
    enrollmentPins: { factoryVersion: conn.factoryVersion, executionContractSha256: mc.executionContractSha256,
      capabilityPolicySha256: sha256(canonicalPermitJson({ installationId: mc.installationId, revision: Number(policy.revision), policyId: policy.policy_id, destinations: policy.destinations })),
      relayLeaseEnrollmentSha256: "0".repeat(64), ownerFactoryAdapter: adapter, revision,
      maxCostMicrousd: Math.round(p.stage.maxCostUsd * 1e6), maxDurationSeconds: p.stage.maxDurationSeconds } };
  const signature = edSign(null, confirmationSigningBytes(binding), createPrivateKey(secret(p.signerEnv))).toString("base64url");
  // Step A (bridge): connect, enrollment, proposal authorization, Plan approval. Returns the MissionControl ids for this confirmation only.
  const a = await bridge(p.bridgeOrigin, "/confirm", { binding, signature }, c.send ?? fetch);
  const relayLease = { ...mc.relay.template, connectionId: a.connectionId, enrollmentRevision: revision };
  const enrollment = ownerEnrollmentSchema.parse({ ...a.enrollment, relayLeaseEnrollmentSha256: relayLeaseEnrollmentDigest(relayLease), ownerFactoryAdapter: adapter });
  if (enrollment.ownerId !== ownerId || enrollment.revision !== revision || enrollment.issuer !== mc.issuer || enrollment.audience !== mc.audience || enrollment.installationId !== mc.installationId
    || enrollment.factoryVersion !== conn.factoryVersion) return refuse("OWNER_LOCAL_ENROLLMENT");
  await c.store.database.atomic(async db => {
    await db.query("SELECT set_config('myeve.missioncontrol_owner',$1,true)", [ownerId]);
    if (revision === 1) await db.query("INSERT INTO missioncontrol_owner_enrollments(owner_id,installation_id,revision,document) VALUES($1,$2,1,$3)", [ownerId, enrollment.installationId, enrollment]);
    else await db.query("UPDATE missioncontrol_owner_enrollments SET revision=$2,document=$3 WHERE owner_id=$1 AND revision=$4", [ownerId, revision, enrollment, revision - 1]);
  });
  const env: NodeJS.ProcessEnv = { ...(c.env ?? process.env), MYEVE_MISSIONCONTROL_MODE: "APPROVED_NONPRODUCTION", MYEVE_OWNER_ID: ownerId,
    MYEVE_MISSIONCONTROL_INSTALLATION_ID: enrollment.installationId, MYEVE_MISSIONCONTROL_CONNECTION_ID: enrollment.connectionId,
    MYEVE_MISSIONCONTROL_URL: enrollment.issuer, MYEVE_MISSIONCONTROL_AUDIENCE: enrollment.audience, MYEVE_MISSIONCONTROL_SECRET: secret(mc.secretEnv),
    MYEVE_CAPABILITY_CONTROL_ENABLED: "true", MYEVE_CAPABILITY_ENVIRONMENT: "qualification", MYEVE_CAPABILITY_INSTALLATION_ID: mc.installationId,
    MYEVE_MISSIONCONTROL_CAPABILITY_BACKEND_ID: mc.capabilityBackendId, MYEVE_MISSIONCONTROL_CAPABILITY_AGENT_ID: runtime.engineering.agentId,
    MYEVE_CAPABILITY_PROPAGATION_JSON: secret(mc.propagationEnv), MYEVE_MISSIONCONTROL_RELAY_LEASE_JSON: JSON.stringify(relayLease),
    MYEVE_MISSIONCONTROL_RELAY_RUNTIME_CREDENTIAL: secret(mc.relay.credentialEnv), MYEVE_MISSIONCONTROL_RELAY_WORKLOAD_TOKEN: secret(mc.relay.workloadTokenEnv) };
  // One MissionControl WorkOrder per stage Work: MyEve prepares exactly one permit request per confirmed Work (persisting each owner Work origin
  // first). MissionControl permits live five minutes, so each is approved just in time, right before that stage's admission, still bound to
  // this one confirmation and approved at most once per Work by the bridge.
  const workOrders = z.array(z.object({ stage: z.number().int().min(1).max(3), workOrderId: z.string().min(1), expectedWorkOrderRevisionId: z.string().min(1) }).strict()).length(3).parse(a.workOrders);
  // The exact Work tuples (owner, installation, connection, Work revision, criteria, repository, limits, Factory pins) exist only once step A
  // created the connection. They are signed under the SAME confirmation (its digest) and the bridge approves a permit only for a request whose
  // Work tuple equals the signed one for that Work.
  const confirmationDigest = sha256(canonicalPermitJson(binding));
  const tupleDocument = { schema: "myeve-owner-confirmation-tuples/v1", confirmationDigest, connectionId: enrollment.connectionId, enrollmentRevision: revision,
    works: ([1, 2, 3] as const).map(stage => ({ stage, id: works[stage].id, version: works[stage].version, generation: works[stage].generation,
      tupleSha256: ownerFactoryWorkTuple(works[stage], enrollment) })) };
  const tuples = { document: tupleDocument, signature: edSign(null, confirmationTupleSigningBytes(tupleDocument), createPrivateKey(secret(p.signerEnv))).toString("base64url") };
  const requestIds = new Map<string, string>();
  for (const stage of [1, 2, 3] as const) {
    const work = works[stage], wo = workOrders.find(x => x.stage === stage) ?? refuse("OWNER_LOCAL_WORKORDER");
    const prepared = await prepareMissionControlExecution(c.store, { operation: "enterprise.prepare_execution", proposalId: a.proposalId, workOrderId: wo.workOrderId,
      expectedWorkOrderRevisionId: wo.expectedWorkOrderRevisionId, expectedPlanDigest: a.planDigest, idempotencyKey: `owner-local:${c.planSha256.slice(0, 16)}:stage-${stage}`,
      workId: work.id, expectedWorkVersion: work.version, expectedWorkGeneration: work.generation }, randomUUID(), env, send, runtime);
    requestIds.set(work.id, prepared.requestId);
  }
  const approved = new Set<string>();
  return { workIds: { stage1: works[1].id, stage2: works[2].id, stage3: works[3].id }, runtime,
    works: ([1, 2, 3] as const).map(stage => ({ id: works[stage].id, version: works[stage].version, generation: works[stage].generation })), connectionId: enrollment.connectionId, enrollmentRevision: revision, missionId: String(a.missionId), confirmationDigest,
    admission: async (store, work, config) => {
      const requestId = requestIds.get(work.id) ?? refuse("OWNER_LOCAL_WORK_NOT_CONFIRMED");
      if (!approved.has(work.id)) { await bridge(p.bridgeOrigin, "/approve-permits", { binding, signature, tuples, requestIds: [requestId] }, c.send ?? fetch); approved.add(work.id); }
      return requestOwnerFactoryAdmission(store, work, config, env, send);
    } };
}
