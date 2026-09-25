// Run from the canonical Relay checkout using node --import tsx <this file>.
// Synthetic local signatures only: no network, credentials, private-key files or KMS.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { verifyEnvelope } from "../../lib/relay/transport.ts";

const canonicalRelay = "e2eb350f5655427d55cc204264020a9295173f96";
assert.equal(execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), canonicalRelay);
assert.equal(execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { encoding: "utf8" }).trim(), "");
globalThis.fetch = async () => { throw new Error("Provider access forbidden in local interoperability qualification."); };
const load = (file: string) => import(pathToFileURL(resolve(file)).href);
const { envelopeV2Fixtures, qualificationIssuer, qualificationAudience, qualificationKeyVersion } = await load("scripts/production-qualification/envelope-v2-fixtures.ts");
const { createLocalEd25519Signer } = await load("lib/v2/evidence/crypto.ts");
const { signDelivery, verifyDelivery } = await load("lib/v2/federation/transport.ts");
const now = Date.now();
const results = [];
for (const fixture of envelopeV2Fixtures(new Date(now))) {
  const local = createLocalEd25519Signer(fixture.keyId);
  let signingCalls = 0;
  const signer = {
    ...local,
    keyVersion: qualificationKeyVersion,
    sign: async (material: string) => { signingCalls++; return local.sign(material); },
  };
  const bindings = { signer, issuer: qualificationIssuer };
  const envelope = fixture.envelope;
  const token = await signDelivery(envelope, qualificationAudience, envelope.id, envelope.expiresAt, bindings);
  assert.equal(token.length, fixture.materialBytes + 87);
  const publicKey = await local.publicKeyPem();
  const identity = { issuer: qualificationIssuer, ownerId: "fq-owner-b", agentId: "fq-agent-b", address: qualificationAudience, keyId: fixture.keyId, keyVersion: qualificationKeyVersion, publicKey };
  assert.deepEqual(verifyEnvelope(token, identity, now), envelope);
  const receiver = {
    issuer: qualificationIssuer, audience: qualificationAudience,
    trustedPublicKey: async (id: string, version: string) => id === fixture.keyId && version === qualificationKeyVersion ? publicKey : undefined,
    claimRequest: async () => true,
  };
  assert.deepEqual(await verifyDelivery(token, receiver), envelope);
  const parts = token.split(".");
  const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString());
  claims.envelope.caller.agentId = "tampered";
  parts[1] = Buffer.from(JSON.stringify(claims)).toString("base64url");
  assert.throws(() => verifyEnvelope(parts.join("."), identity, now));
  await assert.rejects(() => verifyDelivery(parts.join("."), receiver));
  if (fixture.materialBytes === 262057) {
    assert.equal(token.length, 262144);
    assert.throws(() => verifyEnvelope(token + "a", identity, now));
    const callsBefore = signingCalls;
    await assert.rejects(() => signDelivery({ ...envelope, id: envelope.id + "x" }, qualificationAudience, envelope.id, envelope.expiresAt, bindings));
    assert.equal(signingCalls, callsBefore);
  }
  results.push({ materialBytes: fixture.materialBytes, tokenCharacters: token.length, relayVerification: "PASS", myeveVerification: "PASS", tamperRejection: "PASS", signingCalls });
}
console.log(JSON.stringify({ canonicalRelay, provider: "LOCAL", kmsCalls: 0, maximumPlusOneRejected: true, results }, null, 2));
