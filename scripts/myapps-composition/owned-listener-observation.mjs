import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,realpathSync} from 'node:fs';
import {parseProcessIdentity} from './owned-process-registry.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
export function validateOwnedListener(text,identityText,{pid,port,nodePath,executableText,registration}){
 const rows=text.trim().split('\n'),pids=rows.filter(row=>row.startsWith('p')).map(row=>Number(row.slice(1))),names=rows.filter(row=>row.startsWith('n')).map(row=>row.slice(1));
 assert(pids.length>0&&pids.every(value=>value===pid),'OWNED_LISTENER_FOREIGN_PID');
 assert(names.length>0&&names.every(value=>value==='127.0.0.1:'+port),'OWNED_LISTENER_FOREIGN_ADDRESS');
 assert(executableText.split('\n').includes('n'+nodePath),'OWNED_LISTENER_WRONG_EXECUTABLE');
 const identity=parseProcessIdentity(identityText,pid);
 if(registration)for(const key of ['pid','pgid','start'])assert.equal(identity[key],registration[key],'OWNED_LISTENER_PROCESS_IDENTITY_CHANGED');
 return {pid,port,address:'127.0.0.1',identity,listenerOutputSha256:hash(text)};
}
export function observeOwnedListener(child,port,tools){
 for(const item of [tools.ps,tools.lsof,tools.node]){assert.equal(realpathSync(item.path),item.path);assert.equal(hash(readFileSync(item.path)),item.sha256,'LISTENER_OBSERVER_BINARY_DRIFT');}
 const options={encoding:'utf8',timeout:3000,maxBuffer:65536,env:{PATH:'/usr/bin:/bin',LC_ALL:'C'}};
 const listeners=execFileSync(tools.lsof.path,['-nP','-iTCP:'+port,'-sTCP:LISTEN','-Fpn'],options);
 const identity=execFileSync(tools.ps.path,['-ww','-p',String(child.pid),'-o','pid=','-o','pgid=','-o','lstart=','-o','command='],options);
 const executableText=execFileSync(tools.lsof.path,['-nP','-a','-p',String(child.pid),'-d','txt','-Fn'],options);
 const observed=validateOwnedListener(listeners,identity,{pid:child.pid,port,nodePath:tools.node.path,executableText,registration:child.registration});
 // Next may change process.title; PID/group/birth and mapped Node executable
 // remain independently bound to the exact owned spawn, not a mutable title.
 return observed;
}

export function validateProxyRouteWitnesses(witnesses,{evePid,webPid,evePort,webPort,marker}){
 for(const [kind,pid,port] of [['eve',evePid,evePort],['next',webPid,webPort]]){
  const witness=witnesses.find(row=>row.kind===kind);assert(witness,'RUNTIME_PROCESS_WITNESS_REQUIRED');
  assert(witness.listeners.some(row=>row.pid===pid&&row.port===port&&row.address==='127.0.0.1'),'RUNTIME_LISTENER_EVENT_MISSING');
  const requests=witness.httpRequests.filter(row=>row.marker===marker+'-proxy');
  assert.equal(requests.length,1,'RUNTIME_EXACT_PROXY_ROUTE_REQUEST_REQUIRED');
  assert(requests[0].pid===pid&&requests[0].port===port&&requests[0].path==='/eve/v1/health'&&requests[0].method==='GET','RUNTIME_PROXY_ROUTE_WITNESS_MISSING');
  const writes=witness.httpRequests.filter(row=>row.marker===marker+'-chat'&&row.method==='POST');
  assert.equal(writes.length,2,'RUNTIME_TWO_PROXY_CHAT_WRITES_REQUIRED');
  assert(writes.every(row=>row.pid===pid&&row.port===port&&/^\/eve\/v1\/session(?:\/[^/]+)?$/.test(row.path)),'RUNTIME_CHAT_PROXY_ROUTE_MISMATCH');
 }
 return {status:'PROXY_HEALTH_AND_TWO_CHAT_WRITES_OBSERVED_AT_BOTH_OWNED_LISTENERS'};
}
