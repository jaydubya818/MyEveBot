import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { resolveBetaRelayTrust } from "./relay-trust";

const BETA_RELAY_ORIGIN = "https://relay.example";
const publicKey = generateKeyPairSync("ed25519").publicKey;
const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
const fingerprint = createHash("sha256")
  .update(publicKey.export({ type: "spki", format: "der" }))
  .digest("hex");
const trust = { origin: BETA_RELAY_ORIGIN, keyId: "beta-1", keyVersion: "v1", publicKey: pem };
const fetcher = (value: unknown, status = 200) =>
  (async () => new Response(JSON.stringify(value), { status })) as typeof fetch;

test("pins the exact operator-reviewed Relay signing key", async () => {
  assert.deepEqual(await resolveBetaRelayTrust(fingerprint, fetcher(trust), BETA_RELAY_ORIGIN), trust);
});

test("stops before project mutation when the key changed", async () => {
  await assert.rejects(
    resolveBetaRelayTrust("0".repeat(64), fetcher(trust), BETA_RELAY_ORIGIN),
    /does not match/,
  );
});

test("rejects a different issuer and unavailable endpoint", async () => {
  await assert.rejects(
    resolveBetaRelayTrust(fingerprint, fetcher({ ...trust, origin: "https://other.example" }), BETA_RELAY_ORIGIN),
    /invalid trust material/,
  );
  await assert.rejects(
    resolveBetaRelayTrust(fingerprint, fetcher({ error: "disabled" }, 503), BETA_RELAY_ORIGIN),
    /unavailable/,
  );
  await assert.rejects(
    resolveBetaRelayTrust(fingerprint, (async () => { throw new TypeError("redirect blocked"); }) as typeof fetch, BETA_RELAY_ORIGIN),
    /trust endpoint public/,
  );
});

test("rejects invalid fingerprints before any network request", async () => {
  let called = false;
  await assert.rejects(resolveBetaRelayTrust("short", (async () => {
    called = true;
    throw new Error("unexpected request");
  }) as typeof fetch, BETA_RELAY_ORIGIN), /fingerprint/);
  assert.equal(called, false);
});

test("requires a configured public HTTPS origin before fetching", async () => {
  let called = false;
  const trackingFetcher = (async () => {
    called = true;
    throw new Error("unexpected request");
  }) as typeof fetch;
  for (const origin of ["", "http://relay.example", "https://relay.example/path", "https://localhost", "https://127.0.0.1"]) {
    await assert.rejects(resolveBetaRelayTrust(fingerprint, trackingFetcher, origin), /origin/);
  }
  assert.equal(called, false);
});
