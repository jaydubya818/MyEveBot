import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {appendFileSync,readFileSync,writeFileSync} from 'node:fs';
import {registerOwnedProcess,closeOwnedProcess} from './owned-process-registry.mjs';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const hash=value=>createHash('sha256').update(value).digest('hex');

/** One finite owner for exact declared process groups, logs and exit signals.
 * This does not contain a hostile native descendant that leaves its group. */
export function createOwnedRuntimeProcesses(registry){
 const children=[];let firstFailure,closing=false,closePromise;
 let rejectFailure;const failure=new Promise((_,reject)=>{rejectFailure=reject;});
 // A premature exit must remain observed even between readiness operations.
 failure.catch(()=>{});
 const fail=error=>{firstFailure??=error;rejectFailure(firstFailure);};
 const live=child=>{if(!child.pid)return false;try{process.kill(-child.pid,0);return true;}catch(error){if(error.code==='ESRCH')return false;throw error;}};
 const signal=(child,value)=>{if(!child.pid)return;try{process.kill(-child.pid,value);}catch(error){if(error.code!=='ESRCH')throw error;}};
 const interrupted=()=>fail(Error('RUNTIME_OPERATOR_INTERRUPTED'));
 process.once('SIGTERM',interrupted);process.once('SIGINT',interrupted);
 return {
  launch({node,args,cwd,env,log,kind,expectedToExit=false}){
   assert(!closing);assert(['eve','next','client'].includes(kind));
   assert(!Object.keys(env).some(name=>['NODE_OPTIONS','NODE_PATH','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY'].includes(name)),'RUNTIME_UNDECLARED_LOADER_OR_PROXY');
   writeFileSync(log,'',{flag:'wx',mode:0o600});
   const child=spawn(node,args,{cwd,env,detached:true,stdio:['ignore','pipe','pipe']});
   const item={child,kind,node,args,cwd,envSha256:hash(JSON.stringify(Object.fromEntries(Object.entries(env).sort()))),log,
    pid:child.pid,processGroupId:child.pid,exited:false,closed:false,expectedToExit,exitCode:null,signal:null,logBytes:0};
   children.push(item);
   let registrationFailure;
   if(registry)try{item.registration=registerOwnedProcess(registry,{pid:child.pid,binary:node,args,cwd});}catch(error){registrationFailure=error;}
   function collect(chunk){
    item.logBytes+=chunk.length;
    if(item.logBytes>16*1024**2){fail(Error('RUNTIME_PROCESS_LOG_LIMIT:'+kind));return;}
    try{appendFileSync(log,chunk);}catch(error){fail(error);}
   }
   child.stdout.on('data',collect);child.stderr.on('data',collect);
   child.once('error',fail);
   child.once('exit',(code,exitSignal)=>{
    item.exited=true;item.exitCode=code;item.signal=exitSignal;
    if(!closing&&(!expectedToExit||code!==0))fail(Error('RUNTIME_PREMATURE_EXIT:'+kind+':'+(code??exitSignal)));
   });
   child.once('close',()=>{item.closed=true;});
   if(registrationFailure)fail(registrationFailure);
   return item;
  },
  async guard(operation,timeoutMs=60000){
   assert(Number.isInteger(timeoutMs)&&timeoutMs>0&&timeoutMs<=120000);
   if(firstFailure)throw firstFailure;
   let timer;
   try{return await Promise.race([operation,failure,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('RUNTIME_OPERATION_TIMEOUT')),timeoutMs);})]);}
   finally{clearTimeout(timer);}
  },
  async readiness(url,predicate){
   const end=Date.now()+60000;let last='not ready';
   while(Date.now()<end){
    if(firstFailure)throw firstFailure;
    try{const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(2000)});
     if(response.status===200){const value=await response.json();if(predicate(value))return value;last='schema mismatch';}
     else last='status '+response.status;
    }catch(error){last=error.code??error.name;}
    await wait(100);
   }
   throw Error('RUNTIME_READINESS_TIMEOUT:'+last);
  },
  async completed(item){
   for(let attempt=0;attempt<600&&!item.closed;attempt++){if(firstFailure)throw firstFailure;await wait(100);}
   assert(item.exited&&item.closed&&item.exitCode===0,'RUNTIME_CLIENT_EXIT_UNKNOWN');
   assert(!live(item.child),'RUNTIME_CLIENT_DESCENDANTS_UNKNOWN');
  },
  close(){return closePromise??=(async()=>{
   closing=true;const errors=[];
   for(const item of children)try{if(live(item.child))signal(item.child,'SIGTERM');}catch(error){errors.push(error);}
   for(let attempt=0;attempt<50&&children.some(item=>live(item.child));attempt++)await wait(100);
   for(const item of children)try{if(live(item.child))signal(item.child,'SIGKILL');}catch(error){errors.push(error);}
   for(let attempt=0;attempt<30&&children.some(item=>live(item.child)||!item.closed);attempt++)await wait(100);
   const observations=[];
   for(const item of children){
    try{
     assert(item.exited&&item.closed&&!live(item.child),'RUNTIME_PROCESS_CLEANUP_UNKNOWN:'+item.kind);
     if(item.registration)closeOwnedProcess(registry,item.registration);
     observations.push({kind:item.kind,pid:item.pid,processGroupId:item.processGroupId,node:item.node,args:item.args,cwd:item.cwd,
      environmentSha256:item.envSha256,exitCode:item.exitCode,signal:item.signal,groupQuiescent:true,logSha256:hash(readFileSync(item.log))});
    }catch(error){errors.push(error);}
    finally{item.child.stdout.destroy();item.child.stderr.destroy();item.child.unref();}
   }
   process.removeListener('SIGTERM',interrupted);process.removeListener('SIGINT',interrupted);
   if(firstFailure)errors.unshift(firstFailure);
   if(errors.length)throw new AggregateError(errors,'Runtime process failure or cleanup unknown');
   return observations;
  })();},
 };
}
