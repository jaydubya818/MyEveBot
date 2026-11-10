import { expect, it, vi } from "vitest";

/** Blocker 3 wiring: hosted custody hands the capability layer the hosted per-person scope, and keeps the Work store on the owner id. */
const m = vi.hoisted(() => ({
  ownerFactoryCapabilityConfig: vi.fn(async (_c: Record<string, unknown>): Promise<never> => { throw new Error("STOP_AFTER_CAPABILITY_CONFIG"); }),
}));
vi.mock("./custody-assembly.ts", async original => ({ ...(await original<object>()), ownerFactoryCapabilityConfig: m.ownerFactoryCapabilityConfig }));
vi.mock("./hosted-profile.ts", async original => ({ ...(await original<object>()), sameVerifierTrust: () => true, requireHostedPolicy: (_p: unknown, policy: unknown) => policy,
  requireHostedFactoryConnection: (_p: unknown, c: unknown) => c,
  hostedTransports: () => ({ factoryFetch: vi.fn(), capabilityFetch: vi.fn(), verifierFetch: vi.fn(), relayFetch: vi.fn() }) }));
vi.mock("./plan.ts", () => ({ validateJourneyPlan: (p: unknown) => p }));
vi.mock("./work-budget-preflight.ts", () => ({ checkStageWorkBudgets: async () => undefined }));
const { assembleHostedCustody } = await import("./hosted-custody.ts");

it("hosted custody passes hostedOwnerScope(profile) as the capability owner; the Work store principal stays the owner id", async () => {
  const hosted = { ownerId: "owner", installationId: "prj_hosted_owner", build: { appId: "app" }, verifier: { keys: [] } } as never;
  const profile = { publishing: { installationId: "prj_hosted_owner" }, build: { appId: "app" }, verifier: { keys: [] }, workIds: { stage1: "w1", stage2: "w2", stage3: "w3" },
    capability: { signerEnv: "SIGNER", clientId: "client", backendId: "factory", missionId: "mission",
      relay: { credentialEnv: "RELAY_CRED", workloadTokenEnv: "RELAY_TOKEN", enrollment: {}, enrollmentSha256: "e", revision: 1 } } };
  const bundle = { assembly: profile, ownerId: "owner", credentials: { journalDatabaseUrl: "JOURNAL" }, policy: {}, plan: {}, project: {}, conversation: {} } as never;
  const credential = (name: string) => name === "SIGNER" ? JSON.stringify({ signer: { keyId: "k", jwk: {} } }) : "value";
  let principal: unknown;
  await expect(assembleHostedCustody({ bundle, credential }, { hosted, mailboxDb: {} as never, blob: {} as never, database: () => ({}) as never,
    store: ownerId => { principal = { scopeId: ownerId }; return { principal, database: {} } as never; },
    runtimeConfig: async () => ({ connection: {} }) as never })).rejects.toThrow("STOP_AFTER_CAPABILITY_CONFIG");
  expect(principal).toEqual({ scopeId: "owner" });
  expect(m.ownerFactoryCapabilityConfig).toHaveBeenCalledTimes(1);
  expect(m.ownerFactoryCapabilityConfig.mock.calls[0][0]).toMatchObject({ capabilityOwnerId: "myeve.hosted:prj_hosted_owner:owner", ownerLocalRelayLoopback: true });
});
