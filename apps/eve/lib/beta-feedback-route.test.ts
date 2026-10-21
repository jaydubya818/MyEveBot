import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { createWebSessionToken,WEB_SESSION_COOKIE } from './web-auth.ts';
const spies=vi.hoisted(()=>({eligible:vi.fn(),list:vi.fn(async()=>({reports:[],next:null})),save:vi.fn(async(value:unknown)=>value),owners:[] as string[]}));
vi.mock('./beta-integration/runtime.ts',()=>({betaIntegration:()=>({pool:{}})}));
vi.mock('./beta-feedback.ts',()=>({BetaFeedback:class {
  constructor(_pool:unknown,owner:string){spies.owners.push(owner);}
  list=spies.list;save=spies.save;
}}));
vi.mock('./missioncontrol/installed-eligibility.ts',()=>({installedMissionControlEligibility:spies.eligible}));
import { GET,POST } from '../app/api/beta/issues/route.ts';
describe('feedback endpoint canonical owner authentication',()=>{
  beforeEach(()=>{
    vi.stubEnv('MYEVE_MISSIONCONTROL_MODE','APPROVED_NONPRODUCTION');vi.stubEnv('MYEVE_OWNER_ID','feedback-owner');
    vi.stubEnv('MYEVE_ACCESS_PASSWORD','synthetic-owner-password');vi.stubEnv('MYEVE_SESSION_SECRET','synthetic-session-secret-32-characters');
    vi.stubEnv('MYEVE_PARTNER_OWNER_ID','feedback-partner');vi.stubEnv('MYEVE_PARTNER_ACCESS_PASSWORD','synthetic-partner-password');
    vi.stubEnv('MYEVE_DURABLE_WEB_SESSIONS','false');spies.owners.length=0;vi.clearAllMocks();spies.eligible.mockResolvedValue({enrollment:{},config:{}});
  });
  afterEach(()=>vi.unstubAllEnvs());
  function request(method='GET',owner='feedback-owner',origin='https://myeve.example.test',now=Date.now()){
    return new Request('https://myeve.example.test/api/beta/issues',{method,headers:{origin,
      cookie:WEB_SESSION_COOKIE+'='+createWebSessionToken(process.env,now,owner),'content-type':'application/json'},
      ...(method==='POST'?{body:JSON.stringify({id:'synthetic'})}:{})});
  }
  it('denies missing, expired and foreign owner sessions before opening the report store',async()=>{
    expect((await GET(new Request('https://myeve.example.test/api/beta/issues'))).status).toBe(401);
    expect((await GET(request('GET','feedback-owner',undefined,Date.now()-8*24*60*60*1000))).status).toBe(401);
    expect((await GET(request('GET','feedback-partner'))).status).toBe(403);
    expect(spies.owners).toEqual([]);
  });
  it('denies cross-origin writes and disabled installations',async()=>{
    expect((await POST(request('POST','feedback-owner','https://foreign.example.test'))).status).toBe(403);
    vi.stubEnv('MYEVE_MISSIONCONTROL_MODE','');expect((await GET(request())).status).toBe(503);
    expect(spies.owners).toEqual([]);
  });
  it('does not open feedback storage when canonical enrollment is missing or unavailable',async()=>{
    spies.eligible.mockResolvedValue(null);expect((await GET(request())).status).toBe(503);
    spies.eligible.mockRejectedValue(Error('offline'));expect((await POST(request('POST'))).status).toBe(503);
    expect(spies.owners).toEqual([]);
  });
  it('derives owner only from the valid session and prevents response caching',async()=>{
    const response=await GET(request());expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');
    expect(spies.owners).toEqual(['feedback-owner']);expect(await response.json()).toEqual({reports:[],next:null});
  });
});
