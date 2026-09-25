import { describe,it,expect } from "vitest";
import { randomUUID } from "node:crypto";
import { makeContract,digest } from "./contract.ts";
import { initialExecution,queueRun,readiness,nowIso, type GitHubTruth } from "./execution.ts";
import { createCandidate } from "./github.ts";
import { boundedReview } from "./worker.ts";
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
});
