import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Blocker 3 (module-mocked half): the Factory source permit issuer and MyEve's own capability Work admission present the hosted scope as the
 * capability owner, while Work, routing, MissionControl and the primary-agent check stay on the plain owner id. Scope !== owner id throughout.
 */
const OWNER = "owner", SCOPE = "myeve.hosted:prj_hosted_owner:owner";
const m = vi.hoisted(() => ({
  issueBackendOrderedPermit: vi.fn(async () => ({ keyId: "k", message: "{}", signature: "s" })),
  withCapabilityAdmission: vi.fn(async (_c: unknown, _scope: unknown, _r: unknown, admit: (e: Record<string, unknown>) => Promise<unknown>) => admit({})),
}));
vi.mock("../../../../packages/capability-enforcement/src/ordering-source.ts", () => ({ issueBackendOrderedPermit: m.issueBackendOrderedPermit }));
vi.mock("../../../../packages/capability-enforcement/src/ordering-wire.ts", async original => ({ ...(await original<object>()),
  verifyPolicyMessage: vi.fn(async () => ({ kind: "CHALLENGE", capabilityId: "myfactory", agentId: "agent", workId: "w", workGeneration: 1, missionId: "mission",
    actionDigest: "action", budgetMicros: 1_000_000, expiresAt: 1 })),
  admissionActionDigest: vi.fn(async () => "action") }));
vi.mock("../missioncontrol/execution-permit.ts", async original => ({ ...(await original<object>()),
  verifyExecutionPermit: vi.fn(() => ({ document: { admission: { factoryVersion: "fv" }, missionId: "mission", expiresAt: 2 } })) }));
vi.mock("../missioncontrol/owner-factory-binding.ts", async original => ({ ...(await original<object>()),
  assertOwnerFactoryConfiguration: vi.fn(() => "tuple"),
  ownerFactoryOrigin: vi.fn(async () => ({ work_version: 1, work_generation: 1, document: { tupleSha256: "tuple" } })) }));
vi.mock("../engineering/factory-preparation-terminal.ts", () => ({ factoryPreparationForGeneration: vi.fn(async () => null) }));
vi.mock("../engineering/store.ts", async original => ({ ...(await original<object>()),
  WorkStore: class { constructor(readonly principal: unknown, readonly database: unknown) {} async get(id: string) { return { id, version: 1, generation: 1 }; } } }));
vi.mock("@myeve/capability-enforcement", async original => ({ ...(await original<object>()), withCapabilityAdmission: m.withCapabilityAdmission }));
vi.mock("./runtime.ts", () => ({ capabilityConfiguration: () => ({ id: "prj_hosted_owner", environment: "qualification" }) }));

const { issueFactorySourcePermit } = await import("../engineering/factory-capability-source.ts");
const { admitCapabilityWork } = await import("./admission.ts");
const { HOSTED_PROFILE } = await import("../engineering/factory-mailbox.ts");
const { HOSTED_ASSURANCE_LABEL } = await import("../qualification/hosted-profile.ts");

type Call = { sql: string; params: unknown[] };
function recordingStore(answer: (sql: string, params: unknown[]) => Array<Record<string, unknown>>) {
  const calls: Call[] = [];
  const query = async (sql: string, params: unknown[] = []) => { calls.push({ sql, params }); return answer(sql, params); };
  const database = { query, atomic: async <T>(body: (db: { query: typeof query }) => Promise<T>) => body({ query }) };
  return { calls, store: { principal: { scopeId: OWNER, scopeKind: "personal", actorId: OWNER }, database } as never };
}
const capabilityOwnerParams = (calls: Call[]) => calls.filter(c => /set_config\('myeve\.capability_owner'/.test(c.sql)).map(c => c.params[0]);

afterEach(() => { vi.unstubAllEnvs(); m.issueBackendOrderedPermit.mockClear(); m.withCapabilityAdmission.mockClear(); });

describe("issueFactorySourcePermit (Factory-facing source permit)", () => {
  const request = { requestId: "req", workId: "w", workGeneration: 1, maxSpendUsd: 1, input: { repositoryPath: "/r", workerProfile: "mac" } };
  const config = { connection: { repositoryPath: "/r", factoryId: "f", factoryVersion: "fv", sourceDigest: "s", configurationDigest: "c" }, engineering: { agentId: "agent" } } as never;
  const enrollment = { ownerId: OWNER, installationId: "prj_hosted_owner" } as never;
  const issue = (capabilityOwner: string | undefined, destinationOwner: string) => {
    const r = recordingStore((sql, params) => {
      if (/engineering_routing_decisions/.test(sql)) return params[0] === OWNER ? [{ factory_preparation: { request, terminal: false } }] : [];
      if (/capability_control\.installations/.test(sql)) return [{ organization_id: "org" }];
      if (/capability_control\.policy_destinations/.test(sql)) return params[1] === destinationOwner ? [{ key_id: "k", public_jwk: {}, incarnation: "inc", enrollment_version: 1 }] : [];
      return [];
    });
    const args = [r.store, config, enrollment, "factory", { keyId: "s", jwk: {} } as never, { keyId: "k", message: "{}", signature: "s" }, request, {} as never] as const;
    const result = capabilityOwner === undefined ? issueFactorySourcePermit(...args) : issueFactorySourcePermit(...args, capabilityOwner);
    return { calls: r.calls, result };
  };
  it("hosted: the capability rows and the signed permit owner are the scope; Work, routing and MissionControl stay on the owner", async () => {
    const { calls, result } = issue(SCOPE, SCOPE);
    await result;
    expect(m.issueBackendOrderedPermit).toHaveBeenCalledTimes(1);
    expect((m.issueBackendOrderedPermit.mock.calls[0] as unknown[])[2]).toMatchObject({ ownerId: SCOPE, installationId: "prj_hosted_owner", agentId: "agent" });
    expect(capabilityOwnerParams(calls).at(-1)).toBe(SCOPE);
    expect(calls.find(c => /missioncontrol_owner/.test(c.sql))?.params[0]).toBe(OWNER);
    expect(calls.find(c => /engineering_routing_decisions/.test(c.sql))?.params[0]).toBe(OWNER);
    expect(calls.find(c => /policy_destinations/.test(c.sql))?.params[1]).toBe(SCOPE);
  });
  it("hosted: capability rows still keyed on the plain owner are refused", async () => {
    await expect(issue(SCOPE, OWNER).result).rejects.toThrow("FACTORY_SOURCE_DESTINATION");
    expect(m.issueBackendOrderedPermit).not.toHaveBeenCalled();
  });
  it("owner-local (default): unchanged, the owner id and the exact original statement sequence", async () => {
    const { calls, result } = issue(undefined, OWNER);
    await result;
    expect((m.issueBackendOrderedPermit.mock.calls[0] as unknown[])[2]).toMatchObject({ ownerId: OWNER });
    expect(calls.filter(c => /set_config/.test(c.sql))).toEqual([{ sql: "SELECT set_config('myeve.missioncontrol_owner',$1,true),set_config('myeve.capability_owner',$1,true),set_config('myeve.capability_installation',$2,true)",
      params: [OWNER, "prj_hosted_owner"] }]);
    expect(JSON.stringify(calls)).not.toContain("myeve.hosted:");
  });
});

describe("admitCapabilityWork (MyEve capability admission of a Work)", () => {
  const admit = async () => {
    const r = recordingStore((sql, params) => /capability_control\.installations/.test(sql) ? [{ organization_id: "org" }]
      : /FROM agents/.test(sql) ? (params[0] === OWNER ? [{ id: "agent" }] : []) : []);
    const work = { id: "w", scopeId: OWNER, generation: 1 } as never;
    const out = await admitCapabilityWork(r.store, work, "myfactory", "agent", 1.3, async () => "admitted");
    return { calls: r.calls, out, scope: (m.withCapabilityAdmission.mock.calls[0] as unknown[])[1] as { ownerId: string } };
  };
  it("hosted: the capability scope is the per-person scope; the Work and primary-agent checks stay on the owner", async () => {
    vi.stubEnv("MYEVE_OWNER_ID", OWNER);
    vi.stubEnv("MYEVE_HOSTED_PROFILE", JSON.stringify({ profile: HOSTED_PROFILE, role: "OWNER", ownerId: OWNER, installationId: "prj_hosted_owner",
      relayOrigin: "https://relay.example.com", missionControlOrigin: "https://mc.example.com", servedOrigin: "https://sofie.example.com",
      build: { appId: "myeve-dashboard", lockSha256: "a".repeat(64), buildProfileDigest: "c".repeat(64), issuer: { keyId: "build-1", purpose: "STATIC_BUILD_PROVENANCE_V1", ownerId: OWNER,
        factoryId: "f", factoryVersion: "d".repeat(64), buildProfileDigest: "c".repeat(64), publicKeyPem: "pem", spkiSha256: "e".repeat(64), notBefore: "2026-01-01T00:00:00.000Z",
        notAfter: "2099-01-01T00:00:00.000Z", revoked: false } },
      factory: { transport: "MAILBOX", factoryOrigin: "http://127.0.0.1:8792", verifierOrigin: "http://127.0.0.1:8795", relayOrigin: "http://127.0.0.1:8797", ownerScope: SCOPE, spend: "METERED", qualificationMode: "LIVE" },
      verifier: { assurance: "PRIVATE_BETA_LOCAL", label: HOSTED_ASSURANCE_LABEL,
        keys: [{ keyId: "verifier-1", publicKeyPem: "pem", activeFrom: "2026-01-01T00:00:00Z", notAfter: "2099-01-01T00:00:00Z" }], producerKeyIds: ["producer-1"], producerPublicKeysPem: [] },
      limits: { perWorkMicrousd: 1_300_000, maxWorksPerPerson: 4, automaticIncrease: false } }));
    const { calls, out, scope } = await admit();
    expect(out).toBe("admitted");
    expect(scope.ownerId).toBe(SCOPE);
    expect(calls.find(c => /FROM agents/.test(c.sql))?.params[0]).toBe(OWNER);
  });
  it("owner-local: unchanged, the owner id", async () => {
    vi.stubEnv("MYEVE_HOSTED_PROFILE", "");
    const { calls, out, scope } = await admit();
    expect(out).toBe("admitted");
    expect(scope.ownerId).toBe(OWNER);
    expect(calls.find(c => /FROM agents/.test(c.sql))?.params[0]).toBe(OWNER);
  });
});
