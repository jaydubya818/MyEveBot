import {afterEach,describe,expect,it,vi} from 'vitest';
import {createServer,type Server} from 'node:http';
import {Readable} from 'node:stream';
import {once} from 'node:events';
import {generateKeyPairSync,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Env,connection} from '../../../apps/eve/lib/external-alpha/work-test-fixture.ts';
import {remoteHttpExchange,remoteHttpReceiver,REMOTE_HTTP_PATH,REMOTE_REQUEST_BYTES,REMOTE_RESPONSE_BYTES,REMOTE_HTTP_IN_FLIGHT} from '../src/alpha-tasks/remote-http.ts';
import {RemoteAlphaTasksIsolation,RemoteIsolationReceiver,type SignedRemoteRequest,type SignedRemoteObservation,type RemoteEnrollment} from '../src/alpha-tasks/remote-isolation.ts';
import {PostgresRemoteDeliveryJournal} from '../src/alpha-tasks/remote-journal.ts';
import {digest} from '../src/alpha-tasks/contracts.ts';
// @ts-ignore Existing public inert source fixture.
import {fixture} from '../test/alpha-tasks/fixtures.mjs';

const enrollment={ownerId:'synthetic-owner',installationId:'synthetic-installation',agentId:'synthetic-agent',hostId:'synthetic-host',enrollmentDigest:'sha256:'+'1'.repeat(64)};
const endpoint='http://127.0.0.1:12345'+REMOTE_HTTP_PATH;
const config=(url=endpoint,timeoutMs=1000)=>({endpoint:url,enrollment,timeoutMs,loopbackQualification:true as const});
const wire=()=>({document:{binding:{...enrollment},expiresAt:Date.now()+29000},keyId:'synthetic',signature:'opaque-signature',source:null} as SignedRemoteRequest);
const observation={document:{status:'UNKNOWN'},keyId:'synthetic',signature:'retained-signature'} as SignedRemoteObservation;
const request=(body:BodyInit=JSON.stringify(wire()),headers:Record<string,string>={'content-type':'application/json'},url=endpoint)=>
  new Request(url,{method:'POST',body,headers,duplex:'half'} as RequestInit);
const servers:Server[]=[];
afterEach(async()=>{vi.unstubAllEnvs();for(const server of servers.splice(0)){server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}});
async function serve(handle:(request:Request)=>Promise<Response>) {
  let url='';
  const server=createServer(async(req,res)=>{
    const controller=new AbortController();
    req.once('aborted',()=>controller.abort());
    res.once('close',()=>{if(!res.writableFinished)controller.abort();});
    try {
      const headers=new Headers();for(const [key,value] of Object.entries(req.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(','):value);
      const input=new Request(new URL(req.url!,url),{method:req.method,headers,signal:controller.signal,
        ...(req.method==='POST'?{body:Readable.toWeb(req),duplex:'half'}:{})} as RequestInit);
      const response=await handle(input);
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
    } catch {if(!res.destroyed){res.writeHead(500);res.end();}}
  });
  servers.push(server);server.listen(0,'127.0.0.1');await once(server,'listening');
  const address=server.address();if(!address||typeof address==='string')throw Error('missing fixture address');
  url='http://127.0.0.1:'+address.port;return url+REMOTE_HTTP_PATH;
}

describe('dormant bounded remote HTTP transport',()=>{
  it.each(['http://example.invalid','ftp://example.invalid','https://user:pass@example.invalid','https://example.invalid'+REMOTE_HTTP_PATH+'?x=1','https://example.invalid'+REMOTE_HTTP_PATH+'#fragment','https://example.invalid/wrong'])('rejects unqualified endpoint %s',url=>{
    const target=url.includes(REMOTE_HTTP_PATH)||url.endsWith('/wrong')?url:url+REMOTE_HTTP_PATH;
    expect(()=>remoteHttpExchange({...config(),endpoint:target})).toThrow('APP_REMOTE_HTTP_ENDPOINT');
  });
  it.each([0,-1,30001,NaN])('rejects invalid deadline %s',timeoutMs=>expect(()=>remoteHttpExchange(config(endpoint,timeoutMs))).toThrow());
  it.each(['production','vercel'])('test loopback opt-in cannot override %s',mode=>{
    if(mode==='production')vi.stubEnv('NODE_ENV','production');else vi.stubEnv('VERCEL','1');
    expect(()=>remoteHttpExchange(config())).toThrow('APP_REMOTE_HTTP_ENDPOINT');
  });
  it('requires explicit loopback qualification',()=>expect(()=>remoteHttpExchange({...config(),loopbackQualification:undefined})).toThrow());
  it.each(Object.keys(enrollment))('rejects foreign %s before any network call',async key=>{
    const input=wire();(input.document.binding as any)[key]='foreign';
    await expect(remoteHttpExchange(config())(input)).rejects.toMatchObject({cleanup:'UNKNOWN'});
  });
  it('rejects expired commands and oversized source before transport',async()=>{
    const send=remoteHttpExchange(config());const expired=wire();expired.document.expiresAt=Date.now()-1;
    await expect(send(expired)).rejects.toMatchObject({cleanup:'UNKNOWN'});
    const huge=wire();huge.source={payload:'x'.repeat(REMOTE_REQUEST_BYTES)} as any;
    await expect(send(huge)).rejects.toMatchObject({cleanup:'UNKNOWN'});
  });
  it('preserves JSON/signature bytes over real loopback and snapshots the enrolled endpoint',async()=>{
    let handler:(request:Request)=>Promise<Response>;let received:unknown;let headers:Headers|undefined;
    const url=await serve(async req=>{headers=req.headers;return handler(req);});
    const supplied=config(url);handler=remoteHttpReceiver(supplied,{receive:async input=>{received=input;return observation;}});
    const send=remoteHttpExchange(supplied);supplied.endpoint='https://foreign.invalid'+REMOTE_HTTP_PATH;supplied.enrollment={...enrollment,ownerId:'foreign'};
    const input=wire();expect(await send(input)).toEqual(observation);expect(received).toEqual(input);
    expect(headers?.get('cookie')).toBeNull();expect(headers?.get('authorization')).toBeNull();expect(headers?.get('accept-encoding')).toBe('identity');
  });
  it.each([301,302,303,307,308])('never follows HTTP %s redirects',async status=>{
    let foreign=0;const other=await serve(async()=>{foreign++;return Response.json(observation);});
    const url=await serve(async()=>new Response(null,{status,headers:{location:other}}));
    await expect(remoteHttpExchange(config(url))(wire())).rejects.toMatchObject({cleanup:'UNKNOWN'});expect(foreign).toBe(0);
  });
  it.each([401,403,429,500,503])('HTTP %s is UNKNOWN, never proof of no effect',async status=>{
    const url=await serve(async()=>new Response('private internal error',{status}));
    await expect(remoteHttpExchange(config(url))(wire())).rejects.toMatchObject({cleanup:'UNKNOWN'});
  });
  it('bounds real response bytes and rejects non-JSON',async()=>{
    const url=await serve(async()=>new Response('x'.repeat(REMOTE_RESPONSE_BYTES+1),{headers:{'content-type':'application/json'}}));
    await expect(remoteHttpExchange(config(url))(wire())).rejects.toMatchObject({cleanup:'UNKNOWN'});
    const html=await serve(async()=>new Response('<html>internal</html>',{headers:{'content-type':'text/html'}}));
    await expect(remoteHttpExchange(config(html))(wire())).rejects.toMatchObject({cleanup:'UNKNOWN'});
  });
  it('aborts a stalled real response within the configured deadline without retry',async()=>{
    let calls=0;const url=await serve(async req=>{calls++;await new Promise<void>(resolve=>req.signal.addEventListener('abort',()=>resolve(),{once:true}));return Response.json(observation);});
    await expect(remoteHttpExchange(config(url,500))(wire())).rejects.toMatchObject({cleanup:'UNKNOWN'});expect(calls).toBe(1);
  });
  it('rejects wrong route and method without receiver dispatch or CORS permission',async()=>{
    const receive=vi.fn();const handle=remoteHttpReceiver(config(),{receive});
    expect((await handle(new Request(endpoint+'?query=1',{method:'POST',body:'{}'}))).status).toBe(404);
    const res=await handle(new Request(endpoint,{method:'OPTIONS'}));expect(res.status).toBe(405);expect(res.headers.get('access-control-allow-origin')).toBeNull();expect(receive).not.toHaveBeenCalled();
  });
  it.each([
    ['type',{'content-type':'text/plain'}],['encoding',{'content-type':'application/json','content-encoding':'gzip'}],
    ['length',{'content-type':'application/json','content-length':String(REMOTE_REQUEST_BYTES+1)}],
  ] as const)('rejects invalid request %s before parsing or dispatch',async(_name,headers)=>{
    const receive=vi.fn();const res=await remoteHttpReceiver(config(),{receive})(request('{}',{...headers}));
    expect(res.status).toBe(400);expect(receive).not.toHaveBeenCalled();
  });
  it('bounds chunked body bytes when Content-Length is absent',async()=>{
    let canceled=false;const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(REMOTE_REQUEST_BYTES+1));},cancel(){canceled=true;}});
    const receive=vi.fn();const res=await remoteHttpReceiver(config(),{receive})(request(stream));
    expect(res.status).toBe(400);expect(canceled).toBe(true);expect(receive).not.toHaveBeenCalled();
  });
  it('rejects malformed JSON and invalid UTF-8 without revealing body or errors',async()=>{
    const receive=vi.fn();const handle=remoteHttpReceiver(config(),{receive});
    for(const body of ['private malformed',new Uint8Array([0xff])]){
      const res=await handle(request(body));expect(res.status).toBe(400);expect(await res.json()).toEqual({error:'REMOTE_TRANSPORT_UNAVAILABLE'});
    }
    expect(receive).not.toHaveBeenCalled();
  });
  it('cancels a slow request body before dispatch',async()=>{
    let canceled=false;const receive=vi.fn();const stream=new ReadableStream({cancel(){canceled=true;}});
    const res=await remoteHttpReceiver(config(endpoint,20),{receive})(request(stream));
    expect(res.status).toBe(400);expect(canceled).toBe(true);expect(receive).not.toHaveBeenCalled();
  });
  it('does not call the signed receiver for a foreign enrollment',async()=>{
    const receive=vi.fn();const input=wire();input.document.binding.hostId='foreign';
    expect((await remoteHttpReceiver(config(),{receive})(request(JSON.stringify(input)))).status).toBe(400);expect(receive).not.toHaveBeenCalled();
  });
  it('redacts receiver errors and never treats them as a signed denial',async()=>{
    const res=await remoteHttpReceiver(config(),{receive:async()=>{throw Error('private database credential');}})(request());
    expect(res.status).toBe(503);expect(await res.text()).toBe('{"error":"REMOTE_TRANSPORT_UNAVAILABLE"}');expect(res.headers.get('cache-control')).toBe('no-store');
  });
  it('rejects oversized observations',async()=>{
    const res=await remoteHttpReceiver(config(),{receive:async()=>({data:'x'.repeat(REMOTE_RESPONSE_BYTES)} as any)})(request());
    expect(res.status).toBe(503);
  });
  it('retains the concurrency slot after timeout until actual receiver completion',async()=>{
    const finish:Array<()=>void>=[];let calls=0;
    const handle=remoteHttpReceiver(config(endpoint,50),{receive:async()=>{calls++;await new Promise<void>(resolve=>finish.push(resolve));return observation;}});
    for(let i=0;i<REMOTE_HTTP_IN_FLIGHT;i++)expect((await handle(request())).status).toBe(503);
    expect((await handle(request())).status).toBe(503);expect(calls).toBe(REMOTE_HTTP_IN_FLIGHT);
    finish.forEach(done=>done());await new Promise(resolve=>setImmediate(resolve));
    const last=handle(request());await new Promise(resolve=>setImmediate(resolve));finish.at(-1)!();
    expect((await last).status).toBe(200);expect(calls).toBe(REMOTE_HTTP_IN_FLIGHT+1);
  });
});

it.skipIf(!connection)('real signed HTTP response loss recovers the durable PostgreSQL outcome without redispatch',async()=>{
  const env=await Env.create();
  const role='http_delivery_'+randomUUID().replaceAll('-','');let roleCreated=false;
  try {
    await env.pool.query(await readFile(new URL('../src/alpha-tasks/remote-isolation.sql',import.meta.url),'utf8'));
    await env.pool.query(`CREATE ROLE ${role} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);roleCreated=true;
    await env.pool.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
    await env.pool.query(`GRANT SELECT,INSERT,UPDATE ON myapps_remote_delivery TO ${role}`);
    const journal=new PostgresRemoteDeliveryJournal({query:async(sql,values)=>{
      const client=await env.pool.connect();
      try {await client.query('SET ROLE '+role);return await client.query(sql,values);}
      finally {await client.query('RESET ROLE');client.release();}
    }});
    const f=fixture(),controller=generateKeyPairSync('ed25519'),executor=generateKeyPairSync('ed25519');
    const enrolled:RemoteEnrollment={ownerId:f.pkg.spec.ownerId,installationId:f.pkg.origin.installationId,agentId:'synthetic-agent',hostId:randomUUID(),revision:1,controllerKeyId:'controller',executorKeyId:'executor',profile:f.runtime,active:true,expiresAt:Date.now()+600000};
    const trust={enrollment:async()=>structuredClone(enrolled),controllerPublicKey:controller.publicKey,executorPublicKey:executor.publicKey};
    let calls=0,lose=true,handler:(req:Request)=>Promise<Response>;
    const receiver=new RemoteIsolationReceiver(trust,executor.privateKey,journal,{
      execute:async(_source,_op,_input,data,operationId)=>{calls++;return {operationId,output:[],data,cleanup:'CONFIRMED',sourceClosureDigest:f.pkg.sourceClosureDigest,runtimeDigest:digest(f.runtime) as any};},
    },async r=>({commandDigest:r.commandDigest,enrollmentDigest:r.binding.enrollmentDigest,action:r.action,expiresAt:r.expiresAt}));
    const url=await serve(async req=>{
      const response=await handler(req);
      if(lose){lose=false;return new Response(null,{status:503});}return response;
    });
    const {active,...identity}=enrolled;
    const binding={ownerId:enrolled.ownerId,installationId:enrolled.installationId,agentId:enrolled.agentId,hostId:enrolled.hostId,enrollmentDigest:digest(identity)};
    const transport={...config(url),enrollment:binding};handler=remoteHttpReceiver(transport,receiver);
    const client=new RemoteAlphaTasksIsolation(trust,controller.privateKey,remoteHttpExchange(transport));
    const command=await client.prepare(f.pkg,f.closure,'list',{}, {next:1,tasks:[]},randomUUID());
    await expect(client.observe(command,'EXECUTE')).rejects.toMatchObject({cleanup:'UNKNOWN'});expect(calls).toBe(1);
    expect((await client.observe(command,'READ')).status).toBe('COMPLETED');
    expect((await client.observe(command,'EXECUTE')).status).toBe('COMPLETED');expect(calls).toBe(1);
    const tampered=structuredClone(command);tampered.signature='A'.repeat(86)+'==';
    await expect(remoteHttpExchange(transport)(tampered)).rejects.toMatchObject({cleanup:'UNKNOWN'});expect(calls).toBe(1);
  } finally {
    try {if(roleCreated){await env.pool.query('DROP OWNED BY '+role);await env.pool.query('DROP ROLE '+role);}}
    finally {await env.close();}
  }
});
