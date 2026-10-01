import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
vi.mock('./agents.ts',()=>({getAgent:async()=>({status:'active'}),effectiveCapability:()=>({allowed:true})}));
import {localAuthorityProvider,type ActionRequest} from './action-gateway.ts';
const base:ActionRequest={ownerId:'owner',runId:'run',actionKey:'read',capabilityId:'computer.local.read',actionClass:'read',executor:{kind:'primary-agent',agentId:'agent'},trigger:{kind:'owner_chat'},parameters:{operation:'roots'}};
const target={provider:'local-mac',account:'owner',resource:'mac-test',environment:'paired'};
const productionFeatures='memory,proactive,receipts,skills,file-sharing,utilities,goals,knowledge';
beforeEach(()=>{vi.stubEnv('SOFIE_LOCAL_CAPABILITIES','computer.local.read,computer.local.shell');vi.stubEnv('DATABASE_URL','postgres://fixture');vi.stubEnv('SOFIE_LOCAL_DEVICE_ID','mac-test');vi.stubEnv('SOFIE_LOCAL_DEVICE_TOKEN','a'.repeat(64));vi.stubEnv('EVE_ENABLED_FEATURES',productionFeatures+',local-computer');});
afterEach(()=>vi.unstubAllEnvs());
describe('local Mac production authority',()=>{
 it('allows scoped reads without enabling the integrations group',async()=>{expect((await localAuthorityProvider.evaluate(base,target)).decision).toBe('ALLOW');});
 it('requires exact approval for every command',async()=>{expect((await localAuthorityProvider.evaluate({...base,capabilityId:'computer.local.shell',actionClass:'execute',parameters:{operation:'shell',command:'pwd'}},target)).decision).toBe('REQUIRE_APPROVAL');});
 it('denies missing, unknown or different Computer scopes at canonical policy',async()=>{
  for(const scope of ['', 'computer.local.write', 'computer.local.read,unknown']) {
   vi.stubEnv('SOFIE_LOCAL_CAPABILITIES',scope);expect((await localAuthorityProvider.evaluate(base,target)).decision).toBe('DENY');
  }
 });
 it('denies access when the local feature is disabled or pairing is missing',async()=>{
  vi.stubEnv('EVE_ENABLED_FEATURES',productionFeatures);expect((await localAuthorityProvider.evaluate(base,target)).decision).toBe('DENY');
  vi.stubEnv('EVE_ENABLED_FEATURES',productionFeatures+',local-computer');vi.stubEnv('SOFIE_LOCAL_DEVICE_TOKEN','');expect((await localAuthorityProvider.evaluate(base,target)).decision).toBe('DENY');
 });
});
