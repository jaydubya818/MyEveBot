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
