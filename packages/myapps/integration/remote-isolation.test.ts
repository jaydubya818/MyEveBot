import {beforeAll,afterAll,beforeEach,describe,it,expect} from 'vitest';
import {generateKeyPairSync,randomUUID,sign} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Env,connection} from '../../../apps/eve/lib/external-alpha/work-test-fixture.ts';
import {RemoteIsolationReceiver,RemoteAlphaTasksIsolation,type RemoteEnrollment,type RemoteExecutor,type SignedRemoteRequest} from '../src/alpha-tasks/remote-isolation.ts';
import {PostgresRemoteDeliveryJournal} from '../src/alpha-tasks/remote-journal.ts';
import {LocalAlphaTasksIsolation,IsolatedExecutionError} from '../src/alpha-tasks/isolation.ts';
import {canonical,digest} from '../src/alpha-tasks/contracts.ts';
// Existing public inert profile, source tree and immutable image, unchanged.
// @ts-ignore Public Node fixture.
import {fixture} from '../test/alpha-tasks/fixtures.mjs';

describe.skipIf(!connection)('dormant signed MyApps executor delivery custody',()=>{
  let env:Env,journal:PostgresRemoteDeliveryJournal,role:string;
  let f:ReturnType<typeof fixture>,enrolled:RemoteEnrollment,now:number,calls:number,fences:number,allowed:boolean;
  let controller:ReturnType<typeof generateKeyPairSync>,executorKeys:ReturnType<typeof generateKeyPairSync>;
  let backend:RemoteExecutor,receiver:RemoteIsolationReceiver,client:RemoteAlphaTasksIsolation;
  const empty={next:1,tasks:[]};
  beforeAll(async()=>{
    env=await Env.create();await env.pool.query(await readFile(new URL('../src/alpha-tasks/remote-isolation.sql',import.meta.url),'utf8'));
    role='remote_delivery_'+env.name.slice(8);
    await env.pool.query(`CREATE ROLE ${role} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
    await env.pool.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
    await env.pool.query(`GRANT SELECT,INSERT,UPDATE ON myapps_remote_delivery TO ${role}`);
    journal=new PostgresRemoteDeliveryJournal({query:async(sql,values)=>{
      const c=await env.pool.connect();try{await c.query('SET ROLE '+role);return await c.query(sql,values);}
      finally{await c.query('RESET ROLE');c.release();}
    }});
  });
  afterAll(async()=>{if(env){if(role){await env.pool.query('DROP OWNED BY '+role);await env.pool.query('DROP ROLE '+role);}await env.close();}});
  function trust(){return {enrollment:async()=>structuredClone(enrolled),controllerPublicKey:controller.publicKey,
    executorPublicKey:executorKeys.publicKey,now:()=>now};}
  function compose(j=journal,remote=backend){
    receiver=new RemoteIsolationReceiver(trust(),executorKeys.privateKey,j,remote,async request=>{
      if(!allowed)throw Error('CURRENT_CAPABILITY_DENIED');
      return {commandDigest:request.commandDigest,enrollmentDigest:request.binding.enrollmentDigest,action:request.action,expiresAt:request.expiresAt};
    });
    client=new RemoteAlphaTasksIsolation(trust(),controller.privateKey,r=>receiver.receive(r));
  }
  beforeEach(()=>{
    f=fixture();now=Date.now();calls=0;fences=0;allowed=true;
    controller=generateKeyPairSync('ed25519');executorKeys=generateKeyPairSync('ed25519');
    enrolled={ownerId:f.pkg.spec.ownerId,installationId:f.pkg.origin.installationId,agentId:'synthetic-agent',hostId:'host-'+randomUUID(),revision:1,
      controllerKeyId:'controller',executorKeyId:'executor',profile:f.runtime,active:true,expiresAt:now+3600000};
    backend={execute:async(_source,_op,_input,data,operationId)=>{
      calls++;return {operationId,output:[],data,cleanup:'CONFIRMED',sourceClosureDigest:f.pkg.sourceClosureDigest,runtimeDigest:digest(f.runtime) as any};
    }};compose();
  });
  const prepare=()=>client.prepare(f.pkg,f.closure,'list',{},empty,randomUUID());
  function resign(request:SignedRemoteRequest) {
    request.signature=sign(null,Buffer.from(canonical(request.document)),controller.privateKey).toString('base64');return request;
  }
  it('uses a non-superuser journal role with no canonical application rights',async()=>{
    const c=await env.pool.connect();try{await c.query('SET ROLE '+role);
      expect((await c.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows).toEqual([{rolsuper:false,rolbypassrls:false}]);
      await expect(c.query('SELECT * FROM engineering_work')).rejects.toThrow('permission denied');
    }finally{await c.query('RESET ROLE');c.release();}
  });
  it('admits once, returns signed exact output, and replays after controller restart',async()=>{
    const command=await prepare();expect((await client.observe(command,'EXECUTE')).status).toBe('COMPLETED');
    compose();expect((await client.observe(command,'EXECUTE')).status).toBe('COMPLETED');
    expect((await client.observe(command)).result?.data).toEqual(empty);expect(calls).toBe(1);
  });
  it('concurrent duplicates never launch a second worker',async()=>{
    let finish!:()=>void,started!:()=>void;const wait=new Promise<void>(r=>finish=r),begin=new Promise<void>(r=>started=r),original=backend.execute;
    backend.execute=async(...args)=>{started();await wait;return original(...args);};
    const command=await prepare(),first=client.observe(command,'EXECUTE');await begin;
    const duplicates=await Promise.all(Array.from({length:8},()=>client.observe(command,'EXECUTE')));
    expect(duplicates.every(r=>r.status==='UNKNOWN')).toBe(true);finish();expect((await first).status).toBe('COMPLETED');expect(calls).toBe(1);
  });
  it('lost response recovers from the durable outcome without another execution',async()=>{
    const command=await prepare();let lost=true;
    const lossy=new RemoteAlphaTasksIsolation(trust(),controller.privateKey,async r=>{const reply=await receiver.receive(r);if(lost){lost=false;throw Error('response lost');}return reply;});
    await expect(lossy.observe(command,'EXECUTE')).rejects.toThrow('response lost');
    expect((await lossy.observe(command)).status).toBe('COMPLETED');expect(calls).toBe(1);
  });
  it('crash after effect before durable completion remains UNKNOWN after restart',async()=>{
    const original=journal.complete.bind(journal);
    journal.complete=async()=>{throw Error('simulated process termination before acknowledgment');};
    const command=await prepare();try{await expect(client.observe(command,'EXECUTE')).rejects.toThrow('simulated process');}
    finally{journal.complete=original;}
    compose();expect((await client.observe(command,'EXECUTE')).status).toBe('UNKNOWN');expect(calls).toBe(1);
  });
  it('claim persisted before launch is never redispatched after process loss',async()=>{
    const command=await prepare();await journal.claim(command.document.binding,command.document.commandDigest);compose();
    expect((await client.observe(command,'EXECUTE')).status).toBe('UNKNOWN');expect(calls).toBe(0);
  });
  it('changed payload cannot reuse an operation, even with a valid signature',async()=>{
    const a=await prepare();await client.observe(a,'EXECUTE');
    const b=await client.prepare(f.pkg,f.closure,'create',{title:'different',priority:'Low'},empty,a.document.binding.operationId);
    await expect(client.observe(b,'EXECUTE')).rejects.toThrow('APP_REMOTE_OPERATION_CONFLICT');expect(calls).toBe(1);
  });
  it.each(['ownerId','installationId','agentId','hostId','enrollmentDigest','originDigest','runtimeDigest','sourceClosureDigest','packageDigest'])('denies signed foreign %s before execution',async key=>{
    const a=await prepare();(a.document.binding as any)[key]=key.endsWith('Digest')?'sha256:'+'f'.repeat(64):'foreign';
    a.document.commandDigest=digest({binding:a.document.binding,execution:a.document.execution});resign(a);
    await expect(receiver.receive(a)).rejects.toThrow();expect(calls).toBe(0);
  });
  it('denies current capability changes on replay and without touching retained outcome',async()=>{
    const a=await prepare();await client.observe(a,'EXECUTE');const before=await journal.read(a.document.binding,a.document.commandDigest);
    allowed=false;await expect(client.observe(a,'EXECUTE')).rejects.toThrow('CURRENT_CAPABILITY_DENIED');
    expect(await journal.read(a.document.binding,a.document.commandDigest)).toEqual(before);expect(calls).toBe(1);
  });
  it.each(['revision','key','expiry','signature','source'])('denies stale or corrupt %s',async kind=>{
    const a=await prepare();
    if(kind==='revision')enrolled.revision++;
    if(kind==='key')enrolled.controllerKeyId='rotated';
    if(kind==='expiry')now+=30001;
    if(kind==='signature')a.signature='A'.repeat(86)+'==';
    if(kind==='source')a.source!.files[0].base64=Buffer.from('tampered').toString('base64');
    await expect(receiver.receive(a)).rejects.toThrow();expect(calls).toBe(0);
  });
  it('missing authority and a revision changed during authorization fail closed',async()=>{
    const a=await prepare();
    const missing=new RemoteIsolationReceiver(trust(),executorKeys.privateKey,journal,backend,async()=>({} as any));
    await expect(missing.receive(a)).rejects.toThrow('APP_REMOTE_AUTHORITY');
    const changed=new RemoteIsolationReceiver(trust(),executorKeys.privateKey,journal,backend,async r=>{
      enrolled.revision++;return {commandDigest:r.commandDigest,enrollmentDigest:r.binding.enrollmentDigest,action:r.action,expiresAt:r.expiresAt};
    });await expect(changed.receive(a)).rejects.toThrow('APP_REMOTE_ENROLLMENT');expect(calls).toBe(0);
  });
  it.each(['enrollment','journal'])('expiry during the last %s await never launches or redispatches',async boundary=>{
    const a=await prepare(),original=journal.read.bind(journal);let enrollmentReads=0,journalReads=0;
    const slowTrust={...trust(),enrollment:async()=>{if(++enrollmentReads===3&&boundary==='enrollment')now+=30001;return structuredClone(enrolled);}};
    journal.read=async(...args)=>{const row=await original(...args);if(++journalReads===2&&boundary==='journal')now+=30001;return row;};
    const slow=new RemoteIsolationReceiver(slowTrust,executorKeys.privateKey,journal,backend,async r=>({commandDigest:r.commandDigest,
      enrollmentDigest:r.binding.enrollmentDigest,action:r.action,expiresAt:r.expiresAt}));
    try {expect((await slow.receive(a)).document.status).toBe('UNKNOWN');}finally{journal.read=original;}
    expect(calls).toBe(0);
    const retry=await client.prepare(f.pkg,f.closure,'list',{},empty,a.document.binding.operationId);
    expect((await client.observe(retry,'EXECUTE')).status).toBe('UNKNOWN');expect(calls).toBe(0);
  });
  it('unavailable cleanup remains PENDING_BACKEND and blocks delayed admission',async()=>{
    const a=await prepare();expect((await client.observe(a,'FENCE')).status).toBe('PENDING_BACKEND');
    expect((await client.observe(a,'EXECUTE')).status).toBe('PENDING_BACKEND');expect(calls).toBe(0);
  });
  it('revoked enrollment still permits exact recovery while new execution is denied',async()=>{
    const a=await prepare();enrolled.active=false;
    await expect(client.observe(a,'EXECUTE')).rejects.toThrow('APP_REMOTE_DISABLED');
    expect((await client.observe(a,'FENCE')).status).toBe('PENDING_BACKEND');expect(calls).toBe(0);
  });
  it('separates authority fencing from confirmed cleanup and idempotent confirmed replay',async()=>{
    const a=await prepare();let cleanup:'UNKNOWN'|'CONFIRMED'='UNKNOWN';
    backend.fence=async(binding,commandDigest)=>{fences++;return {bindingDigest:digest(binding),commandDigest,fenced:true,cleanup};};
    expect((await client.observe(a,'FENCE')).status).toBe('AUTHORITY_FENCED');cleanup='CONFIRMED';
    expect((await client.observe(a,'FENCE')).status).toBe('CLEANUP_CONFIRMED');
    expect((await client.observe(a,'FENCE')).status).toBe('CLEANUP_CONFIRMED');expect(fences).toBe(2);expect(calls).toBe(0);
  });
  it('late worker output cannot overwrite a concurrent fence or change canonical app state',async()=>{
    let finish!:()=>void,started!:()=>void;const wait=new Promise<void>(r=>finish=r),begin=new Promise<void>(r=>started=r),original=backend.execute;
    backend.execute=async(...args)=>{started();await wait;return original(...args);};
    const a=await prepare(),run=client.observe(a,'EXECUTE');await begin;
    expect((await client.observe(a,'FENCE')).status).toBe('PENDING_BACKEND');finish();
    expect((await run).status).toBe('PENDING_BACKEND');expect((await journal.read(a.document.binding,a.document.commandDigest))?.outcome).toBeNull();
  });
  it('unknown execution never becomes a cleaned denial without exact backend evidence',async()=>{
    backend.execute=async()=>{calls++;throw Error('connection lost');};const a=await prepare();
    expect((await client.observe(a,'EXECUTE')).status).toBe('UNKNOWN');
    backend.fence=async()=>{throw Error('host unavailable');};expect((await client.observe(a,'FENCE')).status).toBe('PENDING_BACKEND');
    expect(calls).toBe(1);
  });
  it('foreign cleanup acknowledgment cannot clear the fence hold',async()=>{
    backend.fence=async(_binding,commandDigest)=>({bindingDigest:'sha256:'+'f'.repeat(64),commandDigest,fenced:true,cleanup:'CONFIRMED'});
    const a=await prepare();expect((await client.observe(a,'FENCE')).status).toBe('PENDING_BACKEND');
  });
  it('cleanup is not invoked after its authority expires during journal custody',async()=>{
    const a=await prepare(),original=journal.requestFence.bind(journal);
    journal.requestFence=async(...args)=>{await original(...args);now+=30001;};
    backend.fence=async(binding,commandDigest)=>{fences++;return {bindingDigest:digest(binding),commandDigest,fenced:true,cleanup:'CONFIRMED'};};
    try {await expect(client.observe(a,'FENCE')).rejects.toThrow('APP_REMOTE_RESPONSE');}finally{journal.requestFence=original;}
    expect(fences).toBe(0);expect((await client.observe(a)).status).toBe('PENDING_BACKEND');
  });
  it('qualified backend fencing prevents a delayed launcher after confirmed cleanup',async()=>{
    let release!:()=>void,started!:()=>void;const waiting=new Promise<void>(r=>release=r),begin=new Promise<void>(r=>started=r);
    const fenced=new Set<string>();
    backend.execute=async(_source,_op,_input,_data,id)=>{started();await waiting;if(fenced.has(id))throw new IsolatedExecutionError('CONFIRMED');
      throw Error('unfenced launch would be a test failure');};
    backend.fence=async(binding,commandDigest)=>{fenced.add(binding.operationId);return {bindingDigest:digest(binding),commandDigest,fenced:true,cleanup:'CONFIRMED'};};
    const a=await prepare(),running=client.observe(a,'EXECUTE');await begin;
    expect((await client.observe(a,'FENCE')).status).toBe('CLEANUP_CONFIRMED');release();
    expect((await running).status).toBe('CLEANUP_CONFIRMED');expect(calls).toBe(0);
  });
  it('caller mutation while awaiting authorization cannot replace verified source or input',async()=>{
    const a=await prepare();let release!:()=>void,started!:()=>void;
    const waiting=new Promise<void>(r=>release=r),begin=new Promise<void>(r=>started=r);
    const isolated=new RemoteIsolationReceiver(trust(),executorKeys.privateKey,journal,backend,async r=>{started();await waiting;
      return {commandDigest:r.commandDigest,enrollmentDigest:r.binding.enrollmentDigest,action:r.action,expiresAt:r.expiresAt};});
    const running=isolated.receive(a);await begin;a.source!.files[0].base64=Buffer.from('evil').toString('base64');
    a.document.execution!.operation='create';release();expect((await running).document.status).toBe('COMPLETED');expect(calls).toBe(1);
  });
  it('executor cannot mutate the before-state to hide a read mutation',async()=>{
    backend.execute=async(_source,_op,_input,data,id)=>{data.next=2;return {operationId:id,output:[],data,cleanup:'CONFIRMED',sourceClosureDigest:f.pkg.sourceClosureDigest,runtimeDigest:digest(f.runtime) as any};};
    const a=await prepare();expect((await client.observe(a,'EXECUTE')).status).toBe('UNKNOWN');expect(a.document.execution!.data).toEqual(empty);
  });
  it('transport deadline is UNKNOWN and does not authorize another delivery',async()=>{
    const a=await prepare();a.document.expiresAt=now+5;resign(a);let attempts=0;
    const hanging=new RemoteAlphaTasksIsolation(trust(),controller.privateKey,async()=>{attempts++;return new Promise(()=>{});});
    await expect(hanging.observe(a,'EXECUTE')).rejects.toMatchObject({cleanup:'UNKNOWN'});expect(attempts).toBe(1);
  });
  it('response that expires during final enrollment read is rejected and only fresh readback can recover',async()=>{
    const a=await prepare();let reads=0;
    const slow=new RemoteAlphaTasksIsolation({...trust(),enrollment:async()=>{
      if(++reads===2)now+=30001;return structuredClone(enrolled);
    }},controller.privateKey,r=>receiver.receive(r));
    await expect(slow.observe(a,'EXECUTE')).rejects.toThrow('APP_REMOTE_RESPONSE');
    expect((await client.observe(a)).status).toBe('COMPLETED');expect(calls).toBe(1);
  });
  it('known isolated failure is denied only when cleanup was confirmed',async()=>{
    backend.execute=async()=>{throw new IsolatedExecutionError('CONFIRMED');};const a=await prepare();
    expect((await client.observe(a,'EXECUTE')).status).toBe('DENIED');
  });
  it.each(['signature','binding','request','output'])('rejects a foreign or malformed signed response: %s',async kind=>{
    const a=await prepare();const bad=new RemoteAlphaTasksIsolation(trust(),controller.privateKey,async r=>{
      const reply=await receiver.receive(r);
      if(kind==='binding')reply.document.binding.operationId=randomUUID();
      if(kind==='request')reply.document.requestDigest='sha256:'+'f'.repeat(64);
      if(kind==='output')reply.document.result!.cleanup='UNKNOWN' as any;
      reply.signature=kind==='signature'?'A'.repeat(86)+'==':sign(null,Buffer.from(canonical(reply.document)),executorKeys.privateKey).toString('base64');
      return reply;
    });await expect(bad.observe(a,'EXECUTE')).rejects.toThrow();
  });
  it('adapter maps unauthenticated transport failure to UNKNOWN, never confirmed cleanup',async()=>{
    const broken=new RemoteAlphaTasksIsolation(trust(),controller.privateKey,async()=>{throw Error('offline');});
    await expect(broken.execute(f.pkg,f.closure,'list',{},empty,randomUUID())).rejects.toMatchObject({cleanup:'UNKNOWN'});
  });
  it.skipIf(process.env.MYAPPS_ALPHA_DOCKER_TEST!=='1')('signed loopback through actual offline Docker preserves the existing runtime profile',async()=>{
    compose(journal,new LocalAlphaTasksIsolation(f.runtime));
    const operationId=randomUUID();const result=await client.execute(f.pkg,f.closure,'create',{title:'Signed loopback task',priority:'Low'},empty,operationId);
    expect(result).toMatchObject({operationId,cleanup:'CONFIRMED',data:{next:2,tasks:[{id:1,title:'Signed loopback task',priority:'Low',done:false}]}});
    expect((await env.pool.query('SELECT count(*) FROM myapps_installations')).rows[0].count).toBe('0');
  });
});
