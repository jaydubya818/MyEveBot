import { describe,it,expect,vi } from "vitest";
import { randomUUID } from "node:crypto";
import { makeContract,digest } from "./contract.ts";
import { initialExecution,queueRun,readiness,manifest,nowIso, type GitHubTruth } from "./execution.ts";
import { ExecutionStore } from "./execution-store.ts";
import type { WorkStore } from "./store.ts";
import { createCandidate } from "./github.ts";
import { boundedReview, EngineeringWorker } from "./worker.ts";
import type { Work } from "./types.ts";

import { fixture } from "../../test/engineering-fixtures.ts";
describe("Golden Work readiness",()=>{
  it("retains stable authority and artifact hashes after jsonb key reordering",()=>{expect(digest({b:{z:1,a:2},a:[2,1]})).toBe(digest({a:[2,1],b:{a:2,z:1}}));});
  it("requires authoritative current evidence and cannot be set by an executor",()=>{const f=fixture();expect(readiness(f.work,f.state).ready).toBe(true);f.state.evidence[0].artifact="executor says PASS";expect(readiness(f.work,f.state).ready).toBe(false);});
  it.each(["UNKNOWN","STALE","NOT_RUN","FAIL"] as const)("never treats %s as PASS",result=>{const f=fixture();f.state.evidence[0].result=result;expect(readiness(f.work,f.state).ready).toBe(false);});
  it("rejects changed head, criteria, profile binding, control, authority and stale observation",()=>{
    for(const change of [
      (f:ReturnType<typeof fixture>)=>f.truth.head="b".repeat(40),
      (f:ReturnType<typeof fixture>)=>f.work.criteriaVersion++,
      (f:ReturnType<typeof fixture>)=>f.state.evidence[0].profileHash="stale",
      (f:ReturnType<typeof fixture>)=>f.work.control="human",
      (f:ReturnType<typeof fixture>)=>f.truth.authority=false,
      (f:ReturnType<typeof fixture>)=>f.truth.observedAt=new Date(Date.now()-61000).toISOString(),
      (f:ReturnType<typeof fixture>)=>f.state.effects[0].status="UNKNOWN",
    ]){const f=fixture();change(f);expect(readiness(f.work,f.state).ready).toBe(false);}
  });
  it("latest failed CI attempt overrides older passing evidence",()=>{const f=fixture();f.truth.checks.push({...f.truth.checks[0],id:"2",attempt:2,result:"FAIL"});expect(readiness(f.work,f.state).ready).toBe(false);});
  it("enforces finite continuation and writer fencing",()=>{const f=fixture();f.state.runs=Array(5).fill(f.run);expect(()=>queueRun(f.state,f.work,"extra",f.candidate.sha)).toThrow(/boundary/);f.state.runs=[];f.work.generation++;expect(()=>queueRun(f.state,f.work,"extra",f.candidate.sha)).toThrow(/control/);});
  it("rejects publication of workflow or secret changes",()=>{const f=fixture();expect(()=>createCandidate(f.contract,f.run,{sha:f.contract.baseSha,files:{}},{".github/workflows/ci.yml":"bad"})).toThrow(/paths/);expect(()=>createCandidate(f.contract,f.run,{sha:f.contract.baseSha,files:{}},{"quantity.mjs":"ghp_"+"a".repeat(30)})).toThrow(/credential/);});
  it("requires an authorized, explicit in-scope review check",()=>{const f=fixture();const review={id:"7",author:"human-reviewer",sha:f.candidate.sha,state:"CHANGES_REQUESTED",submittedAt:nowIso(),body:"Change the authentication system"};expect(()=>boundedReview(f.state,review)).toThrow(/Human judgment/);review.body=JSON.stringify({scope:"within-existing-criteria",criterionId:f.work.criteria[0].id,instruction:"Reject fractional input",check:{program:"quantity.mjs",input:"1.5",expectedOutput:'{"error":"invalid_quantity"}\n',expectedExitCode:0}});expect(boundedReview(f.state,review).check.id).toBe("review-7");review.author="outsider";expect(()=>boundedReview(f.state,review)).toThrow(/authorized/);});
  it("keeps paused or human-held Work out of Needs You",()=>{
    const f=fixture();f.state.phase="stopped";f.work.control="paused";
    expect(manifest(f.work,f.state)).toMatchObject({status:"Paused",pendingDecisions:[],attention:null});
    f.work.control="human";
    expect(manifest(f.work,f.state)).toMatchObject({status:"In your hands",pendingDecisions:[],attention:null});
    // A takeover can precede worker reconciliation. The old publication
    // decision must stop appearing as a current owner request immediately.
    f.state.phase="approval";
    expect(manifest(f.work,f.state)).toMatchObject({status:"In your hands",pendingDecisions:[],attention:null});
    f.work.control="agent";
    f.work.generation++;
    expect(manifest(f.work,f.state)).toMatchObject({pendingDecisions:[],attention:null});
  });
  it("binds attention and verification to current candidate, revision and observation",()=>{
    const f=fixture();f.state.phase="approval";f.state.approval=null;
    const current=manifest(f.work,f.state);
    expect(current.attention).toMatchObject({kind:"publication",candidateSha:f.candidate.sha,executionRevision:f.state.revision,criteriaVersion:f.work.criteriaVersion});
    expect(current.verification[0].result).toBe("PASS");
    f.work.criteriaVersion++;
    f.truth.observedAt=new Date(Date.now()-61000).toISOString();
    const changed=manifest(f.work,f.state);
    expect(changed.verification[0].result).toBe("STALE");
    expect(changed.repositoryObservation.status).toBe("stale");
  });
  it.each(["PREPARED","UNKNOWN"] as const)("surfaces blocked %s publication as a reconciliation need without approval or retry",async status=>{
    const f=fixture();
    f.state.phase="publishing";
    f.state.blockers=["The publisher response was lost after the external call."];
    f.state.effects[0]!.status=status;
    f.state.effects[0]!.expectedHead=f.contract.baseSha;
    f.truth.head=f.contract.baseSha;
    f.truth.pr=null;

    const current=manifest(f.work,f.state);
    expect(current.status).toBe("Needs You");
    expect(current.pendingDecisions).toHaveLength(1);
    expect(current.pendingDecisions[0]).toContain(f.state.blockers[0]);
    expect(current.readiness.ready).toBe(false);
    expect(current.attention).toMatchObject({kind:"exception",candidateSha:f.candidate.sha,
      executionRevision:f.state.revision,reconciliation:{
        effects:[{id:f.state.effects[0]!.id,status,candidate:f.candidate.sha,expectedHead:f.contract.baseSha}],
        blockers:f.state.blockers,
        observation:{status:"fresh",repository:f.contract.repository,baseSha:f.contract.baseSha,
          head:f.contract.baseSha,pr:null,authority:true},
      }});
    expect(current.attention?.options.join(" ")).not.toMatch(/approve|continue|retry/i);
    expect(current.nextStep).toMatch(/Do not approve or retry publication/);

    const store={get:vi.fn().mockResolvedValue(f.work),principal:{actorId:f.work.scopeId}} as unknown as WorkStore;
    const executions=new ExecutionStore(store);
    vi.spyOn(executions,"get").mockResolvedValue(f.state);
    const save=vi.spyOn(executions,"save").mockImplementation(async (_work,state)=>state);
    await expect(executions.approve(f.work.id,f.state.revision,f.candidate.sha,true)).rejects.toThrow(/Approval no longer matches/);
    expect(save).not.toHaveBeenCalled();
  });
  it("does not request human reconciliation while an unblocked publication is still in flight",()=>{
    const f=fixture();f.state.phase="publishing";f.state.effects[0]!.status="PREPARED";
    expect(manifest(f.work,f.state)).toMatchObject({pendingDecisions:[],attention:null});
  });
  it("does not invent repository evidence for an unresolved publication",()=>{
    const f=fixture();f.state.phase="publishing";f.state.blockers=["Repository observation failed."];
    f.state.effects[0]!.status="UNKNOWN";f.state.truth=null;
    expect(manifest(f.work,f.state).attention?.reconciliation?.observation).toMatchObject({
      status:"unknown",observedAt:null,repository:null,baseSha:null,head:null,pr:null,authority:false,
    });
  });
  it("records an exact candidate decline without granting publication or another run",async()=>{
    const f=fixture();f.state.phase="approval";f.state.approval=null;
    const store={get:vi.fn().mockResolvedValue(f.work),principal:{actorId:f.work.scopeId}} as unknown as WorkStore;
    const executions=new ExecutionStore(store);
    vi.spyOn(executions,"get").mockResolvedValue(f.state);
    const save=vi.spyOn(executions,"save").mockImplementation(async (_work,state)=>state);
    await expect(executions.decline(f.work.id,f.state.revision+1,f.candidate.sha)).rejects.toThrow(/changed/);
    await executions.decline(f.work.id,f.state.revision,f.candidate.sha);
    expect(save).toHaveBeenCalledOnce();
    expect(f.state.phase).toBe("stopped");
    expect(f.state.approval).toBeNull();
    expect(f.state.runs).toHaveLength(1);
    expect(manifest(f.work,f.state).pendingDecisions).toEqual([]);
    expect(manifest(f.work,f.state).status).toBe("Stopped");
    expect(manifest(f.work,f.state).activity).toMatch(/declined publication/);
  });
});

describe("Golden Work continuation boundary",()=>{
  function continuation(change?: (truth: ReturnType<typeof fixture>["truth"])=>void) {
    const f=fixture();
    f.state.phase="needs_you";
    f.state.blockers=["Human reconciliation required."];
    f.state.effects[0]!.pr=f.truth.pr!.number;
    const truth=structuredClone(f.truth);
    change?.(truth);
    const save=vi.fn(async (_work:Work,state:typeof f.state)=>state);
    const requestStop=vi.fn(async()=>undefined);
    const store={workStore:{get:vi.fn().mockResolvedValue(f.work)},get:vi.fn().mockResolvedValue(f.state),save};
    const observe=vi.fn().mockResolvedValue(truth);
    const worker=new EngineeringWorker(
      store as unknown as ExecutionStore,
      {observe} as unknown as ConstructorParameters<typeof EngineeringWorker>[1],
      {requestStop} as unknown as ConstructorParameters<typeof EngineeringWorker>[2],
      {} as ConstructorParameters<typeof EngineeringWorker>[3],
      ()=>f.contract.profileHash,async()=>true,
    );
    return {f,truth,worker,save,requestStop,observe};
  }

  it.each([
    ["missing authority",(truth:ReturnType<typeof fixture>["truth"])=>{truth.authority=false;}],
    ["different repository",(truth:ReturnType<typeof fixture>["truth"])=>{truth.repository="other/repository";}],
    ["changed base",(truth:ReturnType<typeof fixture>["truth"])=>{truth.baseSha="b".repeat(40);}],
    ["malformed head",(truth:ReturnType<typeof fixture>["truth"])=>{truth.head="not-a-sha";}],
    ["unpublished branch head",(truth:ReturnType<typeof fixture>["truth"])=>{truth.head="b".repeat(40);}],
    ["missing published branch",(truth:ReturnType<typeof fixture>["truth"])=>{truth.head=null;truth.pr=null;}],
    ["closed PR",(truth:ReturnType<typeof fixture>["truth"])=>{truth.pr!.open=false;}],
    ["non-draft PR",(truth:ReturnType<typeof fixture>["truth"])=>{truth.pr!.draft=false;}],
    ["stale observation",(truth:ReturnType<typeof fixture>["truth"])=>{truth.observedAt=new Date(Date.now()-61000).toISOString();}],
  ] as const)("rejects %s before stopping or queueing a run",async (_caseName,change)=>{
    const {f,worker,save,requestStop}=continuation(change);
    const before=structuredClone(f.state);
    await expect(worker.continue(f.work.id,f.state.revision)).rejects.toThrow(/reconcile it before continuing/);
    expect(requestStop).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(f.state).toEqual(before);
  });

  it("queues a fresh run only from the last confirmed published head",async()=>{
    const {f,truth,worker,save}=continuation();
    await worker.continue(f.work.id,f.state.revision);
    expect(save).toHaveBeenCalledOnce();
    expect(f.state.phase).toBe("executing");
    expect(f.state.runs.at(-1)?.parentSha).toBe(truth.head);
    expect(f.state.approval).toBeNull();
    expect(f.state.evidence.every(item=>item.result==="STALE")).toBe(true);
  });

  it("allows a retained candidate to continue before any Work branch was published",async()=>{
    const {f,worker,save}=continuation(truth=>{truth.head=null;truth.pr=null;});
    f.state.effects=[];
    await worker.continue(f.work.id,f.state.revision);
    expect(save).toHaveBeenCalledOnce();
    expect(f.state.runs.at(-1)?.parentSha).toBe(f.candidate.sha);
  });

  it("refuses to adopt an external branch and PR before the first confirmed publication",async()=>{
    const {f,worker,save}=continuation(truth=>{truth.head="b".repeat(40);});
    f.state.effects=[];
    await expect(worker.continue(f.work.id,f.state.revision)).rejects.toThrow(/reconcile it before continuing/);
    expect(save).not.toHaveBeenCalled();
    expect(f.state.runs).toHaveLength(1);
  });

  it("leaves Give Back to the generation-fenced worker reconciliation",async()=>{
    const {f,worker,save,observe}=continuation();
    f.work.generation++;
    await expect(worker.continue(f.work.id,f.state.revision)).rejects.toThrow(/generation/);
    expect(observe).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it("retains only the exact human Give Back head through executor loss",async()=>{
    const f=fixture();
    f.state.effects[0]!.pr=f.truth.pr!.number;
    const humanHead="b".repeat(40);
    const truth=structuredClone(f.truth);
    const save=vi.fn(async (_work:Work,state:typeof f.state)=>state);
    const store={
      workStore:{get:vi.fn(async()=>f.work)},get:vi.fn(async()=>f.state),save,
      claim:vi.fn(async()=>({token:"lease",state:f.state})),release:vi.fn(async()=>undefined),renew:vi.fn(async()=>undefined),
    };
    const observe=vi.fn(async()=>truth);
    const executor={requestStop:vi.fn(async()=>undefined),cleanup:vi.fn(async()=>undefined)};
    const worker=new EngineeringWorker(
      store as unknown as ExecutionStore,
      {observe} as unknown as ConstructorParameters<typeof EngineeringWorker>[1],
      executor as unknown as ConstructorParameters<typeof EngineeringWorker>[2],
      {} as ConstructorParameters<typeof EngineeringWorker>[3],
      ()=>f.contract.profileHash,async()=>true,
    );

    f.work.control="human";f.work.generation++;
    await worker.tick(f.work.id);
    expect(f.state).toMatchObject({phase:"stopped",humanHandoffGeneration:f.work.generation,handoffBaseline:null});

    f.work.control="agent";f.work.generation++;
    truth.head=humanHead;
    await worker.tick(f.work.id);
    expect(f.state.handoffBaseline).toMatchObject({generation:f.work.generation,head:humanHead,prNumber:f.truth.pr!.number});
    expect(f.state.runs.at(-1)?.parentSha).toBe(humanHead);

    f.state.runs.at(-1)!.status="failed";f.state.phase="needs_you";
    const runsBefore=f.state.runs.length;
    truth.head="c".repeat(40);
    await expect(worker.continue(f.work.id,f.state.revision)).rejects.toThrow(/reconcile it before continuing/);
    expect(f.state.runs).toHaveLength(runsBefore);

    truth.head=humanHead;
    await worker.continue(f.work.id,f.state.revision);
    expect(f.state.runs).toHaveLength(runsBefore+1);
    expect(f.state.runs.at(-1)?.parentSha).toBe(humanHead);
    expect(f.state.handoffBaseline?.head).toBe(humanHead);
  });

  it("does not adopt a different PR during a human handoff",async()=>{
    const f=fixture();f.state.effects[0]!.pr=f.truth.pr!.number;
    f.state.humanHandoffGeneration=f.work.generation;
    f.work.generation++;
    const truth=structuredClone(f.truth);
    truth.pr!.number++;
    const save=vi.fn(async (_work:Work,state:typeof f.state)=>state);
    const store={workStore:{get:vi.fn(async()=>f.work)},get:vi.fn(async()=>f.state),save,
      claim:vi.fn(async()=>({token:"lease",state:f.state})),release:vi.fn(async()=>undefined),renew:vi.fn(async()=>undefined)};
    const worker=new EngineeringWorker(store as unknown as ExecutionStore,
      {observe:vi.fn(async()=>truth)} as unknown as ConstructorParameters<typeof EngineeringWorker>[1],
      {requestStop:vi.fn(async()=>undefined),cleanup:vi.fn(async()=>undefined)} as unknown as ConstructorParameters<typeof EngineeringWorker>[2],
      {} as ConstructorParameters<typeof EngineeringWorker>[3],()=>f.contract.profileHash,async()=>true);
    await worker.tick(f.work.id);
    expect(f.state.phase).toBe("needs_you");
    expect(f.state.handoffBaseline).toBeNull();
  });

  it("clears a human handoff baseline when publication is confirmed",async()=>{
    const f=fixture();
    f.state.phase="publishing";
    f.state.handoffBaseline={generation:f.work.generation,head:"b".repeat(40),prNumber:f.truth.pr!.number,recordedAt:nowIso()};
    const uncertain={id:randomUUID(),candidate:f.candidate.sha,expectedHead:"b".repeat(40),status:"UNKNOWN" as const,createdAt:nowIso()};
    f.state.effects.push(uncertain);
    const save=vi.fn(async (_work:Work,state:typeof f.state)=>state);
    const store={workStore:{get:vi.fn(async()=>f.work)},get:vi.fn(async()=>f.state),save,
      claim:vi.fn(async()=>({token:"lease",state:f.state})),release:vi.fn(async()=>undefined),renew:vi.fn(async()=>undefined)};
    const worker=new EngineeringWorker(store as unknown as ExecutionStore,
      {observe:vi.fn(async()=>f.truth)} as unknown as ConstructorParameters<typeof EngineeringWorker>[1],
      {} as ConstructorParameters<typeof EngineeringWorker>[2],
      {} as ConstructorParameters<typeof EngineeringWorker>[3],()=>f.contract.profileHash,async()=>true);
    await worker.tick(f.work.id);
    expect(uncertain.status).toBe("CONFIRMED");
    expect(f.state.handoffBaseline).toBeNull();
    expect(save).toHaveBeenCalledWith(f.work,f.state,"publication_reconciled","lease");
  });
});
