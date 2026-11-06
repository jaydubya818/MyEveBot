/**
 * Review EVE-REVIEW-1 regressions:
 *  - P1: invalid hosted configuration fails closed — never the owner-local launcher, never a pinned custody module.
 *  - P2: verifier trust sets compare complete normalized records; the hosted build issuer is excluded from the verifier set automatically.
 */
import { generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

const assembleFromProfile = vi.hoisted(() => vi.fn(async () => ({ ownerLocal: true })));
const assembleHostedCustody = vi.hoisted(() => vi.fn(async () => ({ hosted: true })));
vi.mock("./custody-launcher.ts", () => ({ assembleFromProfile }));
vi.mock("./hosted-custody.ts", () => ({ assembleHostedCustody }));

const { loadCustody } = await import("./custody-loader.ts");
const { normalizedVerifierTrust, sameVerifierTrust } = await import("./hosted-profile.ts");
const { producerExclusions, RuntimePortsRefused } = await import("./runtime-ports.ts");

const assemblyContext = { bundle: { assembly: { slot: "Q1" } } } as never;
const moduleContext = { bundle: { custody: { module: "/opt/custody.mjs", sha256: "a".repeat(64) } } } as never;
afterEach(() => { assembleFromProfile.mockClear(); assembleHostedCustody.mockClear(); });

describe("P1: hosted configuration fails closed before any launcher or custody-module selection", () => {
  const read = vi.fn(async () => new Uint8Array());
  it.each([
    ["malformed profile", { MYEVE_HOSTED_PROFILE: "{not json" }],
    ["foreign/invalid profile", { MYEVE_HOSTED_PROFILE: JSON.stringify({ profile: "myeve.private-beta.hosted/v1", ownerId: "someone-else" }), MYEVE_OWNER_ID: "jay" }],
    ["valid-looking marker without a database", { MYEVE_HOSTED_PROFILE: "{}" }],
    ["tester flag only", { MYEVE_EXTERNAL_ALPHA_HOSTED_BETA: "true" }],
  ])("%s -> disabled (null); owner-local launcher and custody module never selected", async (_name, env) => {
    expect(await loadCustody(assemblyContext, { env, launcher: { database: vi.fn() } as never })).toBeNull();
    expect(await loadCustody(moduleContext, { env, read })).toBeNull();
    expect(assembleFromProfile).not.toHaveBeenCalled();
    expect(assembleHostedCustody).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });
  it("an injected hosted launcher is the only launcher; it never accepts a pinned custody module", async () => {
    const hosted = {} as never;
    expect(await loadCustody(assemblyContext, { env: {}, hosted })).toEqual({ hosted: true });
    expect(await loadCustody(moduleContext, { env: {}, hosted, read })).toBeNull();
    expect(read).not.toHaveBeenCalled();
    expect(assembleFromProfile).not.toHaveBeenCalled();
  });
  it("without any hosted marker the owner-local launcher is unchanged", async () => {
    expect(await loadCustody(assemblyContext, { env: {}, launcher: { database: vi.fn() } as never })).toEqual({ ownerLocal: true });
    expect(assembleHostedCustody).not.toHaveBeenCalled();
  });
});

const pem = (k: { publicKey: { export(o: object): string | Buffer } }) => String(k.publicKey.export({ type: "spki", format: "pem" }));
describe("P2: verifier trust and producer separation", () => {
  const a = generateKeyPairSync("ed25519"), b = generateKeyPairSync("ed25519");
  const key = { keyId: "verifier-1", publicKeyPem: pem(a), activeFrom: "2026-01-01T00:00:00Z", notAfter: "2099-01-01T00:00:00Z" };
  it("compares complete normalized records, not ids", () => {
    expect(sameVerifierTrust([key], [{ ...key, activeFrom: "2026-01-01T00:00:00.000Z", publicKeyPem: pem(a).replace(/\n$/, "") + "\n" }])).toBe(true);
    expect(sameVerifierTrust([key], [{ ...key, publicKeyPem: pem(b) }])).toBe(false);                       // same id, different key
    expect(sameVerifierTrust([key], [{ ...key, notAfter: "2098-01-01T00:00:00Z" }])).toBe(false);             // different window
    expect(sameVerifierTrust([key], [{ ...key, revokedAt: "2026-06-01T00:00:00Z" }])).toBe(false);           // revoked on one side
    expect(sameVerifierTrust([key], [key, { ...key, keyId: "verifier-2", publicKeyPem: pem(b) }])).toBe(false);
    expect(sameVerifierTrust([key], [{ ...key, publicKeyPem: "not a key" }])).toBe(false);
    expect(() => normalizedVerifierTrust([key, key])).toThrow("HOSTED_VERIFIER_TRUST_DUPLICATE");
  });
  it("the hosted Mac build issuer joins the producer exclusions automatically (no manual list needed)", () => {
    const issuer = { keyId: "build-1", publicKeyPem: pem(b) };
    const custody = { resultKeys: [], factory: { connection: { keys: [] } }, verifier: { producerKeyIds: [], producerPublicKeysPem: [] },
      hostedMyApps: { issuer, retainBuild: vi.fn(), observe: vi.fn() } } as never;
    expect(producerExclusions(custody)).toEqual({ producerKeyIds: ["build-1"], producerPublicKeysPem: [pem(b)] });
    expect(() => producerExclusions({ ...(custody as object), hostedMyApps: { retainBuild: vi.fn(), observe: vi.fn() } } as never)).toThrow(RuntimePortsRefused);
  });
});
