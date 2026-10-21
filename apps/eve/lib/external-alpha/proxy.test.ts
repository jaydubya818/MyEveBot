import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "../../proxy.ts";
import { hrefAllowed } from "../../components/owner/destination-gate.tsx";

import {authenticateWebPrincipal} from '../web-auth.ts';
vi.mock('../web-auth.ts',async importOriginal=>({...await importOriginal<typeof import('../web-auth.ts')>(),authenticateWebPrincipal:vi.fn()}));
import {installedMissionControlEligibility} from '../missioncontrol/installed-eligibility.ts';
vi.mock('../missioncontrol/installed-eligibility.ts',()=>({installedMissionControlEligibility:vi.fn()}));
const call = (path: string, method = "GET") => proxy(new NextRequest(new URL(path, "https://alpha.example.test"), { method }));

describe("proxy: server-side default-deny for external-alpha installations", () => {
  afterEach(() => {vi.unstubAllEnvs();vi.resetAllMocks();});
  it("returns 404 for denied and unclassified routes, before authentication or any other branch", async () => {
    vi.stubEnv("EVE_PROJECT_NAME", "myeve-alpha-tester-1");
    for (const [path, method] of [
      ["/api/email/send", "POST"], ["/api/routines", "POST"], ["/api/slack", "POST"], ["/api/computer-sessions", "POST"],
      ["/api/relay/owner-execution", "POST"], ["/api/beta/owner-decision", "POST"], ["/api/production-canary", "POST"],
      ["/api/local-computer/worker", "POST"], ["/eve/v1/channels/slack", "POST"], ["/eve/v1/hooks/a", "POST"],
      ["/rooms", "GET"], ["/computer", "GET"], ["/manage", "GET"], ["/memory", "GET"], ["/api/never-classified", "GET"], ["/x.png", "GET"],
      ["/api/threads/%2e%2e/email", "GET"],
    ] as const) {
      const response = await call(path, method);
      expect(response.status, `${method} ${path}`).toBe(404);
      expect(await response.text()).toBe("");
    }
  });
  it("lets allowlisted routes continue to the normal authentication chain", async () => {
    vi.stubEnv("EVE_PROJECT_NAME", "myeve-alpha-tester-1");
    for (const [path, method] of [["/api/threads", "POST"], ["/api/work-inbox", "GET"], ["/eve/v1/session", "POST"], ["/login", "GET"], ["/_next/static/a.js", "GET"]] as const)
      expect((await call(path, method)).status, `${method} ${path}`).not.toBe(404);
  });
  it("keeps Memory and manual compaction denied even with legacy configuration", async () => {
    vi.stubEnv("EVE_PROJECT_NAME", "myeve-alpha-tester-1");
    expect((await call("/api/memories")).status).toBe(404);
    vi.stubEnv("MYEVE_EXTERNAL_ALPHA_MEMORY_BACKEND", "local-postgres");
    expect((await call("/api/memories")).status).toBe(404);
    expect((await call("/eve/v1/session/fixture/compact", "POST")).status).toBe(404);
  });
  it("does not change any deployment that is not an installation", async () => {
    vi.stubEnv("EVE_PROJECT_NAME", "myeve-production");
    expect((await call("/api/email/send", "POST")).status).not.toBe(404);
    expect((await call("/api/never-classified")).status).not.toBe(404);
  });
});

describe("navigation gate", () => {
  it("shows everything outside an installation and only allowlisted hrefs inside one", () => {
    expect(hrefAllowed(null, "/anything")).toBe(true);
    expect(hrefAllowed(["/today"], "/today")).toBe(true);
    expect(hrefAllowed(["/today"], "/rooms")).toBe(false);
    expect(hrefAllowed([], "/today")).toBe(false);
  });
});

describe('installed route eligibility',()=>{
 afterEach(()=>{vi.unstubAllEnvs();vi.resetAllMocks();});
 it('does not open installed receivers with a flag alone or unavailable canonical evidence',async()=>{
  vi.stubEnv('EVE_PROJECT_NAME','myeve-alpha-tester-1');vi.stubEnv('MYEVE_OWNER_ID','owner');vi.stubEnv('MYEVE_MISSIONCONTROL_MODE','APPROVED_NONPRODUCTION');
  for(const response of [null,Error('offline')]){
   if(response instanceof Error)vi.mocked(installedMissionControlEligibility).mockRejectedValue(response);else vi.mocked(installedMissionControlEligibility).mockResolvedValue(response);
   for(const path of ['/api/missioncontrol/control','/api/missioncontrol/result','/api/beta/issues'])expect((await call(path,'POST')).status).toBe(404);
  }
 });
 it('requires the enrolled owner principal on actual feedback routes',async()=>{
  vi.stubEnv('EVE_PROJECT_NAME','myeve-alpha-tester-1');vi.stubEnv('MYEVE_OWNER_ID','owner');vi.stubEnv('MYEVE_MISSIONCONTROL_MODE','APPROVED_NONPRODUCTION');
  vi.mocked(installedMissionControlEligibility).mockResolvedValue({enrollment:{},config:{}} as any);
  for(const principal of [null,{id:'foreign'},{id:'owner'}]){
   vi.mocked(authenticateWebPrincipal).mockResolvedValue(principal);
   for(const path of ['/api/beta/issues','/feedback'])expect((await call(path)).status).toBe(principal?.id==='owner'?200:404);
  }
 });
 it('uses control-purpose canonical eligibility only for the signed control receiver',async()=>{
  vi.stubEnv('EVE_PROJECT_NAME','myeve-alpha-tester-1');vi.stubEnv('MYEVE_OWNER_ID','owner');vi.stubEnv('MYEVE_MISSIONCONTROL_MODE','APPROVED_NONPRODUCTION');
  vi.mocked(installedMissionControlEligibility).mockResolvedValue({enrollment:{},config:{}} as any);
  expect((await call('/api/missioncontrol/control','POST')).status).not.toBe(404);
  expect(installedMissionControlEligibility).toHaveBeenLastCalledWith('owner',process.env,'control');
  expect((await call('/api/missioncontrol/result','POST')).status).not.toBe(404);
  expect(installedMissionControlEligibility).toHaveBeenLastCalledWith('owner',process.env,'admission');
 });
});
