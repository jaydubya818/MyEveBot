/** Actual buildPreparedCurrent body, fake native/build/filesystem APIs. No SDK,
 * real artifact helper, child, network, compiler or application is invoked. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,join,sep} from 'node:path';
import {runInNewContext} from 'node:vm';
import {fileURLToPath} from 'node:url';
const source=readFileSync(new URL('./current-build-producer.mjs',import.meta.url),'utf8');
const start=source.indexOf('export async function buildPreparedCurrent('),end=source.indexOf('\n/** Compatibility',start);
assert(start>=0&&end>start);const subject=source.slice(start,end).replace(/^export /,'');
function fixture(options={}){
 const events=[],writes=new Map(),prepared={},preparedBuilds=new WeakMap(),copy='/synthetic/source',app=copy+'/apps/eve';
 const before={id:'initial',authoredFiles:{},installRoots:['node_modules']},afterEve={...before,id:'post-eve'},afterNext={...before,id:'post-next'};
 const first=Error('FIRST_BUILD_FAILURE'),diagnostic=Error('INPUT_DIAGNOSTIC_FAILURE');let captures=0,commands=0;
 const state={spec:{toolchain:{node:{path:'/synthetic/node'}}},sourceTree:'tree',copy,app,evidence:'/private/evidence',
  commands:[],installEnv:{PATH:'/usr/bin',HOME:'/private/home',TMPDIR:'/private/tmp'},inputs:before,seams:[],sdkArchiveSha256:'archive',registry:{},initialInputRecord:{input:'initial'}};
 preparedBuilds.set(prepared,state);
 const context={assert,join,dirname,sep,preparedBuilds,AggregateError,JSON,LOCK:'lock',AGENT:'agent',SDK:{version:'0.66.3'},
  verifyBuildInputs:(root,input)=>{
   assert.equal(root,copy);events.push('verify:'+input.id);
   if(options.drift&&captures===2)throw Error('INPUT_TREE_CHANGED');
  },assertEveDerivedInputsAbsent:input=>{assert.equal(input,before);events.push('absence');if(options.preseed)throw Error('PRESEEDED');},
  validateBuildEnvironment:()=>({}),existsSync:()=>false,
  observedCommand:async(binary,args,commandOptions)=>{
   commands++;const kind=args[0].includes('/eve/')?'eve':'next';events.push('command:'+kind);
   assert.equal(binary,'/synthetic/node');
   assert.equal(commandOptions.phase,kind==='eve'?'EVE_BUILD':'NEXT_BUILD');
   if(options.fail===kind)throw first;
   return {kind,pid:123,exitCode:0,groupQuiescent:true};
  },captureBuildInputs:()=>{captures++;events.push('capture:'+captures);return captures===1?afterEve:afterNext;},
  writePrivateInputInventory:(path,input)=>{events.push('record:'+input.id);return {path,input:input.id};},
  summarizeInputDifference:(a,b)=>{events.push('diff:'+a.id+'>'+b.id);return {before:a.id,after:b.id};},
  writeFileSync:(path,body,settings)=>{assert.equal(settings.mode,0o600);assert.equal(settings.flag,'wx');assert(!writes.has(path));writes.set(path,body);},
  validateEveDerivedInputTransition:(root,a,b,command,node)=>{
   assert.equal(root,copy);assert.equal(a,before);assert.equal(b,afterEve);assert.equal(command.kind,'eve');assert.equal(node,'/synthetic/node');
   assert(events.includes('record:post-eve'));assert(events.includes('diff:initial>post-eve'));events.push('transition');
   if(options.badTransition)throw Error('UNDECLARED_DERIVED_INPUT');return {status:'DERIVED_NOT_QUALIFIED'};
  },retainFailedBuildInputSnapshot:(root,input,prefix)=>{
   assert.equal(root,copy);events.push('failed-snapshot:'+input.id);if(options.diagnosticFailure)throw diagnostic;
  },createRequire:()=>({resolve:()=>copy+'/node_modules/next/package.json'}),
  bytes:()=>JSON.stringify({version:'16.4.3',bin:{next:'dist/bin/next'}}),realpathSync:value=>value,
  sealRuntimeOutput:path=>{events.push('seal');return {root:{path},entries:[{path:'index.mjs',type:'file'},{path:'_libs/eve.mjs',type:'file'}]};},
  verifyEmittedPackages:()=>({status:'EXTERNAL_NOT_QUALIFIED'})};
 const build=runInNewContext(subject+'\nbuildPreparedCurrent;',context,{timeout:1000});
 return {run:()=>build(prepared,{}),events,writes,first,diagnostic,get commands(){return commands;}};
}
test('actual producer records full after-Eve vector before transition and carries it through Next and closure',async()=>{
 const f=fixture(),result=await f.run();assert.equal(result.status,'CURRENT_BUILD_OBSERVED_NOT_RUNTIME_QUALIFIED');
 assert.equal(result.inputs.id,'post-eve');assert.equal(result.inputRecords.afterNext.input,'post-next');
 assert.deepEqual(f.events.filter(value=>value.startsWith('verify:')),['verify:initial','verify:post-eve','verify:post-eve']);
 assert(f.events.indexOf('absence')<f.events.indexOf('command:eve'));assert(f.events.indexOf('transition')<f.events.indexOf('command:next'));
 assert.equal(f.commands,2);
});
test('preseeded derived namespaces stop actual producer before any build command',async()=>{
 const f=fixture({preseed:true});await assert.rejects(f.run(),/PRESEEDED/);assert.equal(f.commands,0);
});
test('rejected Eve transition retains full vector and diff before stopping without Next',async()=>{
 const f=fixture({badTransition:true});await assert.rejects(f.run(),/UNDECLARED_DERIVED_INPUT/);
 assert(f.events.includes('record:post-eve'));assert(f.events.includes('diff:initial>post-eve'));assert.equal(f.commands,1);
 assert(!f.events.includes('seal'));
});
test('failed Eve command retains read-only diagnostics and original failure without retry',async()=>{
 const f=fixture({fail:'eve'});await assert.rejects(f.run(),error=>error===f.first);
 assert(f.events.includes('failed-snapshot:initial'));assert.equal(f.commands,1);assert(!f.events.includes('transition'));
});
test('failed Next command diagnoses against the full updated inventory',async()=>{
 const f=fixture({fail:'next'});await assert.rejects(f.run(),error=>error===f.first);
 assert(f.events.includes('failed-snapshot:post-eve'));assert.equal(f.commands,2);assert(!f.events.includes('seal'));
});
test('first command failure survives a diagnostic write failure',async()=>{
 const f=fixture({fail:'eve',diagnosticFailure:true});await assert.rejects(f.run(),error=>error.errors[0]===f.first&&error.errors[1]===f.diagnostic);
 assert.equal(f.commands,1);
});
test('post-Next drift records full after vector but cannot reach output sealing',async()=>{
 const f=fixture({drift:true});await assert.rejects(f.run(),/INPUT_TREE_CHANGED/);
 assert(f.events.includes('record:post-next'));assert(f.events.includes('diff:post-eve>post-next'));assert(!f.events.includes('seal'));
});
test('prepared token remains one-attempt only after failure',async()=>{
 const f=fixture({fail:'eve'});await assert.rejects(f.run());await assert.rejects(f.run(),/UNKNOWN_PREPARED_INPUT/);assert.equal(f.commands,1);
});
const runtime=readFileSync(new URL('./current-qe-runtime.mjs',import.meta.url),'utf8');
const witnessStart=runtime.indexOf('function moduleObservations('),witnessEnd=runtime.indexOf('\n\nexport async function runCurrentQEProof',witnessStart);
assert(witnessStart>=0&&witnessEnd>witnessStart);
function witnessFixture({derived=true,observation='RETURNED_SOURCE_BYTES_VERIFIED',stale=false}={}){
 const path='/synthetic/source/apps/eve/node_modules/.cache/eve/authored-modules/'+'a'.repeat(40)+'.mjs';
 const row={kind:'load',url:'file://'+path,sha256:'b'.repeat(64),mode:0o600,observation};
 const build={copiedRoot:'/synthetic/source',derivedInputs:{sha256:'d'.repeat(64),entries:derived?[{path:path.slice('/synthetic/source/'.length),type:'file',sha256:(stale?'c':'b').repeat(64),mode:0o600}]:[]}};
 const subject=runInNewContext(runtime.slice(witnessStart,witnessEnd)+'\nmoduleObservations;',{
  assert,join,relative:(a,b)=>b.slice(a.length+1),fileURLToPath,readFileSync:()=>Buffer.from(JSON.stringify(row)+'\n'),
  hash:value=>createHash('sha256').update(value).digest('hex')},{timeout:1000});
 return ()=>subject('/synthetic/module-log',[{path,sha256:row.sha256,mode:row.mode}],build);
}
test('actual load witness labels generated code separately from published package input',()=>{
 const result=witnessFixture()();assert.equal(result.buildDerivedInputLoads.length,1);
 assert.equal(result.buildDerivedInputLoads[0].provenance,'OWNED_BUILD_DERIVED_NOT_AUTHENTICATED_PUBLISHED_PACKAGE');
 assert.equal(result.buildDerivedInputLoads[0].transitionSha256,'d'.repeat(64));
});
test('generated file-only observations retain their limited evidence label',()=>{
 const result=witnessFixture({observation:'FILE_AND_RESOLUTION_ONLY'})();
 assert.equal(result.buildDerivedInputLoads[0].observation,'FILE_AND_RESOLUTION_ONLY');
});
test('an unchanged approval cannot hide a stale generated-body seal',()=>{
 assert.throws(witnessFixture({stale:true}),/RUNTIME_DERIVED_INPUT_CHANGED/);
});
test('no observed generated load does not manufacture a derived execution claim',()=>{
 assert.equal(witnessFixture({derived:false})().buildDerivedInputLoads.length,0);
});
// Execute the actual terminal failure branch with inert model/writer APIs.
// Reading the source text does not import the runtime or any SDK/artifact.
const failureStart=runtime.indexOf(' if(firstFailure||failures.length){'),failureEnd=runtime.indexOf('\n assert(proof&&cleanup,',failureStart);
assert(failureStart>=0&&failureEnd>failureStart);
function terminalFailureFixture(options={}){
 const first=options.noFirst?null:Error('FIRST_ATTEMPT_FAILURE'),cleanup=Error('CLEANUP_FAILURE');
 const capture=Error('COUNTER_CAPTURE_FAILURE'),write=Object.assign(Error('PRIVATE_WRITE_FAILURE'),{code:options.writeCode??'EIO'});
 const serialization=Error('PRIVATE_SERIALIZATION_FAILURE'),failures=options.noFailures?[]:[cleanup];
 if(options.serializationFailure)Object.defineProperty(first,'message',{get(){throw serialization;}});
 const writes=[];let snapshots=0,observations=0;
 const subject=runInNewContext('()=>{'+runtime.slice(failureStart,failureEnd)+'\nreturn "NO_FAILURE";}',{
  firstFailure:first,failures,AggregateError,join,privateRoot:'/synthetic/private',
  modelServer:{},modelServerClosed:true,modelActive:0,httpRequests:2,failedRequests:0,unexpectedPaths:0,modelFailure:null,
  model:{snapshot(){snapshots++;if(options.captureFailure)throw capture;return {requests:2};}},
  observeFailureModelCounts:input=>{observations++;assert.equal(input.httpRequests,2);return {status:'OBSERVED',finalized:true};},
  json:(path,value)=>{writes.push({path,value});if(options.writeFailure)throw write;JSON.stringify(value);}
 },{timeout:1000});
 return {run:subject,first,cleanup,capture,write,serialization,failures,writes,get snapshots(){return snapshots;},get observations(){return observations;}};
}
function throwsWithErrors(f,expected){
 assert.throws(f.run,error=>error instanceof AggregateError&&error.errors.length===expected.length&&expected.every((value,index)=>error.errors[index]===value)&&/do not retry/.test(error.message));
 assert.equal(f.snapshots,1);assert(f.observations<=1);assert(f.writes.length<=1);
}
test('actual terminal writer preserves first and cleanup errors after successful private evidence write',()=>{
 const f=terminalFailureFixture();throwsWithErrors(f,[f.first,f.cleanup]);
 assert.equal(f.writes.length,1);assert.equal(f.writes[0].path,'/synthetic/private/failure.json');
 assert.equal(f.writes[0].value.status,'FAIL_FIRST_ATTEMPT_PRESERVED');assert.equal(f.writes[0].value.modelObservation.finalized,true);
});
for(const code of ['EEXIST','EIO'])test('actual terminal writer appends '+code+' without replacing first or cleanup errors',()=>{
 const f=terminalFailureFixture({writeFailure:true,writeCode:code});throwsWithErrors(f,[f.first,f.cleanup,f.write]);
 assert.equal(f.writes.length,1);assert.equal(f.write.code,code);
});
test('actual terminal branch preserves counter-capture and write failures after original errors',()=>{
 const f=terminalFailureFixture({captureFailure:true,writeFailure:true});throwsWithErrors(f,[f.first,f.cleanup,f.capture,f.write]);
 assert.equal(f.observations,0);assert.equal(f.writes[0].value.modelObservation.status,'FAILURE_MODEL_COUNTS_UNAVAILABLE_CAPTURE_FAILED');
});
test('actual terminal writer preserves cleanup-only failure without inventing a first attempt error',()=>{
 const f=terminalFailureFixture({noFirst:true,writeFailure:true});throwsWithErrors(f,[f.cleanup,f.write]);
 assert.equal(f.writes[0].value.firstFailure,null);
});
test('actual terminal branch protects original errors when constructing diagnostic payload fails',()=>{
 const f=terminalFailureFixture({serializationFailure:true});throwsWithErrors(f,[f.first,f.cleanup,f.serialization]);assert.equal(f.writes.length,0);
});
test('actual terminal branch does not observe or write when no attempt or cleanup failure exists',()=>{
 const f=terminalFailureFixture({noFirst:true,noFailures:true});assert.equal(f.run(),'NO_FAILURE');
 assert.equal(f.snapshots,0);assert.equal(f.observations,0);assert.equal(f.writes.length,0);
});
