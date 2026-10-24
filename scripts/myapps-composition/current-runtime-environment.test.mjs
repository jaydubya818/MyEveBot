/** New phase-binding tests only. Extracted pure authored expressions/guards use
 * synthetic values. No SDK/Next/app imports, accounting rows, SQL or processes. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash,generateKeyPairSync,createPrivateKey} from 'node:crypto';
import {join,dirname} from 'node:path';
import vm from 'node:vm';

function source(copied,canonical){
 const local=new URL('./'+copied,import.meta.url);
 return readFileSync(existsSync(local)?local:new URL('../../'+canonical,import.meta.url),'utf8');
}
const fixture=source('current-runtime-fixture.ts','apps/eve/test/owner-journey/current-runtime-fixture.ts');
const producer=source('current-build-producer.mjs','scripts/myapps-composition/current-build-producer.mjs');
const policySource=source('BASELINE_ALPHA_POLICY.ts','apps/eve/lib/external-alpha/policy.ts');
const routeSource=source('BASELINE_CHAT_USAGE_ROUTE.ts','apps/eve/app/api/chat-usage/route.ts');
const runtimeSource=readFileSync(new URL('./current-qe-runtime.mjs',import.meta.url),'utf8');
const publicSource=readFileSync(new URL('./current-public-runtime.mjs',import.meta.url),'utf8');
const owner='11111111-1111-4111-8111-111111111111',peer='22222222-2222-4222-8222-222222222222';
const policy={ownerId:owner,projectId:'prj_fixturechat1',slot:'1',repository:'fixture/myeve-alpha-workspace-01'};
const digest=()=> 'a'.repeat(64); // Shape/digest algorithms reuse their existing tests.
const key=generateKeyPairSync('ed25519').privateKey.export({type:'pkcs8',format:'pem'});
const app={url:'postgresql://ux_fixture:synthetic_only@127.0.0.1:56792/ea_work_0123456789abcdef0123456789abcdef',
 owner,policy,password:'synthetic_only_password'.padEnd(64,'x'),sessionSecret:'b'.repeat(96),credential:'c'.repeat(64)};
const central={url:'postgresql://ux_fixture:synthetic_only@127.0.0.1:56792/ea_work_fedcba9876543210fedcba9876543210'};
const copiedApp='/pure/source/apps/eve';
function baseEnvironment(){
 const start=fixture.indexOf('  function environment('),brace=fixture.indexOf('{',start);
 const end=fixture.indexOf('\n  async function observe(',brace);
 assert(start>0&&brace>start&&end>brace);
 const context=vm.createContext({app,central,authorityKey:key,digest,Buffer,Date,Math});
 vm.runInContext('function environment(copiedApp,transportFile) '+fixture.slice(brace,end)
  +'\nglobalThis.buildEnvironment=environment;',context);
 return {...context.buildEnvironment(copiedApp,'/pure/transport.json')};
}
function runtimeEnvironment(base,ambient={}){
 const start=runtimeSource.indexOf('  const runtimeEnvironment={'),tail="WORKFLOW_TARGET_WORLD:'local'};";
 const end=runtimeSource.indexOf(tail,start)+tail.length;
 assert(start>0&&end>start);
 const deletion='delete runtimeEnvironment.NODE_OPTIONS;';
 assert(runtimeSource.includes(deletion));
 const context=vm.createContext({environment:base,dirname,join,node:'/pure/node',privateRoot:'/pure/private',
  spec:{workRoot:'/pure/work',ports:{eve:3185}},process:{env:ambient}});
 vm.runInContext(runtimeSource.slice(start,end)+'\n'+deletion+'\nglobalThis.result=runtimeEnvironment;',context);
 return {...context.result};
}
function buildValidator(){
 const start=producer.indexOf('const BUILD_ENV_KEYS='),end=producer.indexOf(']);',start)+3;
 const fnStart=producer.indexOf('export function validateBuildEnvironment('),fnEnd=producer.indexOf('\n}',fnStart)+2;
 assert(start>=0&&end>start&&fnStart>start&&fnEnd>fnStart);
 const context=vm.createContext({assert,URL,join,Object,
  hash:value=>createHash('sha256').update(value).digest('hex')});
 vm.runInContext(producer.slice(start,end)+'\n'+producer.slice(fnStart,fnEnd).replace('export function','function')
  +'\nglobalThis.validate=validateBuildEnvironment;',context);
 return context.validate;
}
function functionBody(name){
 const start=policySource.indexOf('export function '+name+'('),brace=policySource.indexOf('{',start),end=policySource.indexOf('\n}',brace)+2;
 assert(start>=0&&brace>start&&end>brace);
 return policySource.slice(brace,end);
}
function policyGuard(){
 const context=vm.createContext({Buffer,createPrivateKey,digest,
  EXTERNAL_ALPHA_SIGNING_KEY_ENV:'MYEVE_EXTERNAL_ALPHA_AUTHORITY_SIGNING_KEY',
  externalAlphaPolicySchema:{parse:value=>value},process:{env:{}}});
 const declarations=[
  'function externalAlphaInstallation(env=process.env) '+functionBody('externalAlphaInstallation'),
  'function externalAlphaProjectSlot(env=process.env) '+functionBody('externalAlphaProjectSlot').replace('(match[1] as "1" | "2")','match[1]'),
  'function assertExternalAlphaSigningKey(env=process.env) '+functionBody('assertExternalAlphaSigningKey'),
  'function assertExternalAlphaRuntimeBinding(p,env=process.env) '+functionBody('assertExternalAlphaRuntimeBinding'),
  'function externalAlphaPolicy(env=process.env) '+functionBody('externalAlphaPolicy'),
 ];
 vm.runInContext(declarations.join('\n')+'\nglobalThis.check=externalAlphaPolicy;',context);
 return context.check;
}
function usageRoute(env,principal={id:owner}){
 const counters={policy:0,database:0,accounting:0};
 const start=routeSource.indexOf('export async function GET(');
 assert(start>0);
 const guard=policyGuard();
 const context=vm.createContext({Response,
  authenticateWebPrincipal:async()=>principal,
  externalAlphaPolicy:()=>{counters.policy++;return guard(env);},
  betaIntegration:()=>{counters.database++;throw Error('PURE_STOP_AT_DATABASE_BOUNDARY');},
  readAlphaChatUsage:()=>{counters.accounting++;throw Error('PURE_ACCOUNTING_FORBIDDEN');},
 });
 vm.runInContext(routeSource.slice(start).replace('export async function GET(request: Request)','async function GET(request)')
  +'\nglobalThis.handler=GET;',context);
 return {counters,get:()=>context.handler(new Request('http://localhost:3188/api/chat-usage'))};
}

test('old base/runtime misses installation flag and actual route fails before database',async()=>{
 const base=baseEnvironment();assert.equal(Object.hasOwn(base,'VERCEL'),false);
 assert.throws(()=>policyGuard()(base),/EXTERNAL_ALPHA_INSTALLATION_BINDING/);
 const route=usageRoute(base);assert.equal((await route.get()).status,503);
 assert.deepEqual(route.counters,{policy:1,database:0,accounting:0});
});
test('runtime-only flag passes unchanged canonical policy and leaves base/build untouched',()=>{
 const base=baseEnvironment(),before={...base},runtime=runtimeEnvironment(base);
 assert.equal(runtime.VERCEL,'1');assert.deepEqual(base,before);assert.equal(Object.hasOwn(base,'VERCEL'),false);
 assert.equal(Object.hasOwn(runtime,'NODE_OPTIONS'),false);
 for(const [key,value] of Object.entries(base))if(key!=='NODE_OPTIONS')assert.equal(runtime[key],value,key);
 assert.equal(policyGuard()(runtime).ownerId,owner);
});
test('base environment passes the existing node-server build validator',()=>{
 const base=baseEnvironment();assert.equal(buildValidator()(base,copiedApp).status,'LOCAL_BINDINGS_REQUIRE_EXACT_OPERATOR_OWNERSHIP');
});
test('build rejects VERCEL even though runtime requires it; host-preset guard stays intact',()=>{
 assert.throws(()=>buildValidator()({...baseEnvironment(),VERCEL:'1'},copiedApp),/BUILD_UNKNOWN_ENVIRONMENT_KEYS:VERCEL/);
 assert(producer.includes("assert(!('VERCEL' in buildEnv),'BUILD_VERCEL_HOST_PRESET_REJECTED')"));
});
test('runtime does not inherit ambient owner/database/provider settings',()=>{
 const runtime=runtimeEnvironment(baseEnvironment(),{VERCEL:'ambient',DATABASE_URL:'foreign',CI:'true',VERCEL_PROJECT_ID:'foreign'});
 assert.equal(runtime.VERCEL,'1');assert.equal(runtime.DATABASE_URL,app.url);assert.equal(runtime.VERCEL_PROJECT_ID,policy.projectId);
 assert.equal(Object.hasOwn(runtime,'CI'),false);
});
test('local workflow target, owned service base and loader removal remain exact',()=>{
 const runtime=runtimeEnvironment(baseEnvironment());
 assert.equal(runtime.WORKFLOW_TARGET_WORLD,'local');assert.equal(runtime.WORKFLOW_LOCAL_BASE_URL,'http://127.0.0.1:3185');
 assert.equal(runtime.WORKFLOW_LOCAL_DATA_DIR,'/pure/private/workflow');
 assert.equal(Object.hasOwn(runtime,'NODE_OPTIONS'),false);
});
for(const value of [undefined,'','0','true','false','production']){
 test('unchanged installation guard rejects VERCEL value '+String(value),()=>{
  const env=runtimeEnvironment(baseEnvironment());
  if(value===undefined)delete env.VERCEL;else env.VERCEL=value;
  assert.throws(()=>policyGuard()(env),/EXTERNAL_ALPHA_INSTALLATION_BINDING/);
 });
}
for(const [name,value] of [
 ['MYEVE_OWNER_ID',peer],['VERCEL_PROJECT_ID','prj_foreign'],['VERCEL_ENV','preview'],
 ['VERCEL_TARGET_ENV','preview'],['MYEVE_EXTERNAL_ALPHA_POLICY_SHA256','d'.repeat(64)],
 ['MYEVE_ALPHA_OWNER_BINDING','foreign'],['MYEVE_PRODUCTION_CANARY_CONFIG','foreign'],
 ['MYEVE_CLOUD_QUALIFICATION_CONFIG','foreign'],
]){
 test('runtime flag cannot override required canonical binding '+name,()=>{
  const env={...runtimeEnvironment(baseEnvironment()),[name]:value};
  assert.throws(()=>policyGuard()(env),/EXTERNAL_ALPHA_INSTALLATION_BINDING/);
 });
}
test('runtime flag cannot override immutable tester slot',()=>{
 const env={...runtimeEnvironment(baseEnvironment()),EVE_PROJECT_NAME:'myeve-alpha-tester-2'};
 assert.throws(()=>policyGuard()(env),/EXTERNAL_ALPHA_INSTALLATION_SLOT/);
});
test('runtime flag cannot override repository slot binding',()=>{
 const env=runtimeEnvironment(baseEnvironment());env.MYEVE_EXTERNAL_ALPHA_POLICY=JSON.stringify({...policy,repository:'fixture/foreign'});
 assert.throws(()=>policyGuard()(env),/EXTERNAL_ALPHA_INSTALLATION_REPOSITORY/);
});
test('runtime flag cannot replace required signing-key validation',()=>{
 const env={...runtimeEnvironment(baseEnvironment()),MYEVE_EXTERNAL_ALPHA_AUTHORITY_SIGNING_KEY:'not-a-key'};
 assert.throws(()=>policyGuard()(env),/EXTERNAL_ALPHA_SIGNING_KEY_REQUIRED/);
});
test('public usage route still denies anonymous requests before policy or database',async()=>{
 const route=usageRoute(runtimeEnvironment(baseEnvironment()),null);
 assert.equal((await route.get()).status,401);assert.deepEqual(route.counters,{policy:0,database:0,accounting:0});
});
test('public usage route still denies another owner before database',async()=>{
 const route=usageRoute(runtimeEnvironment(baseEnvironment()),{id:peer});
 assert.equal((await route.get()).status,403);assert.deepEqual(route.counters,{policy:1,database:0,accounting:0});
});
test('fixed runtime reaches a deliberate database tripwire; no accounting row fabricated',async()=>{
 const route=usageRoute(runtimeEnvironment(baseEnvironment()));
 assert.equal((await route.get()).status,503); // Intentional fake boundary, not a usage PASS.
 assert.deepEqual(route.counters,{policy:1,database:1,accounting:0});
});
for(const status of [200,503]){
 test('initial public usage guard retains strict200 and fixed failure label for '+status,()=>{
  const statement="assert.equal(initialUsageResponse.status,200,'PUBLIC_INITIAL_USAGE_READ_FAILED');";
  assert(publicSource.includes(statement));
  const run=()=>vm.runInNewContext(statement,{assert,initialUsageResponse:{status}});
  if(status===200)assert.doesNotThrow(run);else assert.throws(run,/PUBLIC_INITIAL_USAGE_READ_FAILED/);
 });
}
