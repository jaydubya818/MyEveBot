import { generateKeyPairSync, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { capabilityOwnerId } from "./owner-scope.ts";
import { capabilityStore, closeCapabilityDatabase } from "./runtime.ts";
import { HOSTED_PROFILE, hostedOwnerScope } from "../engineering/factory-mailbox.ts";
import { factoryRelayLeaseEnrollmentDigest } from "../engineering/factory-relay-lease-client.ts";
import { issueMissionControlSourcePermit } from "../missioncontrol/capability-source.ts";
import { MissionControlBindings } from "../missioncontrol/permit-store.ts";
import { permitFixture } from "../missioncontrol/permit-test-fixture.ts";
import { installedRelayLeaseConfig, relayLeaseEnrollmentDigest } from "../missioncontrol/relay-lease-client.ts";
import { ownerFactoryCapabilityConfig } from "../qualification/custody-assembly.ts";
import { HOSTED_ASSURANCE_LABEL } from "../qualification/hosted-profile.ts";

/**
 * Blocker 3: hosted MyFactory admits only enrollment owner = client ownerScope (`myeve.hosted:<installation>:<owner>`).
 * The capability identity MyEve presents to Factory / Relay / MissionControl is that scope; Work, agents and user data stay on `owner`.
 * Every fixture here has scope !== owner id.
 */
const OWNER = "owner";
const hostedProfile = (installationId: string, ownerId = OWNER) => ({
  profile: HOSTED_PROFILE, role: "OWNER", ownerId, installationId,
  relayOrigin: "https://relay.example.com", missionControlOrigin: "https://mc.example.com", servedOrigin: "https://sofie.example.com",
  build: { appId: "myeve-dashboard", lockSha256: "a".repeat(64), buildProfileDigest: "c".repeat(64), issuer: { keyId: "build-1", purpose: "STATIC_BUILD_PROVENANCE_V1", ownerId,
    factoryId: "f", factoryVersion: "d".repeat(64), buildProfileDigest: "c".repeat(64), publicKeyPem: "pem", spkiSha256: "e".repeat(64), notBefore: "2026-01-01T00:00:00.000Z",
    notAfter: "2099-01-01T00:00:00.000Z", revoked: false } },
  factory: { transport: "MAILBOX", factoryOrigin: "http://127.0.0.1:8792", verifierOrigin: "http://127.0.0.1:8795", relayOrigin: "http://127.0.0.1:8797",
    ownerScope: hostedOwnerScope({ installationId, ownerId }), spend: "METERED", qualificationMode: "LIVE" },
  verifier: { assurance: "PRIVATE_BETA_LOCAL", label: HOSTED_ASSURANCE_LABEL,
    keys: [{ keyId: "verifier-1", publicKeyPem: "pem", activeFrom: "2026-01-01T00:00:00Z", notAfter: "2099-01-01T00:00:00Z" }], producerKeyIds: ["producer-1"], producerPublicKeysPem: [] },
  limits: { perWorkMicrousd: 1_300_000, maxWorksPerPerson: 4, automaticIncrease: false },
});
const hostedEnv = (installationId: string) => ({ MYEVE_HOSTED_PROFILE: JSON.stringify(hostedProfile(installationId)) });

type Call = { sql: string; params: unknown[] };
function recordingDb(answer: (sql: string, params: unknown[]) => Array<Record<string, unknown>>) {
  const calls: Call[] = [];
  const query = async (sql: string, params: unknown[] = []) => { calls.push({ sql, params }); return answer(sql, params); };
  return { calls, database: { query, atomic: async <T>(body: (db: { query: typeof query }) => Promise<T>) => body({ query }) } };
}
const fixture = () => permitFixture({ ownerId: OWNER, workId: randomUUID(), workVersion: 1, workGeneration: 1, tupleSha256: "a".repeat(64), maxCostMicrousd: 1_300_000, maxDurationSeconds: 180 });
const capabilityOwnerParams = (calls: Call[]) => calls.filter(c => /set_config\('myeve\.capability_owner'/.test(c.sql)).map(c => c.params[0]);
const destinationOwners = (calls: Call[]) => calls.filter(c => /capability_control\.policy_destinations/.test(c.sql)).map(c => c.params[1]);

afterEach(() => { vi.unstubAllEnvs(); });

describe("capabilityOwnerId", () => {
  it("is the hosted per-person scope only for the hosted profile's own owner", () => {
    const env = hostedEnv("prj_hosted_owner");
    expect(capabilityOwnerId(OWNER, env)).toBe("myeve.hosted:prj_hosted_owner:owner");
    expect(capabilityOwnerId(OWNER, env)).not.toBe(OWNER);
    expect(capabilityOwnerId("someone-else", env)).toBe("someone-else");
  });
  it("is the plain owner id without a (valid) hosted profile", () => {
    expect(capabilityOwnerId(OWNER, {})).toBe(OWNER);
    expect(capabilityOwnerId(OWNER, { MYEVE_HOSTED_PROFILE: "{" })).toBe(OWNER);
    expect(capabilityOwnerId(OWNER, { ...hostedEnv("prj_hosted_owner"), MYEVE_OWNER_ID: "other" })).toBe(OWNER);
  });
});

describe("ownerFactoryCapabilityConfig: Factory- and Relay-facing identity", () => {
  const key = generateKeyPairSync("ec", { namedCurve: "P-256" }).publicKey.export({ format: "jwk" });
  const relayEnrollment = (f: ReturnType<typeof fixture>, ownerId: string) => ({ schema: "factory-relay-lease-enrollment/v1", ownerId,
    installationId: f.enrollment.installationId, connectionId: f.enrollment.connectionId, enrollmentRevision: 1, origin: "http://127.0.0.1:8797",
    activeFrom: Date.now() - 1000, expiresAt: Date.now() + 60_000, accountId: "acct_fixtureaccount", agentId: "agt_fixtureagent", runtimeClientId: "rtc_fixtureruntime",
    taskId: "tsk_fixturetask", workloadId: "wkl_fixtureworkload", audience: "fixture-audience", capability: { name: "resource.lease.execute", version: "1.0" },
    resource: { type: "target", ids: ["synthetic"] }, parameters: {}, relayKey: { keyId: "relay-test-key", jwk: { kty: "EC", crv: "P-256", x: key.x!, y: key.y! } } });
  const assemble = (f: ReturnType<typeof fixture>, opts: { capabilityOwnerId?: string; relayOwner: string; destinationOwner: string }) => {
    const db = recordingDb((sql, params) => {
      if (/missioncontrol_owner_enrollments/.test(sql)) return params[0] === OWNER ? [{ document: f.enrollment }] : [];
      if (/capability_control\.installations/.test(sql)) return [{ organization_id: "org" }];
      if (/capability_control\.policy_destinations/.test(sql)) return params[1] === opts.destinationOwner ? [{ key_id: "k", public_jwk: {}, incarnation: "inc", enrollment_version: 1 }] : [];
      return [];
    });
    const store = { principal: { scopeId: OWNER, scopeKind: "personal", actorId: OWNER }, database: db.database } as never;
    const runtimeConfig = async () => ({ connection: { origin: "http://127.0.0.1:8792", repositoryPath: "/r", factoryId: "f", factoryVersion: "d".repeat(64),
      sourceDigest: "1".repeat(64), configurationDigest: "2".repeat(64) }, engineering: { agentId: "agent" } }) as never;
    const enrollment = relayEnrollment(f, opts.relayOwner);
    const run = () => ownerFactoryCapabilityConfig({ store, runtimeConfig, clientId: "client", backendId: "factory", missionId: "mission",
      signer: { keyId: "s", jwk: {} } as never, ownerLocalRelayLoopback: true, send: vi.fn() as never,
      relay: { enrollment, enrollmentSha256: factoryRelayLeaseEnrollmentDigest(enrollment, { ownerLocalLoopback: true }), revision: 1, credential: "cred", workloadIdentityToken: "tok" },
      ...(opts.capabilityOwnerId === undefined ? {} : { capabilityOwnerId: opts.capabilityOwnerId }) });
    return { db, run };
  };

  it("hosted: capability rows, Relay enrollment and the client binding use the scope; the MissionControl enrollment stays on the owner", async () => {
    const f = fixture(), scope = hostedOwnerScope({ installationId: f.enrollment.installationId, ownerId: OWNER });
    const { db, run } = assemble(f, { capabilityOwnerId: scope, relayOwner: scope, destinationOwner: scope });
    const config = await run();
    expect(config.binding.ownerId).toBe(scope);
    expect(capabilityOwnerParams(db.calls)).toEqual([scope]);
    expect(destinationOwners(db.calls)).toEqual([scope]);
    expect(db.calls.find(c => /missioncontrol_owner_enrollments/.test(c.sql))?.params).toEqual([OWNER]);
    expect(db.calls.find(c => /set_config\('myeve\.missioncontrol_owner'/.test(c.sql))?.params).toEqual([OWNER]);
  });
  it("hosted: a Relay enrollment or capability rows still on the plain owner id are refused", async () => {
    const f = fixture(), scope = hostedOwnerScope({ installationId: f.enrollment.installationId, ownerId: OWNER });
    await expect(assemble(f, { capabilityOwnerId: scope, relayOwner: OWNER, destinationOwner: scope }).run()).rejects.toThrow("FACTORY_RELAY_ENROLLMENT_CHANGED");
    await expect(assemble(f, { capabilityOwnerId: scope, relayOwner: scope, destinationOwner: OWNER }).run()).rejects.toThrow("QDEV_ASSEMBLY_CAPABILITY_DESTINATION");
  });
  it("owner-local (no capabilityOwnerId): unchanged, every identity is the plain owner id, even with a hosted profile in the environment", async () => {
    const f = fixture();
    vi.stubEnv("MYEVE_HOSTED_PROFILE", hostedEnv(f.enrollment.installationId).MYEVE_HOSTED_PROFILE);
    const { db, run } = assemble(f, { relayOwner: OWNER, destinationOwner: OWNER });
    const config = await run();
    expect(config.binding.ownerId).toBe(OWNER);
    expect(capabilityOwnerParams(db.calls)).toEqual([OWNER]);
    expect(destinationOwners(db.calls)).toEqual([OWNER]);
    expect(JSON.stringify(db.calls)).not.toContain("myeve.hosted:");
    const scope = hostedOwnerScope({ installationId: f.enrollment.installationId, ownerId: OWNER });
    await expect(assemble(f, { relayOwner: scope, destinationOwner: OWNER }).run()).rejects.toThrow("FACTORY_RELAY_ENROLLMENT_CHANGED");
  });
});

describe("MissionControl capability path", () => {
  const sourceEnv = (f: ReturnType<typeof fixture>, extra: Record<string, string> = {}) => ({ NODE_ENV: "test" as const, MYEVE_MISSIONCONTROL_MODE: "APPROVED_NONPRODUCTION",
    MYEVE_CAPABILITY_CONTROL_ENABLED: "true", MYEVE_CAPABILITY_ENVIRONMENT: "qualification", MYEVE_CAPABILITY_INSTALLATION_ID: f.enrollment.installationId,
    MYEVE_OWNER_ID: OWNER, MYEVE_MISSIONCONTROL_CAPABILITY_BACKEND_ID: "mc", MYEVE_MISSIONCONTROL_CAPABILITY_AGENT_ID: "agt_fixtureagent",
    MYEVE_CAPABILITY_PROPAGATION_JSON: JSON.stringify({ signer: { keyId: "s", jwk: {} } }), ...extra });
  const issue = async (f: ReturnType<typeof fixture>, env: NodeJS.ProcessEnv) => {
    const db = recordingDb(sql => /capability_control\.installations/.test(sql) ? [{ organization_id: "org" }] : []);
    await expect(issueMissionControlSourcePermit(db.database as never, f.enrollment, { keyId: "k", message: "{}", signature: "s" }, env)).rejects.toThrow("MISSIONCONTROL_CAPABILITY_UNAVAILABLE");
    return db.calls;
  };
  it("source permit issuer reads capability rows under the scope when hosted, the owner id otherwise", async () => {
    const f = fixture(), scope = hostedOwnerScope({ installationId: f.enrollment.installationId, ownerId: OWNER });
    const hosted = await issue(f, sourceEnv(f, hostedEnv(f.enrollment.installationId)));
    expect(capabilityOwnerParams(hosted)).toEqual([scope]);
    expect(destinationOwners(hosted)).toEqual([scope]);
    const local = await issue(f, sourceEnv(f));
    expect(capabilityOwnerParams(local)).toEqual([OWNER]);
    expect(destinationOwners(local)).toEqual([OWNER]);
  });

  const relayFixture = (f: ReturnType<typeof fixture>, ownerId: string) => {
    const keys = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const c = { schema: "mc-relay-lease-enrollment/v1", ownerId, installationId: f.enrollment.installationId, connectionId: f.enrollment.connectionId,
      enrollmentRevision: 1, origin: "https://relay.example.test", activeFrom: Date.now() - 1000, expiresAt: Date.now() + 60_000,
      accountId: "acct_fixtureaccount", agentId: "agt_fixtureagent", runtimeClientId: "rtc_fixtureruntime", taskId: "tsk_fixturetask", workloadId: "wkl_fixtureworkload",
      audience: "fixture-audience", capability: { name: "resource.lease.execute", version: "1.0" }, resource: { type: "target", ids: ["synthetic"] }, parameters: {},
      relayKey: { keyId: "relay-test-key", jwk: ((({ kty, crv, x, y }) => ({ kty, crv, x, y }))(keys.publicKey.export({ format: "jwk" }))) } };
    const enrollment = { ...f.enrollment, relayLeaseEnrollmentSha256: relayLeaseEnrollmentDigest(c) };
    const env = { NODE_ENV: "test" as const, MYEVE_MISSIONCONTROL_MODE: "APPROVED_NONPRODUCTION", MYEVE_OWNER_ID: OWNER, MYEVE_MISSIONCONTROL_RELAY_LEASE_JSON: JSON.stringify(c),
      MYEVE_MISSIONCONTROL_RELAY_RUNTIME_CREDENTIAL: "synthetic-runtime-credential", MYEVE_MISSIONCONTROL_RELAY_WORKLOAD_TOKEN: "synthetic-workload-token" };
    return { enrollment, env };
  };
  it("Relay lease enrollment must name the scope when hosted and the owner id otherwise", () => {
    const f = fixture(), scope = hostedOwnerScope({ installationId: f.enrollment.installationId, ownerId: OWNER }), hosted = hostedEnv(f.enrollment.installationId);
    const s = relayFixture(f, scope), o = relayFixture(f, OWNER);
    expect(installedRelayLeaseConfig(s.enrollment, { ...s.env, ...hosted }).enrollment.ownerId).toBe(scope);
    expect(() => installedRelayLeaseConfig(o.enrollment, { ...o.env, ...hosted })).toThrow("MISSIONCONTROL_RELAY_ENROLLMENT_CHANGED");
    expect(installedRelayLeaseConfig(o.enrollment, o.env).enrollment.ownerId).toBe(OWNER);
    expect(() => installedRelayLeaseConfig(s.enrollment, s.env)).toThrow("MISSIONCONTROL_RELAY_ENROLLMENT_CHANGED");
  });

  const receive = async (f: ReturnType<typeof fixture>, sourceOwner: string) => {
    const permit = { kind: "PERMIT", authority: "myeve", ownerId: sourceOwner, organizationId: "org", installationId: f.enrollment.installationId,
      backendId: "mc", incarnation: "incarnation", enrollmentVersion: 1, version: 1, policyId: "source-policy", referenceId: randomUUID(),
      capabilityId: "enterprise.fleet", requiredCapabilities: ["work", "missioncontrol", "enterprise.fleet"], registryVersion: "registry", agentId: "agt_fixtureagent",
      agentRevision: 1, workId: f.document.work.id, missionId: f.document.missionId, workGeneration: 1, actionDigest: "b".repeat(64), budgetMicros: 1_300_000,
      issuedAt: Date.now() - 1, expiresAt: Date.now() + 28_000, sourcePermitHash: "SELF" };
    const pair = { myeve: { keyId: "k", signature: "s", message: JSON.stringify(permit) },
      relay: { keyId: "k", signature: "s", message: JSON.stringify({ ...permit, authority: "relay", sourcePermitHash: "c".repeat(64) }) } };
    const db = recordingDb(sql => /missioncontrol_enrollment_document/.test(sql) ? [{ document: f.enrollment }]
      : /txid_current/.test(sql) ? [{ transaction_id: "1" }] : /pg_roles/.test(sql) ? [{ unsafe: false }] : []);
    const bindings = new MissionControlBindings(db.database as never, OWNER);
    const error = await bindings.acceptInTransaction(db.database as never, {}, {}, { commandId: "c", challenge: "x" }, pair, f.document.work.id, "repo")
      .then(() => null, (e: Error) => e);
    return { bindings, calls: db.calls, error };
  };
  it("hosted MissionControl bindings: source permit owner, admission scope and policy fence use the scope; enrollment stays on the owner", async () => {
    const f = fixture(), scope = hostedOwnerScope({ installationId: f.enrollment.installationId, ownerId: OWNER });
    vi.stubEnv("MYEVE_OWNER_ID", OWNER);
    vi.stubEnv("MYEVE_HOSTED_PROFILE", hostedEnv(f.enrollment.installationId).MYEVE_HOSTED_PROFILE);
    const ok = await receive(f, scope);
    expect(ok.bindings.ownerId).toBe(OWNER);
    expect(ok.bindings.capabilityOwnerId).toBe(scope);
    expect(ok.calls.find(c => /missioncontrol_enrollment_document/.test(c.sql))?.params).toEqual([OWNER]);
    expect(capabilityOwnerParams(ok.calls)[0]).toBe(scope);
    expect(capabilityOwnerParams(ok.calls)).not.toContain(OWNER);
    const plain = await receive(f, OWNER);
    expect(plain.error?.message).toBe("MISSIONCONTROL_BINDING_DENIED");
    expect(capabilityOwnerParams(plain.calls)).toEqual([]);
  });
  it("owner-local MissionControl bindings: unchanged, the owner id throughout", async () => {
    const f = fixture(), scope = hostedOwnerScope({ installationId: f.enrollment.installationId, ownerId: OWNER });
    vi.stubEnv("MYEVE_HOSTED_PROFILE", "");
    const ok = await receive(f, OWNER);
    expect(ok.bindings.capabilityOwnerId).toBe(OWNER);
    expect(capabilityOwnerParams(ok.calls)[0]).toBe(OWNER);
    expect(JSON.stringify(ok.calls)).not.toContain("myeve.hosted:");
    expect((await receive(f, scope)).error?.message).toBe("MISSIONCONTROL_BINDING_DENIED");
  });
});

describe("policy propagation scope", () => {
  const stubCapabilityEnv = () => {
    vi.stubEnv("MYEVE_CAPABILITY_CONTROL_ENABLED", "true");
    vi.stubEnv("MYEVE_CAPABILITY_INSTALLATION_ID", "prj_hosted_owner");
    vi.stubEnv("MYEVE_CAPABILITY_ENVIRONMENT", "qualification");
    vi.stubEnv("MYEVE_CAPABILITY_DATABASE_URL", "postgres://fixture@127.0.0.1:1/none");
    vi.stubEnv("MYEVE_CAPABILITY_ORIGIN", "https://sofie.example.com");
    vi.stubEnv("VERCEL", ""); vi.stubEnv("VERCEL_ENV", "");
  };
  afterEach(async () => { await closeCapabilityDatabase(); });
  it("capability store (rows, commands, propagation) acts as the hosted scope; owner-local keeps the owner id", () => {
    stubCapabilityEnv();
    vi.stubEnv("MYEVE_OWNER_ID", OWNER);
    vi.stubEnv("MYEVE_HOSTED_PROFILE", hostedEnv("prj_hosted_owner").MYEVE_HOSTED_PROFILE);
    expect(capabilityStore({ ownerId: OWNER, source: "settings" }).actor).toEqual({ ownerId: "myeve.hosted:prj_hosted_owner:owner", source: "settings" });
    vi.stubEnv("MYEVE_HOSTED_PROFILE", "");
    expect(capabilityStore({ ownerId: OWNER, source: "sofie" }).actor).toEqual({ ownerId: OWNER, source: "sofie" });
  });
});

it("the DB capability fence migration only replaces the snapshot function body and resolves only hosted-scope rows", async () => {
  const sql = await readFile(new URL("../../migrations/0113_hosted_capability_owner_scope.sql", import.meta.url), "utf8");
  const code = sql.split("\n").filter(line => !line.startsWith("--")).join("\n");
  expect(code).toMatch(/CREATE OR REPLACE FUNCTION missioncontrol_capability_snapshot\(p_owner text,p_installation text,p_agent text,p_backend text\)/);
  expect(code).not.toMatch(/\b(ALTER|INSERT|UPDATE|DELETE|DROP|TRUNCATE|CREATE TABLE)\b/i);
  expect(code).toContain("v_scope := 'myeve.hosted:'||p_installation||':'||p_owner;");
  expect(hostedOwnerScope({ installationId: "inst", ownerId: OWNER })).toBe("myeve.hosted:inst:owner");
});
