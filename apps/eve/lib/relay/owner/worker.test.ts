import {beforeEach,describe,expect,it,vi} from "vitest";
const f=vi.hoisted(()=>({query:vi.fn(),attach:vi.fn(),cancel:vi.fn()}));
vi.mock("../../../agent/lib/receipts-db.ts",()=>({db:()=>({query:f.query})}));
vi.mock("./config.ts",()=>({ownerChannelConfiguration:()=>({enabled:true})}));
vi.mock("eve/client",()=>({Client:class{sessions={attach:f.attach};}}));
import {cancelOwnerRuntime} from "./worker.ts";
beforeEach(()=>{vi.clearAllMocks();f.query.mockResolvedValue([{session_id:"session",dispatch_id:"dispatch"}]);f.attach.mockReturnValue({cancel:f.cancel});});
describe("current Eve cancellation responses",()=>{
 it.each([{status:"accepted",sessionId:"session"},{status:"no_active_turn"}])("records a terminal acknowledgement for %j",async result=>{
  f.cancel.mockResolvedValue(result);await cancelOwnerRuntime("owner","run","agent");
  expect(f.attach).toHaveBeenCalledWith("session");
  expect(f.query.mock.calls.some(([sql])=>sql.includes("SET cancel_acknowledged_at"))).toBe(true);
 });
 it("does not acknowledge a response for another session",async()=>{
  f.cancel.mockResolvedValue({status:"accepted",sessionId:"other"});await cancelOwnerRuntime("owner","run","agent");
  expect(f.query.mock.calls.some(([sql])=>sql.includes("SET cancel_acknowledged_at"))).toBe(false);
 });
});
