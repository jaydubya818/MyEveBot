import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {fixture} from '../../test/fixtures/alpha-owner.ts';
import {digest} from './contract.ts';
import {factoryExecutionConfigurationHash} from './factory-work-driver.ts';
import {engineeringConversationModel} from './conversation-model.ts';
import {EngineeringConversationBudget} from './conversation-budget.ts';
const mocks=vi.hoisted(()=>({config:vi.fn()}));
vi.mock('./factory-routing.ts',async()=>({...await vi.importActual('./factory-routing.ts'),factoryConfig:mocks.config}));
let f:ReturnType<typeof fixture>,config:any,work:any,store:any,authority:any,now:number;
beforeEach(()=>{
 vi.resetAllMocks();now=Date.now();vi.spyOn(Date,'now').mockImplementation(()=>now);f=fixture();
 config={conversationQualification:{mode:'THREE_OWNER_CONVERSATION_V1',modelId:'openai/gpt-5.4-mini',expiresAt:new Date(now+600000).toISOString(),evidenceRef:'disposable',ceilingMicrousd:300000,perCallMicrousd:150000,maxCalls:2,maxOutputTokens:1024,factoryCeilingMicrousd:1000000},profile:{maxOutputTokens:1024,maxModelRequests:2}};
 work={id:f.workId,scopeId:f.binding.ownerScope,version:1,generation:1,lifecycle:'active',control:'agent',repository:'fixture/repo',title:'Bounded fixture',objective:'Local model-free test',criteria:[],maxCostUsd:1.3,maxDurationSeconds:180};
 const runtime={engineering:config,connection:{},commands:[]};mocks.config.mockResolvedValue(runtime);
 const envelope={...f.envelope,expiresAt:new Date(now+10000).toISOString(),approval:{...f.envelope.approval,configurationHash:factoryExecutionConfigurationHash(runtime as never),criteria:[],manifestTemplate:{...f.envelope.approval.manifestTemplate,request:{...f.envelope.approval.manifestTemplate.request,repository:work.repository,input:{title:work.title,description:work.objective}}}}};
 const pin={...f.config,engineering:config,authorizationEnvelope:envelope,authorizationSha256:digest(envelope)};
 for(const [key,value]of Object.entries({...f.env,MYEVE_PRODUCTION_CANARY_CONFIG:JSON.stringify(pin),MYEVE_PRODUCTION_CANARY_AUTHORIZATION_SHA256:pin.authorizationSha256}))vi.stubEnv(key,value);
 store={principal:{scopeId:f.binding.ownerScope,actorId:f.binding.ownerScope,scopeKind:'personal'},get:async()=>work,database:{query:vi.fn().mockImplementation(async(_sql,args)=>{const p=JSON.parse(args[0]);return [{receipt:{id:p.id,dispatch_token:p.token,status:'RESERVED'}}]})}};
 authority={readConfig:async()=>config,read:async()=>({binding:{agentId:'sofie',agentRevision:'1'},contract:{budgetUsd:1.3,deadline:new Date(now+170000).toISOString()}})};
});
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks()});
function model(){
 const provider=vi.fn().mockRejectedValue(Error('provider must not run'));
 const budget={reserve:vi.fn().mockResolvedValue(null),assertDispatch:vi.fn(),remainingMilliseconds:async()=>10000,unknown:vi.fn()};
 const value=engineeringConversationModel({store,workId:f.workId,sessionId:'s',stepKey:'s:0',modelId:'openai/gpt-5.4-mini',productive:true},{authority,budget:budget as never,phase:async()=> 'admission',catalog:async()=>({models:[{id:'openai/gpt-5.4-mini',pricing:{input:'0.00000075',output:'0.0000045'}}]}) as never,model:()=>({doGenerate:provider}) as never});
 return {value,provider,budget};
}
it('configuration changes cannot consume the initial Sofie operation',async()=>{
 mocks.config.mockResolvedValue({engineering:config,connection:{changed:true},commands:[]});
 const m=model();await expect(m.value.doGenerate({prompt:[]} as never)).rejects.toThrow('ALPHA_CONVERSATION_AUTHORITY');expect(m.provider).not.toHaveBeenCalled();expect(m.budget.reserve).not.toHaveBeenCalled();
});
it('approval expiry between reservation and provider dispatch yields zero provider calls',async()=>{
 const m=model();m.budget.assertDispatch.mockImplementation(async()=>{now+=11000});
 await expect(m.value.doGenerate({prompt:[{role:'user',content:[{type:'text',text:'Continue the selected Work'}]}],tools:[{type:'function',name:'engineering_factory',inputSchema:{}}]} as never)).rejects.toThrow('PRODUCTION_APPROVAL_INVALID');expect(m.provider).not.toHaveBeenCalled();expect(m.budget.unknown).toHaveBeenCalledTimes(1);
});
it('common-ledger deadline is clamped to the exact envelope and dispatch rechecks it',async()=>{
 const budget=new EngineeringConversationBudget(store,authority),input={workId:f.workId,sessionId:'s',stepKey:'s:0',modelId:'openai/gpt-5.4-mini',microUsd:150000,maxCalls:2,requestHash:'a'.repeat(64),pricing:{input:'0.00000075',output:'0.0000045'},bounds:{inputBytes:100,maxOutputTokens:1024}};
 await budget.reserve(input);const p=JSON.parse(store.database.query.mock.calls[0][1][0]);expect(Date.parse(p.deadline)).toBe(now+10000);
 now+=11000;await expect(budget.assertDispatch(input)).rejects.toThrow();expect(store.database.query).toHaveBeenCalledTimes(1);
});
it('slow dispatch guards consume the original provider window instead of renewing it',async()=>{
 const m=model(),timeout=vi.spyOn(AbortSignal,'timeout');m.budget.assertDispatch.mockImplementation(async()=>{now+=9000});
 await expect(m.value.doGenerate({prompt:[{role:'user',content:[{type:'text',text:'Continue selected Work'}]}],tools:[{type:'function',name:'engineering_factory',inputSchema:{}}]} as never)).rejects.toThrow('provider must not run');
 expect(m.provider).toHaveBeenCalledTimes(1); // Local rejecting stub, no transport.
 expect(timeout).toHaveBeenCalledWith(1000);
});
