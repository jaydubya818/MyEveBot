import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';

const runner=readFileSync(new URL('../../apps/eve/test/owner-journey/runner-prod.ts',import.meta.url),'utf8');
const enabledExpression=runner.match(/const diagnosticEnabled=([^;]+);/)[1];
function childEnvironment(role,env,diagnosticEnabled){
 const line=runner.split('\n').find(value=>value.includes('owned.child(spawn(')&&value.includes(role==='eve'?'[eveCli,':'[nextCli,'));
 const expression=line.match(/\{cwd:app,env:(.*),stdio:'inherit'\}/)[1];
 return runInNewContext('('+expression+')',{env,diagnosticEnabled});
}
test('ordinary diagnostic activation defaults off and accepts only the explicit fixture value',()=>{
 for(const value of [undefined,'','0','false','eve','next','1'])
  assert.equal(runInNewContext(enabledExpression,{process:{env:{MYEVE_OWNED_FIXTURE_ERROR_DIAGNOSTICS:value}}}),value==='1');
});
test('disabled fixture activation returns each original child environment unchanged',()=>{
 const env=Object.freeze({fixture:'inert',NODE_OPTIONS:'unchanged-preload'});
 for(const role of ['eve','next'])assert.equal(childEnvironment(role,env,false),env);
 assert.equal(Object.hasOwn(env,'MYEVE_OWNED_FIXTURE_ERROR_DIAGNOSTICS'),false);
});
test('enabled owned children get only their fixed runtime role and retain original environment values',()=>{
 const env=Object.freeze({fixture:'inert',NODE_OPTIONS:'unchanged-preload'});
 for(const role of ['eve','next']){
  const value=childEnvironment(role,env,true);assert.notEqual(value,env);
  assert.deepEqual(JSON.parse(JSON.stringify(value)),{...env,MYEVE_OWNED_FIXTURE_ERROR_DIAGNOSTICS:role});
 }
 assert.equal(Object.hasOwn(env,'MYEVE_OWNED_FIXTURE_ERROR_DIAGNOSTICS'),false);
});
test('build and parent fixture environments do not opt in to error diagnostics',()=>{
 const parent=runner.match(/const env:NodeJS\.ProcessEnv=\{([\s\S]*?)\n\};/)[1];
 const build=runner.match(/const buildEnv=([^;]+);/)[1];
 assert.equal(parent.includes('MYEVE_OWNED_FIXTURE_ERROR_DIAGNOSTICS'),false);
 assert.equal(build.includes('MYEVE_OWNED_FIXTURE_ERROR_DIAGNOSTICS'),false);
 assert(runner.indexOf('const diagnosticEnabled=')>runner.indexOf("console.log('QE builds done'"));
});
test('default-off runner still has its exact complete source fingerprint asserted',()=>{
 const seams=readFileSync(new URL('./current-qe-seams.mjs',import.meta.url),'utf8');
 const hash=createHash('sha256').update(runner).digest('hex');
 assert(seams.includes("assert.equal(hash(readFileSync(join(sourceRoot,'apps/eve/test/owner-journey/runner-prod.ts'))),'"+hash+"','QE_RUNNER_PROFILE_CHANGED');"));
});

const workflow=readFileSync(new URL('../../.github/workflows/owner-ux.yml',import.meta.url),'utf8');
const setting="          MYEVE_OWNED_FIXTURE_ERROR_DIAGNOSTICS: ${{ (matrix.journey == 'golden' || matrix.journey == 'e3') && '1' || '' }}\n";
test('workflow changes exactly one startup setting and preserves the complete parent workflow',()=>{
 assert.equal(workflow.split(setting).length,2);
 assert.equal(createHash('sha256').update(workflow.replace(setting,'')).digest('hex'),'d7a6536c990129c7947aa44040e60e34b9b3433fe8b78b950551d018f9f0c768');
 const start=workflow.indexOf('      - name: Start isolated unpaid journey fixture\n');
 const end=workflow.indexOf('      - name:',start+1);
 assert(start>=0&&end>start);assert(workflow.slice(start,end).includes(setting));
 assert.equal((workflow.match(/MYEVE_OWNED_FIXTURE_ERROR_DIAGNOSTICS/g)??[]).length,1);
});
test('fixed source matrix cases enable golden/e3 and leave independent or future profiles off',()=>{
 const expression=setting.match(/\$\{\{ (.*) \}\}/)[1];
 for(const journey of ['golden','e3','independent','future-profile','',undefined])
  assert.equal(runInNewContext(expression,{matrix:{journey}}),journey==='golden'||journey==='e3'?'1':'');
});
