import {beforeEach,describe,expect,it,vi} from "vitest";
const f=vi.hoisted(()=>({query:vi.fn(),fetch:vi.fn()}));
vi.mock("../../../agent/lib/receipts-db.ts",()=>({db:()=>({query:f.query})}));
vi.mock("./config.ts",()=>({ownerChannelConfiguration:()=>({enabled:true})}));
vi.mock("./runtime.ts",()=>({OWNER_RUNTIME_HEADER:"x-myeve-owner-run",signOwnerRuntime:()=>"signed-cancel-claim"}));
import {cancelOwnerRuntime} from "./worker.ts";
const acknowledged=()=>f.query.mock.calls.some(([sql])=>String(sql).includes("SET cancel_acknowledged_at"));
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal("fetch",f.fetch);f.query.mockResolvedValue([{session_id:"session",dispatch_id:"dispatch"}]);});
describe("Eve 0.66 cancellation endpoint",()=>{
 it("posts a signed cancel claim to the exact recorded session without redirects",async()=>{
  f.fetch.mockResolvedValue(new Response(JSON.stringify({status:"accepted",sessionId:"session"}),{status:200}));
  await cancelOwnerRuntime("owner","run","agent");
  const [url,init]=f.fetch.mock.calls[0];
  expect(String(url)).toMatch(/\/eve\/v1\/session\/session\/cancel$/);
  expect(init).toMatchObject({method:"POST",redirect:"error",headers:{"x-myeve-owner-run":"signed-cancel-claim"}});
  expect(acknowledged()).toBe(true);
 });
 it.each([{status:"no_active_turn"},{status:"no_active_turn",sessionId:"session"}])("acknowledges %j without fabricating a session",async body=>{
  f.fetch.mockResolvedValue(new Response(JSON.stringify(body),{status:200}));
  await cancelOwnerRuntime("owner","run","agent");expect(acknowledged()).toBe(true);
 });
 it.each([{status:"accepted",sessionId:"other"},{status:"accepted"},{status:"no_active_turn",sessionId:"other"},{status:"unknown",sessionId:"session"}])("does not acknowledge %j",async body=>{
  f.fetch.mockResolvedValue(new Response(JSON.stringify(body),{status:200}));
  await cancelOwnerRuntime("owner","run","agent");expect(acknowledged()).toBe(false);
 });
 it("does not acknowledge a failed HTTP response but still records observation",async()=>{
  f.fetch.mockResolvedValue(new Response("{}",{status:503}));
  await cancelOwnerRuntime("owner","run","agent");
  expect(acknowledged()).toBe(false);
  expect(f.query.mock.calls.some(([sql])=>String(sql).includes("SET last_observed_at"))).toBe(true);
 });
});
