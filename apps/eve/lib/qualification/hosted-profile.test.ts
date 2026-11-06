import { expect, it } from "vitest";
import { digest } from "../engineering/contract.ts";
import { isMailboxFetch } from "../engineering/factory-mailbox.ts";
import { HOSTED_ASSURANCE_LABEL, HOSTED_PROFILE, hostedProfileFromEnv, hostedProfileSchema, hostedTransports, requireHostedFactoryConnection, requireHostedPolicy } from "./hosted-profile.ts";
import { PRIVATE_BETA_PROFILE } from "./journey-profile.ts";

export const hostedProfileFixture = (over: Record<string, unknown> = {}) => ({
  profile: HOSTED_PROFILE, role: "OWNER", ownerId: "jay", installationId: "prj_hosted_owner",
  relayOrigin: "https://relay.example.com", missionControlOrigin: "https://mc.example.com",
  factory: { transport: "MAILBOX", factoryOrigin: "http://127.0.0.1:8792", verifierOrigin: "http://127.0.0.1:8795", spend: "METERED", qualificationMode: "LIVE" },
  verifier: { assurance: "PRIVATE_BETA_LOCAL", label: HOSTED_ASSURANCE_LABEL,
    keys: [{ keyId: "verifier-1", publicKeyPem: "pem", activeFrom: "2026-01-01T00:00:00Z", notAfter: "2099-01-01T00:00:00Z" }], producerKeyIds: ["producer-1"], producerPublicKeysPem: [] },
  limits: { perWorkMicrousd: 1_300_000, maxWorksPerPerson: 4, automaticIncrease: false },
  ...over,
});
const h = (c: string) => c.repeat(64), sourceDigest = h("1"), configurationDigest = h("2");
const connection = (over: Record<string, unknown> = {}, mode = "LIVE") => ({ origin: "http://127.0.0.1:8792", token: h("a"), factoryId: "f", sourceDigest, configurationDigest,
  factoryVersion: digest({ sourceDigest, configurationDigest }), repositoryPath: "/Users/owner/repo",
  keys: [{ factoryId: "f", keyId: "k", publicKey: "pem", activeFrom: "2026-01-01T00:00:00Z", notAfter: "2099-01-01T00:00:00Z" }],
  spendContract: { version: "WORK_LEDGER_V2", sourceDigest },
  qualification: { scopeId: "owner", profileHash: h("3"), evidenceRef: "ev", qualifiedAt: "2026-01-01T00:00:00Z", expiresAt: "2099-01-01T00:00:00Z", mode, spendEnforced: true }, ...over } as never);

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
