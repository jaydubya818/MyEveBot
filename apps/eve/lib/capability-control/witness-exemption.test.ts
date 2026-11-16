import { afterEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { capabilityConfiguration } from "./runtime.ts";
import { WITNESS_EXEMPT_OWNER } from "./owner-scope.ts";
import { HOSTED_PROFILE, hostedOwnerScope } from "../engineering/factory-mailbox.ts";
import { HOSTED_ASSURANCE_LABEL } from "../qualification/hosted-profile.ts";
import { haltCode, haltDetail } from "../qualification/refusal-code.ts";

const fixture = vi.hoisted(() => ({ pem: "" }));
vi.mock(import("./owner-scope.ts"), async (load) => {
  const actual = await load();
  const { createHash, generateKeyPairSync } = await import("node:crypto");
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  fixture.pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const spki = publicKey.export({ type: "spki", format: "der" });
  return { ...actual, WITNESS_EXEMPT_OWNER: {
    ...actual.WITNESS_EXEMPT_OWNER, confirmationKeyId: createHash("sha256").update(spki).digest("hex"),
  } };
});

/** Owner-only recovery-witness exemption (MyEveBot#120): owner `jay` admitted with a warning; testers and everything else keep the full gate. */
const served = "https://sofie-personal-agent.vercel.app";
const profile = (installationId: string, role: "OWNER" | "TESTER" = "OWNER", ownerId = "owner") => ({
  profile: HOSTED_PROFILE, role, ownerId, installationId,
  relayOrigin: "https://relay.example.com", missionControlOrigin: "https://mc.example.com", servedOrigin: served,
  build: { appId: "myeve-dashboard", lockSha256: "a".repeat(64), buildProfileDigest: "c".repeat(64), issuer: { keyId: "build-1", purpose: "STATIC_BUILD_PROVENANCE_V1", ownerId,
    factoryId: "f", factoryVersion: "d".repeat(64), buildProfileDigest: "c".repeat(64), publicKeyPem: "pem", spkiSha256: "e".repeat(64), notBefore: "2026-01-01T00:00:00.000Z",
    notAfter: "2099-01-01T00:00:00.000Z", revoked: false } },
  factory: { transport: "MAILBOX", factoryOrigin: "http://127.0.0.1:8783", verifierOrigin: "http://127.0.0.1:8786", relayOrigin: "http://127.0.0.1:8788",
    ownerScope: hostedOwnerScope({ installationId, ownerId }), spend: "METERED", qualificationMode: "LIVE" },
  verifier: { assurance: "PRIVATE_BETA_LOCAL", label: HOSTED_ASSURANCE_LABEL,
    keys: [{ keyId: "verifier-1", publicKeyPem: "pem", activeFrom: "2026-01-01T00:00:00Z", notAfter: "2099-01-01T00:00:00Z" }], producerKeyIds: ["producer-1"], producerPublicKeysPem: [] },
  limits: { perWorkMicrousd: 1_300_000, maxWorksPerPerson: 4, automaticIncrease: false },
});
type Env = Record<string, string | undefined>;
const ownerEnv = (over: Env = {}): NodeJS.ProcessEnv => ({
  NODE_ENV: "production", VERCEL: "1", VERCEL_ENV: "production", VERCEL_PROJECT_ID: WITNESS_EXEMPT_OWNER.vercelProjectId, MYEVE_OWNER_ID: "owner",
  MYEVE_CAPABILITY_CONTROL_ENABLED: "true", MYEVE_MISSIONCONTROL_MODE: "APPROVED_NONPRODUCTION", MYEVE_CAPABILITY_INSTALLATION_ID: "jay",
  MYEVE_CAPABILITY_ENVIRONMENT: "qualification", MYEVE_CAPABILITY_ORIGIN: served,
  DATABASE_URL: "postgresql://127.0.0.1/app", MYEVE_CAPABILITY_DATABASE_URL: "postgresql://127.0.0.1/app",
  MYEVE_HOSTED_PROFILE: JSON.stringify(profile("jay")), MYEVE_SOFIE_CONFIRM_KEY: fixture.pem, ...over,
} as NodeJS.ProcessEnv);
const testerEnv = (slot: "1" | "2", over: Env = {}): NodeJS.ProcessEnv => ownerEnv({
  EVE_PROJECT_NAME: `myeve-alpha-tester-${slot}`, VERCEL_PROJECT_ID: `prj_tester_${slot}`, MYEVE_OWNER_ID: `tester-owner-${slot}`,
  MYEVE_CAPABILITY_INSTALLATION_ID: `tester-${slot}`, MYEVE_HOSTED_PROFILE: JSON.stringify(profile(`tester-${slot}`, "TESTER", `tester-owner-${slot}`)), ...over,
});
const refusedCode = (env: NodeJS.ProcessEnv) => { try { capabilityConfiguration(env); return "ADMITTED"; } catch (e) { return haltCode(haltDetail(e)); } };

describe("owner-only capability recovery-witness exemption", () => {
  afterEach(() => vi.restoreAllMocks());
  it("admits the owner installation jay without policy or witness and warns on every use", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    for (let i = 0; i < 2; i++) expect(capabilityConfiguration(ownerEnv())).toMatchObject({ id: "jay", environment: "qualification" });
    expect(warn).toHaveBeenCalledTimes(2);
    expect(String(warn.mock.calls[0][0])).toContain("CAPABILITY_WITNESS_EXEMPT_OWNER installation=jay scope=myeve.hosted:jay:owner");
  });
  it.each(["1", "2"] as const)("myeve-alpha-tester-%s (role TESTER) without policy/witness still refuses with CAPABILITIES_UNAVAILABLE", slot => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(refusedCode(testerEnv(slot))).toBe("QDEV_HALTED:CAPABILITIES_UNAVAILABLE");
    expect(() => capabilityConfiguration(testerEnv(slot))).toThrow(expect.objectContaining({ code: "capabilities_unavailable" }));
    // Even a tester install that copies the owner's profile and installation id cannot borrow the exemption.
    expect(refusedCode(testerEnv(slot, { MYEVE_HOSTED_PROFILE: JSON.stringify(profile("jay", "OWNER", `tester-owner-${slot}`)), MYEVE_CAPABILITY_INSTALLATION_ID: "jay" })))
      .toBe("QDEV_HALTED:CAPABILITIES_UNAVAILABLE");
    expect(refusedCode(testerEnv(slot, { VERCEL_PROJECT_ID: WITNESS_EXEMPT_OWNER.vercelProjectId, MYEVE_HOSTED_PROFILE: JSON.stringify(profile("jay", "OWNER", `tester-owner-${slot}`)), MYEVE_CAPABILITY_INSTALLATION_ID: "jay" })))
      .toBe("QDEV_HALTED:CAPABILITIES_UNAVAILABLE");
    expect(warn).not.toHaveBeenCalled();
  });
  it("requires the installed owner's confirmation key, including in otherwise matching configuration", () => {
    const { privateKey } = generateKeyPairSync("ed25519");
    const anotherKey = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    for (const key of [undefined, "invalid", anotherKey]) {
      expect(refusedCode(ownerEnv({ MYEVE_SOFIE_CONFIRM_KEY: key }))).toBe("QDEV_HALTED:CAPABILITIES_UNAVAILABLE");
    }
  });
  it("requires the canonical owner, origin and production target", () => {
    const otherOrigin = "https://other.example.test";
    for (const override of [
      { MYEVE_OWNER_ID: undefined },
      { MYEVE_OWNER_ID: "other", MYEVE_HOSTED_PROFILE: JSON.stringify(profile("jay", "OWNER", "other")) },
      { MYEVE_CAPABILITY_ORIGIN: otherOrigin, MYEVE_HOSTED_PROFILE: JSON.stringify({ ...profile("jay"), servedOrigin: otherOrigin }) },
      { VERCEL_ENV: "preview" },
      { VERCEL_TARGET_ENV: "preview" },
      { VERCEL: undefined, VERCEL_ENV: undefined },
      { MYEVE_EXTERNAL_ALPHA_HOSTED_BETA: "true" },
    ]) expect(refusedCode(ownerEnv(override))).toBe("QDEV_HALTED:CAPABILITIES_UNAVAILABLE");
  });
  it.each(["1", "2"] as const)("keeps the tester-%s witness gate with Vercel system variables disabled", slot => {
    expect(refusedCode(testerEnv(slot, { VERCEL: undefined, VERCEL_ENV: undefined }))).toBe("QDEV_HALTED:CAPABILITIES_UNAVAILABLE");
  });
  it("refuses a non-hosted Vercel environment (no hosted profile)", () => {
    expect(refusedCode(ownerEnv({ MYEVE_HOSTED_PROFILE: undefined }))).toBe("QDEV_HALTED:CAPABILITIES_UNAVAILABLE");
  });
  it("refuses an OWNER profile for a different installation id, a TESTER role for jay, another project, or an external-alpha policy", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(refusedCode(ownerEnv({ MYEVE_HOSTED_PROFILE: JSON.stringify(profile("jay2")), MYEVE_CAPABILITY_INSTALLATION_ID: "jay2" }))).toBe("QDEV_HALTED:CAPABILITIES_UNAVAILABLE");
    expect(refusedCode(ownerEnv({ MYEVE_HOSTED_PROFILE: JSON.stringify(profile("other")) }))).toBe("QDEV_HALTED:CAPABILITIES_UNAVAILABLE");
    expect(refusedCode(ownerEnv({ MYEVE_HOSTED_PROFILE: JSON.stringify(profile("jay", "TESTER")) }))).toBe("QDEV_HALTED:CAPABILITIES_UNAVAILABLE");
    expect(refusedCode(ownerEnv({ VERCEL_PROJECT_ID: "prj_other" }))).toBe("QDEV_HALTED:CAPABILITIES_UNAVAILABLE");
    expect(refusedCode(ownerEnv({ MYEVE_MISSIONCONTROL_MODE: "PRODUCTION" }))).toBe("QDEV_HALTED:CAPABILITIES_UNAVAILABLE");
    expect(refusedCode(ownerEnv({ MYEVE_CAPABILITY_ORIGIN: "https://foreign.example.test" }))).toBe("QDEV_HALTED:CAPABILITIES_UNAVAILABLE");
    expect(warn).not.toHaveBeenCalled();
  });
});
