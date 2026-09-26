import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { fixture } from "../../test/engineering-fixtures.ts";
import { assertCandidateIdentity } from "./github.ts";
import { EngineeringWorker } from "./worker.ts";
import type { Candidate } from "./execution.ts";
import type { ExecutionStore } from "./execution-store.ts";

const source = { sha: "a".repeat(40), files: { "quantity.mjs": "console.log(0);" } };

describe("exact candidate custody", () => {
  it("accepts the same candidate identity after a durable JSON round trip", () => {
    const { contract, run, candidate } = fixture();
    expect(() => assertCandidateIdentity(contract, run, source, structuredClone(candidate))).not.toThrow();
  });

  it.each([
    ["Work", (candidate: Candidate) => { candidate.workId = randomUUID(); }],
    ["Run", (candidate: Candidate) => { candidate.runId = randomUUID(); }],
    ["attempt", (candidate: Candidate) => { candidate.attemptId = randomUUID(); }],
    ["parent", (candidate: Candidate) => { candidate.parentSha = "b".repeat(40); }],
    ["patch", (candidate: Candidate) => { candidate.patch = "[]"; }],
    ["tree", (candidate: Candidate) => { candidate.tree = "b".repeat(40); }],
    ["artifact", (candidate: Candidate) => { candidate.artifactHash = "b".repeat(64); }],
    ["commit", (candidate: Candidate) => { candidate.sha = "b".repeat(40); }],
  ])("rejects a changed %s before custody", (_field, change) => {
    const { contract, run, candidate } = fixture();
    const changed = structuredClone(candidate);
    change(changed);
    expect(() => assertCandidateIdentity(contract, run, source, changed)).toThrow(/Candidate identity/);
  });

  async function interrupted(candidateChange?: (candidate: Candidate) => void) {
    const f = fixture();
    f.run.status = "running";
    f.run.candidate = undefined;
    f.run.resourceReleasedAt = undefined;
    f.run.inputSnapshot = source;
    f.state.phase = "executing";
    f.state.candidates = [];
    f.state.evidence = [];
    f.state.effects = [];
    f.state.approval = null;
    const candidate = structuredClone(f.candidate);
    candidateChange?.(candidate);
    const save = vi.fn(async (_work, _state, _kind) => undefined);
    const store = {
      claim: vi.fn(async () => ({ token: randomUUID(), state: f.state })),
      workStore: { get: vi.fn(async () => f.work) },
      save,
      renew: vi.fn(async () => undefined),
      release: vi.fn(async () => undefined),
    } as unknown as ExecutionStore;
    const collectCandidate = vi.fn(async () => candidate);
    const cleanup = vi.fn(async () => undefined);
    const worker = new EngineeringWorker(store, {} as ConstructorParameters<typeof EngineeringWorker>[1], {
      kind: "claude-code", capabilities: { resumeSession: false, automaticFailover: false },
      start: vi.fn(), observe: vi.fn(async () => "lost" as const), followUp: vi.fn(),
      requestStop: vi.fn(async () => undefined), collectCandidate,
      collectUsage: vi.fn(async () => ({ coverage: "test", providerCostUsd: null })), cleanup,
    }, {} as ConstructorParameters<typeof EngineeringWorker>[3], () => f.contract.profileHash, async () => true);
    await worker.tick(f.work.id);
    return { f, candidate, save, collectCandidate, cleanup };
  }

  it("retains the exact candidate after executor loss before releasing its resource", async () => {
    const { f, candidate, save, cleanup } = await interrupted();
    expect(f.state.phase).toBe("needs_you");
    expect(f.state.candidates.map(item => item.sha)).toEqual([candidate.sha]);
    expect(f.run.candidate).toBe(candidate.sha);
    expect(f.run.status).toBe("failed");
    expect(save.mock.calls.map(call => call[2])).toEqual(["needs_human_review", "failed_resources_released"]);
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("preserves an unretained recovery resource and never claims a mismatched candidate", async () => {
    const { f, save, cleanup } = await interrupted(candidate => { candidate.sha = "b".repeat(40); });
    expect(f.state.candidates).toHaveLength(0);
    expect(f.run.candidate).toBeUndefined();
    expect(f.run.custodyUnresolved).toBe(true);
    expect(f.state.blockers.join(" ")).toMatch(/no admissible candidate.*Candidate identity/i);
    expect(save.mock.calls.map(call => call[2])).toEqual(["needs_human_review"]);
    expect(f.run.resourceReleasedAt).toBeUndefined();
    expect(cleanup).not.toHaveBeenCalled();

    const observe = vi.fn();
    const worker = new EngineeringWorker({
      workStore: { get: vi.fn(async () => f.work) },
      get: vi.fn(async () => f.state),
    } as unknown as ExecutionStore,
    { observe } as unknown as ConstructorParameters<typeof EngineeringWorker>[1],
    {} as ConstructorParameters<typeof EngineeringWorker>[2],
    {} as ConstructorParameters<typeof EngineeringWorker>[3],
    () => f.contract.profileHash, async () => true);
    await expect(worker.continue(f.work.id, f.state.revision)).rejects.toThrow(/Reconcile its contents/);
    expect(observe).not.toHaveBeenCalled();
  });

  it("does not bypass unresolved custody when the owner gives Work back", async () => {
    const f = fixture();
    f.run.status = "stopped";
    f.run.candidate = undefined;
    f.run.resourceReleasedAt = undefined;
    f.run.custodyUnresolved = true;
    f.state.candidates = [];
    f.state.effects = [];
    f.state.phase = "stopped";
    f.state.humanHandoffGeneration = f.work.generation;
    f.work.generation++;
    const truth = structuredClone(f.truth);
    truth.head = null;
    truth.pr = null;
    const save = vi.fn(async (_work: unknown, _state: unknown, _kind: string) => undefined);
    const cleanup = vi.fn(async () => undefined);
    const store = {
      claim: vi.fn(async () => ({ token: randomUUID(), state: f.state })),
      workStore: { get: vi.fn(async () => f.work) },
      save,
      renew: vi.fn(async () => undefined),
      release: vi.fn(async () => undefined),
    } as unknown as ExecutionStore;
    const worker = new EngineeringWorker(store,
      { observe: vi.fn(async () => truth) } as unknown as ConstructorParameters<typeof EngineeringWorker>[1],
      { cleanup } as unknown as ConstructorParameters<typeof EngineeringWorker>[2],
      {} as ConstructorParameters<typeof EngineeringWorker>[3],
      () => f.contract.profileHash, async () => true);

    await worker.tick(f.work.id);
    expect(f.state.phase).toBe("needs_you");
    expect(f.state.runs).toHaveLength(1);
    expect(f.state.blockers.join(" ")).toMatch(/Reconcile its contents/);
    expect(cleanup).not.toHaveBeenCalled();
    expect(save.mock.calls.map(call => call[2])).toEqual(["needs_human_review"]);
  });

  it("retries cleanup after a retained candidate survives a failed cleanup and worker restart", async () => {
    const f = fixture();
    f.run.status = "running";
    f.run.candidate = undefined;
    f.run.resourceReleasedAt = undefined;
    f.run.inputSnapshot = source;
    f.state.phase = "executing";
    f.state.candidates = [];
    f.state.evidence = [];
    let persisted = structuredClone(f.state);
    const save = vi.fn(async (_work: unknown, state: typeof f.state, _kind: string) => {
      state.revision++;
      persisted = structuredClone(state);
    });
    const cleanup = vi.fn().mockRejectedValueOnce(new Error("cleanup failed")).mockResolvedValue(undefined);
    const store = {
      claim: vi.fn(async () => ({ token: randomUUID(), state: structuredClone(persisted) })),
      workStore: { get: vi.fn(async () => f.work) },
      save,
      renew: vi.fn(async () => undefined),
      release: vi.fn(async () => undefined),
    } as unknown as ExecutionStore;
    const executor = {
      kind: "claude-code", capabilities: { resumeSession: false, automaticFailover: false },
      observe: vi.fn(async () => "completed" as const),
      collectCandidate: vi.fn(async () => structuredClone(f.candidate)),
      collectUsage: vi.fn(async () => ({ coverage: "test", providerCostUsd: null })),
      cleanup,
    } as unknown as ConstructorParameters<typeof EngineeringWorker>[2];
    const worker = new EngineeringWorker(store,
      {} as ConstructorParameters<typeof EngineeringWorker>[1], executor,
      {} as ConstructorParameters<typeof EngineeringWorker>[3],
      () => f.contract.profileHash, async () => true);

    await worker.tick(f.work.id);
    expect(persisted.phase).toBe("needs_you");
    expect(persisted.candidates.map(candidate => candidate.sha)).toEqual([f.candidate.sha]);
    expect(persisted.runs[0].resourceReleasedAt).toBeUndefined();
    expect(cleanup).toHaveBeenCalledTimes(1);

    await worker.tick(f.work.id);
    expect(persisted.phase).toBe("needs_you");
    expect(persisted.runs[0].resourceReleasedAt).toBeTruthy();
    expect(cleanup).toHaveBeenCalledTimes(2);
    expect(save.mock.calls.map(call => call[2])).toEqual([
      "candidate_retained", "needs_human_review", "retained_resources_released",
    ]);
  });
});
