import { expect, it } from "vitest";
import { factoryRelayLeaseConfig, factoryRelayLeaseEnrollmentDigest } from "./factory-relay-lease-client.ts";

const enrollment = (origin: string) => ({
  schema: "factory-relay-lease-enrollment/v1", ownerId: "owner", installationId: "inst", connectionId: "conn", enrollmentRevision: 1, origin,
  activeFrom: 0, expiresAt: Date.now() + 3_600_000, accountId: "acct_12345678", agentId: "agt_12345678", runtimeClientId: "rtc_12345678",
  taskId: "tsk_12345678", workloadId: "wkl_12345678", audience: "relay-pep", capability: { name: "factory.work", version: "1.0" },
  resource: { type: "work" }, parameters: {}, relayKey: { keyId: "relay", jwk: { kty: "EC", crv: "P-256", x: "x", y: "y" } },
});
const creds = { credential: "rrtc_secret", workloadIdentityToken: "token" };
const config = (origin: string, policy?: { ownerLocalLoopback?: boolean }) => {
  const value = enrollment(origin);
  let digest: string;
  try { digest = factoryRelayLeaseEnrollmentDigest(value, policy); } catch { digest = "0".repeat(64); }
  return () => factoryRelayLeaseConfig(value, { ownerId: "owner", installationId: "inst", connectionId: "conn", revision: 1, digest }, creds, policy);
};

it("hosted and tester profiles (default policy) still require an https Relay origin; loopback http is refused", () => {
  expect(config("https://relay.example.com")().enrollment.origin).toBe("https://relay.example.com");
  for (const origin of ["http://127.0.0.1:8797", "http://localhost:8797", "https://127.0.0.1:8797", "http://relay.example.com"])
    expect(config(origin)).toThrow();
  expect(config("http://127.0.0.1:8797", { ownerLocalLoopback: false })).toThrow();
});

it("only the owner-local profile accepts the exact IPv4 loopback http origin, and nothing broader", () => {
  expect(config("http://127.0.0.1:8797", { ownerLocalLoopback: true })().enrollment.origin).toBe("http://127.0.0.1:8797");
  for (const origin of ["http://localhost:8797", "http://127.0.0.1", "http://10.0.0.5:8797", "http://127.0.0.2:8797", "http://user:pw@127.0.0.1:8797", "http://127.0.0.1:8797/api"])
    expect(config(origin, { ownerLocalLoopback: true })).toThrow();
  // The digest binds the origin: an enrollment digested under one origin never validates another.
  const value = enrollment("http://127.0.0.1:8797"), digest = factoryRelayLeaseEnrollmentDigest(value, { ownerLocalLoopback: true });
  expect(() => factoryRelayLeaseConfig({ ...value, origin: "http://127.0.0.1:8798" }, { ownerId: "owner", installationId: "inst", connectionId: "conn", revision: 1, digest }, creds, { ownerLocalLoopback: true })).toThrow(/FACTORY_RELAY_ENROLLMENT_CHANGED/);
});
