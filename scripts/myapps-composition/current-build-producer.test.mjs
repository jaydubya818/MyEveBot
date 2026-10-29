import test from 'node:test';
import assert from 'node:assert/strict';
import {validateBuildEnvironment,observedCommand} from './current-build-producer.mjs';
const app='/private/tmp/synthetic-source/apps/eve';
const environment=()=>({NODE_ENV:'production',VERCEL_ENV:'production',MYEVE_BETA_MODE:'private-alpha',
 EVE_PROJECT_NAME:'myeve-alpha-tester-1',VERCEL_PROJECT_ID:'prj_fixtureproject1',MYEVE_OWNER_ID:'a'.repeat(36),
 NODE_OPTIONS:'--max-old-space-size=5120 --require='+app+'/test/owner-chat-only/transport.cjs',
 DATABASE_URL:'postgresql://ux_fixture:synthetic-local@127.0.0.1:55591/ea_work_'+'a'.repeat(32)});
test('explicit local build bindings have a deterministic value binding, not ownership PASS',()=>{
 const a=environment(),value=validateBuildEnvironment(a,app);
 assert.equal(value.status,'LOCAL_BINDINGS_REQUIRE_EXACT_OPERATOR_OWNERSHIP');
 assert.equal(value.bindingSha256,validateBuildEnvironment(Object.fromEntries(Object.entries(a).reverse()),app).bindingSha256);
 assert.notEqual(value.bindingSha256,validateBuildEnvironment({...a,OWNER_NAME:'Other fixture owner'},app).bindingSha256);
});
test('provider or unknown environment keys fail before execution and diagnostics expose names only',()=>{
 const secret='never-print-this-value';
 assert.throws(()=>validateBuildEnvironment({...environment(),AI_GATEWAY_API_KEY:secret},app),error=>
  error.message.includes('BUILD_UNKNOWN_ENVIRONMENT_KEYS:AI_GATEWAY_API_KEY')&&!error.message.includes(secret));
});
for(const change of ['remote-database','foreign-role','ordinary-database','loader','dev','real-project','real-oidc'])
 test('invalid prospective build binding rejected: '+change,()=>{
  const value=environment();
  if(change==='remote-database')value.DATABASE_URL=value.DATABASE_URL.replace('127.0.0.1','example.invalid');
  if(change==='foreign-role')value.DATABASE_URL=value.DATABASE_URL.replace('ux_fixture','postgres');
  if(change==='ordinary-database')value.DATABASE_URL=value.DATABASE_URL.replace('/ea_work_'+'a'.repeat(32),'/owner_production');
  if(change==='loader')value.NODE_OPTIONS+=' --import=foreign.mjs';
  if(change==='dev')value.NODE_ENV='development';
  if(change==='real-project')value.VERCEL_PROJECT_ID='prj_liveRealProject';
  if(change==='real-oidc')value.VERCEL_OIDC_TOKEN='eyActualProductionOidc';
  assert.throws(()=>validateBuildEnvironment(value,app),/BUILD_/);
 });
test('unbounded commands and shell-shaped invocations are rejected without spawning',()=>{
 assert.throws(()=>observedCommand('node',['-e','throw 1'],{timeoutMs:100}),/COMMAND_ARRAY_REQUIRED/);
 assert.throws(()=>observedCommand('/not-executed',['-e','throw 1'],{timeoutMs:0}),/COMMAND_DEADLINE/);
});
