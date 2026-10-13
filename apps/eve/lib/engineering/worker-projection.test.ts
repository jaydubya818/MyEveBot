import {beforeEach,describe,it,expect,vi} from "vitest";
const mocks=vi.hoisted(()=>({execution:vi.fn(),routing:vi.fn()}));
vi.mock("./execution-store.ts",()=>({ExecutionStore:class{get=mocks.execution;}}));
vi.mock("./routing-store.ts",async original=>({...await original<typeof import("./routing-store.ts")>(),RoutingStore:class{snapshot=mocks.routing;}}));
import retained from "../../test/gap2b-retained-fixture.json";
import {EngineeringWorkerProjectionStore} from "./worker-projection.ts";
import {renderToStaticMarkup} from "react-dom/server";
import {createElement} from "react";
import {CurrentWorkTruth} from "../../components/engineering/current-work-truth.tsx";
import {currentTruthLines} from "./current-truth-lines.ts";
import {fixture} from "../../test/engineering-fixtures.ts";
import {digest} from "./contract.ts";
import type {WorkStore} from "./store.ts";
let data:typeof retained;
let queries:string[];
let held:number|null=null;
let terminalPreparation:any=null;
let heldPreparations:any[]=[];
const work={...fixture().work,id:retained.workspace.work_id,version:2,generation:2,criteriaVersion:1,control:"agent" as const,lifecycle:"active" as const};
function reader(authority=vi.fn().mockRejectedValue(new Error("revoked"))){
 const store={principal:{scopeId:"authenticated-native-fixture",scopeKind:"personal",actorId:"authenticated-native-fixture"},get:async()=>work,database:{query:async(sql:string)=>{
 queries.push(sql);if(sql.includes('SELECT d.factory_preparation AS held_preparation'))return heldPreparations;if(sql.includes('SELECT factory_preparation,factory_observation'))return terminalPreparation?[terminalPreparation]:[];if(sql.includes('jsonb_agg(c)'))return [{calls:[],observations:[],legacy:{spent_microusd:0,reserved_microusd:0,usage_unknown:false}}];if(sql.includes("to_regprocedure"))return [{present:held===null?null:"function"}];
 if(sql.includes("SELECT engineering_completion_remaining"))throw new Error("Budget and hold must use one SQL snapshot");
 if(sql.includes("FROM engineering_direct_workspaces n"))return[data.workspace];
 if(sql.includes("FROM engineering_native_runtime"))return[data.runtime];
 if(sql.includes("FROM engineering_work_model_budget b"))return[{...data.budget,held_microusd:held}];
 if(sql.includes("FROM engineering_route_runs r"))return[data.run];
 if(sql.includes("FROM engineering_direct_verification_jobs"))return[data.job];return[];
 }}} as unknown as WorkStore;
 return new EngineeringWorkerProjectionStore(store,"auth-native-sofie",authority);
}
beforeEach(()=>{Object.assign(work,{control:"agent",version:2,generation:2});data=structuredClone(retained);queries=[];held=null;terminalPreparation=null;heldPreparations=[];mocks.execution.mockResolvedValue(null);mocks.routing.mockResolvedValue({decision:{id:data.workspace.decision_id,status:"ADMITTED",workVersion:2},runs:[{id:data.run.id,route:"DEEP_AGENT",providerId:"myeve-native-sofie",status:"RUNNING",decisionId:data.workspace.decision_id,workVersion:2,workGeneration:2}],transitions:[]});});
describe("retained failed journey Current Truth",()=>{
 it("D: preserves failed candidate, checks, unverified repair draft and immutable Result",async()=>{const before=JSON.stringify(data);const {projection:p}=await reader().get(work.id);expect(p.runTruth.activeRun).toBeNull();expect(p.currentRun).toBeNull();expect(p.runTruth.latestRun?.id).toBe(data.run.id);expect(p.draft?.revision).toBe(6);expect(p.draft?.differsFromCandidate).toBe(true);expect(p.verification.status).toBe("FAIL");expect(p.verification.evidenceCount).toBe(10);expect(p.nativeResult?.proof.outcome).toBe("FAILED");expect(p.readiness.ready).toBe(false);expect(p.readiness.reasons.join()).not.toContain("verification is PARTIAL");expect(p.conversationRuntime?.spentUsd).toBe(.777654);expect(JSON.stringify(data)).toBe(before);expect(queries.every(s=>s.trimStart().startsWith("SELECT"))).toBe(true);});
 it("E: binds repaired-candidate PASS to its own proof and protected evidence",async()=>{const candidate=data.workspace.candidates[0];candidate.sha="a".repeat(40);candidate.files=data.workspace.draft_files;data.job.candidate_sha=candidate.sha;data.workspace.native_proof.resultRevision=candidate.sha;data.workspace.native_proof.outcome="PARTIAL";for(const e of data.workspace.native_proof.evidence){e.resultRevision=candidate.sha;e.state="PASS";}
 for(const e of data.workspace.evidence){e.candidate=candidate.sha;e.result="PASS";}data.workspace.native_proof_hash=digest(data.workspace.native_proof);
 const {projection:p}=await reader().get(work.id);expect(p.verification.status).toBe("PASS");expect(p.draft?.differsFromCandidate).toBe(false);expect(p.readiness.ready).toBe(false);expect(p.nativeResult?.proof.outcome).toBe("PARTIAL");});
 it("reports additive completion capacity separately without double counting provider exposure",async()=>{held=200000;data.budget.status="ACTIVE";const {projection:p}=await reader().get(work.id);expect(p.completionBudget.heldUsd).toBe(.2);expect(p.completionBudget.remainingUsd).toBeCloseTo(.322346);expect(p.conversationRuntime?.spentUsd).toBe(.777654);expect(p.conversationRuntime?.reservedUsd).toBe(0);});
 it("keeps unobserved completion capacity unknown on 0052",async()=>{const {projection:p}=await reader().get(work.id);expect(p.completionBudget.heldUsd).toBeNull();expect(p.completionBudget.remainingUsd).toBeNull();});
 it("never reuses older verification for a new candidate",async()=>{data.workspace.candidates[0].sha="b".repeat(40);const {projection:p}=await reader().get(work.id);expect(p.verification.status).toBe("UNKNOWN");expect(p.verification.evidenceCount).toBe(0);expect(p.latestResult?.candidate).toBe(retained.workspace.candidates[0].sha);});
 it("A: observes current authority plus writer; never grants it by projection",async()=>{data.budget.status="ACTIVE";data.run.deadline="2099-01-01T00:00:00Z";data.workspace.deadline=data.run.deadline;Object.assign(data.run,{completion:{id:data.run.id,expiresAt:"2099-01-01T00:00:00Z",stages:[{id:"REPAIR",calls:3}]}});const authority=vi.fn().mockResolvedValue({runId:data.run.id});const {projection:p}=await reader(authority).get(work.id);expect(p.runTruth.activeRun?.id).toBe(data.run.id);expect(authority).toHaveBeenCalledOnce();expect(p.runTruth.writerSession.productive).toBe(true);});
 it("keeps revoked provider qualification inactive even before deadline",async()=>{data.budget.status="ACTIVE";data.run.deadline="2099-01-01T00:00:00Z";const {projection:p}=await reader().get(work.id);expect(p.runTruth.activeRun).toBeNull();expect(p.runTruth.latestRun?.effectiveStatus).toBe("NOT_EXECUTABLE");});
 it("uses one formatter for Work and chat without collapsing no active Run into no history",async()=>{const {projection:p}=await reader().get(work.id);const lines=currentTruthLines(p).join("\n");const markup=renderToStaticMarkup(createElement(CurrentWorkTruth,{projection:p})); for(const line of currentTruthLines(p)) expect(markup).toContain(line.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#x27;"));expect(lines).toContain("Active Run: none currently confirmed executable");expect(lines).toContain(`Latest Run: ${data.run.id}`);expect(lines).toContain("Protected verification: FAIL");expect(lines).toContain("unverified changes");expect(lines).toContain("$0.777654");expect(lines).not.toContain("Last Run: none");});
});

it("paused later-generation Work preserves its historical Result without claiming execution never happened",async()=>{
 Object.assign(work,{control:'paused',version:3,generation:3});
 mocks.routing.mockResolvedValue({decision:null,runs:[],transitions:[]});
 data.budget.status='ACTIVE';data.runtime.inflight=false;data.runtime.usage_unknown=false;
 const before=JSON.stringify(data),{projection:p}=await reader().get(work.id);
 expect(p.latestResult).not.toBeNull();expect(p.activity).toContain('prior execution');
 expect(p.nextStep).toContain('retained Result and Proof');expect(p.nextStep).not.toContain('No execution has started');
 expect(p.authoritySummary.admitted).toBe(false);expect(p.readiness.ready).toBe(false);expect(JSON.stringify(data)).toBe(before);
});

it('same-generation terminal remains visible after Work version changes',async()=>{
 work.version=3;
 const now=Date.now();
 terminalPreparation={factory_preparation:{request:{requestId:'request',workGeneration:2},terminal:{accounting:'HOLD',receipt:{schema:'factory-capability-preparation-terminal/v1',ownerId:'owner',organizationId:'org',installationId:'install',agentId:'agent',clientId:'client',backendId:'backend',incarnation:'epoch',enrollmentVersion:1,requestId:'request',workId:work.id,generation:2,missionId:'mission',factoryId:'factory',factoryVersion:'a'.repeat(64),sourceDigest:'b'.repeat(64),configurationDigest:'c'.repeat(64),nativeRequestDigest:'d'.repeat(64),planId:'plan',planDigest:'e'.repeat(64),receiverSequence:3,receiverHeadDigest:'f'.repeat(64),outcome:'ADMISSION_UNCERTAIN',reasonCode:'RESTORE_OR_COMMIT_AMBIGUITY',nativeOutcomeDigest:'a'.repeat(64),issuedAt:now,expiresAt:now+30000}}}};
 const {projection:p}=await reader().get(work.id);
 expect(p.factoryPreparation?.state).toBe('ADMISSION_UNCERTAIN');expect(p.activity).toContain('reservation stays held');expect(p.nextStep).toContain('Do not resend');
 const query=queries.find(sql=>sql.includes('SELECT factory_preparation,factory_observation'))!;expect(query).toContain("'{request,workGeneration}'=$4");expect(query).not.toContain('work_version=$4');
});

it('prior-generation reservation HOLD remains visible without replacing current-generation state or controls',async()=>{
 const now=Date.now(),receipt={schema:'factory-capability-preparation-terminal/v1',ownerId:'authenticated-native-fixture',organizationId:'org',installationId:'install',agentId:'agent',clientId:'client',backendId:'backend',incarnation:'epoch',enrollmentVersion:1,requestId:'prior-request',workId:work.id,generation:1,missionId:'mission',factoryId:'factory',factoryVersion:'a'.repeat(64),sourceDigest:'b'.repeat(64),configurationDigest:'c'.repeat(64),nativeRequestDigest:'d'.repeat(64),planId:'plan',planDigest:'e'.repeat(64),receiverSequence:3,receiverHeadDigest:'f'.repeat(64),outcome:'ADMISSION_UNCERTAIN',reasonCode:'RESTORE_OR_COMMIT_AMBIGUITY',nativeOutcomeDigest:'a'.repeat(64),issuedAt:now,expiresAt:now+30000};
 const before=(await reader().get(work.id)).projection;
 heldPreparations=[{held_preparation:{terminal:{accounting:'HOLD',receipt}}}];
 const p=(await reader().get(work.id)).projection;
 expect(p.factoryReservationHolds).toEqual([{requestId:'prior-request',generation:1,state:'ADMISSION_UNCERTAIN',accounting:'HOLD'}]);
 expect(p.factoryPreparation).toEqual(before.factoryPreparation);expect(p.status).toBe(before.status);expect(p.control).toBe(before.control);expect(p.runTruth).toEqual(before.runTruth);
 heldPreparations=Array(129).fill(heldPreparations[0]);const limited=(await reader().get(work.id)).projection;expect(limited.factoryReservationHolds).toHaveLength(128);expect(limited.factoryReservationHistoryIncomplete).toBe(true);expect(limited.status).toBe(before.status);expect(limited.control).toBe(before.control);
 heldPreparations=[{held_preparation:{terminal:{accounting:'HOLD',receipt:{...receipt,ownerId:'foreign'}}}}];const foreign=(await reader().get(work.id)).projection;expect(foreign.factoryReservationHolds).toEqual([]);expect(foreign.factoryReservationHistoryIncomplete).toBe(true);expect(foreign.control).toBe(before.control);
});

it('retains unresolved prior preparations across owner revision without inventing terminal or accounting truth',async()=>{
 const before=(await reader().get(work.id)).projection;
 const row={scope_id:'authenticated-native-fixture',scope_kind:'personal',work_id:work.id,
  held_preparation:{request:{requestId:'unresolved-request',workId:work.id,workGeneration:1},state:'BLOCKED'}};
 heldPreparations=[row];const p=(await reader().get(work.id)).projection;
 expect(p.factoryUnresolvedPreparations).toEqual([{requestId:'unresolved-request',generation:1,state:'UNRESOLVED',accounting:'UNRESOLVED'}]);
 expect(p.factoryReservationHolds).toEqual([]);expect(p.factoryPreparation).toEqual(before.factoryPreparation);expect(p.status).toBe(before.status);expect(p.control).toBe(before.control);expect(p.runTruth).toEqual(before.runTruth);
 expect(queries.find(sql=>sql.includes('SELECT d.factory_preparation AS held_preparation'))).toContain('NOT EXISTS(SELECT 1 FROM engineering_route_runs');
 heldPreparations=Array(129).fill(row);const bounded=(await reader().get(work.id)).projection;expect(bounded.factoryUnresolvedPreparations).toHaveLength(128);expect(bounded.factoryReservationHistoryIncomplete).toBe(true);expect(bounded.control).toBe(before.control);
 heldPreparations=[{...row,scope_id:'foreign'}];const foreign=(await reader().get(work.id)).projection;expect(foreign.factoryUnresolvedPreparations).toEqual([]);expect(foreign.factoryReservationHistoryIncomplete).toBe(true);expect(foreign.status).toBe(before.status);
});
