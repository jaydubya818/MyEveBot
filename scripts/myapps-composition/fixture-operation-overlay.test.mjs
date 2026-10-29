import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {stripTypeScriptTypes} from 'node:module';
import {runInNewContext} from 'node:vm';
import {types} from 'node:util';
import {fixtureOperationOverlay,operationSourcePreimages} from './fixture-operation-overlay.mjs';

const root=new URL('../../',import.meta.url);
const helperPath='apps/eve/test/owner-journey/fixture-error-diagnostics.cjs';
const companion='/tmp/myeve-owner-journey-synthetic/'+helperPath;
const helper=readFileSync(new URL(helperPath,root),'utf8');
const sources=Object.fromEntries(Object.keys(operationSourcePreimages).map(path=>[path,readFileSync(new URL(path,root),'utf8')]));
const overlays=fixtureOperationOverlay('1',sources,companion);
const hash=value=>createHash('sha256').update(value).digest('hex');
function diagnostics({write,byteLength=Buffer.byteLength}={}){
 const module={exports:{}},lines=[],writes=[],consoleCalls=[];
 const consoleObject={error(...args){consoleCalls.push(args);}};
 runInNewContext(helper,{module,Buffer:{byteLength},Error,TypeError,RangeError,ReferenceError,SyntaxError,URIError,EvalError,AggregateError,
  require(name){
   if(name==='node:util')return {types};
   if(name==='node:fs')return {writeSync(fd,line){assert.equal(fd,2);writes.push(line);if(write)return write(line);lines.push(line);return Buffer.byteLength(line);}};
   throw Error('Unexpected diagnostic dependency');
  }});
 return {...module.exports,module,consoleObject,lines,writes,consoleCalls,
  records:()=>lines.map(line=>JSON.parse(line.slice(line.indexOf(' ')+1)))};
}
function evaluate(body,h,role='eve',stubs={}){
 const script=stripTypeScriptTypes(body,{mode:'strip'}).replace(/^import[^\n]*\n/gm,'')
  .replace('export default ','globalThis.result = ').replaceAll('import.meta.url',"'file:///synthetic/owned-bundle.mjs'");
 const requires=[];
 const context={process:{env:{MYEVE_OWNED_FIXTURE_ERROR_DIAGNOSTICS:role}},console:{info(){}},
  fixtureDiagnosticRequire(){return path=>{requires.push(path);assert.equal(path,companion);return h.module.exports;};},
  defineAgent:value=>value,defineDynamic:value=>value,defineInstructions:value=>value,
  ...stubs};
 runInNewContext(script,context);
 return {value:context.result,requires};
}
function modelFixture(h,{role='eve',selectionError,callError,method='doGenerate',response={synthetic:true},order=[]}={}){
 let selections=0,calls=0,received;
 const selected={provider:'myeve-external-alpha',
  async [method](options){calls++;received=options;order.push('delegated');
   if(callError){order.push('existing-accounting-reconciled');throw callError;}
   return response;}};
 const transformed=overlays.find(value=>value.path.endsWith('/agent.ts')).body;
 const evaluated=evaluate(transformed,h,role,{gateway(){throw Error('Unbudgeted gateway must not run');},
  externalAlphaInstallation:()=>true,ownerModelStepKey:()=> 'synthetic:1',
  externalAlphaModel(){selections++;order.push('selection');if(selectionError)throw selectionError;return selected;}});
 const scope={session:{id:'synthetic',auth:{current:{principalId:'not-emitted',attributes:{owner:'true'}},initiator:{}}},messages:[]};
 const model=evaluated.value.model.events['step.started']({},scope).model;
 return {model,evaluated,count:()=>({selections,calls}),received:()=>received};
}

test('overlay is inert for every non-exact opt-in without inspecting source/path inputs',()=>{
 let invoked=0;const opaque=new Proxy({},{get(){invoked++;throw Error('unexpected input read');}});
 for(const optIn of [undefined,'',false,true,1,'eve','next','0','false',opaque])assert.deepEqual(fixtureOperationOverlay(optIn,opaque,opaque),[]);
 assert.equal(invoked,0);
});
test('only two exact production preimages are transformed and provenance binds their complete original/derived bodies',()=>{
 assert.equal(overlays.length,2);
 for(const item of overlays){
  assert.equal(item.beforeSha256,hash(sources[item.path]));assert.equal(item.afterSha256,hash(item.body));
  assert.equal(item.beforeSha256,operationSourcePreimages[item.path]);
  assert(item.body.startsWith("import { createRequire as fixtureDiagnosticRequire } from 'node:module';"));
  assert.equal(item.body.split(JSON.stringify(companion)).length,2);
  for(const {phase,provenance} of item.boundaries){assert(item.body.includes("'"+phase+"'"));assert(helper.includes("'"+provenance+"'"));}
 }
 assert.deepEqual(overlays.flatMap(item=>item.boundaries.map(value=>value.phase)).sort(),['INSTRUCTIONS','MODEL_GENERATE','MODEL_SELECTION','MODEL_STREAM']);
});
test('changed, missing or duplicated source preimages fail rather than applying a guessed overlay',()=>{
 for(const path of Object.keys(sources))for(const altered of [undefined,sources[path]+'\n',sources[path]+sources[path]])
  assert.throws(()=>fixtureOperationOverlay('1',{...sources,[path]:altered},companion),/FIXTURE_OPERATION_(SOURCE_REQUIRED|PREIMAGE_CHANGED)/);
 for(const path of [undefined,'relative.cjs','/tmp/wrong.cjs',companion+'\0',companion+'x','/'.repeat(4097)+companion])
  assert.throws(()=>fixtureOperationOverlay('1',sources,path),/FIXTURE_OPERATION_COMPANION_PATH/);
});
test('instruction callback returns the original value, calls once and emits no context or instruction content',async()=>{
 const h=diagnostics();h.installFixtureErrorDiagnostics(h.consoleObject,'eve');
 let binds=0,assemblies=0;const instruction={markdown:'SYNTHETIC_PRIVATE_CONTEXT'};
 const evaluated=evaluate(overlays.find(value=>value.path.includes('/instructions/')).body,h,'eve',{
  ownerRuntimeFromAuth:()=>({ownerId:'private-owner',agentId:'private-agent',runId:'private-run'}),
  async bindOwnerRuntime(){binds++;},async assembleContext(){assemblies++;return instruction;}});
 const result=await evaluated.value.events['turn.started']({data:{turnId:'private-turn'}},{session:{id:'private-session',auth:{}}});
 assert.equal(result.markdown,instruction.markdown);assert.equal(binds,1);assert.equal(assemblies,1);
 assert.deepEqual(h.records().map(value=>[value.phase,value.state]),[['INSTRUCTIONS','ENTER'],['INSTRUCTIONS','RETURN']]);
 assert(!h.lines.join('').includes('PRIVATE_CONTEXT'));assert(!h.lines.join('').includes('private-'));
 assert.deepEqual(evaluated.requires,[companion]);
});
test('instruction failure remains the identical original rejection, including after a diagnostic sink failure',async()=>{
 const original=Object.assign(new TypeError('private-message'),{code:'ECONNREFUSED'});
 for(const write of [undefined,()=>{throw Error('sink failure');}]){
  const h=diagnostics({write});h.installFixtureErrorDiagnostics(h.consoleObject,'eve');let calls=0;
  const evaluated=evaluate(overlays.find(value=>value.path.includes('/instructions/')).body,h,'eve',{
   ownerRuntimeFromAuth:()=>({}),async bindOwnerRuntime(){calls++;throw original;}});
  await assert.rejects(evaluated.value.events['turn.started']({data:{turnId:'private-turn'}},{session:{id:'private-session',auth:{}}}),error=>error===original);
  assert.equal(calls,1);
  if(!write){const failure=h.records().at(-1);assert.equal(failure.state,'THROW');assert.equal(failure.errors[0].class,'TypeError');assert.equal(failure.errors[0].code,'ECONNREFUSED');}
 }
});
for(const method of ['doGenerate','doStream'])test(method+' keeps selection lazy and delegates once with exact options/result identities',async()=>{
 const h=diagnostics();h.installFixtureErrorDiagnostics(h.consoleObject,'eve');const response={opaque:true},options={privatePrompt:'never inspected'};
 const fixture=modelFixture(h,{method,response});assert.deepEqual(fixture.count(),{selections:0,calls:0});assert.equal(h.lines.length,0);
 assert.equal(await fixture.model[method](options),response);assert.equal(fixture.received(),options);
 assert.deepEqual(fixture.count(),{selections:1,calls:1});
 const phase=method==='doGenerate'?'MODEL_GENERATE':'MODEL_STREAM';
 assert.deepEqual(h.records().map(value=>[value.phase,value.state]),[['MODEL_SELECTION','ENTER'],['MODEL_SELECTION','RETURN'],[phase,'ENTER'],[phase,'RETURN']]);
 assert(!h.lines.join('').includes(options.privatePrompt));assert.deepEqual(fixture.evaluated.requires,[companion]);
});
test('lazy selection failure never calls the model and rethrows the original error once',async()=>{
 const h=diagnostics();h.installFixtureErrorDiagnostics(h.consoleObject,'eve');const original=new ReferenceError('private');
 const fixture=modelFixture(h,{selectionError:original});
 await assert.rejects(fixture.model.doGenerate({}),error=>error===original);
 assert.deepEqual(fixture.count(),{selections:1,calls:0});
 assert.deepEqual(h.records().map(value=>[value.phase,value.state]),[['MODEL_SELECTION','ENTER'],['MODEL_SELECTION','THROW']]);
});
test('outer call failure is observed after unchanged delegated accounting reconciliation',async()=>{
 const order=[],h=diagnostics({write(line){order.push('diagnostic:'+JSON.parse(line.slice(line.indexOf(' ')+1)).state);}});
 h.installFixtureErrorDiagnostics(h.consoleObject,'eve');const original=new Error('private');
 const fixture=modelFixture(h,{callError:original,order});
 await assert.rejects(fixture.model.doGenerate({}),error=>error===original);
 assert.deepEqual(fixture.count(),{selections:1,calls:1});
 assert(order.indexOf('existing-accounting-reconciled')<order.indexOf('diagnostic:THROW'));
 assert.equal(hash(readFileSync(new URL('apps/eve/lib/external-alpha/model.ts',root))),'406f45c94c3e2605ec5ace2593ac8efedfe82256f69de35695fa6f7d1331c7d1');
});
test('MODEL_STREAM RETURN never reads, consumes or reports completion of the returned stream',async()=>{
 let read=0;const response=Object.defineProperty({},'stream',{get(){read++;throw Error('stream must remain untouched');}});
 const h=diagnostics();h.installFixtureErrorDiagnostics(h.consoleObject,'eve');const fixture=modelFixture(h,{method:'doStream',response});
 assert.equal(await fixture.model.doStream({}),response);assert.equal(read,0);
 assert.equal(h.records().at(-1).state,'RETURN');assert(!h.lines.join('').includes('completed'));
});
for(const role of [undefined,'1','next','production',''])test('derived operations remain inert for runtime role '+String(role),async()=>{
 const h=diagnostics();if(role==='next')h.installFixtureErrorDiagnostics(h.consoleObject,'next');
 const fixture=modelFixture(h,{role:role??null});await fixture.model.doGenerate({});
 assert.deepEqual(fixture.count(),{selections:1,calls:1});assert.deepEqual(fixture.evaluated.requires,[]);assert.equal(h.lines.length,0);
});
test('a missing or unusable optional companion preserves the original operation',async()=>{
 for(const exports of [undefined,{}, {observeFixtureOperation:false}]){
  const h=diagnostics();h.module.exports=exports;const fixture=modelFixture(h);
  await fixture.model.doGenerate({});assert.deepEqual(fixture.count(),{selections:1,calls:1});assert.equal(h.lines.length,0);
 }
});
test('preload and derived operations share one monotonic count/byte budget, including reinstall attempts',async()=>{
 const h=diagnostics();h.installFixtureErrorDiagnostics(h.consoleObject,'eve');
 for(let n=0;n<7;n++)h.consoleObject.error('private');
 for(let n=0;n<20;n++)await h.observeFixtureOperation('INSTRUCTIONS',async()=>n);
 const second={error(){}};assert.equal(h.installFixtureErrorDiagnostics(second,'eve'),true);
 assert.equal(h.installFixtureErrorDiagnostics({error(){}},'next'),false);
 second.error('private');h.installFixtureErrorDiagnostics(h.consoleObject,'eve');
 assert.equal(h.lines.length,32);assert.equal(h.consoleCalls.length,7);
 assert.deepEqual(h.records().map(value=>value.sequence),Array.from({length:32},(_,n)=>n+1));
 assert(h.lines.every(line=>Buffer.byteLength(line)<=2048));assert(h.lines.reduce((sum,line)=>sum+Buffer.byteLength(line),0)<=32768);
});
test('failed/oversized sinks and aggregate-byte limit apply to console and operations together',async()=>{
 for(const [byteLength,write,count] of [[()=>2049,undefined,0],[()=>2048,undefined,16],[Buffer.byteLength,()=>{throw Error('sink');},32]]){
  const h=diagnostics({byteLength,write});h.installFixtureErrorDiagnostics(h.consoleObject,'eve');
  let calls=0;for(let n=0;n<100;n++){h.consoleObject.error('private');await h.observeFixtureOperation('MODEL_STREAM',async()=>{calls++;});}
  assert.equal(calls,100);assert.equal(h.consoleCalls.length,100);assert.equal(h.writes.length,count);
 }
});
test('native error descriptor projection never reads messages/stacks, invokes getters or inspects proxies/opaque throwables',async()=>{
 let invoked=0;const native=new TypeError();
 for(const key of ['message','stack','name','code','cause'])Object.defineProperty(native,key,{get(){invoked++;throw Error('getter');}});
 const traps={get(){invoked++;throw Error('proxy');},getPrototypeOf(){invoked++;throw Error('proxy');},getOwnPropertyDescriptor(){invoked++;throw Error('proxy');}};
 const proxy=Proxy.revocable(new Error(),traps);proxy.revoke();
 for(const error of [native,new Proxy(new Error(),traps),proxy.proxy,{get message(){invoked++;}},'private-text',null]){
  const h=diagnostics();h.installFixtureErrorDiagnostics(h.consoleObject,'eve');
  // Node assert.rejects itself inspects a rejection's code/then fields. Capture
  // identity manually so the assertion framework cannot trigger proxy traps.
  let rejected=false,received;
  try{await h.observeFixtureOperation('INSTRUCTIONS',async()=>{throw error;});}
  catch(value){rejected=true;received=value;}
  assert.equal(rejected,true);assert.equal(received,error);
  const failure=h.records().at(-1);assert.equal(failure.state,'THROW');
  assert.deepEqual(Object.keys(failure).sort(),['errors','phase','provenance','runtime','sequence','state','version']);
  assert(!h.lines.join('').includes('private-text'));
 }
 assert.equal(invoked,0);
});
test('unknown phase values are not coerced and do not change the original operation',async()=>{
 let invoked=0;const opaque={toString(){invoked++;throw Error('coercion');}},h=diagnostics();h.installFixtureErrorDiagnostics(h.consoleObject,'eve');
 for(const phase of [undefined,null,'private-phase',opaque])assert.equal(await h.observeFixtureOperation(phase,()=>opaque),opaque);
 assert.equal(h.lines.length,0);assert.equal(invoked,0);
});
test('ordinary manifest enumerates derived source and helper without enabling builds, model server or independent native overlays',()=>{
 const runner=readFileSync(new URL('apps/eve/test/owner-journey/runner-prod.ts',root),'utf8');
 assert(runner.includes("if(process.env.MYEVE_OWNED_FIXTURE_ERROR_DIAGNOSTICS==='1'){"));
 assert(runner.includes("fixtureOperationOverlay('1',sources,companion)"));
 assert(runner.includes("join(app,'test/owner-journey/fixture-error-diagnostics.cjs')"));
 assert(runner.includes('derivedInputs:overlays.map(({body,...metadata})=>metadata)'));
 assert(runner.includes("{flag:'wx',mode:0o600}"));
 const seams=readFileSync(new URL('scripts/myapps-composition/current-qe-seams.mjs',root),'utf8');
 assert(!seams.includes('fixtureOperationOverlay'));assert(!seams.includes('fixtureDiagnosticRequire'));
 assert(seams.includes("'"+hash(runner)+"','QE_RUNNER_PROFILE_CHANGED'"));
});
