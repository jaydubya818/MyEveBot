import {afterEach,afterAll,describe,expect,it,vi} from 'vitest';
import {mkdtemp,writeFile,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {digest,validateRuntime} from '../../../../packages/myapps/src/alpha-tasks/contracts.ts';
// @ts-ignore Public inert source fixture, never private installation evidence.
import {fixture} from '../../../../packages/myapps/test/alpha-tasks/fixtures.mjs';
const state=vi.hoisted(()=>({constructed:0,connected:0,bound:vi.fn()}));
vi.mock('pg',()=>({default:{Pool:class{constructor(){state.constructed++;}on(){}async end(){}connect(){state.connected++;throw Error('No connection allowed');}}}}));
vi.mock('./hosting.ts',()=>({bindLocalApps:(value:unknown)=>state.bound(value),localAppsAllowed:()=>process.env.MYAPPS_LOCAL_INTEGRATION==='1'}));
import {localOwnerAppsConfiguration,localOwnerAppsConfigured} from './local-configuration.ts';
import {ensureConfiguredLocalApps,readLocalAppSource,closeLocalAppsBootstrap} from './local-bootstrap.ts';
import {getCapability} from '../capability-registry.ts';
const f=fixture(),config={version:1 as const,kind:'OWNER_FACTORY' as const,ownerId:'owner-a',installationId:'installation-a',agentId:'agent-a',
  runtimeId:'local-qualification',target:'private-tasks',sourceRoot:'/private/tmp/myapps-public-test',runtime:validateRuntime(f.runtime)};
const valid=():NodeJS.ProcessEnv=>({NODE_ENV:'test',VERCEL:'',VERCEL_ENV:'',MYAPPS_LOCAL_INTEGRATION:'1',MYAPPS_LOCAL_REGISTRATION:JSON.stringify(config),
  MYAPPS_LOCAL_REGISTRATION_SHA256:digest(config),MYEVE_OWNER_ID:config.ownerId,MYEVE_MISSIONCONTROL_MODE:'APPROVED_NONPRODUCTION',
  MYEVE_CAPABILITY_CONTROL_ENABLED:'true',MYEVE_CAPABILITY_ENVIRONMENT:'qualification',MYEVE_CAPABILITY_INSTALLATION_ID:config.installationId,
  MYEVE_CAPABILITY_ORIGIN:'http://localhost:3999',DATABASE_URL:'postgresql://fixture@localhost/public_fixture',
  MYEVE_CAPABILITY_DATABASE_URL:'postgresql://fixture@localhost/public_fixture'});
afterEach(()=>vi.unstubAllEnvs());afterAll(()=>closeLocalAppsBootstrap());
describe('explicit local owner registration',()=>{
  it('does nothing when absent, and preferences/flags alone never activate discovery',()=>{
    vi.stubEnv('MYAPPS_LOCAL_REGISTRATION',undefined);
    expect(ensureConfiguredLocalApps()).toBeNull();expect(state.constructed).toBe(0);expect(state.bound).not.toHaveBeenCalled();
    expect(localOwnerAppsConfigured({NODE_ENV:'test',MYAPPS_LOCAL_INTEGRATION:'1'})).toBe(false);
  });
  it('only exposes the exact registered local owner; execution still needs canonical backend admission',()=>{
    expect(localOwnerAppsConfiguration(valid())).toEqual(config);
    expect(getCapability('tool.installed_apps',valid())?.availability.status).toBe('available');
  });
  it.each([
    {NODE_ENV:'production' as const},{VERCEL:'1'},{VERCEL_ENV:'production'},{EVE_PROJECT_NAME:'myeve-alpha-tester-1'},
    {EVE_PROJECT_NAME:'myeve-alpha-tester-2'},{MYEVE_EXTERNAL_ALPHA_POLICY:'{}'},{MYAPPS_LOCAL_INTEGRATION:''},
    {MYEVE_MISSIONCONTROL_MODE:''},{MYEVE_CAPABILITY_CONTROL_ENABLED:''},{MYEVE_CAPABILITY_ENVIRONMENT:'development'},
    {MYEVE_OWNER_ID:'foreign'},{MYEVE_CAPABILITY_INSTALLATION_ID:'foreign'},
    {MYEVE_CAPABILITY_DATABASE_URL:'postgresql://other@localhost/other'},{MYAPPS_LOCAL_REGISTRATION_SHA256:'sha256:'+'a'.repeat(64)},
  ])('denies unavailable or mismatched registration %j',change=>{
    expect(localOwnerAppsConfigured({...valid(),...change})).toBe(false);
    expect(getCapability('tool.installed_apps',{...valid(),...change})?.availability.status).toBe('disabled');
  });
  it.each(['NODE_ENV','VERCEL'] as const)('cannot bypass the actual host with a supplied local environment: %s',key=>{
    vi.stubEnv(key,key==='NODE_ENV'?'production':'1');expect(localOwnerAppsConfigured(valid())).toBe(false);
  });
  it('reads only an exact bounded regular source closure from the operator store',async()=>{
    const root=await mkdtemp(join(tmpdir(),'myapps-bootstrap-'));
    try{
      const input={...config,sourceRoot:root};await writeFile(join(root,f.closure.tree+'.json'),JSON.stringify(f.closure),{mode:0o600});
      expect(await readLocalAppSource(input,f.closure.tree)).toEqual(f.closure);
      await expect(readLocalAppSource(input,'../anything')).rejects.toThrow('APP_SOURCE_UNAVAILABLE');
      await writeFile(join(root,f.closure.tree+'.json'),JSON.stringify({...f.closure,tree:'a'.repeat(40)}));
      await expect(readLocalAppSource(input,f.closure.tree)).rejects.toThrow();
      await rm(join(root,f.closure.tree+'.json'));await symlink('/no-private-read',join(root,f.closure.tree+'.json'));
      await expect(readLocalAppSource(input,f.closure.tree)).rejects.toThrow();
    }finally{await rm(root,{recursive:true,force:true});}
  });
  it('initializes once without connecting, and changed or removed configuration cannot reuse the binding',()=>{
    for(const [key,value] of Object.entries(valid()))vi.stubEnv(key,value);
    const first=ensureConfiguredLocalApps();expect(first?.alphaTasks).toBeDefined();
    expect(ensureConfiguredLocalApps()).toBe(first);expect(state.constructed).toBe(1);expect(state.connected).toBe(0);expect(state.bound).toHaveBeenCalledTimes(1);
    vi.stubEnv('DATABASE_URL','postgresql://fixture@localhost/changed');vi.stubEnv('MYEVE_CAPABILITY_DATABASE_URL','postgresql://fixture@localhost/changed');
    expect(()=>ensureConfiguredLocalApps()).toThrow('APP_LOCAL_REGISTRATION_CHANGED');
    vi.stubEnv('MYAPPS_LOCAL_REGISTRATION',undefined);expect(()=>ensureConfiguredLocalApps()).toThrow('APP_LOCAL_REGISTRATION_CHANGED');
    expect(state.constructed).toBe(1);expect(state.connected).toBe(0);
  });
});
