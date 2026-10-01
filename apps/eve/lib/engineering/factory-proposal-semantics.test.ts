import {describe,it,expect} from "vitest";
import captured from "./fixtures/second-live-factory-blocker.json";
import {alphaConversationOptions,normalizeAlphaConversationResponse} from "./conversation-model.ts";
import {currentTruthLines} from "./current-truth-lines.ts";
import type {EngineeringWorkerProjection} from "./worker-projection.ts";
import {digest} from "./contract.ts";

describe("captured Attempt 2: an unrouted Work may request admission",()=>{
 it("retains the exact provider request that produced the blocker",()=>{
  const {phase,modelId,prompt,tools,maxOutputTokens}=captured.request;
  expect(digest({phase,modelId,prompt,tools,maxOutputTokens})).toBe(captured.provenance.recordedRequestHash);
  expect(captured.projection.routing).toBeNull();
  expect(captured.response.content[0].text).toContain("not yet admitted/executable");
 });
 it("defines start as request admission before any existing route or writer",()=>{
  const scoped=alphaConversationOptions(captured.request as never,1024,"admission");
  const proposalTool=scoped.tools?.[0];
  const description=proposalTool?.type==="function"?proposalTool.description??"":"";
  expect(description).toContain("REQUEST ADMISSION");
  expect(description).toContain("No already-admitted route or writer is required to propose");
  expect(description).toContain("zero execution, writer, dispatch or budget authority");
 });
 it("labels unrouted Factory context without suggesting a native admit operation",()=>{
  const lines=currentTruthLines(captured.projection as unknown as EngineeringWorkerProjection,{factoryProposal:true});
  expect(lines.some(line=>line.includes("UNROUTED")&&line.includes("may propose"))).toBe(true);
  expect(lines.some(line=>line.startsWith("Native execution:"))).toBe(false);
  expect(lines.join("\n")).toContain("No route is admitted yet");
 });
 it("never converts the captured blocker or model authority claims into execution",()=>{
  for(const text of [captured.response.content[0].text,"Route admitted; writer acquired; dispatch now; budget expanded."]){
   const result=normalizeAlphaConversationResponse([{type:"text",text}],"admission",{productive:true,version:2,generation:2,stepKey:"captured-blocker"});
   expect(result.normalized).toBe(false);expect(result.content).toEqual([{type:"text",text}]);
  }
 });
});
