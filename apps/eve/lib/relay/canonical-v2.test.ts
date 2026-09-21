import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { verifyEnvelope } from "./transport.ts";

// Public-only producer vector from Relay main e2eb350f5655427d55cc204264020a9295173f96.
// Kept verbatim: this test must not reproduce the receiver's signing algorithm.
const vector = JSON.parse(readFileSync(new URL("./fixtures/canonical-v2.json", import.meta.url), "utf8"));
const header = JSON.parse(vector.header);
const identity = {
  issuer: "https://relay.synthetic.invalid",
  ownerId: "b",
  agentId: "b",
  address: "relay://b/b",
  keyId: header.kid,
  keyVersion: header.keyVersion,
  publicKey: vector.publicKeyPem,
};
const now = Date.parse("2030-01-01T00:00:00Z");

describe("canonical Relay producer interoperability", () => {
  it("accepts the unmodified canonical producer vector", () => {
    expect(verifyEnvelope(vector.token, identity, now)).toEqual(JSON.parse(vector.canonicalPayload).envelope);
  });
  it("requires the trusted immutable version, even with the right public key", () => {
    expect(() => verifyEnvelope(vector.token, { ...identity, keyVersion: "wrong" }, now)).toThrow();
    expect(() => verifyEnvelope(vector.token, { ...identity, keyVersion: undefined }, now)).toThrow();
  });
  it("rejects changed producer payload bytes", () => {
    const parts = vector.token.split(".");
    const payload = JSON.parse(vector.canonicalPayload);
    payload.envelope.payload.body = "tampered";
    parts[1] = Buffer.from(JSON.stringify(payload)).toString("base64url");
    expect(() => verifyEnvelope(parts.join("."), identity, now)).toThrow();
  });
});
