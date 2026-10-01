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
const work={...fixture().work,id:retained.workspace.work_id,version:2,generation:2,criteriaVersion:1,control:"agent" as const,lifecycle:"active" as const};
function reader(authority=vi.fn().mockRejectedValue(new Error("revoked"))){
 const store={principal:{scopeId:"authenticated-native-fixture",scopeKind:"personal",actorId:"authenticated-native-fixture"},get:async()=>work,database:{query:async(sql:string)=>{
 queries.push(sql);if(sql.includes('jsonb_agg(c)'))return [{calls:[],observations:[],legacy:{spent_microusd:0,reserved_microusd:0,usage_unknown:false}}];if(sql.includes("to_regprocedure"))return [{present:held===null?null:"function"}];
 if(sql.includes("SELECT engineering_completion_remaining"))throw new Error("Budget and hold must use one SQL snapshot");
 if(sql.includes("FROM engineering_direct_workspaces n"))return[data.workspace];
 if(sql.includes("FROM engineering_native_runtime"))return[data.runtime];
 if(sql.includes("FROM engineering_work_model_budget b"))return[{...data.budget,held_microusd:held}];
 if(sql.includes("FROM engineering_route_runs r"))return[data.run];
 if(sql.includes("FROM engineering_direct_verification_jobs"))return[data.job];return[];
 }}} as unknown as WorkStore;
 return new EngineeringWorkerProjectionStore(store,"auth-native-sofie",authority);
}
beforeEach(()=>{data=structuredClone(retained);queries=[];held=null;mocks.execution.mockResolvedValue(null);mocks.routing.mockResolvedValue({decision:{id:data.workspace.decision_id,status:"ADMITTED",workVersion:2},runs:[{id:data.run.id,route:"DEEP_AGENT",providerId:"myeve-native-sofie",status:"RUNNING",decisionId:data.workspace.decision_id,workVersion:2,workGeneration:2}],transitions:[]});});
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
