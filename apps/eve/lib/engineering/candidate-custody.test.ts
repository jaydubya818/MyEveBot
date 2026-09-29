import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { fixture } from "../../test/engineering-fixtures.ts";
import { assertCandidateIdentity } from "./github.ts";
import { EngineeringWorker } from "./worker.ts";
import { readiness, type Candidate } from "./execution.ts";
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
      requestStop: vi.fn(async () => undefined), inspectCustody: vi.fn(async () => ({container:"absent" as const,volume:"present" as const})), collectCandidate,
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

  it("fences Continue when Docker observation and stop are both unconfirmed", async () => {
    const f = fixture();
    f.run.status = "running";
    f.run.candidate = undefined;
    f.run.resourceReleasedAt = undefined;
    f.run.inputSnapshot = source;
    f.state.phase = "executing";
    f.state.candidates = [];
    f.state.effects = [];
    const save = vi.fn(async (_work: unknown, _state: unknown, _kind: string) => undefined);
    const store = {
      claim: vi.fn(async () => ({ token: randomUUID(), state: f.state })),
      get: vi.fn(async () => f.state),
      workStore: { get: vi.fn(async () => f.work) },
      save, renew: vi.fn(async () => undefined), release: vi.fn(async () => undefined),
    } as unknown as ExecutionStore;
    const requestStop = vi.fn(async () => { throw new Error("Docker state unavailable"); });
    const collectCandidate = vi.fn();
    const githubObserve = vi.fn();
    const executor = {
      observe: vi.fn(async () => { throw new Error("Docker state unavailable"); }),requestStop,collectCandidate,
    } as unknown as ConstructorParameters<typeof EngineeringWorker>[2];
    const worker = new EngineeringWorker(store,
      {observe: githubObserve} as unknown as ConstructorParameters<typeof EngineeringWorker>[1],
      executor,
      {} as ConstructorParameters<typeof EngineeringWorker>[3],
      () => f.contract.profileHash, async () => true);

    await worker.tick(f.work.id);
    expect(f.state.phase).toBe("needs_you");
    expect(f.run.status).toBe("failed");
    expect(f.run.custodyUnresolved).toBe(true);
    expect(f.run.resourceReleasedAt).toBeUndefined();
    expect(collectCandidate).not.toHaveBeenCalled();
    expect(save.mock.calls.map(call => call[2])).toEqual(["needs_human_review"]);
    await expect(worker.continue(f.work.id,f.state.revision)).rejects.toThrow(/Reconcile its contents/);
    expect(githubObserve).not.toHaveBeenCalled();
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

  function reconciliationFixture() {
    const f=fixture();
    f.run.status="failed";
    f.run.candidate=undefined;
    f.run.custodyUnresolved=true;
    f.run.resourceReleasedAt=undefined;
    f.run.inputSnapshot=source;
    f.state.phase="needs_you";
    f.state.candidates=[];
    f.state.evidence=[];
    f.state.results=[];
    f.state.approval=null;
    f.state.effects=[];
    f.state.blockers=["Interrupted attempt has no admissible candidate: Candidate identity changed."];
    let persisted=structuredClone(f.state);
    const save=vi.fn(async (_work:unknown,state:typeof f.state,_kind:string) => {
      state.revision++;
      persisted=structuredClone(state);
      return state;
    });
    const store={
      claim:vi.fn(async () => ({token:randomUUID(),state:structuredClone(persisted)})),
      get:vi.fn(async () => structuredClone(persisted)),
      workStore:{get:vi.fn(async () => f.work)},save,
      renew:vi.fn(async () => undefined),
      release:vi.fn(async () => undefined),
    } as unknown as ExecutionStore;
    const inspectCustody=vi.fn(async () => ({container:"absent" as "running"|"stopped"|"absent",volume:"present" as "present"|"absent"}));
    const collectCandidate=vi.fn(async () => structuredClone(f.candidate));
    const cleanup=vi.fn(async () => undefined);
    const executor={inspectCustody,collectCandidate,cleanup} as unknown as ConstructorParameters<typeof EngineeringWorker>[2];
    const worker=new EngineeringWorker(store,{} as ConstructorParameters<typeof EngineeringWorker>[1],executor,
      {} as ConstructorParameters<typeof EngineeringWorker>[3],()=>f.contract.profileHash,async()=>true);
    return {f,worker,store,save,inspectCustody,collectCandidate,cleanup,getPersisted:()=>persisted};
  }

  it("records an exact owner inspection, then retains and releases a candidate across a restart without claiming Ready", async () => {
    const r=reconciliationFixture();
    r.collectCandidate.mockImplementationOnce(async () => ({...structuredClone(r.f.candidate),sha:"b".repeat(40)}));
    await r.worker.reconcileCustody(r.f.work.id,r.getPersisted().revision,r.f.run.id);
    expect(r.getPersisted().runs[0].custodyUnresolved).toBe(true);
    expect(r.getPersisted().runs[0].resourceReleasedAt).toBeUndefined();
    expect(r.getPersisted().custodyInspections?.at(-1)?.outcome).toBe("UNRESOLVED");
    expect(r.cleanup).not.toHaveBeenCalled();
    expect(r.getPersisted().candidates).toHaveLength(0);

    // A new worker reads the persisted revision and the same preserved volume.
    const restarted=new EngineeringWorker(r.store,{} as ConstructorParameters<typeof EngineeringWorker>[1],
      {inspectCustody:r.inspectCustody,collectCandidate:r.collectCandidate,cleanup:r.cleanup} as unknown as ConstructorParameters<typeof EngineeringWorker>[2],
      {} as ConstructorParameters<typeof EngineeringWorker>[3],()=>r.f.contract.profileHash,async()=>true);
    const reconciled=await restarted.reconcileCustody(r.f.work.id,r.getPersisted().revision,r.f.run.id);
    expect(reconciled.runs[0].candidate).toBe(r.f.candidate.sha);
    expect(reconciled.runs[0].custodyUnresolved).toBe(false);
    expect(reconciled.runs[0].resourceReleasedAt).toBeTruthy();
    expect(reconciled.custodyInspections?.map(item=>item.outcome)).toEqual(["UNRESOLVED","RETAINED"]);
    expect(r.save.mock.calls.map(call=>call[2])).toEqual([
      "custody_inspection_unresolved","candidate_custody_reconciled","reconciled_resource_released",
    ]);
    expect(r.cleanup).toHaveBeenCalledOnce();
    expect(readiness(r.f.work,reconciled).ready).toBe(false);
    expect(reconciled.results).toHaveLength(0);
    await expect(restarted.reconcileCustody(r.f.work.id,reconciled.revision,r.f.run.id)).rejects.toThrow(/no longer has an unreconciled resource/);
    expect(r.cleanup).toHaveBeenCalledOnce();
  });

  it("renews and clears the custody lease while inspection is slow",async()=>{
    vi.useFakeTimers();
    try {
      const r=reconciliationFixture();
      let releaseInspection!:()=>void;
      let inspectionStarted!:()=>void;
      const held=new Promise<void>(resolve=>{releaseInspection=resolve;});
      const started=new Promise<void>(resolve=>{inspectionStarted=resolve;});
      r.inspectCustody.mockImplementationOnce(async()=>{
        inspectionStarted();
        await held;
        return {container:"absent",volume:"present"};
      });
      const pending=r.worker.reconcileCustody(r.f.work.id,r.getPersisted().revision,r.f.run.id);
      await started;
      await vi.advanceTimersByTimeAsync(11_000);
      expect(vi.mocked(r.store.renew)).toHaveBeenCalledOnce();
      releaseInspection();
      await pending;
      expect(vi.getTimerCount()).toBe(0);
      expect(r.getPersisted().runs[0].resourceReleasedAt).toBeTruthy();
    } finally {vi.useRealTimers();}
  });

  it.each([
    ["running",{container:"running" as const,volume:"present" as const}],
    ["missing volume",{container:"absent" as const,volume:"absent" as const}],
  ])("keeps %s resource custody unresolved without collecting or cleaning",async (_label,observation)=>{
    const r=reconciliationFixture();
    r.inspectCustody.mockResolvedValueOnce(observation);
    const state=await r.worker.reconcileCustody(r.f.work.id,r.getPersisted().revision,r.f.run.id);
    expect(state.runs[0].custodyUnresolved).toBe(true);
    expect(state.custodyInspections?.at(-1)).toMatchObject({outcome:"UNRESOLVED",...observation});
    expect(r.collectCandidate).not.toHaveBeenCalled();
    expect(r.cleanup).not.toHaveBeenCalled();
    expect(readiness(r.f.work,state).ready).toBe(false);
  });

  it("records unavailable Docker state as unknown, not as proof that the resource is absent",async()=>{
    const r=reconciliationFixture();
    r.inspectCustody.mockRejectedValueOnce(new Error("daemon unavailable"));
    const state=await r.worker.reconcileCustody(r.f.work.id,r.getPersisted().revision,r.f.run.id);
    expect(state.custodyInspections?.at(-1)).toMatchObject({outcome:"UNRESOLVED",container:"unknown",volume:"unknown"});
    expect(state.runs[0].resourceReleasedAt).toBeUndefined();
    expect(r.cleanup).not.toHaveBeenCalled();
  });

  it("does not reconcile a simulated Run as live resource evidence",async()=>{
    const r=reconciliationFixture();
    r.getPersisted().qualificationMode="simulation";
    await expect(r.worker.reconcileCustody(r.f.work.id,r.getPersisted().revision,r.f.run.id)).rejects.toThrow(/authority changed/);
    expect(r.inspectCustody).not.toHaveBeenCalled();
  });

  it("fences stale revisions and unknown publication effects before touching Docker",async()=>{
    const r=reconciliationFixture();
    await expect(r.worker.reconcileCustody(r.f.work.id,r.getPersisted().revision-1,r.f.run.id)).rejects.toThrow(/authority changed/);
    r.getPersisted().effects.push({id:randomUUID(),candidate:r.f.candidate.sha,expectedHead:null,status:"UNKNOWN",createdAt:new Date().toISOString()});
    await expect(r.worker.reconcileCustody(r.f.work.id,r.getPersisted().revision,r.f.run.id)).rejects.toThrow(/authority changed/);
    expect(r.inspectCustody).not.toHaveBeenCalled();
    expect(r.collectCandidate).not.toHaveBeenCalled();
    expect(r.cleanup).not.toHaveBeenCalled();
  });

  it("retains the candidate before cleanup failure and fences duplicate recovery until cleanup is confirmed",async()=>{
    const r=reconciliationFixture();
    r.cleanup.mockRejectedValueOnce(new Error("Docker timeout"));
    const state=await r.worker.reconcileCustody(r.f.work.id,r.getPersisted().revision,r.f.run.id);
    expect(state.candidates.map(candidate=>candidate.sha)).toEqual([r.f.candidate.sha]);
    expect(state.runs[0].resourceReleasedAt).toBeUndefined();
    expect(r.save.mock.calls.map(call=>call[2])).toEqual(["candidate_custody_reconciled","reconciled_resource_release_pending"]);
    await expect(r.worker.reconcileCustody(r.f.work.id,state.revision,r.f.run.id)).rejects.toThrow(/no longer has an unreconciled resource/);
    await expect(r.worker.continue(r.f.work.id,state.revision)).rejects.toThrow(/has not been released/);
    expect(r.cleanup).toHaveBeenCalledOnce();
  });
});
