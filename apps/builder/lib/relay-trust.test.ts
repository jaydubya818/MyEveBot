import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { BETA_RELAY_ORIGIN, resolveBetaRelayTrust } from "./relay-trust";

const publicKey = generateKeyPairSync("ed25519").publicKey;
const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
const fingerprint = createHash("sha256")
  .update(publicKey.export({ type: "spki", format: "der" }))
  .digest("hex");
const trust = { origin: BETA_RELAY_ORIGIN, keyId: "beta-1", keyVersion: "v1", publicKey: pem };
const fetcher = (value: unknown, status = 200) =>
  (async () => new Response(JSON.stringify(value), { status })) as typeof fetch;

test("pins the exact operator-reviewed Relay signing key", async () => {
  assert.deepEqual(await resolveBetaRelayTrust(fingerprint, fetcher(trust)), trust);
});

test("stops before project mutation when the key changed", async () => {
  await assert.rejects(
    resolveBetaRelayTrust("0".repeat(64), fetcher(trust)),
    /does not match/,
  );
});

test("rejects a different issuer and unavailable endpoint", async () => {
  await assert.rejects(
    resolveBetaRelayTrust(fingerprint, fetcher({ ...trust, origin: "https://other.example" })),
    /invalid trust material/,
  );
  await assert.rejects(
    resolveBetaRelayTrust(fingerprint, fetcher({ error: "disabled" }, 503)),
    /unavailable/,
  );
});

test("rejects invalid fingerprints before any network request", async () => {
  let called = false;
  await assert.rejects(resolveBetaRelayTrust("short", (async () => {
    called = true;
    throw new Error("unexpected request");
  }) as typeof fetch), /fingerprint/);
  assert.equal(called, false);
});
