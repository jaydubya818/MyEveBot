'use strict';
// Owned ordinary-browser fixture only. Importing this module does not install it.
const {writeSync}=require('node:fs');
const {types}=require('node:util');
const installed=new WeakSet();
// One CJS instance is loaded by the preload and by exact absolute-path requires
// in the ordinary fixture's derived source. Never reset this combined budget.
let activeRuntime=null,sequence=0,bytes=0;
const classes=new Map([[Error.prototype,'Error'],[TypeError.prototype,'TypeError'],
 [RangeError.prototype,'RangeError'],[ReferenceError.prototype,'ReferenceError'],
 [SyntaxError.prototype,'SyntaxError'],[URIError.prototype,'URIError'],
 [EvalError.prototype,'EvalError'],[AggregateError.prototype,'AggregateError']]);
const codes=new Set(['ABORT_ERR','EACCES','ECONNREFUSED','ECONNRESET','ENOENT','EPERM','ETIMEDOUT',
 'ERR_INVALID_URL','ERR_MODULE_NOT_FOUND','MODULE_NOT_FOUND','UND_ERR_CONNECT_TIMEOUT',
 'EXTERNAL_ALPHA_SHARED_DENIED']);
const PREFIX='OWNED_FIXTURE_ERROR_CALLSITE ';
const OPERATION_PREFIX='OWNED_FIXTURE_OPERATION ';
const operations=new Map([
 ['INSTRUCTIONS','PERSISTENT_AGENT_TURN_STARTED'],
 ['MODEL_SELECTION','AGENT_MODEL_RESOLVE'],
 ['MODEL_GENERATE','AGENT_MODEL_DO_GENERATE'],
 ['MODEL_STREAM','AGENT_MODEL_DO_STREAM'],
]);
const own=(value,key)=>{
 if(!value||(typeof value!=='object'&&typeof value!=='function')||types.isProxy(value))return undefined;
 const field=Object.getOwnPropertyDescriptor(value,key);
 return field&&Object.hasOwn(field,'value')?field.value:undefined;
};
function errorClass(value){
 let prototype=value;
 for(let depth=0;depth<5;depth++){
  prototype=Object.getPrototypeOf(prototype);
  if(!prototype||types.isProxy(prototype))break;
  if(classes.has(prototype))return classes.get(prototype);
 }
 return 'Error';
}
function projectErrors(args,consoleText=true){
 const errors=[];
 for(let index=0;index<Math.min(args.length,4)&&errors.length<4;index++){
  let value=args[index];
  for(let depth=0;depth<2&&errors.length<4;depth++){
   if(!value||types.isProxy(value)||!types.isNativeError(value))break;
   const code=own(value,'code');
   errors.push({argument:index,causeDepth:depth,class:errorClass(value),
    code:typeof code==='string'&&codes.has(code)?code:'UNKNOWN'});
   value=own(value,'cause');
  }
 }
 if(consoleText&&!errors.length&&typeof args[0]==='string')errors.push({argument:0,causeDepth:0,class:'CONSOLE_TEXT',
  code:'UNKNOWN'});
 return errors;
}
function emit(prefix,buildRecord){
 try{
  if(sequence>=32||bytes>=32768)return;
  sequence++;
  const line=prefix+JSON.stringify({version:1,runtime:activeRuntime,sequence,...buildRecord()})+'\n';
  const size=Buffer.byteLength(line);
  if(size>2048||bytes+size>32768)return;
  bytes+=size; // Failed/partial sinks still consume the same finite budget.
  writeSync(2,line);
 }catch{/* Diagnostics never replace an original operation outcome. */}
}
function operationRecord(phase,state,error){
 try{
  emit(OPERATION_PREFIX,()=>({phase,state,provenance:operations.get(phase),
   errors:state==='THROW'?projectErrors([error],false):[]}));
 }catch{}
}
async function observeFixtureOperation(phase,action){
 // Installation is possible only in owned runtime children; Next never gets
 // operation observations. No arbitrary event, model, context or args input.
 if(activeRuntime!=='eve'||typeof phase!=='string'||!operations.has(phase))return action();
 operationRecord(phase,'ENTER');
 try{
  const result=await action();
  // MODEL_STREAM RETURN observes construction, never stream completion.
  operationRecord(phase,'RETURN');
  return result;
 }catch(error){
  operationRecord(phase,'THROW',error);
  throw error;
 }
}
function installFixtureErrorDiagnostics(consoleObject,runtime){
 try{
  if(runtime!=='eve'&&runtime!=='next')return false;
  if(!consoleObject||types.isProxy(consoleObject))return false;
  if(installed.has(consoleObject))return true;
  if(activeRuntime!==null&&activeRuntime!==runtime)return false;
  const descriptor=Object.getOwnPropertyDescriptor(consoleObject,'error');
  if(!descriptor||!Object.hasOwn(descriptor,'value')||typeof descriptor.value!=='function')return false;
  const original=descriptor.value;
  function wrapped(...args){
   emit(PREFIX,()=>({boundary:'console.error',errors:projectErrors(args),frames:[]}));
   return Reflect.apply(original,this,args);
  }
  Object.defineProperty(consoleObject,'error',{...descriptor,value:wrapped});
  // Set only after installing successfully; never infer opt-in from env here.
  if(activeRuntime===null)activeRuntime=runtime;
  installed.add(consoleObject);
  return true;
 }catch{return false;}
}
module.exports={installFixtureErrorDiagnostics,observeFixtureOperation};
