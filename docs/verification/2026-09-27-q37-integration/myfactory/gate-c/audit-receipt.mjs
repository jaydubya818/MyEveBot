// Read-only audit of the actual pinned producer protocol. No candidate is admitted.
// Usage: node audit-receipt.mjs /absolute/path/to/MyFactory
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

assert.ok(process.argv[2], "Pass the inspected MyFactory source directory");
const root = resolve(process.argv[2]);
const pins = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
for (const [file, expected] of Object.entries(pins.myFactorySourceFiles)) {
  assert.equal(createHash("sha256").update(readFileSync(resolve(root, file))).digest("hex"), expected, `Source changed: ${file}`);
}
const { receiptDescription, readReceipt, parseInput } = await import(pathToFileURL(resolve(root, "packages/hosted-routing/src/index.mjs")).href);
const pair = generateKeyPairSync("ed25519");
const other = generateKeyPairSync("ed25519");
const receipt = {
  version: 1, issueId: "11111111-1111-4111-a111-111111111111",
  workOrderId: "22222222-2222-4222-a222-222222222222", state: "ready_for_review",
  updatedAt: "2026-09-27T00:00:00.000Z", workOrderUrl: "http://127.0.0.1:8788/",
};
const signed = receiptDescription("Synthetic audit only", receipt, pair.privateKey);
const checks = [];
function check(name, kind, run) { run(); checks.push({ name, kind, result: "PASS" }); }
check("expected receipt key authenticates the actual status shape", "PRIMITIVE", () => {
  assert.deepEqual(readReceipt(signed, pair.publicKey, receipt.issueId), receipt);
});
check("wrong producer key rejected", "PRIMITIVE", () => {
  assert.throws(() => readReceipt(signed, other.publicKey, receipt.issueId), /Unverified/);
});
check("wrong request rejected", "PRIMITIVE", () => {
  assert.throws(() => readReceipt(signed, pair.publicKey, receipt.workOrderId), /Wrong/);
});
check("changed signed bytes rejected", "PRIMITIVE", () => {
  const encoded = Buffer.from(JSON.stringify(receipt)).toString("base64url");
  const changed = Buffer.from(JSON.stringify({ ...receipt, state: "cancelled" })).toString("base64url");
  assert.throws(() => readReceipt(signed.replace(encoded, changed), pair.publicKey, receipt.issueId), /Unverified/);
});
check("unknown receipt protocol rejected", "PRIMITIVE", () => {
  assert.throws(() => readReceipt(receiptDescription("", { ...receipt, version: 2 }, pair.privateKey), pair.publicKey, receipt.issueId), /Wrong/);
});
check("producer receipt lacks required execution attestation fields", "GAP_CONFIRMED", () => {
  const value = readReceipt(signed, pair.publicKey, receipt.issueId);
  for (const key of ["factoryId", "factoryVersion", "configurationDigest", "runId", "attemptNumber", "workId", "workGeneration", "candidateCommit", "manifestDigest", "keyVersion", "issuedAt", "expiresAt"]) {
    assert.equal(Object.hasOwn(value, key), false, key);
  }
});
check("unchanged receipt authenticates alongside substituted unsigned candidate data", "GAP_CONFIRMED", () => {
  const deliveries = [
    { signed, candidateCommit: "a".repeat(40), manifestDigest: "a".repeat(64) },
    { signed, candidateCommit: "b".repeat(40), manifestDigest: "b".repeat(64) },
  ];
  for (const delivery of deliveries) assert.deepEqual(readReceipt(delivery.signed, pair.publicKey, receipt.issueId), receipt);
});
check("receipt reader has no replay admission state", "GAP_CONFIRMED", () => {
  assert.deepEqual(readReceipt(signed, pair.publicKey, receipt.issueId), readReceipt(signed, pair.publicKey, receipt.issueId));
});
check("legacy request rejects a new Work binding field", "GAP_CONFIRMED", () => {
  assert.throws(() => parseInput({ idempotencyKey: "audit", title: "Audit", description: "Synthetic", kind: "investigation", acceptanceCriteria: ["Inspect"], allowedPaths: ["README.md"], workId: receipt.workOrderId }), /Unsupported/);
});
console.log(JSON.stringify({
  sourceCommit: pins.myFactorySourceCommit, sourceFilesMatched: Object.keys(pins.myFactorySourceFiles).length,
  checks, checksPassed: checks.length,
  scope: "Ephemeral in-memory keys, real protocol code, synthetic receipt; no service or candidate admission",
  conclusion: "Admission/status authentication exists; authenticated candidate return and execution-version attestation are missing",
  gateC: "PARTIAL", factoryVersionAttestation: "FAIL",
  factoryGrantedAuthority: 0, unauthenticatedCandidateAdmission: 0, falseReady: 0,
  liveFactory: "NOT_RUN", independentVerification: "NOT_RUN", readiness: "NOT_READY",
}, null, 2));
