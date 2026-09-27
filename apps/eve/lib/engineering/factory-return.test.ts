import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { digest } from "./contract.ts";
import { factoryExpectationSchema, factoryReturnEnvelopeSchema, type FactoryCustodyRecord } from "./factory-return-contract.ts";
import { bindFactorySubmission, factoryArtifactDigest, observeFactoryCancellation, prepareFactoryCancellation,
  receiveFactoryReturn, unknownFactoryOutcome } from "./factory-return.ts";

const raw = JSON.parse(readFileSync(new URL("../../../../docs/verification/2026-09-27-q37-integration/myfactory/golden-fixture.json", import.meta.url), "utf8"));
const original = { expectation: factoryExpectationSchema.parse(raw.expectation),
  envelope: factoryReturnEnvelopeSchema.parse(raw.envelope), currentWork: raw.currentWork as {
    ownerId: string; agentId: string; workId: string; workVersion: number; workGeneration: number;
    criteriaVersion: number; lifecycle: string; control: string;
  } };
type Fixture = typeof original;
const fixture = (): Fixture => structuredClone(original);
const now = Date.parse(raw.now);
const receive = (f = fixture(), previous?: FactoryCustodyRecord) => receiveFactoryReturn({
  binding: original.envelope.binding, currentWork: f.currentWork, expectation: f.expectation, envelope: f.envelope, previous,
}, now);
const otherId = "ea1a4458-917f-4fb7-9923-f4735393aed9";
const otherSha = "f".repeat(40);
function stateOnly(state: Fixture["envelope"]["reported"]["workOrder"]["state"]) {
  const f = fixture(), r = f.envelope.reported;
  r.workOrder.state = r.receipt.state = state;
  r.run = r.candidateEvent = r.startedEvent = r.implementingEvent = null;
  r.checks = []; f.envelope.artifacts = [];
  if (["planning", "implementing", "verifying"].includes(state)) {
    r.run = { ...original.envelope.reported.run!, state: "implementing", candidateCommit: null, finishedAt: null };
  }
  return f;
}

describe("synthetic MyFactory candidate/evidence return boundary", () => {
  it("runs the W1/F1/WO1/A1/C1/E1/E2 golden contract without promoting Factory claims", () => {
    const result = receive();
    expect(result).toMatchObject({ disposition: "RECEIVED", status: "completed", authorityGranted: false,
      automaticResubmission: false, readiness: "NOT_READY", independentVerification: "NOT_RUN",
      receipt: { trust: "FACTORY_REPORTED", integrity: "MATCHED_LOCAL_PINS",
        workOrderId: original.expectation.workOrderId, runId: original.expectation.activeRunId,
        candidate: original.envelope.reported.candidateEvent!.payload,
        provenance: { sourcePin: original.envelope.sourcePin, model: "synthetic-model" } },
    });
    if (!("receipt" in result)) throw new Error("Missing synthetic custody");
    expect(result.receipt.checks).toHaveLength(2);
    expect(result.receipt.artifacts).toHaveLength(3);
    expect(result.receipt.binding.submission.workId).toBe(original.currentWork.workId);
  });

  it("pins real Git-format fixture identities separately from the returned claims", () => {
    const gitHash = (kind: string, data: string) => createHash("sha1")
      .update(`${kind} ${Buffer.byteLength(data)}\0${data}`).digest("hex");
    expect(gitHash("commit", raw.gitFixture.baseObject)).toBe(original.envelope.binding.submission.baseCommit);
    expect(gitHash("commit", raw.gitFixture.candidateObject)).toBe(original.expectation.attempts[0].candidatePin!.candidateCommit);
    expect(raw.gitFixture.candidateObject).toContain(`parent ${original.envelope.binding.submission.baseCommit}\n`);
    expect(raw.gitFixture.candidateObject).toContain(`tree ${original.expectation.attempts[0].candidatePin!.candidateTree}\n`);
  });

  it("binds all local submission fields and preserves hosted idempotency identity", () => {
    const binding = original.envelope.binding;
    expect(bindFactorySubmission(binding.submission)).toEqual(binding);
    expect(bindFactorySubmission(binding.submission, JSON.parse(JSON.stringify(binding)))).toEqual(binding);
    for (const changed of [
      { objective: "another request" }, { workGeneration: 3 }, { criteriaVersion: 2 },
      { baseCommit: otherSha }, { budgetReference: "another-budget" }, { policyReference: "another-policy" },
    ]) expect(() => bindFactorySubmission({ ...binding.submission, ...changed }, binding)).toThrow("IDEMPOTENCY_CONFLICT");
    expect(() => bindFactorySubmission({ ...binding.submission, allowedPaths: ["answer.ts", "answer.ts"] })).toThrow("DUPLICATE_SCOPE");
  });

  it("preserves the real hosted client/key bounds", () => {
    for (const change of [{ clientId: "unbounded/private/client" }, { idempotencyKey: "x".repeat(161) }])
      expect(() => bindFactorySubmission({ ...original.envelope.binding.submission, ...change })).toThrow();
  });

  const adversarial: Array<[string, (f: Fixture) => void, string]> = [
    ["wrong Work ID", f => { f.envelope.binding.submission.workId = otherId; }, "BINDING_CORRUPT"],
    ["rehashed cross-Work return", f => {
      f.envelope.binding = bindFactorySubmission({ ...f.envelope.binding.submission, workId: otherId });
    }, "WRONG_WORK_BINDING"],
    ["wrong owner", f => { f.currentWork.ownerId = "other-owner"; }, "STALE_WORK"],
    ["wrong agent", f => { f.currentWork.agentId = "other-agent"; }, "STALE_WORK"],
    ["stale generation", f => { f.currentWork.workGeneration++; }, "STALE_WORK"],
    ["stale criteria", f => { f.currentWork.criteriaVersion++; }, "STALE_WORK"],
    ["stale version", f => { f.currentWork.workVersion++; }, "STALE_WORK"],
    ["wrong source version", f => { f.envelope.sourcePin.factoryVersion.myFactoryCommit = otherSha; }, "WRONG_FACTORY_VERSION"],
    ["wrong Factory", f => { f.envelope.sourcePin.factoryId = "another-factory"; }, "WRONG_FACTORY_VERSION"],
    ["wrong configuration", f => { f.envelope.sourcePin.factoryVersion.configurationDigest = "f".repeat(64); }, "WRONG_FACTORY_VERSION"],
    ["wrong request", f => { f.envelope.reported.receipt.issueId = otherId; }, "UNKNOWN_WORK_ORDER"],
    ["unknown WorkOrder", f => { f.envelope.reported.workOrder.id = otherId; }, "UNKNOWN_WORK_ORDER"],
    ["wrong repository", f => { f.envelope.reported.workOrder.repositoryPath = "/other"; }, "WRONG_REPOSITORY_BASE"],
    ["wrong base", f => { f.envelope.reported.run!.inputCommit = otherSha; }, "WRONG_BASE"],
    ["wrong objective", f => { f.envelope.reported.workOrder.description = "different"; }, "WRONG_REQUEST_SCOPE"],
    ["wrong scope", f => { f.envelope.reported.workOrder.allowedPaths = ["other.ts"]; }, "WRONG_REQUEST_SCOPE"],
    ["candidate substitution", f => { f.envelope.reported.run!.candidateCommit = otherSha; }, "CANDIDATE_SUBSTITUTION"],
    ["coherent candidate substitution", f => {
      f.envelope.reported.run!.candidateCommit = otherSha;
      f.envelope.reported.candidateEvent!.payload.candidateCommit = otherSha;
      f.envelope.reported.checks.forEach(c => c.candidateCommit = otherSha);
    }, "CANDIDATE_SUBSTITUTION"],
    ["wrong candidate tree", f => { f.envelope.reported.candidateEvent!.payload.candidateTree = otherSha; }, "CANDIDATE_SUBSTITUTION"],
    ["candidate digest mismatch", f => {
      const patch = f.envelope.artifacts[0]; patch.content += "different patch"; patch.sha256 = factoryArtifactDigest(patch.content);
    }, "CANDIDATE_DIGEST_MISMATCH"],
    ["artifact digest mismatch", f => { f.envelope.artifacts[1].content += "tampered"; }, "ARTIFACT_DIGEST_MISMATCH"],
    ["duplicate artifact", f => { f.envelope.artifacts.push(f.envelope.artifacts[1]); }, "DUPLICATE_ARTIFACT"],
    ["unknown attempt", f => { f.envelope.reported.run!.id = otherId; }, "UNKNOWN_ATTEMPT"],
    ["changed attempt number", f => { f.envelope.reported.run!.attemptNumber++; }, "UNKNOWN_ATTEMPT"],
    ["cross-attempt event", f => { f.envelope.reported.candidateEvent!.runId = otherId; }, "INVALID_EVENT_PROVENANCE"],
    ["cross-attempt check", f => { f.envelope.reported.checks[0].runId = otherId; }, "INVALID_CHECK_PROVENANCE"],
    ["future event", f => { f.envelope.reported.candidateEvent!.createdAt = "2099-01-01T00:00:00.000Z"; }, "INVALID_EVENT_PROVENANCE"],
    ["events out of order", f => { f.envelope.reported.implementingEvent!.createdAt = "2026-09-27T03:00:04.000Z"; }, "INVALID_EVENT_ORDER"],
    ["receipt precedes terminal run", f => { f.envelope.reported.run!.finishedAt = "2026-09-27T03:00:07.000Z"; }, "INVALID_RUN_PROVENANCE"],
    ["impossible check chronology", f => { f.envelope.reported.checks[0].finishedAt = "2026-09-27T03:00:02.000Z"; }, "INVALID_CHECK_PROVENANCE"],
    ["PASS with no checks", f => { f.envelope.reported.checks = []; }, "EVIDENCE_INCOMPLETE"],
    ["PASS with no log custody", f => { f.envelope.artifacts.pop(); }, "EVIDENCE_INCOMPLETE"],
    ["PASS with missing digest", f => { f.envelope.reported.checks[0].logSha256 = null; }, "EVIDENCE_INCOMPLETE"],
    ["PASS with wrong exit", f => { f.envelope.reported.checks[0].exitCode = 1; }, "CONTRADICTORY_CHECK"],
    ["completion with failing checks", f => { f.envelope.reported.checks[0].status = "failed"; }, "FALSE_COMPLETION_CLAIM"],
    ["repeated check", f => { f.envelope.reported.checks[1] = f.envelope.reported.checks[0]; }, "DUPLICATE_CHECK"],
    ["missing model provenance", f => { f.envelope.reported.startedEvent = null; }, "MISSING_EXECUTOR_PROVENANCE"],
    ["terminal claim with active run", f => { f.envelope.reported.run!.finishedAt = null; }, "INCONSISTENT_TERMINAL_STATE"],
  ];
  it.each(adversarial)("denies %s", (_name, mutate, code) => {
    const f = fixture(); mutate(f); expect(() => receive(f)).toThrow(code);
  });

  it.each(["factoryVersion", "factoryId"])("rejects missing %s", key => {
    const f = fixture(); Reflect.deleteProperty(f.envelope.sourcePin, key);
    expect(() => receive(f)).toThrow();
  });
  it.each(["readiness", "authority", "writerLease", "protectedVerification", "blocker"])("rejects invented return field %s", key => {
    const f = fixture(); Reflect.set(f.envelope.reported, key, { status: "READY_FOR_REVIEW", granted: true });
    expect(() => receive(f)).toThrow();
  });

  it("dedupes serialized replay without creating a second local candidate", () => {
    const localCandidates: FactoryCustodyRecord[] = [];
    const first = receive();
    if (first.disposition !== "RECEIVED" || !("receipt" in first)) throw new Error("Missing fixture candidate");
    localCandidates.push(first.receipt);
    const recovered = JSON.parse(JSON.stringify(localCandidates[0]));
    const second = receive(fixture(), recovered);
    if (second.disposition === "RECEIVED" && "receipt" in second) localCandidates.push(second.receipt);
    expect(second.disposition).toBe("DEDUPED"); expect(localCandidates).toHaveLength(1);
    const changed = fixture(); changed.envelope.artifacts[1].content += "new reported log";
    changed.envelope.artifacts[1].sha256 = factoryArtifactDigest(changed.envelope.artifacts[1].content);
    changed.envelope.reported.checks[0].logSha256 = changed.envelope.artifacts[1].sha256;
    expect(() => receive(changed, recovered)).toThrow("CONFLICTING_DUPLICATE");
    expect(() => receive(fixture(), { ...recovered, runId: otherId })).toThrow("INVALID_PRIOR_RECEIPT");
  });

  it("keeps a superseded attempt historical and non-authoritative", () => {
    const f = fixture(); f.expectation.attempts.push({ runId: otherId, attemptNumber: 2, candidatePin: null });
    f.expectation.activeRunId = otherId;
    expect(receive(f)).toMatchObject({ disposition: "HISTORICAL", authorityGranted: false, readiness: "NOT_READY" });
  });
  it.each(["paused", "human", "stopping"])("keeps returns historical under Work control %s", control => {
    const f = fixture(); f.currentWork.control = control;
    expect(receive(f).disposition).toBe("HISTORICAL");
  });

  it("does not derive protected verification from valid failing Factory evidence", () => {
    const f = fixture(), r = f.envelope.reported;
    r.workOrder.state = r.receipt.state = r.run!.state = "failed";
    r.run!.failure = "One or more required checks failed";
    r.checks[0].status = "failed"; r.checks[0].exitCode = 1;
    expect(receive(f)).toMatchObject({ disposition: "RECEIVED", status: "failed", readiness: "NOT_READY",
      independentVerification: "NOT_RUN", receipt: { trust: "FACTORY_REPORTED" } });
  });

  it("requires separate local pins for supplemental reports and other bounded outputs", () => {
    const f = fixture(), content = "Synthetic environment report; no execution occurred.";
    const artifact = { reference: "/fixture/artifacts/report.json", kind: "report" as const,
      sha256: factoryArtifactDigest(content), content };
    f.envelope.artifacts.push(artifact);
    expect(() => receive(f)).toThrow("UNBOUND_ARTIFACT");
    f.expectation.supplementalArtifacts = [{ reference: artifact.reference, kind: artifact.kind, sha256: artifact.sha256 }];
    expect(receive(f)).toMatchObject({ disposition: "RECEIVED", readiness: "NOT_READY" });
    f.expectation.supplementalArtifacts[0].sha256 = "f".repeat(64);
    expect(() => receive(f)).toThrow("SUPPLEMENTAL_ARTIFACT_MISMATCH");
  });

  it("uses Factory's deduplicated reproduction-plus-checks rule for defects", () => {
    const f = fixture(), r = f.envelope.reported;
    f.envelope.binding = bindFactorySubmission({ ...f.envelope.binding.submission, kind: "defect" });
    r.workOrder.kind = "defect"; r.workOrder.reproductionCommand = r.workOrder.checkCommands[0];
    const input = { binding: f.envelope.binding, currentWork: f.currentWork, expectation: f.expectation, envelope: f.envelope };
    expect(receiveFactoryReturn(input, now).disposition).toBe("RECEIVED");
    r.workOrder.reproductionCommand = "node missing-reproduction.mjs";
    expect(() => receiveFactoryReturn(input, now)).toThrow("WRONG_REQUEST_SCOPE");
    f.expectation.requiredChecks.unshift(r.workOrder.reproductionCommand);
    expect(() => receiveFactoryReturn(input, now)).toThrow("EVIDENCE_INCOMPLETE");
  });

  it.each([
    ["queued", "accepted"], ["implementing", "working"], ["awaiting_clarification", "blocked"],
    ["awaiting_environment", "blocked"], ["awaiting_approval", "blocked"], ["interrupted", "unknown"], ["failed", "failed"],
  ] as const)("represents %s as %s without inventing local presentation state", (state, status) => {
    expect(receive(stateOnly(state))).toMatchObject({ status, readiness: "NOT_READY", automaticResubmission: false });
  });
  it.each([
    ["concurrency_limit", "CAPACITY"], ["attempt_limit", "CAPACITY"], ["dispatch_paused", "CAPACITY"],
    ["evidence_incomplete", "VERIFICATION"], ["linear_unavailable", "EXTERNAL_DEPENDENCY"], ["recovery_hold", "RECOVERY"],
  ] as const)("classifies actual action error %s", (code, category) => {
    const f = stateOnly("queued"); f.envelope.reported.actionError = { code, error: "Bounded reported explanation." };
    expect(receive(f)).toMatchObject({ status: "blocked", blocker: { code, category, retryPermitted: false } });
  });
  it("rejects malformed blockers instead of interpreting arbitrary prose", () => {
    const f = stateOnly("queued"); Reflect.set(f.envelope.reported, "actionError", { code: "approve_everything", error: "", retryPermitted: true });
    expect(() => receive(f)).toThrow();
  });
  it.each(["SUBMISSION_RESPONSE_LOST", "RESULT_UNAVAILABLE", "TIMEOUT_AFTER_POSSIBLE_COMPLETION"] as const)(
    "preserves UNKNOWN after %s and reconciles the same request", reason => {
      expect(unknownFactoryOutcome(original.envelope.binding, reason)).toMatchObject({
        status: "unknown", reconcileRequestId: original.envelope.binding.requestId, automaticResubmission: false,
      });
    });
  it("does not treat stale result readback as fresh completion", () => {
    expect(receiveFactoryReturn({ binding: original.envelope.binding, currentWork: original.currentWork,
      expectation: original.expectation, envelope: original.envelope }, now + 86_400_001)).toMatchObject({ status: "unknown" });
  });

  it("models cancellation intent, stopping, terminal report and uncertainty without dispatch", () => {
    const binding = original.envelope.binding, intent = prepareFactoryCancellation(binding, original.expectation);
    expect(prepareFactoryCancellation(binding, original.expectation)).toEqual(intent);
    expect(intent).toMatchObject({ action: "run.cancel", input: { workOrderId: original.expectation.workOrderId }, dispatch: "NOT_AVAILABLE_TO_AGENT" });
    for (const value of [null, { result: null }, { result: original.envelope.reported.run }])
      expect(observeFactoryCancellation(binding, intent, value)).toMatchObject({ state: "UNKNOWN", remoteCancellationQualified: false });
    expect(observeFactoryCancellation(binding, intent, { result: { ...original.envelope.reported.run, state: "implementing", finishedAt: null } }))
      .toMatchObject({ state: "STOPPING_REPORTED", remoteCancellationQualified: false });
    expect(observeFactoryCancellation(binding, intent, { result: { ...original.envelope.reported.run, state: "cancelled" } }))
      .toMatchObject({ state: "TERMINAL_REPORTED", remoteCancellationQualified: false });
    expect(() => observeFactoryCancellation(binding, intent, { result: { ...original.envelope.reported.run, id: otherId } }))
      .toThrow("WRONG_CANCELLATION_RESPONSE");
    const late = receiveFactoryReturn({ binding, currentWork: original.currentWork,
      expectation: original.expectation, envelope: original.envelope, cancellation: intent }, now);
    expect(late).toMatchObject({ disposition: "HISTORICAL", readiness: "NOT_READY", authorityGranted: false });
  });

  it("bounds artifacts and rejects malformed package versions", () => {
    const f = fixture(); f.envelope.artifacts[1].content = "🙂".repeat(60_000);
    f.envelope.artifacts[1].sha256 = factoryArtifactDigest(f.envelope.artifacts[1].content);
    expect(() => receive(f)).toThrow("ARTIFACT_DIGEST_MISMATCH");
    Reflect.set(f.envelope, "format", "MYFACTORY_REAL_SIGNED_RETURN"); expect(() => receive(f)).toThrow();
  });
  it("keeps every admitted fixture outcome free of authority and false Ready", () => {
    const outcomes = [receive(), receive(stateOnly("queued")), receive(stateOnly("awaiting_environment")),
      unknownFactoryOutcome(original.envelope.binding, "RESULT_UNAVAILABLE")];
    expect(outcomes.filter(r => r.authorityGranted).length).toBe(0);
    expect(outcomes.filter(r => String(r.readiness) === "READY_FOR_REVIEW").length).toBe(0);
    expect(digest(original.envelope.binding.submission)).toBe(original.envelope.binding.submissionDigest);
  });
});
