/** Authored initial Client options and unchanged owner guard snippets only.
 * No SDK/app module, real Client, database, fetch, timer or process is executed. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const driver=readFileSync(new URL('./current-public-runtime.mjs',import.meta.url),'utf8');
const channel=readFileSync(new URL('../../apps/eve/agent/channels/eve.ts',import.meta.url),'utf8');
const retained=readFileSync(new URL('../../apps/eve/agent/lib/retained-work-session.ts',import.meta.url),'utf8');
const start=driver.indexOf('const initialStreamReconnectPolicy='),end=driver.indexOf('\n});',start)+4;
assert(start>0&&end>start);
const policy=vm.runInNewContext(driver.slice(start,end)+'\ninitialStreamReconnectPolicy',{Object});
const time=driver.match(/const timeout=\(\)=>AbortSignal.timeout\(([^)]+)\);/);assert(time);
const first=driver.split('\n').find(line=>line.includes('const first=await new Client(options).sessions.create('));assert(first);
async function create(){
 const calls=[],options={headers:{cookie:'synthetic-cookie',origin:'http://localhost:3188','x-myeve-browser-owner':'owner','x-myeve-thread-id':'thread'}};
 const answer={session:{id:'synthetic'},response:{}};
 class Client {constructor(value){assert.equal(value,options);this.sessions={create:async value=>{calls.push(value);return answer;}};}}
 const context=vm.createContext({Client,options,firstText:'one authored message',initialStreamReconnectPolicy:policy,
  AbortSignal:{timeout:ms=>({timeoutMs:ms})}});
 const result=await vm.runInContext('const timeout=()=>AbortSignal.timeout('+time[1]+');\n(async()=>{'+first+'\nreturn first;})()',context);
 return {calls,result,answer};
}
test('initial policy retries HTTP500 only',()=>assert.deepEqual(Array.from(policy.retryableErrorStatuses),[500]));
for(const status of [401,403,404,409,425,502,503,504])test('initial opening never adds HTTP'+status+' to eligible statuses',()=>assert(!policy.retryableErrorStatuses.includes(status)));
test('stream opening has eight finite attempts and bounded backoff',()=>{
 assert.equal(policy.streamOpenReconnectPolicy.maxAttempts,8);assert.equal(policy.streamOpenReconnectPolicy.baseDelayMs,250);assert.equal(policy.streamOpenReconnectPolicy.maxDelayMs,1000);
});
test('idle reconnect stays disabled after the stream opens',()=>assert.equal(policy.streamIdleReconnectPolicy.maxAttempts,0));
test('reconnect policy and nested arrays/objects are immutable',()=>{
 for(const value of [policy,policy.retryableErrorStatuses,policy.streamOpenReconnectPolicy,policy.streamIdleReconnectPolicy])assert(Object.isFrozen(value));
});
test('the actual initial expression creates one message with the same finite30second signal',async()=>{
 const f=await create();assert.equal(f.calls.length,1);assert.equal(f.calls[0].message,'one authored message');assert.equal(f.calls[0].signal.timeoutMs,30000);assert.equal(f.calls[0].streamReconnectPolicy,policy);assert.equal(f.result,f.answer);
});
test('replay and followup policies remain the original three explicit no-reconnect options',()=>{
 assert.equal(driver.split('streamReconnectPolicy:{reconnect:false}').length-1,3);
 assert.equal(driver.split('sessions.create(').length-1,1);
 assert(!first.includes('.send(')&&!first.includes('.resume('));
});
const replayStart=retained.indexOf('export function replaySessionId('),replayEnd=retained.indexOf('\n}',replayStart)+2;
const ownerStart=retained.indexOf('export async function retainedSessionOwner('),ownerEnd=retained.indexOf('\n}',ownerStart)+2;
assert(replayStart>=0&&ownerStart>=0);
const replay=retained.slice(replayStart,replayEnd).replace('export function','function').replace('(request: Request): string | null','(request)');
const owner=retained.slice(ownerStart,ownerEnd).replace('export async function','async function').replace('(sessionId: string, ownerId: string, threadId?: string): Promise<boolean | null>','(sessionId, ownerId, threadId)');
const gateStart=channel.indexOf('    const replayId = replaySessionId(request);'),gateEnd=channel.indexOf('    const workHeader =',gateStart);assert(gateStart>0&&gateEnd>gateStart);
async function authorize(rows,method='GET'){
 const queries=[];
 class ForbiddenError extends Error {constructor(value){super(value.message);this.code=value.code;this.status=403;}}
 const context=vm.createContext({URL,Error,ForbiddenError,db:()=>({async query(sql,args){queries.push({sql,args});return rows;}}),
  request:new Request('http://127.0.0.1:3185/eve/v1/session/session-test/stream',{method}),principal:{id:'owner'},requestedThreadId:'thread'});
 const promise=vm.runInContext(replay+'\n'+owner+'\n(async()=>{'+channel.slice(gateStart,gateEnd)+'\nreturn "BOUND";})()',context);
 return {promise,queries};
}
test('pending binding remains an error, never provisional authorization',async()=>{
 const f=await authorize([]);await assert.rejects(f.promise,error=>error.message==='Session ownership binding is not available yet.');assert.equal(f.queries.length,1);
});
test('matching retained owner and thread pass the unchanged server guard',async()=>{
 const f=await authorize([{owner_id:'owner',thread_id:'thread'}]);assert.equal(await f.promise,'BOUND');assert.equal(f.queries.length,1);
});
for(const [name,rows] of [
 ['foreign owner',[{owner_id:'another-owner',thread_id:'thread'}]],
 ['foreign thread',[{owner_id:'owner',thread_id:'another-thread'}]],
 ['mixed ownership',[{owner_id:'owner',thread_id:'thread'},{owner_id:'another-owner',thread_id:'thread'}]],
])test(name+' stays forbidden403 and is not retry-eligible',async()=>{
 const f=await authorize(rows);await assert.rejects(f.promise,error=>error.status===403&&error.code==='invalid_session_owner');assert(!policy.retryableErrorStatuses.includes(403));
});
