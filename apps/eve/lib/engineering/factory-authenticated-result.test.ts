import { createHash, generateKeyPairSync, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { requestDescription, receiptDescription, resultDescription } from "../myfactory-protocol.mjs";
import { observeAuthenticatedFactoryResult, prepareAuthenticatedFactoryInput } from "./factory-authenticated-result.ts";

const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const keys = generateKeyPairSync("ed25519");
const tree = "a".repeat(40), base = "b".repeat(40);
const pin = { kind: "TRUSTED_FACTORY_EXPECTATION" as const, factoryId: "q37-test-factory",
  factoryVersion: { myFactoryCommit: "c".repeat(40), sourceTree: "d".repeat(40), configurationDigest: "e".repeat(64) } };
const submission = { ownerId: "fixture-owner", agentId: "fixture-agent", workId: randomUUID(),
  workVersion: 2, workGeneration: 3, criteriaVersion: 1, objective: "Make one bounded change.",
  criteria: ["The check passes."], kind: "feature" as const, repository: "owner/repo",
  baseCommit: base, allowedPaths: ["answer.ts"], sourcePin: pin, clientId: "myeve",
  idempotencyKey: "q37-result-1", policyReference: null, budgetReference: null,
  submittedAt: "2026-09-27T03:00:00.000Z" };
const config = { clientId: "myeve", repository: "owner/repo", teamId: "team-1",
  token: "a".repeat(64), receiptPublicKey: keys.publicKey.export({ type: "spki", format: "pem" }).toString() };
const artifact = (kind: "patch" | "log", value: string) => {
  const bytes = Buffer.from(value); const digest = sha(bytes);
  return { id: `${kind}:${digest}`, kind, byteLength: bytes.length, sha256: digest,
    bytes: bytes.toString("base64url") };
};

function fixture() {
  const { binding, hostedInput } = prepareAuthenticatedFactoryInput(submission, "Bounded change", pin);
  const workOrderId = randomUUID(), runId = randomUUID();
  const rawCommit = `tree ${tree}\nparent ${base}\nauthor Factory <factory@example.invalid> 1 +0000\ncommitter Factory <factory@example.invalid> 1 +0000\n\nCandidate\n`;
  const candidateCommit = createHash("sha1").update(`commit ${Buffer.byteLength(rawCommit)}\0`).update(rawCommit).digest("hex");
  const patch = artifact("patch", "bounded patch"), log = artifact("log", "check passed");
  const manifest = { requestBindingDigest: sha(JSON.stringify(hostedInput.factoryBinding)),
    workOrderId, runId, attemptNumber: 1, inputCommit: base, candidateCommit, candidateTree: tree,
    changedPaths: ["answer.ts"], commitObject: Buffer.from(rawCommit).toString("base64url"),
    checks: [{ id: randomUUID(), command: "npm test", candidateCommit, status: "passed", exitCode: 0,
      startedAt: "2026-09-27T03:01:00.000Z", finishedAt: "2026-09-27T03:01:01.000Z", logSha256: log.sha256 }],
    artifacts: [patch, log] };
  const result = { version: 1, keyVersion: "ed25519-v1", issueId: binding.requestId,
    operationId: sha(JSON.stringify(["myfactory-result-v1", binding.requestId, runId])),
    factoryId: pin.factoryId, factoryVersion: hostedInput.factoryBinding.expectedFactoryVersion,
    manifestDigest: sha(JSON.stringify(manifest)), manifest, issuedAt: "2026-09-27T03:02:00.000Z" };
  const issue = { id: binding.requestId, title: hostedInput.title, team: { id: config.teamId },
    identifier: "MYE-1", url: "https://linear.app/example/issue/MYE-1",
    description: requestDescription(config, hostedInput) };
  issue.description = resultDescription(receiptDescription(issue.description, { version: 1,
    issueId: issue.id, workOrderId, state: "ready_for_review", updatedAt: "2026-09-27T03:02:00.000Z",
    workOrderUrl: `http://127.0.0.1:8788/?workOrder=${workOrderId}` }, keys.privateKey),
    Buffer.from(JSON.stringify(result)).toString("base64url"), keys.privateKey);
  const graphql = async () => ({ issues: { nodes: [issue] } });
  const currentWork = { ownerId: submission.ownerId, agentId: submission.agentId,
    workId: submission.workId, workVersion: submission.workVersion,
    workGeneration: submission.workGeneration, criteriaVersion: submission.criteriaVersion,
    lifecycle: "active", control: "agent" };
  const request = { binding, hostedInput, currentWork, expectedWorkOrderId: workOrderId,
    expectedRunId: runId, expectedAttempt: 1, requiredChecks: ["npm test"], trustedPin: pin,
    config, graphql };
  return { request, issue, result, keys };
}

describe("authenticated Factory candidate return", () => {
  it("verifies the exact signed attempt, artifacts and FactoryVersion without granting authority", async () => {
    const f = fixture();
    const first = await observeAuthenticatedFactoryResult(f.request);
    expect(first).toMatchObject({ status: "INTEGRITY_VERIFIED", authorityGranted: false,
      independentVerification: "NOT_RUN", readiness: "NOT_READY",
      operationId: f.result.operationId, candidateCommit: f.result.manifest.candidateCommit });
    const replay = await observeAuthenticatedFactoryResult({ ...f.request,
      previous: { operationId: first.operationId!, manifestDigest: first.manifestDigest! } });
    expect(replay.status).toBe("DEDUPED");
    await expect(observeAuthenticatedFactoryResult({ ...f.request,
      previous: { operationId: first.operationId!, manifestDigest: "f".repeat(64) } })).rejects.toThrow("FACTORY_RESULT_CONFLICT");
  });

  it("denies a forged signer, changed bytes, version pin and wrong attempt", async () => {
    const f = fixture();
    const forged = generateKeyPairSync("ed25519");
    const forgedDescription = resultDescription(requestDescription(config, f.request.hostedInput),
      Buffer.from(JSON.stringify(f.result)).toString("base64url"), forged.privateKey);
    const unknown = await observeAuthenticatedFactoryResult({ ...f.request,
      graphql: async () => ({ issues: { nodes: [{ ...f.issue, description: forgedDescription }] } }) });
    expect(unknown.status).toBe("UNKNOWN");
    await expect(observeAuthenticatedFactoryResult({ ...f.request, expectedAttempt: 2 })).rejects.toThrow("FACTORY_RESULT_WRONG_REQUEST_OR_ATTEMPT");
    const wrongPin = { ...pin, factoryVersion: { ...pin.factoryVersion, configurationDigest: "f".repeat(64) } };
    await expect(observeAuthenticatedFactoryResult({ ...f.request, trustedPin: wrongPin })).rejects.toThrow("UNTRUSTED_FACTORY_PIN");
    const altered = { ...f.result, manifest: { ...f.result.manifest,
      artifacts: [{ ...f.result.manifest.artifacts[0], bytes: Buffer.from("changed").toString("base64url") },
        f.result.manifest.artifacts[1]] } };
    const changed = resultDescription(requestDescription(config, f.request.hostedInput),
      Buffer.from(JSON.stringify(altered)).toString("base64url"), keys.privateKey);
    const uncertain = await observeAuthenticatedFactoryResult({ ...f.request,
      graphql: async () => ({ issues: { nodes: [{ ...f.issue, description: changed }] } }) });
    expect(uncertain.status).toBe("UNKNOWN");
  });

  it("keeps stale Work and lost readback non-authoritative", async () => {
    const f = fixture();
    expect((await observeAuthenticatedFactoryResult({ ...f.request,
      currentWork: { ...f.request.currentWork, workGeneration: 4 } })).status).toBe("HISTORICAL");
    expect((await observeAuthenticatedFactoryResult({ ...f.request,
      graphql: async () => { throw new Error("lost response"); } })).status).toBe("UNKNOWN");
  });
});
