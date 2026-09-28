import { randomUUID } from "node:crypto";
import { makeContract,digest } from "../lib/engineering/contract.ts";
import { initialExecution,queueRun,nowIso,type GitHubTruth } from "../lib/engineering/execution.ts";
import { createCandidate } from "../lib/engineering/github.ts";
import type { Work } from "../lib/engineering/types.ts";
export function fixture() {
  const criterion=randomUUID(),id=randomUUID();
  const work:Work={id,scopeId:"golden-owner",title:"Normalize quantities",objective:"Accept positive integer quantities and reject all other quantities.",repository:"fixture/golden",
    lifecycle:"active",control:"agent",version:2,generation:2,criteriaVersion:1,criteria:[{id:criterion,statement:"Accept positive integer quantities; reject zero, negative and fractional quantities.",method:"test"}],maxCostUsd:5,maxDurationSeconds:1800,createdAt:nowIso(),updatedAt:nowIso()};
  const profile={id:"node-cli",version:1,repository:work.repository,privateQualification:true as const,baseBranch:"main",allowedPaths:["quantity.mjs"],
    checks:[{id:"positive",program:"quantity.mjs",input:"2",expectedOutput:'{"quantity":2}\n',expectedExitCode:0,criterionIds:[criterion]}],requiredCI:["quantity-ci"],reviewerLogins:["human-reviewer"],policyVersion:1,executor:"claude-code" as const,
    image:"myeve-golden-executor@sha256:f4cf5d653d247d013ebe3054d5333278923736832e4af11f9c350bfec2bea82c",maxRuns:5,maxModelRequests:20,maxOutputTokens:8192};
  const contract=makeContract(work,{scopeId:work.scopeId,scopeKind:"personal",actorId:work.scopeId},profile,{number:1,url:"https://github.com/fixture/golden/issues/1",body:work.objective},"a".repeat(40),"sofie");
  const state=initialExecution(contract,work.generation);
  const run=queueRun(state,work,"initial",contract.baseSha);
  const candidate=createCandidate(contract,run,{sha:contract.baseSha,files:{"quantity.mjs":"console.log(0);"}},{"quantity.mjs":"console.log(2);"});
  run.status="candidate";run.candidate=candidate.sha;run.resourceReleasedAt=nowIso();state.candidates.push(candidate);state.phase="observing";
  state.approval={id:randomUUID(),candidate:candidate.sha,actor:work.scopeId,generation:work.generation,at:nowIso(),boundedUpdates:true};
  state.effects.push({id:randomUUID(),candidate:candidate.sha,expectedHead:null,status:"CONFIRMED",createdAt:nowIso()});
  const artifact="protected output comparison";
  state.evidence.push({id:randomUUID(),workId:id,candidate:candidate.sha,base:contract.baseSha,criteriaVersion:1,profileHash:contract.profileHash,environment:profile.image,check:"positive",producer:"protected-supervisor",attemptId:run.attemptId,observedAt:nowIso(),result:"PASS",artifact,artifactHash:digest(artifact)});
  const truth:GitHubTruth={observedAt:nowIso(),authority:true,repository:work.repository,baseSha:contract.baseSha,head:candidate.sha,pr:{number:1,url:"https://github.com/fixture/golden/pull/1",draft:true,open:true},checks:[{id:"1",name:"quantity-ci",sha:candidate.sha,attempt:1,result:"PASS",details:""}],reviews:[]};
  state.truth=truth;
  return {work,profile,contract,state,run,candidate,truth};
}
