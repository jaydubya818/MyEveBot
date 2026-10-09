import {afterEach, expect, test, vi} from 'vitest';
import {capabilityRegistry, resolveCapabilities, type PolicySnapshot} from '@mission-control/capability-control';
import {getAvailableCapabilities, getCapability} from './capability-registry.ts';
import {bindLocalApps, handleInstalledApps, localAppsAllowed} from './myapps/hosting.ts';

afterEach(()=>vi.unstubAllEnvs());

for(const role of ['ordinary','platform'] as const) {
  test(`${role} enabled preferences cannot activate or authorize packaged MyApps`,async()=>{
    const now=1_800_000_000_000;
    const scope={ownerId:'owner-1',organizationId:'org-1',installationId:'qualification-1',environment:'qualification' as const};
    const snapshot:PolicySnapshot={registryVersion:capabilityRegistry.version,scope,revision:1,observedAt:now-1,expiresAt:now+60000,
      preferences:role==='ordinary'?Object.fromEntries(capabilityRegistry.capabilities.map(x=>[x.id,'ENABLED' as const])):{},ordinaryDefaults:{},facts:{},
      ...(role==='platform'?{platformOwnerPolicy:{...scope,id:'policy-1',revision:1,status:'ACTIVE' as const,expiresAt:now+60000,administrationRecordId:'admin-1',membershipRecordId:'member-1',installationRecordId:'install-1',auditRecordId:'audit-1'}}:{})};
    const preferences=resolveCapabilities(capabilityRegistry,snapshot,now);
    expect(preferences.every(x=>x.preference==='ENABLED')).toBe(true);
    expect(preferences.find(x=>x.id==='myapps')).toBeDefined();
    vi.stubEnv('MYEVE_CAPABILITY_CONTROL_ENABLED','1');
    for(const [mode,vercel,optIn] of [['production','','1'],['development','1','1'],['development','','']] as const) {
      vi.stubEnv('NODE_ENV',mode);vi.stubEnv('VERCEL',vercel);vi.stubEnv('MYAPPS_LOCAL_INTEGRATION',optIn);
      expect(localAppsAllowed()).toBe(false);
      expect(getCapability('tool.installed_apps',process.env)?.availability).toMatchObject({status:'disabled',configured:false});
      expect(getAvailableCapabilities({},process.env).some(x=>x.id==='tool.installed_apps')).toBe(false);
      const authenticate=vi.fn();
      const response=await handleInstalledApps(new Request('http://localhost/api/myapps/ui'),authenticate);
      expect(response.status).toBe(404);expect(authenticate).not.toHaveBeenCalled();
    }
    vi.stubEnv('NODE_ENV','development');vi.stubEnv('VERCEL','');vi.stubEnv('MYAPPS_LOCAL_INTEGRATION','1');
    const list=vi.fn(),policy=vi.fn();
    bindLocalApps({apps:{list} as unknown as Parameters<typeof bindLocalApps>[0]['apps'],policy});
    expect((await handleInstalledApps(new Request('http://localhost/api/myapps/ui'),async()=>null)).status).toBe(401);
    expect(policy).not.toHaveBeenCalled();expect(list).not.toHaveBeenCalled();
    policy.mockResolvedValue({ownerId:'foreign-owner',kind:'human'});
    const foreign=await handleInstalledApps(new Request('http://localhost/api/myapps/ui'),async()=>({id:'owner-1',kind:'human'}) as never);
    expect(foreign.status).toBe(404);expect(list).not.toHaveBeenCalled();
  });
}
