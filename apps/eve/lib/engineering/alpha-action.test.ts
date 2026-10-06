import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {fixture} from '../../test/fixtures/alpha-owner.ts';
import {digest} from './contract.ts';
const mocks=vi.hoisted(()=>({agent:vi.fn(),queue:vi.fn(),wake:vi.fn()}));
vi.mock('../agents.ts',async()=>({...await vi.importActual('../agents.ts'),getAgent:mocks.agent}));
vi.mock('./factory-commands.ts',async()=>({...await vi.importActual('./factory-commands.ts'),enqueueFactoryCommand:mocks.queue}));
vi.mock('./cloud-controller-queue.ts',()=>({wakeCloudController:mocks.wake}));
import {localAuthorityProvider,type ActionRequest} from '../action-gateway.ts';
import {factoryAction} from './factory-api.ts';
import {engineeringWorkEnabled} from './deployment-mode.ts';
import {getCapability} from '../capability-registry.ts';
let f:ReturnType<typeof fixture>;
function install(value=fixture()) {f=value;for(const [k,v] of Object.entries(f.env))vi.stubEnv(k,v);}
beforeEach(()=>{vi.resetAllMocks();install();mocks.agent.mockResolvedValue({id:'sofie',ownerId:f.binding.ownerScope,isPrimary:true,status:'active'});mocks.queue.mockResolvedValue({command:{id:'test-command'},executionGranted:false});});
afterEach(()=>vi.unstubAllEnvs());
const proposal=()=>({workId:f.workId,operation:'start',expectedWorkVersion:1,expectedWorkGeneration:1});
const action=()=>({ownerId:f.binding.ownerScope,runId:'retained-run',actionKey:'exact-start',capabilityId:'tool.engineering_factory',actionClass:'write',executor:{kind:'primary-agent',agentId:'sofie'},trigger:{kind:'owner_chat'},parameters:proposal()}) as ActionRequest;
const target=()=>({provider:'myfactory-cloud-production',account:f.binding.ownerScope,resource:'engineering-work:'+f.workId,environment:'CLOUD_PRODUCTION'});
describe('selected alpha gateway with general Work disabled',()=>{
 it('permits only the exact start proposal while all general engineering discovery remains disabled',async()=>{
  expect(engineeringWorkEnabled()).toBe(false);
  for(const id of ['tool.engineering_factory','tool.engineering_direct','tool.engineering_work'])expect(getCapability(id)?.availability.status).toBe('disabled');
  expect((await localAuthorityProvider.evaluate(action(),target())).decision).toBe('ALLOW');
 });
 it('denies stale versions, other effects, owners, targets and routine authority',async()=>{
  for(const p of [{operation:'publish'},{operation:'stop'},{expectedWorkVersion:2},{expectedWorkGeneration:2},{extra:'authority'}])expect((await localAuthorityProvider.evaluate({...action(),parameters:{...proposal(),...p}},target())).decision).toBe('DENY');
  for(const patch of [{ownerId:'other'},{trigger:{kind:'relay_request'}},{executor:{kind:'persistent-agent',agentId:'sofie'}},{actionClass:'spend'}])expect((await localAuthorityProvider.evaluate({...action(),...patch} as ActionRequest,target())).decision).toBe('DENY');
  for(const patch of [{account:'other'},{resource:'engineering-work:other'},{environment:'preview'},{provider:'other'}])expect((await localAuthorityProvider.evaluate(action(),{...target(),...patch})).decision).toBe('DENY');
  expect((await localAuthorityProvider.evaluate(action(),target(),{} as never)).decision).toBe('DENY');
 });
 it('allows exact owner stop/reconcile after expiry but rejects start before queueing',async()=>{
  const envelope={...f.envelope,expiresAt:new Date(0).toISOString()},config={...f.config,authorizationEnvelope:envelope,authorizationSha256:digest(envelope)};
  install({...f,env:{...f.env,MYEVE_PRODUCTION_CANARY_CONFIG:JSON.stringify(config),MYEVE_PRODUCTION_CANARY_AUTHORIZATION_SHA256:config.authorizationSha256}});
  const store={principal:{scopeId:f.binding.ownerScope}} as never;
  await expect(factoryAction(store,f.workId,{operation:'start',expectedWorkVersion:1,expectedWorkGeneration:1})).rejects.toThrow();expect(mocks.queue).not.toHaveBeenCalled();
  for(const operation of ['stop','reconcile','takeover'])await factoryAction(store,f.workId,{operation,expectedWorkVersion:1,expectedWorkGeneration:1});
  expect(mocks.queue).toHaveBeenCalledTimes(3);expect(mocks.wake).toHaveBeenCalledTimes(3);
  await expect(factoryAction({principal:{scopeId:'other'}} as never,f.workId,{operation:'stop',expectedWorkVersion:1,expectedWorkGeneration:1})).rejects.toThrow();
  expect(mocks.queue).toHaveBeenCalledTimes(3);
 });
});
