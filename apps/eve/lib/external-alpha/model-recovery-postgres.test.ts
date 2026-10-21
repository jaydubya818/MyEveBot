import {afterEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({database:null as any,policy:null as any,agent:null as any,generate:vi.fn()}));
vi.mock('ai',()=>({gateway:Object.assign(()=>({doGenerate:mocks.generate}),{getAvailableModels:async()=>({models:[{id:mocks.policy.model,pricing:{input:'0.00000001',output:'0.00000001'}}]})})}));
vi.mock('../../agent/lib/receipts-db.ts',()=>({db:()=>mocks.database}));
vi.mock('../../agent/lib/session-settings.ts',()=>({resolveSessionAgent:async()=>mocks.agent}));
vi.mock('./policy.ts',async original=>({...await original<any>(),externalAlphaPolicy:()=>mocks.policy}));
import {Env,connection} from './work-test-fixture.ts';
import {externalAlphaModel} from './model.ts';
import {EXTERNAL_ALPHA_INSTRUCTIONS,externalAlphaContextBinding} from './context.ts';
import {ExternalAlphaAllowance} from './allowance.ts';
import {digest} from '../engineering/contract.ts';

describe.skipIf(!connection)('provider boundary accounting recovery',()=>{
 const envs:Env[]=[];afterEach(async()=>{await Promise.all(envs.splice(0).map(e=>e.close()));vi.clearAllMocks();},60000);
 async function fixture(){const e=await Env.create();envs.push(e);mocks.database=e.db;mocks.policy=e.policy;
  mocks.agent={id:'agent-a',ownerId:e.owner,status:'active',name:'Sofie',role:'Primary',description:'Private',instructions:'Preserve owner privacy.',riskCeiling:'low'};
  const principal={authenticator:'myeve-web-session',principalType:'user',principalId:e.owner,attributes:{owner:'true'}};
  const model=externalAlphaModel({ownerId:e.owner,sessionId:'session-a',stepKey:'turn-a:0',auth:{current:principal,initiator:principal},primaryFallback:true});
  const options={prompt:[{role:'system' as const,content:[externalAlphaContextBinding({ownerId:e.owner,sessionId:'session-a',turnId:'turn-a'},mocks.agent),EXTERNAL_ALPHA_INSTRUCTIONS,mocks.agent.instructions].join('\n')},{role:'user' as const,content:[{type:'text' as const,text:'Explain this.'}]}]};
  return {e,model,options};
 }
 it('lost shared settlement acknowledgment never poisons durable known usage',async()=>{
  const {e,model,options}=await fixture(),shared=e.db.externalAlphaAccounting!,settle=shared.settle.bind(shared);
  mocks.generate.mockResolvedValue({content:[{type:'text',text:'Retained answer'}],warnings:[],providerMetadata:{gateway:{cost:0}},usage:{},finishReason:{unified:'stop',raw:'stop'}});
  shared.settle=async()=>{throw Error('shared unavailable');};
  await expect(model.doGenerate(options)).rejects.toThrow('shared unavailable');
  expect(mocks.generate).toHaveBeenCalledOnce();
  expect((await e.pool.query('SELECT state,spent_microusd FROM external_alpha_operation')).rows[0]).toEqual({state:'SETTLED',spent_microusd:'0'});
  expect((await e.pool.query('SELECT state FROM external_alpha_cohort_admission')).rows[0].state).toBe('BOUND');
  shared.settle=settle;await shared.reconcile(e.db,e.policy);await shared.reconcile(e.db,e.policy);
  await expect(new ExternalAlphaAllowance(e.db,e.policy).admit({kind:'CHAT',bindingId:'next',requestSha256:digest('next')})).resolves.toBeTruthy();
 });
 it('a provider timeout retains UNKNOWN across restart and never dispatches again',async()=>{
  const {e,model,options}=await fixture();mocks.generate.mockRejectedValue(Error('provider timeout'));
  await expect(model.doGenerate(options)).rejects.toThrow('provider timeout');
  await e.db.externalAlphaAccounting!.reconcile(e.db,e.policy);
  await expect(model.doGenerate(options)).rejects.toThrow();expect(mocks.generate).toHaveBeenCalledOnce();
  const op=(await e.pool.query('SELECT state,reserved_microusd,spent_microusd FROM external_alpha_operation')).rows[0];expect(op.state).toBe('UNKNOWN');expect(Number(op.reserved_microusd)).toBeGreaterThan(0);expect(op.spent_microusd).toBeNull();
 });
});
