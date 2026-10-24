import {afterEach,expect,it,vi} from "vitest";
import {readFileSync} from "node:fs";
import {executeRelayMemory,relayMemoryAdapter,relayMemoryRequest} from "./mcp-memory.ts";
import {consumeRelayMemoryAuthority,type ActionRequest,type AuthorizedAction} from "../action-gateway.ts";
import {getCapability} from "../capability-registry.ts";

afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});
it("rejects IDs beyond the selected Relay contract before identity/provider access",async()=>{
  await expect(relayMemoryRequest(undefined as never,{operation:"get",id:"x".repeat(101)})).rejects.toMatchObject({name:"ZodError"});
});
it("neither dormant capability is registered or available",()=>{
  expect(getCapability("relay.memory.read")).toBeNull();
  expect(getCapability("relay.memory.write")).toBeNull();
});
it.each([1,2])("alpha slot %s denies before database or network",async slot=>{
  vi.stubEnv("EVE_PROJECT_NAME",`myeve-alpha-tester-${slot}`);
  const network=vi.spyOn(globalThis,"fetch");
  await expect(executeRelayMemory(undefined as never,{operation:"list",limit:10})).rejects.toThrow("EXTERNAL_ALPHA_PAID_PATH_DENIED:relay-mcp-memory");
  expect(network).not.toHaveBeenCalled();
});
it("fabricated adapter and revalidation authority cannot reach SQL/transport",async()=>{
  const action={ownerId:"owner",runId:"run",actionKey:"fixture",capabilityId:"relay.memory.read",actionClass:"read",
    executor:{kind:"primary-agent",agentId:"agent"},trigger:{kind:"owner_chat",id:"session"},parameters:{operation:"list",limit:10}} satisfies ActionRequest;
  const authority={idempotencyKey:"fake",authorityId:"fake",executor:action.executor,expiresAt:Date.now()+10000,
    target:{provider:"relay-mcp",account:"foreign",resource:"fake"},capabilityId:action.capabilityId} satisfies AuthorizedAction;
  const network=vi.spyOn(globalThis,"fetch");
  await expect(relayMemoryAdapter(action).execute(action.parameters,authority)).rejects.toMatchObject({status:"denied"});
  await expect(consumeRelayMemoryAuthority(authority,action.parameters)).rejects.toMatchObject({status:"denied"});
  expect(network).not.toHaveBeenCalled();
});
it("canonical entry passes turn cancellation to the durable gateway",()=>{
  // Its real gateway must deny the unregistered capabilities; positive wire
  // qualification uses synthetic test-only authority, not a production flag.
  const source=readFileSync(new URL("./mcp-memory.ts",import.meta.url),"utf8");
  expect(source).toContain("}, ctx.abortSignal)");
  expect(source).not.toMatch(/NODE_TLS_REJECT_UNAUTHORIZED|MYEVE_RELAY_ALLOW_LOCAL_HTTP|globalThis\.fetch\s*=/);
});
