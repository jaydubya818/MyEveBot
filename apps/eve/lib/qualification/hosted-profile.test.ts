import { expect, it, vi } from "vitest";
import { fixture } from "../../test/engineering-fixtures.ts";
import { engineeringConfig } from "../engineering/runtime.ts";
import { factoryExecutionConfigurationHash } from "../engineering/factory-configuration-hash.ts";
import { assertOwnerFactoryConfiguration, ownerFactoryWorkTuple } from "../missioncontrol/owner-factory-binding.ts";
import { permitFixture } from "../missioncontrol/permit-test-fixture.ts";
import { readHostedFactoryRuntime } from "./hosted-custody.ts";
import { digest } from "../engineering/contract.ts";
import { isMailboxFetch } from "../engineering/factory-mailbox.ts";
import { HOSTED_ASSURANCE_LABEL, HOSTED_PROFILE, hostedOwnerScope, hostedProfileFromEnv, hostedProfileSchema, hostedTransports, requireHostedFactoryConnection, requireHostedPolicy } from "./hosted-profile.ts";
import { PRIVATE_BETA_PROFILE } from "./journey-profile.ts";

export const hostedProfileFixture = (over: Record<string, unknown> = {}) => ({
  profile: HOSTED_PROFILE, role: "OWNER", ownerId: "jay", installationId: "prj_hosted_owner",
  relayOrigin: "https://relay.example.com", missionControlOrigin: "https://mc.example.com", servedOrigin: "https://sofie.example.com",
  build: { appId: "myeve-dashboard", lockSha256: "a".repeat(64), buildProfileDigest: "c".repeat(64), issuer: { keyId: "build-1", purpose: "STATIC_BUILD_PROVENANCE_V1", ownerId: "jay",
    factoryId: "f", factoryVersion: "d".repeat(64), buildProfileDigest: "c".repeat(64), publicKeyPem: "pem", spkiSha256: "e".repeat(64), notBefore: "2026-01-01T00:00:00.000Z",
    notAfter: "2099-01-01T00:00:00.000Z", revoked: false } },
  factory: { transport: "MAILBOX", factoryOrigin: "http://127.0.0.1:8792", verifierOrigin: "http://127.0.0.1:8795", ownerScope: "myeve.hosted:prj_hosted_owner:jay", spend: "METERED", qualificationMode: "LIVE" },
  verifier: { assurance: "PRIVATE_BETA_LOCAL", label: HOSTED_ASSURANCE_LABEL,
    keys: [{ keyId: "verifier-1", publicKeyPem: "pem", activeFrom: "2026-01-01T00:00:00Z", notAfter: "2099-01-01T00:00:00Z" }], producerKeyIds: ["producer-1"], producerPublicKeysPem: [] },
  limits: { perWorkMicrousd: 1_300_000, maxWorksPerPerson: 4, automaticIncrease: false },
  ...over,
});
const h = (c: string) => c.repeat(64), sourceDigest = h("1"), configurationDigest = h("2");
const hostedQualification = () => ({
  scopeId: "myeve.hosted:prj_hosted_owner:jay", profileHash: h("3"), evidenceRef: "ev",
  qualifiedAt: "2026-01-01T00:00:00Z", expiresAt: "2099-01-01T00:00:00Z", mode: "LIVE", spendEnforced: true,
});
const connection = (over: Record<string, unknown> = {}, mode = "LIVE", scopeId = "myeve.hosted:prj_hosted_owner:jay") => ({ origin: "http://127.0.0.1:8792", token: h("a"), factoryId: "f", sourceDigest, configurationDigest,
  factoryVersion: digest({ sourceDigest, configurationDigest }), repositoryPath: "/Users/owner/repo",
  keys: [{ factoryId: "f", keyId: "k", publicKey: "pem", activeFrom: "2026-01-01T00:00:00Z", notAfter: "2099-01-01T00:00:00Z" }],
  spendContract: { version: "WORK_LEDGER_V2", sourceDigest },
  qualification: { scopeId, profileHash: h("3"), evidenceRef: "ev", qualifiedAt: "2026-01-01T00:00:00Z", expiresAt: "2099-01-01T00:00:00Z", mode, spendEnforced: true }, ...over } as never);

it("is a profile of its own, distinct from the owner-local private-beta profile", () => {
  expect(HOSTED_PROFILE).not.toBe(PRIVATE_BETA_PROFILE);
  expect(hostedProfileSchema.safeParse(hostedProfileFixture()).success).toBe(true);
  expect(hostedProfileSchema.safeParse(hostedProfileFixture({ profile: PRIVATE_BETA_PROFILE })).success).toBe(false);
});

it("requires https Relay and MissionControl (never loopback or a local .invalid issuer)", () => {
  for (const origin of ["http://relay.example.com", "http://127.0.0.1:8790", "https://127.0.0.1", "https://localhost", "https://owner-local-identity.myeve.invalid", "https://relay.example.com/path"]) {
    expect(hostedProfileSchema.safeParse(hostedProfileFixture({ relayOrigin: origin })).success, origin).toBe(false);
    expect(hostedProfileSchema.safeParse(hostedProfileFixture({ missionControlOrigin: origin })).success, origin).toBe(false);
  }
});

it("requires the mailbox transport, metered spend, the labelled local assurance and the fixed limits (no automatic increase)", () => {
  const f = hostedProfileFixture().factory, v = hostedProfileFixture().verifier;
  for (const factory of [{ ...f, transport: "LOOPBACK" }, { ...f, spend: "SUBSCRIPTION_UNMETERED" }, { ...f, qualificationMode: "OWNER_SUBSCRIPTION_LOCAL" },
    { ...f, factoryOrigin: "https://factory.example.com" }, { ...f, verifierOrigin: f.factoryOrigin }])
    expect(hostedProfileSchema.safeParse(hostedProfileFixture({ factory })).success, JSON.stringify(factory)).toBe(false);
  for (const verifier of [{ ...v, assurance: "INDEPENDENT" }, { ...v, label: "independent custody" }])
    expect(hostedProfileSchema.safeParse(hostedProfileFixture({ verifier })).success).toBe(false);
  for (const limits of [{ perWorkMicrousd: 1_300_001, maxWorksPerPerson: 4, automaticIncrease: false }, { perWorkMicrousd: 1_300_000, maxWorksPerPerson: 5, automaticIncrease: false },
    { perWorkMicrousd: 1_300_000, maxWorksPerPerson: 4, automaticIncrease: true }])
    expect(hostedProfileSchema.safeParse(hostedProfileFixture({ limits })).success, JSON.stringify(limits)).toBe(false);
  expect(HOSTED_ASSURANCE_LABEL).toBe("automated checks on the owner's machine, not independent custody");
});

it("reads the profile only from MYEVE_HOSTED_PROFILE and only for the deployment owner", () => {
  expect(hostedProfileFromEnv({})).toBeNull();
  expect(hostedProfileFromEnv({ MYEVE_HOSTED_PROFILE: "{bad" })).toBeNull();
  expect(hostedProfileFromEnv({ MYEVE_HOSTED_PROFILE: JSON.stringify(hostedProfileFixture()), MYEVE_OWNER_ID: "jay" })?.ownerId).toBe("jay");
  expect(hostedProfileFromEnv({ MYEVE_HOSTED_PROFILE: JSON.stringify(hostedProfileFixture()), MYEVE_OWNER_ID: "someone-else" })).toBeNull();
});

it("accepts only the metered LIVE loopback Factory connection at the profile origin, with enforced spend and a Work ledger contract", () => {
  const profile = hostedProfileSchema.parse(hostedProfileFixture());
  expect(() => requireHostedFactoryConnection(profile, connection())).not.toThrow();
  expect(() => requireHostedFactoryConnection(profile, connection({}, "OWNER_SUBSCRIPTION_LOCAL"))).toThrow("HOSTED_FACTORY_METERED_ONLY");
  expect(() => requireHostedFactoryConnection(profile, connection({ origin: "http://127.0.0.1:9000" }))).toThrow("HOSTED_FACTORY_ORIGIN");
  expect(() => requireHostedFactoryConnection(profile, connection({ spendContract: undefined }))).toThrow("HOSTED_FACTORY_SPEND_CONTRACT");
  const transports = hostedTransports(profile, { query: async () => [] }, connection());
  expect([transports.factoryFetch, transports.capabilityFetch, transports.verifierFetch].every(isMailboxFetch)).toBe(true);
  expect(transports.assurance).toEqual({ assurance: "PRIVATE_BETA_LOCAL", label: HOSTED_ASSURANCE_LABEL });
});

it("refuses any accounting policy above $1.30 per Work, 4 Works per person or $5.20 in total", () => {
  const profile = hostedProfileSchema.parse(hostedProfileFixture());
  const policy = (limits: Partial<Record<string, number>>) => ({ ownerId: "jay", limits: { journeyMicrousd: 5_200_000, perWorkMicrousd: 1_300_000, maxWorks: 4, concurrency: 1, ...limits } }) as never;
  expect(() => requireHostedPolicy(profile, policy({}))).not.toThrow();
  for (const limits of [{ perWorkMicrousd: 1_300_001 }, { maxWorks: 5 }, { journeyMicrousd: 5_200_001 }] as Array<Partial<Record<string, number>>>) expect(() => requireHostedPolicy(profile, policy(limits))).toThrow("HOSTED_POLICY_LIMITS");
  expect(() => requireHostedPolicy(profile, { ...(policy({}) as object), ownerId: "other" } as never)).toThrow("HOSTED_POLICY_OWNER");
});

it("gives each person (owner, Tester 1, Tester 2) a distinct, stable Factory ownerScope and refuses any other scope", () => {
  const people = [["jay", "prj_hosted_owner"], ["tester-1", "prj_hosted_tester_1"], ["tester-2", "prj_hosted_tester_2"]];
  const scopes = people.map(([ownerId, installationId]) => hostedOwnerScope({ ownerId, installationId }));
  expect(new Set(scopes).size).toBe(3);
  expect(hostedOwnerScope({ ownerId: "jay", installationId: "prj_hosted_owner" })).toBe(scopes[0]);
  for (const [i, [ownerId, installationId]] of people.entries()) {
    const fixture = hostedProfileFixture({ ownerId, installationId, factory: { ...hostedProfileFixture().factory, ownerScope: scopes[i] } });
    fixture.build = { ...fixture.build, issuer: { ...fixture.build.issuer, ownerId } };
    expect(hostedProfileSchema.safeParse(fixture).success, ownerId).toBe(true);
    expect(hostedProfileSchema.safeParse({ ...fixture, factory: { ...fixture.factory, ownerScope: scopes[(i + 1) % 3] } }).success).toBe(false);
  }
  const profile = hostedProfileSchema.parse(hostedProfileFixture());
  expect(() => requireHostedFactoryConnection(profile, connection({}, "LIVE", scopes[1]))).toThrow("HOSTED_FACTORY_OWNER_SCOPE");
  expect(() => requireHostedFactoryConnection(profile, connection({ evidence: { ownerScope: scopes[2], token: h("b"), expiresAt: "2099-01-01T00:00:00Z" } }))).toThrow("HOSTED_FACTORY_OWNER_SCOPE");
});

it("loads the hosted Factory runtime in production and requires the installation scope at permit preparation", async () => {
  const hosted = hostedProfileSchema.parse(hostedProfileFixture());
  const example = fixture();
  const work = { ...example.work, scopeId: hosted.ownerId, maxCostUsd: 1.3, maxDurationSeconds: 180 };
  const profile = { ...example.profile, executor: "factory-cloud" };
  const profileHash = digest(profile);
  const engineering = { mode: "production-cloud", ownerId: work.scopeId, agentId: "sofie", model: "none",
    objective: work.objective, criteria: work.criteria, profile,
    approvedBase: { sha: "a".repeat(40), files: [{ path: "package.json", sha256: "b".repeat(64) }] } };
  const raw = { engineering, connection: connection({ qualification: { ...hostedQualification(), profileHash } }),
    routing: { intent: "PRODUCE" }, commands: ["npm run build"] };
  const { enrollment: fixtureEnrollment, now } = permitFixture({
    ownerId: work.scopeId, workId: work.id, workVersion: work.version, workGeneration: work.generation,
    tupleSha256: "a".repeat(64), maxCostMicrousd: 1_300_000, maxDurationSeconds: 180,
  });

  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("MYEVE_HOSTED_PROFILE", JSON.stringify(hosted));
  try {
    await expect(engineeringConfig()).rejects.toMatchObject({ code: "engineering_disabled" });
    const config = readHostedFactoryRuntime(JSON.stringify(raw), hosted);
    const enrollmentFor = (runtime: typeof config) => ({
      ...fixtureEnrollment, installationId: hosted.installationId, factoryVersion: runtime.connection.factoryVersion,
      ownerFactoryAdapter: { repository: work.repository, agentId: config.engineering.agentId, factoryId: runtime.connection.factoryId,
        sourceDigest, configurationDigest, configurationHash: factoryExecutionConfigurationHash(runtime), profileHash },
    });
    const enrollment = enrollmentFor(config);
    expect(assertOwnerFactoryConfiguration(work, enrollment, config, now)).toBe(ownerFactoryWorkTuple(work, enrollment));
    expect(() => assertOwnerFactoryConfiguration(work, { ...enrollment, installationId: "foreign" }, config, now)).toThrow("MISSIONCONTROL_OWNER_FACTORY_BINDING_DENIED");
    const local = { ...config, connection: { ...config.connection, qualification: { ...config.connection.qualification, scopeId: work.scopeId } } } as typeof config;
    expect(() => assertOwnerFactoryConfiguration(work, enrollmentFor(local), local, now)).toThrow("MISSIONCONTROL_OWNER_FACTORY_BINDING_DENIED");
    expect(() => readHostedFactoryRuntime(JSON.stringify({ ...raw, engineering: { ...engineering, ownerId: "foreign" } }), hosted)).toThrow("HOSTED_FACTORY_RUNTIME_BINDING");
    expect(() => readHostedFactoryRuntime(undefined, hosted)).toThrow("HOSTED_FACTORY_RUNTIME_REQUIRED");
    vi.stubEnv("MYEVE_HOSTED_PROFILE", "");
    expect(assertOwnerFactoryConfiguration(work, enrollmentFor(local), local, now)).toBeTruthy();
  } finally {
    vi.unstubAllEnvs();
  }
});
