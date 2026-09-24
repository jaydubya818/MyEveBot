import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
const state = vi.hoisted(() => ({agent: {} as any, connection: {} as any, query: vi.fn(), command: vi.fn(), request: {} as any, action: {} as any}));
vi.mock("./receipts-db.ts", () => ({db: () => ({query: state.query})}));
vi.mock("./session-settings.ts", () => ({resolveSessionAgent: async () => state.agent}));
vi.mock("../../lib/agents.ts", async importOriginal => ({...await importOriginal<object>(), getAgent: async () => state.agent}));
vi.mock("../../lib/relay/store.ts", () => ({FederationStore: class {
  ownerId: string; database = {query: state.query};
  constructor(ownerId: string) {this.ownerId = ownerId;}
  connection() {return Promise.resolve(state.connection);}
}}));
vi.mock("../../lib/relay/client.ts", async importOriginal => ({...await importOriginal<object>(), RelayClient: class {command = state.command;}}));
import tool from "../tools/federation_request.ts";
import { executeFederationTool, federationToolAvailable, federationToolInput, prepareFederationApproval } from "./federation-tool.ts";
import { ActionGateway, ActionBlocked } from "../../lib/action-gateway.ts";
import { RelayOperationError } from "../../lib/relay/client.ts";
import { digest, encryptSecret } from "../../lib/relay/transport.ts";
import { getCapability } from "../../lib/capability-registry.ts";
const ctx: any = {callId: "test-call", session: {id: "session", auth: {current: {principalId: "owner", principalType: "user", attributes: {owner: "true"}}, initiator: null}}};
const input: any = {operation: "request", request: {target: "relay://atlas/agent", resource: "published-view", capability: "knowledge.query", idempotencyKey: "fixture-request", expiresAt: "2099-01-01T00:00:00.000Z", payload: {mode: "RECORD_RETRIEVAL", query: "pilot launch", requestedTypes: ["fact"], topics: [], maxRecords: 1}}};
beforeEach(() => {
  vi.restoreAllMocks(); vi.clearAllMocks();
  vi.stubEnv("MYEVE_RELAY_ENABLED", "true"); vi.stubEnv("MYEVE_RELAY_ORIGIN", "https://relay.example");
  vi.stubEnv("DATABASE_URL", "postgres://fixture"); vi.stubEnv("MYEVE_RELAY_ENCRYPTION_KEY", "a".repeat(64));
  state.agent = {id: "sofie", name: "Sofie", status: "active", isPrimary: false, riskCeiling: "low", limits: {maxSteps: 20,maxRuntimeSeconds:900,maxEstimatedCostUsd:2}, capabilities: [{id:"federation.request",enabled:true,availability:"available"}]};
  state.connection = {localOwnerId: "owner", localAgentId: "sofie", ownerId: "relay-owner", agentId: "relay-sofie", credential: "fixture-secret-not-for-model"};
  input.request.expiresAt = new Date(Date.now() + 3600000).toISOString();
  state.request = {}; state.action = {};
  state.command.mockImplementation(async command => {
    if (command.operation === "authority.inspect") return {authorized:true,status:"ACTIVE",expiresAt:"2099-01-01T00:00:00Z",approvalRequired:false,observedAt:new Date().toISOString(),executionRecheckRequired:true};
    if (command.operation === "submit") return {requestId: "request", status: "QUEUED"};
    if (command.operation === "discover") return {agents: []};
    return {requestId: "request", status: "COMPLETED", result: {ownerId:"atlas",publisherAgentId:"atlas-agent", publicationVersion:1,kind:"OWNER_PUBLISHED_KNOWLEDGE",records:[{content:"Atlas pilot launch date is October 15.", reference:"published",provenance:"owner publication"}]}};
  });
  state.query.mockImplementation(async (sql: string, params: any[] = []) => {
    if (sql.includes("SELECT * FROM myeve_peer_permissions")) return [{id:"permission",owner_id:"owner",local_agent_id:"sofie",relay_origin:"https://relay.example",local_relay_account_id:"relay-owner",local_relay_agent_id:"relay-sofie",peer_account_id:"atlas",peer_agent_id:"agent",revision:1,expires_at:null,revoked_at:null,policies:[{capability:"knowledge.query",resource:"published-view",policy:"ALLOW",recordTypes:["fact"],topics:[]}]}];
    if (sql.includes("SELECT * FROM myeve_peer_action_bindings")) return [{permission_id:"permission",permission_revision:1,request_hash:digest(input.request)}];
    if (sql.includes("SELECT owner_chat_run")) return [{id:"run"}];
    if (sql.includes("SELECT r.agent_id,r.role_id")) return [{agent_id:"sofie",role_id:null,run_live:true,agent_revision:"2026-01-01"}];
    if (sql.includes("INSERT INTO action_requests")) {state.action = {id:params[0],parameter_hash:params[10],executor:JSON.parse(params[5]),trigger:JSON.parse(params[6]),status:params[13],attempt_count:0}; return [state.action];}
    if (sql.includes("WITH started AS")) return [{id:state.action.id}];
    if (sql.includes("SELECT a.id,a.parameter_hash")) return [state.action];
    if (sql.includes("SELECT a.id FROM action_requests")) return [{id:state.action.id}];
    if (sql.includes("SELECT id FROM changed")) return [{id:state.action.id}];
    if (sql.includes("INSERT INTO myeve_relay_requests")) {state.request = {envelope_encrypted:params[7]}; return [];}
    if (sql.includes("SELECT envelope_encrypted")) return state.request.envelope_encrypted ? [state.request] : [];
    if (sql.includes("SELECT request_id FROM myeve_relay_requests")) return [{request_id:"request"}];
    return [];
  });
});
describe("canonical Federation tool boundary", () => {
  it("rejects a grant expiry used as a request deadline before creating an Action and explains the real cause", async () => {
    const invalid = { ...input, request: { ...input.request, expiresAt: new Date(Date.now() + 7 * 86400000).toISOString() } };
    expect(await executeFederationTool(invalid, ctx, true)).toMatchObject({ code: "FEDERATION_REQUEST_EXPIRY_INVALID" });
    const approval = await prepareFederationApproval({ ...ctx, toolInput: invalid });
    expect(approval).toMatchObject({ type: "denied" });
    expect(JSON.parse((approval as {reason: string}).reason)).toMatchObject({ code: "FEDERATION_REQUEST_EXPIRY_INVALID" });
    expect(state.query).not.toHaveBeenCalled();
    expect(state.command).not.toHaveBeenCalled();
  });
  it("disabled and false flags hide the tool and deny execution before transport", async () => {
    for (const flag of ["", "false"]) {
      vi.stubEnv("MYEVE_RELAY_ENABLED", flag);
      expect(getCapability("federation.request")?.availability.status).toBe("disabled");
      expect(await federationToolAvailable(ctx)).toBe(false);
      expect(await executeFederationTool(input, ctx)).toMatchObject({status:"denied"});
    }
    expect(state.command).not.toHaveBeenCalled();
  });
  it("descriptor never confers a missing Agent grant or identity", async () => {
    expect(getCapability("federation.request")).toBeDefined();
    state.agent.capabilities=[];
    expect(await executeFederationTool(input,ctx)).toMatchObject({status:"denied"});
    state.agent.isPrimary=true; state.connection.localAgentId="another-agent";
    expect(await executeFederationTool(input,ctx)).toMatchObject({status:"denied"});
    expect(state.command).not.toHaveBeenCalled();
  });
  it("valid authority submits through canonical inbox and retrieves the provider result", async () => {
    const submitted=await executeFederationTool(input,ctx);
    expect(submitted).toMatchObject({response:{requestId:"request",status:"QUEUED"}});
    expect(state.command).toHaveBeenCalledWith({operation:"submit",input:input.request});
    const result=await executeFederationTool({operation:"status",requestId:"request"},{...ctx,callId:"get-call"});
    expect(result).toMatchObject({response:{status:"COMPLETED",result:{records:[{content:"Atlas pilot launch date is October 15."}]}}});
    expect(JSON.stringify(result)).not.toContain(state.connection.credential);
    expect(JSON.stringify(state.query.mock.calls.filter(([sql])=>sql.includes("action_receipts")))).not.toContain("Atlas pilot launch date");
  });
  it("an executing Action for different exact parameters cannot authorize the low-level send", async () => {
    const query = state.query.getMockImplementation()!;
    state.query.mockImplementation(async (sql: string, params: any[]) => sql.includes("SELECT a.id,a.parameter_hash")
      ? [{ ...state.action, parameter_hash: "different-approved-request" }] : query(sql, params));
    expect(await executeFederationTool(input, ctx)).toMatchObject({ status: "denied" });
    expect(state.command).not.toHaveBeenCalledWith({ operation: "submit", input: input.request });
  });
  it.each(["missing peer grant","revoked grant","private resource"])("preserves canonical Relay denial: %s",async () => {
    state.command.mockRejectedValue(new Error("Relay refused operation (403). fixture-secret-not-for-model"));
    const result=await executeFederationTool(input,ctx);
    expect(result).not.toHaveProperty("response");
    expect(state.command).toHaveBeenCalledWith({operation:"authority.inspect",input:input.request});
    expect(state.command).not.toHaveBeenCalledWith({operation:"submit",input:input.request});
    expect(JSON.stringify(result)).not.toContain("fixture-secret");
  });
  it("pending approval retains its Action identity and is distinct from Relay authority denial", async () => {
    vi.spyOn(ActionGateway.prototype,"execute").mockRejectedValueOnce(new ActionBlocked("awaiting_approval","exact-action"));
    expect(await executeFederationTool(input,ctx)).toMatchObject({status:"awaiting_approval",code:"exact_action_approval_required",actionId:"exact-action",canEscalate:true});
    expect(state.command).not.toHaveBeenCalledWith({operation:"submit",input:input.request});
    state.command.mockRejectedValue(new RelayOperationError(403));
    expect(await executeFederationTool(input,ctx)).toMatchObject({code:"RELAY_UNAVAILABLE",canEscalate:false});
  });
  it("revocation before result retrieval never releases cached content",async () => {
    state.request={envelope_encrypted:encryptSecret("owner",input.request)};
    state.command.mockRejectedValue(new Error("Relay refused operation (403)"));
    expect(await executeFederationTool({operation:"status",requestId:"request"},ctx)).not.toHaveProperty("response");
  });
  it("Agent revocation after transport prevents result release",async () => {
    state.command.mockImplementation(async () => {state.agent.status="paused";return {requestId:"request",status:"QUEUED"};});
    expect(await executeFederationTool(input,ctx)).not.toHaveProperty("response");
  });
  it("Action Gateway denial prevents canonical service invocation",async () => {
    state.query.mockImplementation(async (sql: string) => {
      if(sql.includes("SELECT r.id,r.agent_id"))return [{id:"run",agent_id:"sofie"}];
      return [];
    });
    expect(await executeFederationTool(input,ctx)).toMatchObject({status:"denied"});
    expect(state.command).not.toHaveBeenCalled();
  });
  it("rejects administrative commands, extra payloads, and delegated authority",async () => {
    expect(federationToolInput.safeParse({operation:"grant"}).success).toBe(false);
    expect(federationToolInput.safeParse({...input,requestId:"another"}).success).toBe(false);
    expect(await executeFederationTool(input,{...ctx,session:{...ctx.session,parent:{id:"parent"}}})).toMatchObject({status:"denied"});
    expect(state.command).not.toHaveBeenCalled();
  });
  it("Eve actual dynamic resolver and model-tool assembly serialize the callable schema",async () => {
    const require=createRequire(import.meta.url);
    const root=path.dirname(require.resolve("eve/package.json"));
    const lifecycle=await import(pathToFileURL(path.join(root,"dist/src/context/dynamic-tool-lifecycle.js")).href);
    const assembly=await import(pathToFileURL(path.join(root,"dist/src/context/build-dynamic-tools.js")).href);
    const values=new Map<string,unknown>([["eve.auth",ctx.session.auth.current],["eve.sessionId","session"]]);
    const context={get:(key:any)=>values.get(key.name),set:(key:any,value:any)=>values.set(key.name,value),setVirtualContext:(key:any,value:any)=>values.set(key.name,value)};
    const resolvers=[{slug:"federation_request",events:tool.events,eventNames:["step.started"]}];
    await lifecycle.dispatchDynamicToolEvent({ctx:context,resolvers,event:{type:"step.started"},messages:[]});
    const tools=assembly.buildDynamicTools(context);
    expect(tools.map((item:any)=>item.name)).toEqual(["federation_request"]);
    expect(typeof tools[0].execute).toBe("function");
    expect(JSON.stringify(tools[0].inputSchema)).toContain("knowledge.query");
    vi.stubEnv("MYEVE_RELAY_ENABLED","false");
    await lifecycle.dispatchDynamicToolEvent({ctx:context,resolvers,event:{type:"step.started"},messages:[]});
    expect(assembly.buildDynamicTools(context)).toEqual([]);
  });
});
