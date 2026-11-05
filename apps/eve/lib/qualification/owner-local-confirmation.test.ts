import { describe, expect, it, vi } from "vitest";
import { generateKeyPairSync, sign, verify } from "node:crypto";
import { confirmationSigningBytes, confirmationTupleSigningBytes, ownerLocalConfirmationSchema, ownerLocalRequestRuntime, ownerLocalSend, requestObjective } from "./owner-local-confirmation.ts";
import { PRIVATE_BETA_PROFILE } from "./journey-profile.ts";
import { factoryExecutionConfigurationHash } from "../engineering/factory-configuration-hash.ts";

const MC = "https://missioncontrol.owner-local.invalid", RELAY = "https://relay.owner-local.invalid";
describe("owner-local MissionControl/Relay transport", () => {
  it("maps only the pinned identity labels to their loopback ports, for the owner-local profile", async () => {
    const base = vi.fn(async (_input: unknown, _init?: unknown) => new Response("{}"));
    const send = ownerLocalSend(PRIVATE_BETA_PROFILE, { [MC]: "http://127.0.0.1:8799", [RELAY]: "http://127.0.0.1:8797" }, base as never);
    await send(MC + "/api/action", { method: "POST" });
    await send(RELAY + "/api/v2/runtime/capability-leases/prepare?x=1");
    await send("https://other.example.com/api/action");
    expect(base.mock.calls.map(c => c[0])).toEqual(["http://127.0.0.1:8799/api/action", "http://127.0.0.1:8797/api/v2/runtime/capability-leases/prepare?x=1",
      "https://other.example.com/api/action"]);
  });
  it("hosted and tester profiles never get a loopback MissionControl or Relay", () => {
    for (const profile of ["myeve.qdev/v1", "myeve.private-beta.tester/v1", "hosted"])
      expect(() => ownerLocalSend(profile, { [MC]: "http://127.0.0.1:8799" })).toThrow("OWNER_LOCAL_TRANSPORT_PROFILE");
  });
  it("refuses non-loopback targets and non-label sources", () => {
    for (const map of <Record<string, string>[]>[{ [MC]: "http://10.0.0.5:8799" }, { [MC]: "https://127.0.0.1:8799" }, { [MC]: "http://localhost:8799" }, { "https://mc.example.com": "http://127.0.0.1:8799" },
      { "http://missioncontrol.owner-local.invalid": "http://127.0.0.1:8799" }])
      expect(() => ownerLocalSend(PRIVATE_BETA_PROFILE, map)).toThrow("OWNER_LOCAL_TRANSPORT_ORIGIN");
  });
  it("the confirmation profile only accepts loopback bridge/MissionControl and label identities", () => {
    const valid = { bridgeOrigin: "http://127.0.0.1:8798", signerEnv: "QDEV_OWNER_CONFIRMATION_SIGNER",
      authorizations: { auditPath: "/tmp/audit.jsonl", accountingIssuerEnv: "QDEV_ACCOUNTING_ISSUER_DATABASE_URL", approverEnv: "QDEV_OWNER_APPROVER_PEM" },
      stage: { maxCostUsd: 0.65, maxDurationSeconds: 180, budgetMinutes: 90, requestDeadlineSeconds: 590 },
      missionControl: { issuer: MC, audience: "https://myeve.owner-local.invalid", loopbackOrigin: "http://127.0.0.1:8799", installationId: "i", secretEnv: "QDEV_MC_SECRET",
        capabilityBackendId: "mc", propagationEnv: "QDEV_MYEVE_SOURCE_SIGNER", executionContractSha256: "a".repeat(64),
        relay: { label: RELAY, loopbackOrigin: "http://127.0.0.1:8797", template: {}, credentialEnv: "QDEV_RELAY_LEASE_CREDENTIAL", workloadTokenEnv: "QDEV_RELAY_WORKLOAD_TOKEN" } } };
    expect(ownerLocalConfirmationSchema.safeParse(valid).success).toBe(true);
    expect(ownerLocalConfirmationSchema.safeParse({ ...valid, bridgeOrigin: "https://bridge.example.com" }).success).toBe(false);
    expect(ownerLocalConfirmationSchema.safeParse({ ...valid, missionControl: { ...valid.missionControl, issuer: "https://mc.example.com" } }).success).toBe(false);
    expect(ownerLocalConfirmationSchema.safeParse({ ...valid, stage: { ...valid.stage, requestDeadlineSeconds: 900 } }).success).toBe(false);
  });
});

describe("per-request runtime", () => {
  const base: any = { engineering: { ownerId: "o", agentId: "a", objective: "static", criteria: [{ id: "5b0d6c1e-8a1f-4d6b-9a52-0c7f3e1a2b44", statement: "s", method: "test" }],
    profile: { repository: "local/dashboard" } }, connection: { origin: "http://127.0.0.1:8792" }, commands: ["x"] };
  it("binds the confirmed request into the objective and criterion, keeping the reviewed profile and criterion id", () => {
    const r = ownerLocalRequestRuntime(base, { request: "Build a dashboard.", planSha256: "f".repeat(64) });
    expect(r.engineering.objective).toBe(requestObjective("Build a dashboard.", "f".repeat(64), "local/dashboard"));
    expect(r.engineering.objective).toContain("Build a dashboard.");
    expect(r.engineering.criteria[0].id).toBe(base.engineering.criteria[0].id);
    expect(r.engineering.profile).toBe(base.engineering.profile);
    expect(factoryExecutionConfigurationHash(r)).not.toBe(factoryExecutionConfigurationHash(base));
    expect(factoryExecutionConfigurationHash(ownerLocalRequestRuntime(base, { request: "Build a dashboard.", planSha256: "f".repeat(64) }))).toBe(factoryExecutionConfigurationHash(r));
  });
  it("refuses a profile without exactly one pinned criterion", () => {
    expect(() => ownerLocalRequestRuntime({ ...base, engineering: { ...base.engineering, criteria: [] } }, { request: "x", planSha256: "f".repeat(64) })).toThrow();
  });
  it("confirmation signatures are domain-separated canonical JSON", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const binding = { b: 1, a: { d: 2, c: 3 } };
    const signature = sign(null, confirmationSigningBytes(binding), privateKey);
    expect(verify(null, Buffer.from('myeve-owner-confirmation/v1\n{"a":{"c":3,"d":2},"b":1}'), publicKey, signature)).toBe(true);
  });
  it("the Work-tuple attestation has its own signing domain (never interchangeable with the confirmation)", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const document = { works: [{ id: "w", tupleSha256: "a".repeat(64) }], confirmationDigest: "d".repeat(64) };
    const signature = sign(null, confirmationTupleSigningBytes(document), privateKey);
    expect(verify(null, Buffer.from(`myeve-owner-confirmation-tuples/v1\n{"confirmationDigest":"${"d".repeat(64)}","works":[{"id":"w","tupleSha256":"${"a".repeat(64)}"}]}`), publicKey, signature)).toBe(true);
    expect(verify(null, confirmationSigningBytes(document), publicKey, signature)).toBe(false);
  });
});
