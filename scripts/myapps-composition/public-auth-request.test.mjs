import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {authenticatePublicOwner} from './current-public-runtime.mjs';

const baseline = new URL('./BASELINE_WEB_AUTH.ts', import.meta.url);
const guardPath = existsSync(baseline) ? baseline : new URL('../../apps/eve/lib/web-auth.ts', import.meta.url);
const guardSource = readFileSync(guardPath, 'utf8');
// Bound unchanged application guard, not a copied permissive test replacement.
const guardSha256 = createHash('sha256').update(guardSource).digest('hex');
assert.equal(guardSha256,'216311cfe5e4c801d2f0e2b0ccc150dfadf2c4a4df33c39b0582fc38f7d70680');
const start = guardSource.indexOf('function normalizeOriginForComparison(');
const end = guardSource.indexOf('\n/**', guardSource.indexOf('export function requireSameOrigin(', start));
assert(start > 0 && end > start);
const guard = vm.runInNewContext(guardSource.slice(start, end)
  .replace('function normalizeOriginForComparison(rawUrl: string): string', 'function normalizeOriginForComparison(rawUrl)')
  .replace('function isUnsafeCrossOrigin(request: Request): boolean', 'function isUnsafeCrossOrigin(request)')
  .replace('export function requireSameOrigin(request: Request): Response | null', 'function requireSameOrigin(request)')
  + '\nrequireSameOrigin', {URL, process:{env:{NODE_ENV:'production'}},
    apiError: (_request,status,code,message) => Response.json({error:{code,message}}, {status})});
const ownerId = '11111111-1111-4111-8111-111111111111';
const password = 'synthetic-public-password-never-installed';
const config = {webOrigin:'http://localhost:3188',ownerId,password};

export function fakeBrowserHttp(options = {}) {
  const calls = [];
  async function send(raw, init = {}) {
    const wire = new URL(raw);
    // A synthetic HTTP boundary modeling the pinned NextRequest/NextURL
    // loopback normalization. No Next/SDK code is imported or evaluated.
    const routed = new URL(wire);
    if (['127.0.0.1','[::1]'].includes(routed.hostname)) routed.hostname='localhost';
    const request = new Request(routed, init);
    const cookie = request.headers.get('cookie');
    calls.push({url:wire.href,method:request.method,origin:request.headers.get('origin'),
      hasCookie:cookie!==null,ownerHeader:request.headers.get('x-myeve-browser-owner')});
    const denied = guard(request);
    if (denied) return denied;
    if (wire.pathname==='/api/threads' && !cookie) return new Response(null,{status:options.initialStatus??401});
    if (wire.pathname==='/api/auth/login') {
      assert.equal(cookie,null);assert.equal(request.headers.get('x-myeve-browser-owner'),null);
      assert.deepEqual(await request.json(),{password});
      const status=options.loginStatus??200;
      if(status!==200)return Response.json({error:'Synthetic denial'},{status});
      const headers=new Headers();
      for(const value of options.cookies??['myeve_session=synthetic-session; HttpOnly; Secure; SameSite=Strict'])headers.append('set-cookie',value);
      return Response.json({ok:true},{headers});
    }
    if(wire.pathname==='/api/auth/status')return Response.json(options.status??{authenticated:true,ownerId,mode:'owner-session'},{status:options.authStatus??200});
    return Response.json({ok:true});
  }
  return {calls,send};
}

test('production guard still denies old numeric-loopback wire Origin after Next canonicalization',async()=>{
  const f=fakeBrowserHttp();
  const response=await f.send('http://127.0.0.1:3188/api/auth/login',{method:'POST',headers:{origin:'http://127.0.0.1:3188','content-type':'application/json'},body:JSON.stringify({password})});
  assert.equal(response.status,403);assert.equal((await response.json()).error.code,'cross_origin_request');
});

test('canonical wire URL and Origin pass the unchanged production guard with owner headers only after cookie',async()=>{
  const f=fakeBrowserHttp();const session=await authenticatePublicOwner(config,f.send);
  assert.equal(session.cookie,'myeve_session=synthetic-session');
  assert.deepEqual(f.calls.map(call=>({method:call.method,origin:call.origin,hasCookie:call.hasCookie,ownerHeader:call.ownerHeader})),[
    {method:'GET',origin:config.webOrigin,hasCookie:false,ownerHeader:null},
    {method:'POST',origin:config.webOrigin,hasCookie:false,ownerHeader:null},
    {method:'GET',origin:config.webOrigin,hasCookie:true,ownerHeader:ownerId},
  ]);
  await session.request('/api/threads/synthetic',{method:'PUT',body:{title:'Synthetic'}});
  assert(f.calls.every(call=>new URL(call.url).origin===call.origin));
  assert.equal(f.calls.at(-1).ownerHeader,ownerId);
});

for(const status of [401,403,429,503])test(`login ${status} stops without retry, cookie or later authenticated calls`,async()=>{
  const f=fakeBrowserHttp({loginStatus:status});await assert.rejects(authenticatePublicOwner(config,f.send),/PUBLIC_LOGIN_FAILED/);
  assert.equal(f.calls.length,2);assert(f.calls.every(call=>!call.hasCookie&&call.ownerHeader===null));
});

test('unexpected anonymous read success stops before sending the password',async()=>{
  const f=fakeBrowserHttp({initialStatus:200});await assert.rejects(authenticatePublicOwner(config,f.send),/PUBLIC_SIGNED_LOGIN_REQUIRED/);assert.equal(f.calls.length,1);
});

for(const cookies of [[],['foreign_session=synthetic'],['myeve_session=one','myeve_session=two']])
test('missing, foreign or duplicate session cookies stop before authenticated reads: '+cookies.length,async()=>{
  const f=fakeBrowserHttp({cookies});await assert.rejects(authenticatePublicOwner(config,f.send),/PUBLIC_SIGNED_SESSION_COOKIE_REQUIRED/);assert.equal(f.calls.length,2);
});

for(const [status,pattern] of [[{authenticated:false,ownerId,mode:'owner-session'},/PUBLIC_AUTHENTICATED_STATUS_REQUIRED/],
  [{authenticated:true,ownerId:'22222222-2222-4222-8222-222222222222',mode:'owner-session'},/PUBLIC_AUTHENTICATED_OWNER_REQUIRED/],
  [{authenticated:true,ownerId,mode:'local-development'},/PUBLIC_OWNER_SESSION_MODE_REQUIRED/]])
test('authentication or owner-mode mismatch stops the phase',async()=>{
  const f=fakeBrowserHttp({status});await assert.rejects(authenticatePublicOwner(config,f.send),pattern);assert.equal(f.calls.length,3);
});

test('failed status HTTP response cannot attest authentication even with an authenticated-looking body',async()=>{
  const f=fakeBrowserHttp({authStatus:503});await assert.rejects(authenticatePublicOwner(config,f.send),/PUBLIC_AUTH_STATUS_FAILED/);assert.equal(f.calls.length,3);
});

for(const [label,value] of [['invalid owner',{...config,ownerId:'foreign'}],['short password',{...config,password:'short'}],
  ['long password',{...config,password:'x'.repeat(129)}],['unknown field',{...config,unexpected:true}]])
test(`${label} stops before any HTTP call`,async()=>{
  const f=fakeBrowserHttp();await assert.rejects(authenticatePublicOwner(value,f.send));assert.equal(f.calls.length,0);
});

for(const webOrigin of ['http://127.0.0.1:3188','http://[::1]:3188','https://localhost:3188','http://localhost:3189/path',
  'http://localhost:3188/?query=x','http://user@localhost:3188','http://other.localhost:3188','http://localhost'])
test('noncanonical web binding is rejected before any request: '+webOrigin,async()=>{
  const f=fakeBrowserHttp();await assert.rejects(authenticatePublicOwner({...config,webOrigin},f.send),/PUBLIC_CANONICAL_WEB_ORIGIN_REQUIRED/);assert.equal(f.calls.length,0);
});

test('request cannot escape to a protocol-relative or absolute foreign endpoint',async()=>{
  const f=fakeBrowserHttp();const session=await authenticatePublicOwner(config,f.send);const count=f.calls.length;
  for(const path of ['//foreign.invalid/','https://foreign.invalid/'])await assert.rejects(session.request(path),/PUBLIC_RELATIVE_PATH_REQUIRED/);
  assert.equal(f.calls.length,count);
});

test('different origin scheme, port, foreign host and cross-site remain denied by the unchanged guard',()=>{
  for(const origin of ['https://localhost:3188','http://localhost:3189','http://foreign.invalid'])
    assert.equal(guard(new Request('http://localhost:3188/api/auth/login',{method:'POST',headers:{origin}})).status,403);
  assert.equal(guard(new Request('http://localhost:3188/api/auth/login',{method:'POST',headers:{origin:config.webOrigin,'sec-fetch-site':'cross-site'}})).status,403);
});

test('authenticated request with foreign Origin is still denied by the unchanged application guard',async()=>{
  const f=fakeBrowserHttp();const session=await authenticatePublicOwner(config,f.send);
  const response=await session.request('/api/threads/synthetic',{method:'PUT',headers:{origin:'https://foreign.invalid'},body:{title:'Synthetic'}});
  assert.equal(response.status,403);assert.equal((await response.json()).error.code,'cross_origin_request');
});

