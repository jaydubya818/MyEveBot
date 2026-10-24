import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import * as util from 'node:util';

const helperUrl=new URL('../../apps/eve/test/owner-journey/fixture-error-diagnostics.cjs',import.meta.url);
const helperPath=helperUrl.pathname,source=readFileSync(helperUrl,'utf8');
const PREFIX='OWNED_FIXTURE_ERROR_CALLSITE ';
function harness({frames=[{scriptName:'/synthetic/node_modules/eve/dist/public-runtime.js',lineNumber:42,columnNumber:7}],capture,write,original}={}){
 const lines=[],writes=[],calls=[],returned={original:true};
 const consoleObject={error:original??function(...args){calls.push({receiver:this,args});return returned;}};
 const module={exports:{}};
 runInNewContext(source,{module,Buffer,__filename:helperPath,Error,TypeError,RangeError,ReferenceError,SyntaxError,URIError,EvalError,AggregateError,
  require(name){
   if(name==='node:crypto')return {createHash};
   if(name==='node:util')return {types:util.types,getCallSites:capture??((count,options)=>{
    assert.equal(count,12);assert.equal(options.sourceMap,false);return frames;
   })};
   if(name==='node:fs')return {writeSync(fd,line){writes.push({fd,line});if(write)return write(fd,line);lines.push(line);return Buffer.byteLength(line);}};
   throw Error('Unexpected diagnostic module');
  }},{filename:helperPath});
 return {install:module.exports.installFixtureErrorDiagnostics,consoleObject,lines,writes,calls,returned,
  records:()=>lines.map(line=>{assert(line.startsWith(PREFIX));return JSON.parse(line.slice(PREFIX.length));})};
}
test('import is inert and installation requires an explicit allowlisted owned runtime',()=>{
 const h=harness(),original=h.consoleObject.error;
 assert.equal(h.lines.length,0);assert.equal(h.consoleObject.error,original);
 for(const role of [undefined,false,'1','production','session-secret',{}])assert.equal(h.install(h.consoleObject,role),false);
 assert.equal(h.consoleObject.error,original);assert.equal(h.install(h.consoleObject,'eve'),true);
});
test('original console receiver, exact arguments and return value are preserved once',()=>{
 const h=harness(),error=new Error('synthetic secret message'),other={opaque:true};
 h.install(h.consoleObject,'next');
 assert.equal(h.consoleObject.error(error,other),h.returned);
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].receiver,h.consoleObject);
 assert.equal(h.calls[0].args[0],error);assert.equal(h.calls[0].args[1],other);
 const record=h.records()[0];assert.equal(record.runtime,'next');assert.equal(record.boundary,'console.error');
 assert.equal(record.errors[0].class,'Error');assert.equal(record.errors[0].code,'UNKNOWN');
 assert.equal(h.writes[0].fd,2);assert(!h.lines[0].includes(error.message));
});
test('original thrown error remains the identical primary failure when diagnostics also fail',()=>{
 const original=new Error('original'),h=harness({write(){throw Error('diagnostic write');},original(){throw original;}});
 h.install(h.consoleObject,'eve');assert.throws(()=>h.consoleObject.error(new Error('input')),error=>error===original);
});
test('synchronous stderr failure never fails the original product console call',()=>{
 const h=harness({write(){throw Error('closed synthetic fd');}});h.install(h.consoleObject,'eve');
 assert.equal(h.consoleObject.error(new Error('input')),h.returned);assert.equal(h.calls.length,1);
});
test('callsite failure retains a bounded error projection and original outcome',()=>{
 const h=harness({capture(){throw Error('capture unavailable');}});h.install(h.consoleObject,'eve');
 assert.equal(h.consoleObject.error(new Error('input')),h.returned);assert.deepEqual(h.records()[0].frames,[]);
});
test('message, stack, name, code and cause accessors never execute',()=>{
 let invoked=0;const error=new Error();
 for(const field of ['message','stack','name','code','cause'])Object.defineProperty(error,field,{configurable:true,get(){invoked++;throw Error('getter');}});
 const h=harness();h.install(h.consoleObject,'eve');h.consoleObject.error(error);
 assert.equal(invoked,0);assert.equal(h.records()[0].errors[0].code,'UNKNOWN');
 assert.equal(Object.hasOwn(h.records()[0].errors[0],'message'),false);
});
test('ordinary object getters, custom inspection and toJSON hooks are not inspected',()=>{
 let invoked=0;const input={get message(){invoked++;throw Error('getter');},toJSON(){invoked++;throw Error('toJSON');},
  [util.inspect.custom](){invoked++;throw Error('inspect');}};
 const h=harness();h.install(h.consoleObject,'eve');h.consoleObject.error(input);
 assert.equal(invoked,0);assert.deepEqual(h.records()[0].errors,[]);assert.equal(h.calls[0].args[0],input);
});
for(const kind of ['error','object','revoked'])test('untrusted '+kind+' proxy is never traversed',()=>{
 let invoked=0;const traps={get(){invoked++;throw Error('proxy');},getOwnPropertyDescriptor(){invoked++;throw Error('proxy');},
  getPrototypeOf(){invoked++;throw Error('proxy');},ownKeys(){invoked++;throw Error('proxy');}};
 const pair=Proxy.revocable(kind==='error'?new Error('secret'):{},traps);if(kind==='revoked')pair.revoke();
 const h=harness();h.install(h.consoleObject,'eve');h.consoleObject.error(pair.proxy);
 assert.equal(invoked,0);assert.deepEqual(h.records()[0].errors,[]);assert.equal(h.calls[0].args[0],pair.proxy);
});
test('proxied native-error prototype does not invoke traps',()=>{
 let invoked=0;const prototype=new Proxy({},{getPrototypeOf(){invoked++;throw Error('proxy');},get(){invoked++;throw Error('proxy');}});
 const error=new Error('input');Object.setPrototypeOf(error,prototype);
 const h=harness();h.install(h.consoleObject,'eve');h.consoleObject.error(error);
 assert.equal(invoked,0);assert.equal(h.records()[0].errors[0].class,'Error');
});
test('console proxy, accessor and immutable method leave the original target untouched',()=>{
 const h=harness();let invoked=0;
 const proxy=new Proxy({},{getOwnPropertyDescriptor(){invoked++;throw Error('proxy');},get(){invoked++;throw Error('proxy');}});
 assert.equal(h.install(proxy,'eve'),false);
 const accessor=Object.defineProperty({},'error',{get(){invoked++;throw Error('getter');}});
 assert.equal(h.install(accessor,'eve'),false);
 const original=()=>{},fixed=Object.defineProperty({},'error',{value:original});
 assert.equal(h.install(fixed,'eve'),false);assert.equal(fixed.error,original);assert.equal(invoked,0);
});
test('console method descriptor attributes are preserved and installation is idempotent',()=>{
 const h=harness(),before=Object.getOwnPropertyDescriptor(h.consoleObject,'error');
 h.install(h.consoleObject,'eve');const wrapped=h.consoleObject.error;
 assert.equal(h.install(h.consoleObject,'next'),true);assert.equal(h.consoleObject.error,wrapped);
 for(const field of ['configurable','enumerable','writable'])assert.equal(Object.getOwnPropertyDescriptor(h.consoleObject,'error')[field],before[field]);
 h.consoleObject.error('message');assert.equal(h.calls.length,1);assert.equal(h.lines.length,1);assert.equal(h.records()[0].runtime,'eve');
});
test('known class/code are allowlisted and unknown text is never emitted raw',()=>{
 const h=harness();h.install(h.consoleObject,'eve');
 const known=new TypeError('input');known.code='ECONNREFUSED';h.consoleObject.error(known);
 const unknown=new Error('second');unknown.code='TOKEN_OWNER_SESSION_SECRET';h.consoleObject.error(unknown);
 assert.equal(h.records()[0].errors[0].class,'TypeError');assert.equal(h.records()[0].errors[0].code,'ECONNREFUSED');
 assert.equal(h.records()[1].errors[0].code,'UNKNOWN');assert(!h.lines.join('').includes(unknown.code));
});
test('cause traversal and argument inspection have fixed bounds including cause cycles',()=>{
 const h=harness();h.install(h.consoleObject,'eve');const error=new Error('synthetic');error.cause=error;
 h.consoleObject.error(error,error,error,error,error);
 const errors=h.records()[0].errors;assert.equal(errors.length,4);assert(errors.every(value=>value.argument<4&&value.causeDepth<2));
});
test('primitive console messages are hashed with explicit UTF-16 truncation only',()=>{
 const h=harness(),text='x'.repeat(16384)+'SYNTHETIC_SECRET_TAIL';h.install(h.consoleObject,'eve');h.consoleObject.error(text);
 const message=h.records()[0].errors[0].message;assert.equal(message.truncated,true);
 assert.equal(message.sha256,createHash('sha256').update(text.slice(0,16384)).digest('hex'));
 assert(!h.lines[0].includes('SYNTHETIC_SECRET_TAIL'));assert.equal(h.calls[0].args[0],text);
});
test('source classification emits hashes and bounded positions without paths, names or URLs',()=>{
 const path='file:///synthetic/owner-session-task-secret/apps/eve/.next/server/chunk.js?token=secret';
 const h=harness({frames:[{scriptName:path,lineNumber:123,columnNumber:7,functionName:'SECRET_FUNCTION'}]});
 h.install(h.consoleObject,'next');h.consoleObject.error(new Error('input'));
 const frame=h.records()[0].frames[0];assert.equal(frame.kind,'APP_BUILD');assert.equal(frame.line,123);assert.equal(frame.column,7);
 assert.equal(frame.source.sha256,createHash('sha256').update(path).digest('hex'));
 for(const value of [path,'owner-session-task-secret','token=secret','SECRET_FUNCTION'])assert(!h.lines[0].includes(value));
});
test('frame proxies, accessors and invalid positions are ignored without getters or coercion',()=>{
 let invoked=0;const proxy=new Proxy({},{getOwnPropertyDescriptor(){invoked++;throw Error('proxy');}});
 const accessor={get scriptName(){invoked++;throw Error('getter');}};
 const h=harness({frames:[proxy,accessor,{scriptName:'node:synthetic',lineNumber:'12',columnNumber:Infinity}]});
 h.install(h.consoleObject,'eve');h.consoleObject.error('message');
 assert.equal(invoked,0);assert.equal(h.records()[0].frames.length,1);
 assert.equal(h.records()[0].frames[0].line,null);assert.equal(h.records()[0].frames[0].column,null);
});
test('source length, frame capture and emission counts remain bounded',()=>{
 const frames=Array.from({length:100},()=>({scriptName:'s'.repeat(8193),lineNumber:1,columnNumber:1}));
 const h=harness({frames});h.install(h.consoleObject,'eve');h.consoleObject.error('message');
 assert.equal(h.records()[0].frames.length,6);assert(h.records()[0].frames.every(frame=>frame.source.truncated));
});
test('a proxied frame array is ignored without invoking its traps',()=>{
 let invoked=0;const frames=new Proxy([],{get(){invoked++;throw Error('proxy');},getOwnPropertyDescriptor(){invoked++;throw Error('proxy');}});
 const h=harness({frames});h.install(h.consoleObject,'eve');h.consoleObject.error('message');
 assert.equal(invoked,0);assert.deepEqual(h.records()[0].frames,[]);
});
test('boxed message/code and position values are never coerced',()=>{
 let invoked=0;const opaque={toString(){invoked++;throw Error('coercion');},valueOf(){invoked++;throw Error('coercion');}};
 const error=new Error();Object.defineProperty(error,'message',{value:opaque});error.code=opaque;
 const h=harness({frames:[{scriptName:'node:synthetic',lineNumber:opaque,columnNumber:opaque}]});
 h.install(h.consoleObject,'eve');h.consoleObject.error(error);
 assert.equal(invoked,0);assert.equal(h.records()[0].errors[0].code,'UNKNOWN');
 assert.equal(Object.hasOwn(h.records()[0].errors[0],'message'),false);assert.equal(h.records()[0].frames[0].line,null);
});
test('per-process record/byte caps do not drop or retry any original console call',()=>{
 const h=harness();h.install(h.consoleObject,'eve');for(let n=0;n<100;n++)h.consoleObject.error(new Error('input'));
 assert.equal(h.calls.length,100);assert.equal(h.lines.length,32);
 assert(h.lines.every(line=>Buffer.byteLength(line)<=2048));assert(h.lines.reduce((sum,line)=>sum+Buffer.byteLength(line),0)<=32768);
 assert.deepEqual(h.records().map(record=>record.sequence),Array.from({length:32},(_,index)=>index+1));
});
test('failed sinks consume the same attempt budget without repeated product errors',()=>{
 const h=harness({write(){throw Error('sink');}});h.install(h.consoleObject,'eve');
 for(let n=0;n<100;n++)assert.equal(h.consoleObject.error('message'),h.returned);
 assert.equal(h.writes.length,32);assert.equal(h.calls.length,100);
});
test('total byte budget stops emissions before record budget without changing original calls',()=>{
 const frames=Array.from({length:6},()=>({scriptName:'/synthetic/node_modules/eve/runtime.js',lineNumber:99999999,columnNumber:99999999}));
 const h=harness({frames}),error=new AggregateError([],'synthetic');error.code='EXTERNAL_ALPHA_SHARED_DENIED';error.cause=error;
 h.install(h.consoleObject,'eve');for(let n=0;n<100;n++)h.consoleObject.error(error);
 assert(h.lines.length>0&&h.lines.length<32);assert.equal(h.calls.length,100);
 assert(h.lines.reduce((sum,line)=>sum+Buffer.byteLength(line),0)<=32768);
 assert(h.lines.every(line=>Buffer.byteLength(line)<=2048));
});
test('Node24 public callsites bypass Error.prepareStackTrace without reading error.stack',()=>{
 const previous=Object.getOwnPropertyDescriptor(Error,'prepareStackTrace');let invoked=0;
 const error=new Error('input'),h=harness({capture:util.getCallSites});
 try{
  Object.defineProperty(Error,'prepareStackTrace',{configurable:true,get(){invoked++;throw Error('hook');}});
  h.install(h.consoleObject,'eve');assert.equal(h.consoleObject.error(error),h.returned);
  assert.equal(invoked,0);assert(h.records()[0].frames.length>0);
 }finally{if(previous)Object.defineProperty(Error,'prepareStackTrace',previous);else delete Error.prepareStackTrace;}
});

const runner=readFileSync(new URL('../../apps/eve/test/owner-journey/runner-prod.ts',import.meta.url),'utf8');
const preloadLiteral=runner.match(/transport\+=(`[^`]*`);/)[1],preload=runInNewContext(preloadLiteral);
test('only owned Eve/Next runtime opt-in installs at the generated preload boundary',()=>{
 for(const role of [undefined,'1','production','eve','next']){
  const calls=[],consoleObject={};
  runInNewContext(preload,{process:{env:{MYEVE_OWNED_FIXTURE_ERROR_DIAGNOSTICS:role}},console:consoleObject,
   require(path){assert.equal(path,'./fixture-error-diagnostics.cjs');return {installFixtureErrorDiagnostics(...args){calls.push(args);}};}});
  assert.equal(calls.length,role==='eve'||role==='next'?1:0);
  if(calls.length){assert.equal(calls[0][0],consoleObject);assert.equal(calls[0][1],role);}
 }
});
test('missing or failed optional diagnostic companion does not fail the generated preload',()=>{
 assert.doesNotThrow(()=>runInNewContext(preload,{process:{env:{MYEVE_OWNED_FIXTURE_ERROR_DIAGNOSTICS:'eve'}},console:{},require(){throw Error('optional unavailable');}}));
});
test('ordinary source wiring copies the companion, avoids build opt-in and retains exact runner guard',()=>{
 assert(runner.includes("for(const file of ['gateway.ts','fixture-error-diagnostics.cjs'])"));
 assert.equal((runner.match(/MYEVE_OWNED_FIXTURE_ERROR_DIAGNOSTICS:'eve'/g)??[]).length,1);
 assert.equal((runner.match(/MYEVE_OWNED_FIXTURE_ERROR_DIAGNOSTICS:'next'/g)??[]).length,1);
 assert(runner.indexOf("MYEVE_OWNED_FIXTURE_ERROR_DIAGNOSTICS:'eve'")>runner.indexOf("console.log('QE builds done'"));
 const seams=readFileSync(new URL('./current-qe-seams.mjs',import.meta.url),'utf8');
 const hash=createHash('sha256').update(runner).digest('hex');
 assert(seams.includes("assert.equal(hash(readFileSync(join(sourceRoot,'apps/eve/test/owner-journey/runner-prod.ts'))),'"+hash+"','QE_RUNNER_PROFILE_CHANGED');"));
 const manifest=readFileSync(new URL('../../apps/eve/test/enterprise-fixture-manifest.test.mjs',import.meta.url),'utf8');
 assert(manifest.includes("'apps/eve/test/owner-journey/fixture-error-diagnostics.cjs':await readFile("));
});
