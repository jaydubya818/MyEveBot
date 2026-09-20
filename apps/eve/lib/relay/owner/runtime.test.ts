import { describe,expect,it } from "vitest";
import { assertOwnerRuntimeRoute,signOwnerRuntime,verifyOwnerRuntime,type OwnerRuntimeClaim } from "./runtime.ts";

const claim:OwnerRuntimeClaim={ownerId:"fixture-owner",agentId:"fixture-agent",runId:"fixture-run",dispatchId:"11111111-1111-4111-8111-111111111111",expiresAt:Date.now()+60000,purpose:"execute"};
const request=(path:string,method="GET")=>new Request(`https://myeve.invalid/eve/v1/${path}`,{method});
describe("owner runtime transport scope",()=>{
 it("allows initial admission but never a second turn",()=>{
  expect(()=>assertOwnerRuntimeRoute(request("session","POST"),claim,{})).not.toThrow();
  expect(()=>assertOwnerRuntimeRoute(request("session","POST"),claim,{session_id:"first"})).toThrow();
  expect(()=>assertOwnerRuntimeRoute(request("session/first","POST"),claim,{session_id:"first"})).toThrow();
 });
 it("observation can only read the recorded session",()=>{
  const observe={...claim,purpose:"observe" as const};
  expect(()=>assertOwnerRuntimeRoute(request("session/first/stream"),observe,{session_id:"first"})).not.toThrow();
  expect(()=>assertOwnerRuntimeRoute(request("session/other/stream"),observe,{session_id:"first"})).toThrow();
  expect(()=>assertOwnerRuntimeRoute(request("session","POST"),observe,{})).toThrow();
 });
 it("cancellation cannot read, create, reset or continue sessions",()=>{
  const cancel={...claim,purpose:"cancel" as const};
  expect(()=>assertOwnerRuntimeRoute(request("session/first/cancel","POST"),cancel,{session_id:"first"})).not.toThrow();
  for(const path of ["session","session/first","session/reset","session/first/stream"]){expect(()=>assertOwnerRuntimeRoute(request(path,"POST"),cancel,{session_id:"first"})).toThrow();}
 });
 it("binds purpose and expiry into the authenticated claim",()=>{
  const key="isolated-fixture-key-not-a-real-secret";
  const token=signOwnerRuntime(claim,key);expect(verifyOwnerRuntime(token,key)).toEqual(claim);
  expect(()=>verifyOwnerRuntime(token,key+"wrong")).toThrow();
  expect(()=>verifyOwnerRuntime(signOwnerRuntime({...claim,expiresAt:Date.now()-1},key),key)).toThrow();
 });
});
