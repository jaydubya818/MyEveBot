import test from 'node:test';
import assert from 'node:assert/strict';
import {GET} from '../app/api/work-thread/route.ts';
import {createWebSessionToken,WEB_SESSION_COOKIE} from '../lib/web-auth.ts';
import {betaConfiguration} from '../lib/beta-integration/configuration.ts';

test('disabled canonical Work datastore stays unavailable instead of inventing empty progress',async()=>{
  const values={MYEVE_BETA_MODE:undefined,MYEVE_PARTNER_OWNER_ID:undefined,SOFIE_OWNER_ID:undefined,SOFIE_ACCESS_PASSWORD:undefined,SOFIE_SESSION_SECRET:undefined,MYEVE_OWNER_ID:'work-route-fixture-owner',MYEVE_ACCESS_PASSWORD:'fixture-only',MYEVE_SESSION_SECRET:'fixture-only-session-secret-at-least-thirty-two-characters'};
  const saved=Object.fromEntries(Object.keys(values).map(key=>[key,process.env[key]]));
  try{
    for(const [key,value] of Object.entries(values)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
    assert.throws(()=>betaConfiguration(),/Beta integration is not enabled/);
    const token=createWebSessionToken(process.env);
    const response=await GET(new Request('http://localhost/api/work-thread?threadId=fixture-thread',{headers:{cookie:`${WEB_SESSION_COOKIE}=${token}`}}));
    assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'no-store');
    assert.deepEqual(await response.json(),{error:'Work progress is unavailable. Retry to refresh its saved state.'});
  }finally{for(const [key,value] of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
