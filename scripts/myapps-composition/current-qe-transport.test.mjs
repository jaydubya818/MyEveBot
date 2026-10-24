/** Executes only the actual projected allowedHttp function with synthetic URL
 * bindings. Never evaluates require/pg/socket/preload/application statements. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {projectCurrentQETransport} from './current-qe-seams.mjs';
const baseline=new URL('./BASELINE_OWNER_CHAT_ONLY_TRANSPORT.cjs',import.meta.url);
const source=readFileSync(existsSync(baseline)?baseline:new URL('../../apps/eve/test/owner-chat-only/transport.cjs',import.meta.url),'utf8');
assert.equal(createHash('sha256').update(source).digest('hex'),'775ce4b368c59a0460ab67e3030b65f3c17129da65eb10326fa42c93d0d515ca');
const projected=projectCurrentQETransport(source);new vm.Script(projected);
const start=projected.indexOf('function allowedHttp('),end=projected.indexOf("\nfor (const protocol",start);
assert(start>0&&end>start);
const allowed=vm.runInNewContext(projected.slice(start,end)+'\nallowedHttp',{web:new Set(['http://localhost:3188','http://127.0.0.1:3188']),eve:'http://127.0.0.1:3185',model:'http://127.0.0.1:3184',reads:new Set(['/api/agents'])});
for(const base of ['http://localhost:3188','http://127.0.0.1:3188'])
 for(const path of ['/eve/v1/health','/eve/v1/session','/eve/v1/session/session-a/stream?startIndex=0&follow=false'])
  test('reviewed web proxy allows required public path: '+base+path,()=>assert.equal(allowed(new URL(base+path),path==='/eve/v1/session'?'POST':'GET'),true));
for(const path of ['http://127.0.0.1:3189/eve/v1/health','https://provider.invalid/model','http://127.0.0.1:3188/api/work/execute'])
 test('proxy seam retains foreign/disabled endpoint denial: '+path,()=>assert.equal(allowed(new URL(path),'POST'),false));
test('unknown transport baseline never receives a guessed rewrite',()=>assert.throws(()=>projectCurrentQETransport('changed source'),/SEAM_CHANGED/));
