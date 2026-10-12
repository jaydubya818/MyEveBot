import {requireValue} from '../contracts.ts';
import {IsolatedExecutionError} from './isolation.ts';
import type {RemoteBinding,SignedRemoteRequest,SignedRemoteObservation} from './remote-isolation.ts';

export const REMOTE_HTTP_PATH='/myapps/remote-isolation/v2';
// A 4 MiB source closure expands under base64; the signed document retains its own 100 KB bound.
export const REMOTE_REQUEST_BYTES=6*1024*1024;
export const REMOTE_RESPONSE_BYTES=128*1024;
export const REMOTE_HTTP_IN_FLIGHT=8;
type EnrollmentBinding=Pick<RemoteBinding,'ownerId'|'installationId'|'agentId'|'hostId'|'enrollmentDigest'>;
export interface RemoteHttpConfiguration {
  endpoint:string;
  enrollment:EnrollmentBinding;
  timeoutMs?:number;
  /** Inert loopback fixtures only; the actual process must be test/non-Vercel. */
  loopbackQualification?:true;
}
const identityKeys=['ownerId','installationId','agentId','hostId','enrollmentDigest'] as const;

function configuration(value:RemoteHttpConfiguration) {
  const endpoint=new URL(value.endpoint),timeoutMs=value.timeoutMs??30000;
  const loopback=value.loopbackQualification===true&&process.env.NODE_ENV==='test'&&!process.env.VERCEL&&
    endpoint.protocol==='http:'&&endpoint.hostname==='127.0.0.1';
  requireValue((endpoint.protocol==='https:'||loopback)&&!endpoint.username&&!endpoint.password&&
    !endpoint.search&&!endpoint.hash&&endpoint.pathname===REMOTE_HTTP_PATH&&endpoint.href===value.endpoint,'APP_REMOTE_HTTP_ENDPOINT');
  requireValue(Number.isSafeInteger(timeoutMs)&&timeoutMs>0&&timeoutMs<=30000,'APP_REMOTE_HTTP_DEADLINE');
  const enrollment=structuredClone(value.enrollment);
  requireValue(identityKeys.every(key=>typeof enrollment[key]==='string'&&enrollment[key].length>0),'APP_REMOTE_HTTP_ENROLLMENT');
  return {endpoint:endpoint.href,enrollment,timeoutMs};
}
function exactEnrollment(wire:SignedRemoteRequest,expected:EnrollmentBinding) {
  requireValue(identityKeys.every(key=>wire.document?.binding?.[key]===expected[key]),'APP_REMOTE_HTTP_ENROLLMENT');
}

async function deadline<T>(ms:number,parent:AbortSignal|undefined,operation:(signal:AbortSignal)=>Promise<T>):Promise<T> {
  const controller=new AbortController();
  const signal=parent?AbortSignal.any([parent,controller.signal]):controller.signal;
  const timer=setTimeout(()=>controller.abort(),ms);
  let rejectAbort:()=>void=()=>{};
  const aborted=new Promise<never>((_resolve,reject)=>{
    rejectAbort=()=>reject(new Error('APP_REMOTE_HTTP_DEADLINE'));
    signal.addEventListener('abort',rejectAbort,{once:true});
  });
  try {
    signal.throwIfAborted();
    return await Promise.race([operation(signal),aborted]);
  } finally {
    clearTimeout(timer);signal.removeEventListener('abort',rejectAbort);
  }
}

async function readJson(message:Request|Response,limit:number,signal:AbortSignal):Promise<unknown> {
  const reader=message.body?.getReader();
  requireValue(reader,'APP_REMOTE_HTTP_BODY');
  const cancel=()=>{void reader.cancel().catch(()=>{});};
  signal.addEventListener('abort',cancel,{once:true});
  let completed=false;
  try {
    requireValue(/^application\/json(?:;\s*charset=utf-8)?$/i.test(message.headers.get('content-type')??''),'APP_REMOTE_HTTP_TYPE');
    requireValue(['','identity'].includes(message.headers.get('content-encoding')??''),'APP_REMOTE_HTTP_ENCODING');
    const length=message.headers.get('content-length');
    requireValue(length===null||(/^\d+$/.test(length)&&Number.isSafeInteger(Number(length))&&Number(length)<=limit),'APP_REMOTE_HTTP_SIZE');
    const chunks:Uint8Array[]=[];let bytes=0;
    while(true) {
      signal.throwIfAborted();
      const part=await reader.read();
      signal.throwIfAborted();
      if(part.done)break;
      bytes+=part.value.byteLength;
      requireValue(bytes<=limit,'APP_REMOTE_HTTP_SIZE');
      chunks.push(part.value);
    }
    requireValue(length===null||Number(length)===bytes,'APP_REMOTE_HTTP_SIZE');
    const parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
    completed=true;return parsed;
  } finally {
    signal.removeEventListener('abort',cancel);
    if(!completed)cancel();
    reader.releaseLock();
  }
}

/** Only a trusted enrollment loader may supply this fixed destination. No caller URL or retry. */
export function remoteHttpExchange(input:RemoteHttpConfiguration) {
  const config=configuration(input);
  return async(wire:SignedRemoteRequest):Promise<SignedRemoteObservation>=>{
    try {
      exactEnrollment(wire,config.enrollment);
      const remaining=wire.document.expiresAt-Date.now();
      requireValue(Number.isSafeInteger(remaining)&&remaining>0&&remaining<=30000,'APP_REMOTE_HTTP_DEADLINE');
      const body=JSON.stringify(wire);
      requireValue(Buffer.byteLength(body)<=REMOTE_REQUEST_BYTES,'APP_REMOTE_HTTP_SIZE');
      return await deadline(Math.min(remaining,config.timeoutMs),undefined,async signal=>{
        const response=await fetch(config.endpoint,{method:'POST',body,signal,redirect:'error',
          credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',
          headers:{'content-type':'application/json','accept':'application/json','accept-encoding':'identity'}});
        if(response.status!==200||response.redirected||response.url!==config.endpoint) {
          void response.body?.cancel().catch(()=>{});
          throw new Error('APP_REMOTE_HTTP_STATUS');
        }
        return await readJson(response,REMOTE_RESPONSE_BYTES,signal) as SignedRemoteObservation;
      });
    } catch {
      // Transport status, disconnect and elapsed time never prove that no effect happened.
      throw new IsolatedExecutionError('UNKNOWN');
    }
  };
}

function reply(status:number,value:unknown) {
  return new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json',
    'cache-control':'no-store','x-content-type-options':'nosniff'}});
}

/** A handler only: no server, bootstrap import, route registration or credential loading. */
export function remoteHttpReceiver(input:RemoteHttpConfiguration,
  receiver:{receive(wire:SignedRemoteRequest):Promise<SignedRemoteObservation>}) {
  const config=configuration(input);
  let active=0;
  return async(request:Request):Promise<Response>=>{
    const reject=(status:number,error:string)=>{
      void request.body?.cancel().catch(()=>{});return reply(status,{error});
    };
    if(request.url!==config.endpoint)return reject(404,'REMOTE_ENDPOINT_UNAVAILABLE');
    if(request.method!=='POST')return reject(405,'REMOTE_METHOD_UNAVAILABLE');
    if(active>=REMOTE_HTTP_IN_FLIGHT)return reject(503,'REMOTE_TRANSPORT_UNAVAILABLE');
    if(request.signal.aborted)return reject(400,'REMOTE_TRANSPORT_UNAVAILABLE');
    active++;
    let dispatched=false;
    try {
      return await deadline(config.timeoutMs,request.signal,async signal=>{
        try {
          const wire=await readJson(request,REMOTE_REQUEST_BYTES,signal) as SignedRemoteRequest;
          exactEnrollment(wire,config.enrollment);
          signal.throwIfAborted();
          // The receiver must independently verify signatures, enrollment and current canonical admission.
          dispatched=true;
          const observation=await receiver.receive(wire);
          signal.throwIfAborted();
          requireValue(Buffer.byteLength(JSON.stringify(observation))<=REMOTE_RESPONSE_BYTES,'APP_REMOTE_HTTP_SIZE');
          return reply(200,observation);
        } finally {
          // Do not release capacity just because HTTP timed out while the receiver is still running.
          active--;
        }
      });
    } catch {
      // The receiver can still finish durable custody after HTTP timeout; there is no cancellation inference.
      return reply(dispatched?503:400,{error:'REMOTE_TRANSPORT_UNAVAILABLE'});
    }
  };
}
