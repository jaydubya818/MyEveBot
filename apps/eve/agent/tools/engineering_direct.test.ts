import {beforeEach,afterEach,it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({session:vi.fn(),gateway:vi.fn(),inspect:vi.fn(),binding:vi.fn()}));
vi.mock("../lib/engineering-knowledge-binding.ts",()=>({assertEngineeringKnowledgeWorkBinding:m.binding}));
vi.mock("../lib/session-settings.ts",()=>({resolveSessionAgent:async()=>({id:"sofie",isPrimary:true})}));
vi.mock("../../lib/engineering/runtime.ts",()=>({engineeringRuntime:async()=>({config:{agentId:"sofie",nativeMode:"potato",profile:{repository:"jaydubya818/myeve-golden-work-qual"}},store:{},authorityCurrent:async()=>true})}));
vi.mock("../../lib/engineering/native-model-budget.ts",()=>({NativeModelBudget:class {assertSession=m.session;}}));
vi.mock("../../lib/engineering/native-routing.ts",()=>({NativeRouteAuthority:class {},admitNativeWork:vi.fn()}));
vi.mock("../../lib/engineering/direct-development.ts",()=>({DirectDevelopmentStore:class {inspect=m.inspect;}}));
vi.mock("../../lib/engineering/worker-projection.ts",()=>({EngineeringWorkerProjectionStore:class {get=async()=>({work:{id:"selected"},projection:{readiness:{ready:false}},routing:{}})}}));
vi.mock("../../lib/engineering/knowledge.ts",()=>({EngineeringKnowledgeStore:class {list=async()=>[]}}));
vi.mock("../lib/action-context.ts",()=>({toolActionRequest:async()=>({})}));
vi.mock("../../lib/action-gateway.ts",()=>({ActionGateway:class {execute=m.gateway},localAuthorityProvider:{},consumeActionAuthority:vi.fn(),consumeProviderAuthority:vi.fn()}));
import toolDefinition from "./engineering_direct.ts";
const id="11111111-1111-4111-8111-111111111111";
const ctx=(intent="observe")=>({session:{id:"fresh",auth:{current:{principalId:"owner",principalType:"user",attributes:{owner:"true",myeveEngineeringWorkId:id,myeveEngineeringIntent:intent}}}}});
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("MYEVE_ENGINEERING_MODE","dogfood");m.inspect.mockResolvedValue({workspace:null,current:false});});
afterEach(()=>vi.unstubAllEnvs());
it("fresh inspection exposes persisted truth without writer acquisition or gateway effects",async()=>{
 const context=ctx(),tool=await toolDefinition.events["step.started"]!({},context as never) as any;
 const result=await tool.execute({request:{operation:"inspect"}},context);expect(result.projection.readiness.ready).toBe(false);
 expect(m.session).not.toHaveBeenCalled();expect(m.gateway).not.toHaveBeenCalled();expect(m.binding).toHaveBeenCalled();
});
it.each(["read","admit","open","plan","write","submit"])("read-only direct %s cannot reach native session or effect boundary",async operation=>{
 const context=ctx(),tool=await toolDefinition.events["step.started"]!({},context as never) as any;
 await expect(tool.execute({request:{operation}},context)).rejects.toThrow("read-only");expect(m.gateway).not.toHaveBeenCalled();expect(m.session).not.toHaveBeenCalled();
});
it("explicit productive continuation retains the existing writer-session denial",async()=>{
 const context=ctx("continue"),tool=await toolDefinition.events["step.started"]!({},context as never) as any;
 m.session.mockRejectedValueOnce(new Error("existing writer required"));await expect(tool.execute({request:{operation:"open"}},context)).rejects.toThrow("existing writer required");expect(m.gateway).not.toHaveBeenCalled();
});
