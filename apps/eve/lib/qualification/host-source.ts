import { createHash } from "node:crypto";
import { z } from "zod";
import type { ExecutionDatabase } from "../execution-types.ts";
import { QualificationAccounting, qualificationPolicySchema } from "../external-alpha/qualification-accounting.ts";
import { isPrivateBetaProject, journeyBinding, journeyProjectSchema, PRIVATE_BETA_PROFILE } from "./journey-profile.ts";
import { deriveOwnerJourney, ownerRequestTemplateSchema } from "./owner-request.ts";
import { CANONICAL_RELAY_CONTRACT } from "./relay-tool-contract.ts";
import type { QualificationRootConfig } from "./root.ts";
import { qualificationConversation } from "./conversation-model.ts";
import { createImprovementRecorder, type ImprovementFrontdoor } from "./improvement.ts";
import { assemblyProfileSchema, qdevJourneyId } from "./custody-profile.ts";
import { PostgresJournal } from "./journal.ts";
import { validateJourneyPlan } from "./plan.ts";
import { RelayMcpTransport } from "./relay-mcp-transport.ts";
import { relayToolMap } from "./relay-tool-contract.ts";
import { RelayDeveloperTools } from "./relay-tools.ts";
import type { QdevHostMaterial, QdevHostSource } from "./host-bootstrap.ts";
import type { WiringConfig } from "./wiring.ts";

/**
 * Concrete root source loader for a QDEV installation.
 *
 * Everything protected is supplied at RUNTIME by the host environment and nothing is read at import time:
 *  - MYEVE_QDEV_ENABLED=true (the existing host switch);
 *  - MYEVE_QDEV_HOST_BUNDLE: one strict JSON bundle of NON-secret configuration (owner, cohort policy, project identity,
 *    approved plan, Relay origin/grant, approved request text) plus the NAMES of the environment variables that hold
 *    each credential and database URL. A bundle never contains a credential value.
 *  - the named credential variables themselves.
 * Any missing, malformed, foreign-owner, expired or incomplete input yields `null` (every transport disabled). Nothing
 * here dispatches, reserves, calls a provider, or grants authority: the qdev ledger gate stays the only spend authority.
 * Components that need protected custody and have no ordinary adapter (agent execution, Factory, verifier, MyApps) come
 * from the injected `ports` provider; without it the installation stays disabled.
 */
const envName = z.string().regex(/^[A-Z][A-Z0-9_]{2,63}$/);
const grantSchema = z.object({
  connectionId: z.string().min(1).max(255), repository: z.string().min(1).max(255), baseCommit: z.string().regex(/^[a-f0-9]{40}$/), outputBranch: z.string().min(1).max(255),
  permissions: z.object({ metadata: z.literal("read"), contents: z.enum(["read", "write"]), actions: z.literal("read"), deployments: z.literal("read") }).strict(),
  repositoryAdmin: z.literal(false), workflowEdit: z.literal(false), productionDeployment: z.literal(false),
}).strict();
export const hostBundleSchema = z.object({
  version: z.literal(1),
  ownerId: z.string().min(1).max(255),
  notAfter: z.string().datetime(),
  policy: qualificationPolicySchema,
  project: journeyProjectSchema,
  plan: z.unknown(),
  credentials: z.object({ accounting: envName, relay: envName, accountingDatabaseUrl: envName, journalDatabaseUrl: envName }).strict(),
  relay: z.object({ origin: z.string().url(), grant: grantSchema }).strict(),
  conversation: z.object({ approvedRequest: z.string().trim().min(1).max(4000), deliveryUrl: z.string().url().optional() }).strict(),
  /** The one operator-installed custody module (absolute path + SHA-256 of its bytes) that supplies the protected ports. Absent keeps the ports disabled. */
  custody: z.object({ module: z.string().min(2).max(1024), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict().optional(),
  /** Non-secret assembly profile (ids, pins, env-var NAMES) the production launcher turns into the protected ports. Mutually exclusive with `custody`. */
  assembly: assemblyProfileSchema.optional(),
}).strict().refine(bundle => !(bundle.custody && bundle.assembly), { message: "custody module and assembly profile are mutually exclusive" });
export type QdevHostBundle = z.infer<typeof hostBundleSchema>;

/**
 * Private-beta OWNER-LOCAL bundle (version 2). Instead of a frozen project, plan and approved request it carries the installation template (repository,
 * baseline, output branch, release environment, frozen sources, four-stage reservation template). Each owner-confirmed request is derived into a complete
 * version-1-shaped bundle (owner-request.ts) and built through exactly the same path, so the accounting, journal, binding and ports guarantees are the
 * frozen ones. It is owner-only by construction: there is no tester, member or guest field, and the ingress keeps refusing mixed installations.
 */
export const ownerLocalBundleSchema = z.object({
  version: z.literal(2),
  profile: z.literal(PRIVATE_BETA_PROFILE),
  installation: z.literal("owner-local"),
  ownerId: z.string().uuid(),
  notAfter: z.string().datetime(),
  template: ownerRequestTemplateSchema,
  credentials: z.object({ accounting: envName, relay: envName, accountingDatabaseUrl: envName, journalDatabaseUrl: envName }).strict(),
  relay: z.object({ origin: z.string().url(), grant: grantSchema }).strict(),
  conversation: z.object({ deliveryUrl: z.string().url().optional() }).strict(),
  custody: z.object({ module: z.string().min(2).max(1024), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict().optional(),
  assembly: assemblyProfileSchema.optional(),
}).strict().refine(bundle => !(bundle.custody && bundle.assembly), { message: "custody module and assembly profile are mutually exclusive" });
export type OwnerLocalBundle = z.infer<typeof ownerLocalBundleSchema>;

/** The version-1-shaped bundle of one confirmed owner request (never parsed from the environment; built from the version-2 bundle). */
export function derivedRequestBundle(bundle: OwnerLocalBundle, request: string): { bundle: QdevHostBundle; planSha256: string; request: string } {
  const d = deriveOwnerJourney({ ownerId: bundle.ownerId, template: bundle.template, request });
  return { planSha256: d.planSha256, request: d.request, bundle: { version: 1, ownerId: bundle.ownerId, notAfter: bundle.notAfter, policy: d.policy, project: d.project, plan: d.plan,
    credentials: bundle.credentials, relay: bundle.relay, conversation: { approvedRequest: d.request, ...(bundle.conversation.deliveryUrl ? { deliveryUrl: bundle.conversation.deliveryUrl } : {}) },
    ...(bundle.custody ? { custody: bundle.custody } : {}), ...(bundle.assembly ? { assembly: bundle.assembly } : {}) } };
}

export type RuntimePorts = Omit<WiringConfig, "project" | "relay" | "journal">;
export type RuntimeHostDeps = {
  env?: NodeJS.ProcessEnv;
  now?: () => number;
  fetcher?: typeof fetch;
  /** Opens a database from a runtime-supplied URL. Production: `pgExecutionDatabase`. */
  database(url: string): ExecutionDatabase;
  /** Protected-custody ports (agent execution, Factory, verifier, MyApps). Absent or null keeps the installation disabled. */
  ports?(context: { bundle: QdevHostBundle; relay: RelayDeveloperTools; credential(name: string): string | undefined }): Promise<RuntimePorts | null>;
  /** The owner's durable Work storage frontdoor, used only to record inert, unfunded post-delivery improvement proposals. Absent disables proposals (progress stays available). */
  improvementFrontdoor?(ownerId: string): ImprovementFrontdoor;
};
/** Owner-scoped improvement frontdoor over the existing engineering Work tables. Opened lazily on first use, so building the host touches no Work database. */
export function ownerImprovementFrontdoor(ownerId: string): ImprovementFrontdoor {
  return { async exclusive(key, action) {
    const [{ WorkStore }, { workImprovementFrontdoor }] = await Promise.all([import("../engineering/store.ts"), import("./improvement-store.ts")]);
    return workImprovementFrontdoor(ownerId, new WorkStore({ scopeKind: "personal", scopeId: ownerId, actorId: ownerId }).database).exclusive(key, action);
  } };
}

const sha = (text: string) => createHash("sha256").update(text).digest("hex");
/** Fingerprint of the four required runtime inputs (hash only; values are never retained or printed). Null when any is absent or malformed. */
function runtimeFingerprint(env: NodeJS.ProcessEnv, names: QdevHostBundle["credentials"]): string | null {
  const values = [names.accounting, names.relay, names.accountingDatabaseUrl, names.journalDatabaseUrl].map(name => env[name]);
  if (!values.every(value => typeof value === "string" && value.length > 0)) return null;
  if (!/^[a-f0-9]{64}$/.test(values[0]!) || !databaseUrl(values[2]) || !databaseUrl(values[3])) return null;
  return sha(JSON.stringify(values));
}
const databaseUrl = (value: string | undefined) => {
  if (!value) return null;
  try { const url = new URL(value); return /^postgres(ql)?:$/.test(url.protocol) ? value : null; } catch { return null; }
};

export function createRuntimeHostSource(deps: RuntimeHostDeps): QdevHostSource {
  const env = deps.env ?? process.env;
  const now = deps.now ?? Date.now;
  const cache = new Map<string, { fingerprint: string; built: Promise<QdevHostMaterial | null> }>();

  function bundleFor(ownerId: string): { raw: string; bundle: QdevHostBundle | OwnerLocalBundle } | null {
    const raw = env.MYEVE_QDEV_HOST_BUNDLE;
    if (!raw || raw.length > 100_000) return null;
    let parsed: QdevHostBundle | OwnerLocalBundle;
    try {
      const json = JSON.parse(raw);
      parsed = json?.version === 2 ? ownerLocalBundleSchema.parse(json) : hostBundleSchema.parse(json);
    } catch { return null; }
    if (parsed.ownerId !== ownerId) return null;
    // A frozen (v1) bundle carries only a frozen qdev project; private-beta projects exist only as derivations of an owner-local (v2) bundle.
    if (parsed.version === 1 && (parsed.policy.ownerId !== ownerId || isPrivateBetaProject(parsed.project))) return null;
    if (parsed.version === 2 && (parsed.relay.grant.repository !== parsed.template.installation.repository || parsed.relay.grant.baseCommit !== parsed.template.installation.inputCommit
      || parsed.relay.grant.outputBranch !== parsed.template.installation.outputBranch)) return null;
    if (Date.parse(parsed.notAfter) <= now()) return null;
    return { raw, bundle: parsed };
  }

  async function build(raw: string, any: QdevHostBundle | OwnerLocalBundle, bound: string): Promise<QdevHostMaterial | null> {
    if (any.version === 2) return buildOwnerLocal(raw, any, bound);
    const bundle = any;
    const secret = (name: string) => env[name];
    /** Every use of previously returned material re-proves that the exact supplied inputs are still present and unchanged. */
    const live = () => env.MYEVE_QDEV_ENABLED === "true" && runtimeFingerprint(env, bundle.credentials) === bound;
    const guarded = (database: ExecutionDatabase): ExecutionDatabase => ({
      query: async (sql, parameters) => { if (!live()) throw Error("QDEV_CONFIGURATION_REQUIRED"); return database.query(sql, parameters); },
    });
    const accountingCredential = secret(bundle.credentials.accounting), relayCredential = secret(bundle.credentials.relay);
    const accountingUrl = databaseUrl(secret(bundle.credentials.accountingDatabaseUrl)), journalUrl = databaseUrl(secret(bundle.credentials.journalDatabaseUrl));
    if (!accountingCredential || !/^[a-f0-9]{64}$/.test(accountingCredential) || !relayCredential || !accountingUrl || !journalUrl) return null;
    let plan; try { plan = validateJourneyPlan(bundle.plan); } catch { return null; }
    const binding = journeyBinding(bundle.project);
    const accounting = new QualificationAccounting(guarded(deps.database(accountingUrl)), accountingCredential, bundle.policy, binding);
    const journal = new PostgresJournal(guarded(deps.database(journalUrl)), qdevJourneyId(bundle.ownerId, bundle.project, bundle.policy, plan));
    const transport = new RelayMcpTransport({ enabled: true, origin: bundle.relay.origin, tools: relayToolMap(), fetcher: deps.fetcher,
      credential: async () => { const current = env[bundle.credentials.relay]; if (!live() || !current) throw Error("QDEV_RELAY_CREDENTIAL"); return current; } });
    const relay = new RelayDeveloperTools(bundle.relay.grant, transport);
    const ports = deps.ports ? await deps.ports({ bundle, relay, credential: secret }) : null;
    if (!ports) return null;
    const bundleSha = sha(raw);
    /** Read-only current admission. It touches no provider: only the bundle's presence/expiry and the ledger's own status read. */
    const revalidate = async (input: { ownerId: string; sessionId: string; stepKey: string }) => {
      if (input.ownerId !== bundle.ownerId || !live() || env.MYEVE_QDEV_HOST_BUNDLE === undefined) return false;
      if (sha(env.MYEVE_QDEV_HOST_BUNDLE) !== bundleSha || Date.parse(bundle.notAfter) <= now()) return false;
      return (await accounting.status()).state === "active";
    };
    const conversation = qualificationConversation({ ownerId: bundle.ownerId, approvedRequest: bundle.conversation.approvedRequest,
      deliveryUrl: bundle.conversation.deliveryUrl, revalidate, retained: () => journal.read(),
      improvements: deps.improvementFrontdoor ? createImprovementRecorder({ ownerId: bundle.ownerId, frontdoor: deps.improvementFrontdoor(bundle.ownerId) }) : undefined });
    return { ownerId: bundle.ownerId, project: bundle.project, plan, accounting, journal, relay, ports, conversation };
  }

  /** Owner-local private beta: per-request material derived from the confirmed request, through the same accounting/journal/ports construction. */
  async function buildOwnerLocal(raw: string, bundle: OwnerLocalBundle, bound: string): Promise<QdevHostMaterial | null> {
    const secret = (name: string) => env[name];
    const bundleSha = sha(raw);
    const live = () => env.MYEVE_QDEV_ENABLED === "true" && runtimeFingerprint(env, bundle.credentials) === bound
      && env.MYEVE_QDEV_HOST_BUNDLE !== undefined && sha(env.MYEVE_QDEV_HOST_BUNDLE) === bundleSha && Date.parse(bundle.notAfter) > now();
    const guarded = (database: ExecutionDatabase): ExecutionDatabase => ({
      query: async (sql, parameters) => { if (!live()) throw Error("QDEV_CONFIGURATION_REQUIRED"); return database.query(sql, parameters); },
    });
    const accountingCredential = secret(bundle.credentials.accounting), relayCredential = secret(bundle.credentials.relay);
    const accountingUrl = databaseUrl(secret(bundle.credentials.accountingDatabaseUrl)), journalUrl = databaseUrl(secret(bundle.credentials.journalDatabaseUrl));
    if (!accountingCredential || !/^[a-f0-9]{64}$/.test(accountingCredential) || !relayCredential || !accountingUrl || !journalUrl) return null;
    const installation = bundle.template.installation;
    const transport = new RelayMcpTransport({ enabled: true, origin: bundle.relay.origin, tools: relayToolMap(), fetcher: deps.fetcher,
      credential: async () => { const current = env[bundle.credentials.relay]; if (!live() || !current) throw Error("QDEV_RELAY_CREDENTIAL"); return current; } });
    const relay = new RelayDeveloperTools(bundle.relay.grant, transport, CANONICAL_RELAY_CONTRACT,
      { repository: installation.repository, outputBranch: installation.outputBranch, inputCommit: installation.inputCommit });
    const accountingDb = guarded(deps.database(accountingUrl)), journalDb = guarded(deps.database(journalUrl));
    const derivedCache = new Map<string, Promise<{ planSha256: string; config: QualificationRootConfig } | null>>();
    async function deriveConfig(request: string): Promise<{ planSha256: string; config: QualificationRootConfig } | null> {
      if (!live()) return null;
      const derived = derivedRequestBundle(bundle, request), b = derived.bundle;
      const plan = validateJourneyPlan(b.plan);
      const accounting = new QualificationAccounting(accountingDb, accountingCredential!, b.policy, journeyBinding(b.project));
      const journal = new PostgresJournal(journalDb, qdevJourneyId(b.ownerId, b.project, b.policy, plan));
      const ports = deps.ports ? await deps.ports({ bundle: b, relay, credential: secret }) : null;
      if (!ports) return null;
      return { planSha256: derived.planSha256, config: { ownerId: b.ownerId, project: b.project, plan, accounting, journal, relay, ports } };
    }
    const ownerRequest = { derive(request: string, expectedPlanSha256: string) {
      let key: string;
      try { key = derivedRequestBundle(bundle, request).planSha256; } catch { return Promise.resolve(null); }
      // A digest the owner did not confirm builds nothing (no database handle, no ports).
      if (key !== expectedPlanSha256) return Promise.resolve({ planSha256: key, config: null });
      let entry = derivedCache.get(key);
      if (!entry) {
        if (derivedCache.size >= 16) derivedCache.delete(derivedCache.keys().next().value!);
        entry = deriveConfig(request).catch(() => null);
        derivedCache.set(key, entry);
      }
      return entry.then(value => { if (!value) derivedCache.delete(key); return value; });
    } };
    // Read-only admission: bundle presence/digest/expiry and the runtime inputs. There is no cohort before a request is confirmed, so the ledger is
    // consulted by the journey's own gate (which refuses an unissued, inactive, paused or revoked derived cohort before any provider call).
    const revalidate = async (input: { ownerId: string; sessionId: string; stepKey: string }) => input.ownerId === bundle.ownerId && live();
    const conversation = qualificationConversation({ ownerId: bundle.ownerId, deliveryUrl: bundle.conversation.deliveryUrl, revalidate,
      ownerRequest: { derive: text => {
        const d = deriveOwnerJourney({ ownerId: bundle.ownerId, template: bundle.template, request: text });
        return { request: d.request, requestSha256: d.requestSha256, planSha256: d.planSha256, repository: installation.repository, environment: installation.environment, cohortId: d.policy.cohortId };
      } } });
    return { ownerId: bundle.ownerId, ownerRequest, conversation };
  }

  return {
    enabled: () => env.MYEVE_QDEV_ENABLED === "true",
    async material(ownerId) {
      if (env.MYEVE_QDEV_ENABLED !== "true") return null;
      const found = bundleFor(ownerId);                      // revalidated on every call: expiry, owner and presence are never cached
      if (!found) return null;
      const key = sha(found.raw), fingerprint = runtimeFingerprint(env, found.bundle.credentials);
      if (!fingerprint) { cache.delete(key); return null; }  // a removed or malformed credential/database input disables warm material too
      let entry = cache.get(key);
      if (!entry || entry.fingerprint !== fingerprint) {     // replaced inputs build new material; the old one no longer passes `live()`
        entry = { fingerprint, built: build(found.raw, found.bundle, fingerprint).catch(() => null) };
        cache.set(key, entry);
      }
      const material = await entry.built;
      if (!material) cache.delete(key);                      // an incomplete installation may become complete later
      return material;
    },
  };
}

/** Production database opener for runtime-supplied URLs (lazy `pg` pool; no connection until first query). */
export function pgExecutionDatabase(url: string): ExecutionDatabase {
  let pool: Promise<{ query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }> }> | undefined;
  const open = () => pool ??= import("pg").then(({ default: pg }) => new pg.Pool({ connectionString: url, max: 2, idleTimeoutMillis: 10_000 }));
  return { query: async (sql: string, params?: unknown[]) => (await (await open()).query(sql, params)).rows } as ExecutionDatabase;
}

/** Default production source: runtime-supplied, and disabled until a protected `ports` provider is enrolled. */
export const runtimeHostSource = (ports?: RuntimeHostDeps["ports"]): QdevHostSource => createRuntimeHostSource({ database: pgExecutionDatabase, ports, improvementFrontdoor: ownerImprovementFrontdoor });
