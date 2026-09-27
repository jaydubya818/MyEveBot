import {MAX_RESULT_BYTES} from './factory-producer-protocol.ts';
import type {FactoryBinding} from './factory-receipt-store.ts';
/** Qualified producer's existing scoped channel. Origin/token come only from
 * trusted server configuration. No returned URL or redirect is ever followed. */
export async function readFactoryAttempt(config: {origin: string;token: string},binding: FactoryBinding,fetcher: typeof fetch=fetch) {
 const origin=new URL(config.origin);
 if(origin.username || origin.password || origin.search || origin.hash || origin.pathname!=='/' ||
   origin.protocol!=='http:' || origin.hostname!=='127.0.0.1' || !config.token.trim())
  throw new Error('Factory result channel requires configured loopback origin and backend token');
 const path=`/api/connect/v1/work-orders/${encodeURIComponent(binding.workOrderId)}/runs/${encodeURIComponent(binding.runId)}/result`;
 const response=await fetcher(new URL(path,origin),{method:'GET',headers:{Authorization:`Bearer ${config.token}`},
  redirect:'error',signal:AbortSignal.timeout(15_000)});
 if(!response.ok || !response.body) throw new Error(`Factory result unavailable (${response.status})`);
 const limit=MAX_RESULT_BYTES+1024, chunks:Uint8Array[]=[]; let size=0;
 const reader=response.body.getReader();
 try {
  while(true) {const {done,value}=await reader.read();if(done)break;size+=value.length;
   if(size>limit) throw new Error('Factory result channel size limit');chunks.push(value);}
 } finally {await reader.cancel();}
 const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
 if(!body || Object.keys(body).sort().join(',')!=='result,state') throw new Error('Malformed Factory readback');
 if(body.result===null) {
  if(!['RUNNING','STOPPING','UNKNOWN'].includes(body.state)) throw new Error('Missing terminal result');
  return {state:body.state as 'RUNNING'|'STOPPING'|'UNKNOWN',result:null};
 }
 if(!['COMPLETED','FAILED','CANCELLED'].includes(body.state)) throw new Error('Contradictory Factory readback');
 // The unsigned transport status is informational. The signed manifest alone
 // controls processing after cryptographic authentication.
 return {state:body.state as 'COMPLETED'|'FAILED'|'CANCELLED',result:body.result as unknown};
}
