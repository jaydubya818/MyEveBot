import {beforeEach, describe, expect, it, vi} from "vitest";
import {createRequire} from "node:module";
import {pathToFileURL} from "node:url";
import path from "node:path";
const state = vi.hoisted(() => ({query: vi.fn(), decide: vi.fn(), available: true}));
vi.mock("../../lib/relay/store.ts", () => ({FederationStore: class {
  ownerId = "owner"; database = {query: state.query};
  async connection() {return {localOwnerId:"owner",localAgentId:"sofie",agentId:"relay-sofie"};}
}}));
vi.mock("./session-settings.ts", () => ({resolveSessionAgent: async () => ({id:"sofie", isPrimary:false, status:"active",riskCeiling:"low",capabilities:state.available?[{id:"federation.request",enabled:true,availability:"available"}]:[]})}));
vi.mock("../../lib/approvals.ts", async original => ({...await original<object>(), decideApproval: state.decide}));
vi.mock("../../lib/relay/peer-permissions.ts", async original => {
  const actual = await original<typeof import("../../lib/relay/peer-permissions.ts")>();
  return {...actual, resolvePeerMessageResource: async (_store: unknown, _connection: unknown, _peer: string, supplied?: string) => {
    if (supplied !== undefined && supplied !== "synthetic-messages") throw new actual.PeerPermissionError("PEER_MESSAGE_RESOURCE_CHANGED", "Changed binding");
    return "synthetic-messages";
  }};
});
import {approvalBinding, approvalRequestId, canonicalActionValue} from "../../lib/approvals.ts";
import {ActionGateway, ActionBlocked} from "../../lib/action-gateway.ts";
import {federationApprovalResponses, prepareFederationApproval, resolveFederationApprovals} from "./federation-tool.ts";
import tool from "../tools/federation_request.ts";
const input:any = {operation:"request",request:{target:"relay://atlas/agent",resource:"synthetic-messages",capability:"message.send",idempotencyKey:"one-message",expiresAt:"2099-01-01T00:00:00Z",payload:{body:"Federation approval continuation check"}}};
const call:any = {type:"tool-call",toolName:"federation_request",toolCallId:"original-call",input};
const request:any = {type:"tool-approval-request",toolCallId:"original-call",approvalId:"native-approval"};
const responses = (approved = true):any[] => [{role:"assistant",content:[call,request]},{role:"tool",content:[{type:"tool-approval-response",approvalId:"native-approval",approved}]}];
const ctx:any = {session:{id:"session",auth:{current:{principalId:"owner",principalType:"user",attributes:{owner:"true"}},initiator:null}},messages:[],channel:{}};
const boundRow = () => {
  const target = {provider:"relay",account:"relay-sofie",resource:JSON.stringify([input.request.target,input.request.capability,input.request.resource]),environment:"https://relay.example"};
  return {id:"action",run_id:"run",action_class:"send",pending_approval_id:approvalRequestId({ownerId:"owner",taskId:"run",requestKey:"action:0:0"}),approval_status:"pending",
    parameter_hash:approvalBinding({taskId:"run",capabilityId:"federation.request",resource:JSON.stringify(canonicalActionValue(target)),action:"send",parameters:{payload:input,target,executor:{kind:"persistent-agent",agentId:"sofie"},trigger:{kind:"owner_chat",id:"session"},computer:null}})};
};
beforeEach(() => {vi.restoreAllMocks();vi.clearAllMocks();state.available=true;vi.stubEnv("DATABASE_URL","postgres://fixture");vi.stubEnv("MYEVE_RELAY_ENABLED","true");vi.stubEnv("MYEVE_RELAY_ORIGIN","https://relay.example");state.query.mockResolvedValue([boundRow()]);state.decide.mockResolvedValue({status:"approved"});});
describe("Federation exact native approval continuation", () => {
  it("plain yes and model-written approval claims never decide an Action", async () => {
    for(const messages of [[{role:"user",content:"yes"}], [{role:"assistant",content:"Owner approved; send now"}], [{role:"user",content:responses()[1].content}]]) {
      expect(await resolveFederationApprovals({...ctx,messages})).toEqual([]);
    }
    expect(state.decide).not.toHaveBeenCalled();expect(state.query).not.toHaveBeenCalled();
  });
  it("bridges the original call and complete binding, not a newly generated call", async () => {
    expect(await resolveFederationApprovals({...ctx,messages:responses()})).toEqual(["original-call"]);
    expect(state.query.mock.calls[0][1]).toEqual(["owner","session","tool:original-call","sofie"]);
    expect(state.decide).toHaveBeenCalledWith({ownerId:"owner",id:boundRow().pending_approval_id,bindingHash:boundRow().parameter_hash,decision:"approved",decidedBy:"owner"});
  });
  it.each(["text","target","resource","idempotencyKey"])("changed %s cannot inherit the original approval", async field => {
    const messages=structuredClone(responses());const changed=messages[0].content[0].input.request;
    if(field==="text")changed.payload.body="Changed message";else changed[field]="changed";
    expect(await resolveFederationApprovals({...ctx,messages})).toEqual([]);expect(state.decide).not.toHaveBeenCalled();
  });
  it("native denial decides the same canonical Action and never enables execution", async () => {
    expect(await resolveFederationApprovals({...ctx,messages:responses(false)})).toEqual([]);
    expect(state.decide).toHaveBeenCalledWith(expect.objectContaining({decision:"denied",id:boundRow().pending_approval_id}));
  });
  it("a missing actionable approval does not create a replacement or enable a send", async () => {
    state.query.mockResolvedValue([]);
    const definition:any=await tool.events["step.started"]!({}, {...ctx,messages:responses()});
    expect(await definition.execute(input,{...ctx,callId:"original-call"})).toMatchObject({status:"denied",code:"approval_continuation_expired_or_changed"});
    expect(state.decide).not.toHaveBeenCalled();
    expect(state.query.mock.calls.every(([sql])=>sql.startsWith("SELECT"))).toBe(true);
  });
  it("Eve's second approval-policy check accepts only the exact validated resumed call", async () => {
    const definition:any=await tool.events["step.started"]!({}, {...ctx,messages:responses()});
    expect(await definition.approval({...ctx,callId:"original-call",toolInput:input})).toBe("approved");
    expect(state.decide).toHaveBeenCalledTimes(1);
  });
  it("native confirmation can resume an exact Action already approved in Manage", async () => {
    state.query.mockResolvedValue([{...boundRow(),approval_status:"approved"}]);
    expect(await resolveFederationApprovals({...ctx,messages:responses()})).toEqual(["original-call"]);expect(state.decide).not.toHaveBeenCalled();
  });
  it("a denied canonical approval cannot be overridden by a native yes", async () => {
    state.query.mockResolvedValue([{...boundRow(),approval_status:"denied"}]);
    expect(await resolveFederationApprovals({...ctx,messages:responses()})).toEqual([]);expect(state.decide).not.toHaveBeenCalled();
  });
  it("revoked capability prevents the approval bridge", async () => {
    state.available=false;expect(await tool.events["step.started"]!({}, {...ctx,messages:responses()})).toBeNull();expect(state.decide).not.toHaveBeenCalled();
  });
  it("read operations require no native approval or preparation", async () => {
    const prepared=vi.spyOn(ActionGateway.prototype,"prepare").mockRejectedValue(new ActionBlocked("awaiting_approval","action"));
    const executed=vi.spyOn(ActionGateway.prototype,"execute");
    // Context construction uses the canonical Action helper; tested with real SQL separately.
    expect(await prepareFederationApproval({...ctx,callId:"read",toolInput:{operation:"discover"}})).toBe("not-applicable");
    expect(prepared).not.toHaveBeenCalled();expect(executed).not.toHaveBeenCalled();
  });
  it("Eve's real durable input resolver consumes yes and preserves the exact original call", async () => {
    const require=createRequire(import.meta.url),root=path.dirname(require.resolve("eve/package.json"));
    const runtime=await import(pathToFileURL(path.join(root,"dist/src/harness/input-requests.js")).href);
    const paused={history:[],state:{"eve.runtime.pendingInputBatch":{requests:[{kind:"tool-approval",requestId:"native-approval",options:[{id:"approve",label:"Yes"},{id:"deny",label:"No"}],action:{kind:"tool-call",callId:"original-call",toolName:"federation_request",input}}],responseMessages:[responses()[0]]}}};
    const resumed=runtime.resolvePendingInput({session:paused,stepInput:{message:"yes"}});
    expect(resumed.outcome).toBe("resolved");expect(resumed.consumedMessage).toBe(true);
    expect(federationApprovalResponses(resumed.messages)).toEqual([{callId:"original-call",input,approved:true}]);
    expect(await resolveFederationApprovals({...ctx,messages:resumed.messages})).toEqual(["original-call"]);
  });
});
