/**
 * Hosted private beta on Vercel PRODUCTION: the Factory runtime comes from MYEVE_HOSTED_FACTORY_RUNTIME (non-secret) + MYEVE_HOSTED_FACTORY_TOKEN
 * (secret), never from the isolated-dogfood config files (refused in production), and a configured-but-invalid hosted installation fails loudly.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { digest } from "./contract.ts";
import { factoryConfig, hostedFactoryRuntime, HOSTED_FACTORY_RUNTIME_ENV, HOSTED_FACTORY_TOKEN_ENV } from "./factory-routing.ts";
import { hostedProfileFixture } from "../qualification/hosted-profile.test.ts";

const h = (c: string) => c.repeat(64), sourceDigest = h("1"), configurationDigest = h("2");
const profile = { id: "hosted-dashboard", version: 1, repository: "jaydubya818/sofie-first-build", privateQualification: true, baseBranch: "main",
  allowedPaths: ["src/**"], checks: [{ id: "factory-build-tests", program: "package.json", input: "", expectedOutput: "", expectedExitCode: 0, criterionIds: ["5b0d6c1e-8a1f-4d6b-9a52-0c7f3e1a2b44"] }],
  requiredCI: ["factory-build-tests"], reviewerLogins: ["jaydubya818"], policyVersion: 1, executor: "claude-code", image: `node@sha256:${h("9")}`, maxRuns: 2, maxModelRequests: 3, maxOutputTokens: 1024 };
const engineering = { mode: "isolated-dogfood", ownerId: "jay", agentId: "agent_e0954312-6a71-4727-a915-f1484a0b8736", objective: "Hosted private beta.",
  criteria: [{ id: "5b0d6c1e-8a1f-4d6b-9a52-0c7f3e1a2b44", statement: "Build and tests pass.", method: "test" }], profile,
  approvedBase: { sha: "d1619cc870ad63e4442e078e73dad377dfb3ccf6", files: [{ path: "package.json", sha256: h("4") }] }, brokerPort: 55470, model: "claude-sonnet-5" };
const publicConnection = (over: Record<string, unknown> = {}) => ({ origin: "http://127.0.0.1:8792", factoryId: "f", sourceDigest, configurationDigest,
  factoryVersion: digest({ sourceDigest, configurationDigest }), repositoryPath: "/Users/owner/repo",
  keys: [{ factoryId: "f", keyId: "k", publicKey: "pem", activeFrom: "2026-01-01T00:00:00Z", notAfter: "2099-01-01T00:00:00Z" }],
  spendContract: { version: "WORK_LEDGER_V2", sourceDigest },
  qualification: { scopeId: "myeve.hosted:prj_hosted_owner:jay", profileHash: digest(profile), evidenceRef: "ev", qualifiedAt: "2026-01-01T00:00:00Z", expiresAt: "2099-01-01T00:00:00Z", mode: "LIVE", spendEnforced: true }, ...over });
const runtime = (over: Record<string, unknown> = {}, eng: Record<string, unknown> = engineering) =>
  JSON.stringify({ engineering: eng, factory: { routing: { intent: "PRODUCE", boundedOperationQualified: false }, commands: ["npm run build && npx playwright test"], connection: publicConnection(over) } });
const env = (over: Record<string, string | undefined> = {}) => ({ VERCEL: "1", VERCEL_ENV: "production", MYEVE_OWNER_ID: "jay", DATABASE_URL: "postgres://x/y",
  MYEVE_HOSTED_PROFILE: JSON.stringify(hostedProfileFixture()), [HOSTED_FACTORY_RUNTIME_ENV]: runtime(), [HOSTED_FACTORY_TOKEN_ENV]: h("a"), ...over });

afterEach(() => vi.unstubAllEnvs());
describe("hosted Factory runtime on Vercel production", () => {
  it("is built from the hosted env values (token only from the secret value) and bound to the engineering profile", async () => {
    const config = await hostedFactoryRuntime(env());
    expect(config!.engineering.ownerId).toBe("jay");
    expect(config!.connection).toMatchObject({ origin: "http://127.0.0.1:8792", token: h("a") });
  });
  it("factoryConfig() serves it under VERCEL_ENV=production instead of refusing as isolated dogfood", async () => {
    for (const [k, v] of Object.entries(env())) vi.stubEnv(k, v!);
    const config = await factoryConfig();
    expect(config.engineering.agentId).toBe("agent_e0954312-6a71-4727-a915-f1484a0b8736");
    expect(config.routing.intent).toBe("PRODUCE");
  });
  it("without a hosted marker it is not used (existing dogfood/cloud paths unchanged)", async () => {
    expect(await hostedFactoryRuntime({ VERCEL_ENV: "production" })).toBeNull();
  });
  it.each([
    ["invalid profile", "HOSTED_PROFILE_INVALID", { MYEVE_HOSTED_PROFILE: "{}" }],
    ["tester marker without a profile", "HOSTED_PROFILE_INVALID", { MYEVE_HOSTED_PROFILE: undefined, MYEVE_EXTERNAL_ALPHA_HOSTED_BETA: "true" }],
    ["missing runtime", "HOSTED_FACTORY_RUNTIME_MISSING", { [HOSTED_FACTORY_RUNTIME_ENV]: undefined }],
    ["missing token", "HOSTED_FACTORY_TOKEN_MISSING", { [HOSTED_FACTORY_TOKEN_ENV]: undefined }],
    ["malformed runtime", "HOSTED_FACTORY_RUNTIME_INVALID", { [HOSTED_FACTORY_RUNTIME_ENV]: "{" }],
    ["token in the public value", "HOSTED_FACTORY_TOKEN_IN_PUBLIC_CONFIG", { [HOSTED_FACTORY_RUNTIME_ENV]: runtime({ token: h("b") }) }],
    ["foreign engineering owner", "HOSTED_ENGINEERING_OWNER", { [HOSTED_FACTORY_RUNTIME_ENV]: runtime({}, { ...engineering, ownerId: "someone" }) }],
    ["invalid engineering", "HOSTED_ENGINEERING_INVALID", { [HOSTED_FACTORY_RUNTIME_ENV]: runtime({}, { ...engineering, brokerPort: undefined }) }],
    ["other Factory origin", "HOSTED_FACTORY_ORIGIN", { [HOSTED_FACTORY_RUNTIME_ENV]: runtime({ origin: "http://127.0.0.1:8783" }) }],
    ["subscription route", "HOSTED_FACTORY_METERED_ONLY", { [HOSTED_FACTORY_RUNTIME_ENV]: runtime({ qualification: { ...publicConnection().qualification, mode: "OWNER_SUBSCRIPTION_LOCAL" } }) }],
    ["other owner scope", "HOSTED_FACTORY_OWNER_SCOPE", { [HOSTED_FACTORY_RUNTIME_ENV]: runtime({ qualification: { ...publicConnection().qualification, scopeId: "jay" } }) }],
    ["unbound engineering profile", "HOSTED_FACTORY_PROFILE_BINDING", { [HOSTED_FACTORY_RUNTIME_ENV]: runtime({ qualification: { ...publicConnection().qualification, profileHash: h("3") } }) }],
  ])("%s -> throws %s (loud, never a dogfood fallback)", async (_name, code, over: Record<string, string | undefined>) => {
    await expect(hostedFactoryRuntime(env(over))).rejects.toMatchObject({ code });
    for (const [k, v] of Object.entries(env(over))) vi.stubEnv(k, v as string);
    await expect(factoryConfig()).rejects.toMatchObject({ code });
  });
});
