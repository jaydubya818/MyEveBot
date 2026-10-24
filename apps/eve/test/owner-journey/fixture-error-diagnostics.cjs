'use strict';
// Owned ordinary-browser fixture only. Importing this module does not install it.
const {createHash}=require('node:crypto');
const {writeSync}=require('node:fs');
const {getCallSites,types}=require('node:util');
const installed=new WeakSet();
const classes=new Map([[Error.prototype,'Error'],[TypeError.prototype,'TypeError'],
 [RangeError.prototype,'RangeError'],[ReferenceError.prototype,'ReferenceError'],
 [SyntaxError.prototype,'SyntaxError'],[URIError.prototype,'URIError'],
 [EvalError.prototype,'EvalError'],[AggregateError.prototype,'AggregateError']]);
const codes=new Set(['ABORT_ERR','EACCES','ECONNREFUSED','ECONNRESET','ENOENT','EPERM','ETIMEDOUT',
 'ERR_INVALID_URL','ERR_MODULE_NOT_FOUND','MODULE_NOT_FOUND','UND_ERR_CONNECT_TIMEOUT',
 'EXTERNAL_ALPHA_SHARED_DENIED']);
const PREFIX='OWNED_FIXTURE_ERROR_CALLSITE ';
const own=(value,key)=>{
 if(!value||(typeof value!=='object'&&typeof value!=='function')||types.isProxy(value))return undefined;
 const field=Object.getOwnPropertyDescriptor(value,key);
 return field&&Object.hasOwn(field,'value')?field.value:undefined;
};
function textHash(value,limit){
 return {sha256:createHash('sha256').update(value.slice(0,limit)).digest('hex'),truncated:value.length>limit};
}
function errorClass(value){
 let prototype=value;
 for(let depth=0;depth<5;depth++){
  prototype=Object.getPrototypeOf(prototype);
  if(!prototype||types.isProxy(prototype))break;
  if(classes.has(prototype))return classes.get(prototype);
 }
 return 'Error';
}
function projectErrors(args){
 const errors=[];
 for(let index=0;index<Math.min(args.length,4)&&errors.length<4;index++){
  let value=args[index];
  for(let depth=0;depth<2&&errors.length<4;depth++){
   if(!value||types.isProxy(value)||!types.isNativeError(value))break;
   const code=own(value,'code'),message=own(value,'message');
   errors.push({argument:index,causeDepth:depth,class:errorClass(value),
    code:typeof code==='string'&&codes.has(code)?code:'UNKNOWN',
    ...(typeof message==='string'?{message:textHash(message,16384)}:{})});
   value=own(value,'cause');
  }
 }
 if(!errors.length&&typeof args[0]==='string')errors.push({argument:0,causeDepth:0,class:'CONSOLE_TEXT',
  code:'UNKNOWN',message:textHash(args[0],16384)});
 return errors;
}
function sourceKind(name){
 if(name.startsWith('node:'))return 'NODE_BUILTIN';
 if(name.includes('/node_modules/eve/'))return 'PUBLIC_SDK';
 if(name.includes('/node_modules/next/'))return 'FRAMEWORK';
 if(name.includes('/.output/')||name.includes('/.next/'))return 'APP_BUILD';
 if(name.includes('/test/owner-journey/'))return 'FIXTURE';
 if(name.includes('/apps/eve/'))return 'APP_SOURCE';
 return 'OTHER';
}
function projectCallsites(){
 // Node24's public API bypasses Error.prepareStackTrace and source-map reads.
 const frames=typeof getCallSites==='function'?getCallSites(12,{sourceMap:false}):[];
 if(!Array.isArray(frames)||types.isProxy(frames))return [];
 const result=[];
 for(let index=0;index<Math.min(frames.length,12)&&result.length<6;index++){
  const frame=own(frames,String(index)),name=own(frame,'scriptName');
  if(typeof name!=='string'||name===__filename||name==='file://'+__filename)continue;
  const line=own(frame,'lineNumber'),column=own(frame,'columnNumber');
  const position=value=>Number.isSafeInteger(value)&&value>0&&value<=100000000?value:null;
  result.push({kind:sourceKind(name.slice(0,8192)),source:textHash(name,8192),line:position(line),column:position(column)});
 }
 return result;
}
function installFixtureErrorDiagnostics(consoleObject,runtime){
 try{
  if(runtime!=='eve'&&runtime!=='next')return false;
  if(!consoleObject||types.isProxy(consoleObject))return false;
  if(installed.has(consoleObject))return true;
  const descriptor=Object.getOwnPropertyDescriptor(consoleObject,'error');
  if(!descriptor||!Object.hasOwn(descriptor,'value')||typeof descriptor.value!=='function')return false;
  const original=descriptor.value;
  let sequence=0,bytes=0;
  function wrapped(...args){
   if(sequence<32&&bytes<32768){
    sequence++;
    try{
     let frames=[];try{frames=projectCallsites();}catch{}
     const record={version:1,runtime,sequence,boundary:'console.error',errors:projectErrors(args),frames};
     const line=PREFIX+JSON.stringify(record)+'\n',size=Buffer.byteLength(line);
     if(size<=2048&&bytes+size<=32768){bytes+=size;writeSync(2,line);}
    }catch{/* Diagnostics must never replace an original console outcome. */}
   }
   return Reflect.apply(original,this,args);
  }
  Object.defineProperty(consoleObject,'error',{...descriptor,value:wrapped});
  installed.add(consoleObject);
  return true;
 }catch{return false;}
}
module.exports={installFixtureErrorDiagnostics};
