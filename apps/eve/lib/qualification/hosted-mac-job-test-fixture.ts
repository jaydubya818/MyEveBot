import { createHash, generateKeyPairSync, type KeyObject } from "node:crypto";
import { digest, RESULT_PROTOCOL, signLocalResultV4, type LocalResultManifestV4, type ResultKey } from "../engineering/factory-producer-protocol.ts";

/**
 * SYNTHETIC TEST FIXTURE (labelled; no Factory, no network): a stage-3 local V4 Factory Result signed with a throwaway key, and the matching
 * expected build binding. Used by the Mac job authority tests and the hosted end-to-end test.
 */
const objectId = (kind: string, bytes: Buffer) => createHash("sha1").update(`${kind} ${bytes.length}\0`).update(bytes).digest("hex");
export function stage3ResultFixture(options: { ownerId?: string; deadline?: string; key?: { privateKey: KeyObject; publicKey: KeyObject } } = {}) {
  const pair = options.key ?? generateKeyPairSync("ed25519");
  const tree = (body: string) => Buffer.concat([Buffer.from("100644 index.html\0"), Buffer.from(objectId("blob", Buffer.from(body)), "hex")]);
  const inputTree = tree("before\n"), inputTreeId = objectId("tree", inputTree);
  const base = Buffer.from(`tree ${inputTreeId}\nauthor Synthetic <fixture@example.invalid> 1793016000 +0000\ncommitter Synthetic <fixture@example.invalid> 1793016000 +0000\n\nSynthetic input\n`);
  const inputCommit = objectId("commit", base), candidateTree = tree("after\n"), candidateTreeId = objectId("tree", candidateTree);
  const commit = Buffer.from(`tree ${candidateTreeId}\nparent ${inputCommit}\nauthor Synthetic <fixture@example.invalid> 1793016001 +0000\ncommitter Synthetic <fixture@example.invalid> 1793016001 +0000\n\nSynthetic candidate\n`);
  const candidate = objectId("commit", commit), patch = Buffer.from("Synthetic patch\n"), log = Buffer.from("Synthetic check log\n");
  const configuration = { model: "openai/gpt-5.4-mini", executor: "codex-cli" as const, executorVersion: "synthetic", skillRevision: "synthetic", workerProfile: "container" as const,
    verificationImage: "synthetic-verifier", nodeVersion: "v24.18.1", platform: "linux", architecture: "arm64", commands: ["npm test"], allowedPaths: ["index.html"], timeoutMs: 1000 };
  const sourceDigest = "1".repeat(64), configurationDigest = digest(configuration), factoryId = "myfactory-local-v4", factoryVersion = digest({ sourceDigest, configurationDigest });
  const execution = { version: 4 as const, factoryId, factoryVersion, sourceDigest, configurationDigest, configuration, requestId: "request-3", requestDigest: "4".repeat(64),
    workOrderId: "11111111-1111-4111-8111-111111111111", runId: "22222222-2222-4222-8222-222222222222", attemptNumber: 1, inputCommit, inputTree: inputTreeId,
    workspace: { kind: "GIT_WORKTREE" as const, path: "/synthetic/worktree", branch: null }, capturedAt: "2026-11-05T10:00:00.000Z" };
  const metadata = [["commit", "git-commit", commit], ["tree", "git-tree", candidateTree], ["patch", "patch", patch], ["check", "check-log", log]] as const;
  const artifacts = metadata.map(([id, , bytes]) => ({ id, base64: bytes.toString("base64") }));
  const artifactMetadata = metadata.map(([id, kind, bytes]) => ({ id, kind, producer: factoryId, runId: execution.runId, candidateCommit: candidate,
    sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.length, createdAt: "2026-11-05T10:00:00.200Z" }));
  const evidence = [{ id: "check", producer: factoryId, runId: execution.runId, candidateCommit: candidate, command: "npm test", status: "passed" as const, exitCode: 0,
    startedAt: "2026-11-05T10:00:00.100Z", finishedAt: "2026-11-05T10:00:00.200Z", logArtifactId: "check" }];
  const manifest: LocalResultManifestV4 = { protocol: RESULT_PROTOCOL, keyId: "factory-result-1", producer: factoryId,
    operationId: digest([RESULT_PROTOCOL, factoryId, execution.requestId, execution.workOrderId, execution.runId]), execution, status: "COMPLETED",
    candidate: { commit: candidate, tree: candidateTreeId, base: inputCommit, patchDigest: createHash("sha256").update(patch).digest("hex"), commitArtifactId: "commit",
      treeArtifactId: "tree", patchArtifactId: "patch" }, evidence, artifacts: artifactMetadata, evidenceDigest: digest(evidence), artifactDigest: digest(artifactMetadata),
    completedAt: "2026-11-05T10:00:00.300Z", issuedAt: "2026-11-05T10:00:00.400Z" } as LocalResultManifestV4;
  const signed = signLocalResultV4(manifest, artifacts, pair.privateKey);
  const resultKey: ResultKey = { factoryId, keyId: "factory-result-1", publicKey: String(pair.publicKey.export({ type: "spki", format: "pem" })),
    activeFrom: "2026-01-01T00:00:00.000Z", notAfter: "2099-01-01T00:00:00.000Z" };
  const binding = { ownerId: options.ownerId ?? "jay", agentId: "sofie", appId: "myeve-dashboard", workId: "work-3", workVersion: 1, workGeneration: 1,
    requestId: execution.requestId, runId: execution.runId, factoryId, factoryVersion, sourceDigest, configurationDigest, inputCommit, inputTree: inputTreeId,
    candidateCommit: candidate, candidateTree: candidateTreeId, lockSha256: "a".repeat(64), buildProfileDigest: "b".repeat(64), deadline: options.deadline ?? "2099-01-01T00:00:00.000Z" };
  return { signed, manifest, resultKey, binding, candidate: { commit: candidate, tree: candidateTreeId }, privateKey: pair.privateKey };
}
