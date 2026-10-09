import { beforeEach, afterEach, expect, it, vi } from "vitest";
const guards=vi.hoisted(()=>({action:vi.fn(),provider:vi.fn(),token:vi.fn()}));
vi.mock("../../lib/action-gateway.ts",()=>({consumeActionAuthority:guards.action,consumeProviderAuthority:guards.provider}));
vi.mock("@vercel/connect",()=>({getToken:guards.token}));
import { factoryAdapter } from "./myfactory.ts";
beforeEach(()=>{
 vi.resetAllMocks();
 for(const name of ["REPOSITORY","LINEAR_TEAM_ID","LINEAR_CONNECTOR","LINEAR_WORKSPACE_ID","CLIENT_TOKEN","RECEIPT_PUBLIC_KEY"])vi.stubEnv(`MYFACTORY_${name}`,name);
 guards.token.mockResolvedValue("private-token");
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
it.each(["action","provider"] as const)("requires %s authority before any external execution",async guard=>{
 guards[guard].mockRejectedValue(new Error("denied"));
 await expect(factoryAdapter("create").execute({},{} as never)).rejects.toThrow("denied");
 expect(guards.token).not.toHaveBeenCalled();
});
it("rejects a connector for another workspace",async()=>{
 const fetcher=vi.fn().mockResolvedValue(Response.json({data:{viewer:{organization:{id:"other"}},team:{id:"LINEAR_TEAM_ID"}}}));vi.stubGlobal("fetch",fetcher);
 await expect(factoryAdapter("create").resolveTarget({})).rejects.toThrow("destination mismatch");
 expect(fetcher).toHaveBeenCalledTimes(1);
});
it("rejects arbitrary commands before any external mutation",async()=>{
 await expect(factoryAdapter("create").execute({command:"rm -rf"},{} as never)).rejects.toThrow("Unsupported");
 expect(guards.token).not.toHaveBeenCalled();
});

it("retries only the read-only destination check before admission", async () => {
 const fetcher=vi.fn().mockRejectedValueOnce(new Error("temporary transport failure"))
  .mockResolvedValueOnce(Response.json({data:{viewer:{organization:{id:"LINEAR_WORKSPACE_ID"}},team:{id:"LINEAR_TEAM_ID"}}}));
 vi.stubGlobal("fetch",fetcher);
 expect(await factoryAdapter("create").resolveTarget({})).toMatchObject({provider:"myfactory",account:"LINEAR_WORKSPACE_ID"});
 expect(fetcher).toHaveBeenCalledTimes(2);
});
it("returns and verifies an authenticated missing request without claiming intake", async () => {
 vi.stubGlobal("fetch",vi.fn().mockImplementation(()=>Promise.resolve(Response.json({data:{issues:{nodes:[]}}}))));
 const adapter=factoryAdapter("read");
 const result=await adapter.execute({requestId:"ee32a8c7-3243-4332-a602-0ad6d678bc1b"},{} as never);
 expect(result).toEqual({requestId:"ee32a8c7-3243-4332-a602-0ad6d678bc1b",status:"not_found",receipt:null});
 expect(await adapter.verify(result,{} as never)).toMatchObject({verified:true,receipt:{status:"not_found",receipt:null}});
});
it("does not relabel provider failures as missing requests", async () => {
 vi.stubGlobal("fetch",vi.fn().mockRejectedValue(new Error("offline")));
 await expect(factoryAdapter("read").execute({requestId:"ee32a8c7-3243-4332-a602-0ad6d678bc1b"},{} as never)).rejects.toThrow("offline");
});
