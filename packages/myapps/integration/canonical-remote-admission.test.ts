import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {generateKeyPairSync,randomUUID} from 'node:crypto';
import pg from 'pg';
import {capabilityRegistry} from '@mission-control/capability-control';
import {assertCapabilityAdmission} from '../../capability-enforcement/src/postgres.ts';
import {Env,connection} from '../../../apps/eve/lib/external-alpha/work-test-fixture.ts';
import {AlphaTasksApps,type AlphaTasksHost} from '../../../apps/eve/lib/myapps/alpha-tasks.ts';
import {RemoteAlphaTasksIsolation,RemoteIsolationReceiver,type RemoteRequest,type SignedRemoteRequest} from '../src/alpha-tasks/remote-isolation.ts';
import {digest} from '../src/alpha-tasks/contracts.ts';
import {PostgresRemoteDeliveryJournal} from '../src/alpha-tasks/remote-journal.ts';
// @ts-ignore Existing public inert fixture, no external execution.
import {fixture} from '../test/alpha-tasks/fixtures.mjs';

describe.skipIf(!connection)('canonical remote admission custody (ordinary-role PostgreSQL)',()=>{
 let env:Env,role:string,pool:pg.Pool,apps:AlphaTasksApps,host:AlphaTasksHost;
 let client:RemoteAlphaTasksIsolation,wire:SignedRemoteRequest,trust:any,executorKey:any;
 let started:Promise<void>,release:()=>void,pending:Promise<any>|undefined,request:RemoteRequest,clock:number;
 const f=fixture(),owner=f.pkg.origin.ownerId,installation=f.pkg.origin.installationId,id=f.pkg.appId;
 const principal={ownerId:owner,actorId:owner,kind:'human' as const,allowedOperations:['apps.read','apps.manage','apps.install','apps.run']};
 const identity={ownerId:owner,installationId:installation,agentId:'fixture-agent',hostId:'fixture-host',enrollmentDigest:'a'.repeat(64)};
 beforeEach(async()=>{
  clock=Date.now();pending=undefined;env=await Env.create();role='remote_admit_'+env.name.slice(8);
  for(const name of ['migration','enforcement','decisions','ordering','lifecycle'])
   await env.pool.query(await readFile(new URL('../../../docs/capability-control/'+name+'.sql',import.meta.url),'utf8'));
  const password=randomUUID();await env.pool.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
  await env.pool.query(`GRANT USAGE ON SCHEMA public,capability_control TO ${role}`);
  await env.pool.query(`GRANT SELECT ON ALL TABLES IN SCHEMA capability_control TO ${role}`);
  await env.pool.query(`GRANT EXECUTE ON FUNCTION capability_control.lock_admission_policy(text,text,text) TO ${role}`);
  for(const {tablename} of (await env.pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'myapps_%'")).rows)
   await env.pool.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ${tablename} TO ${role}`);
  await env.pool.query(`GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO ${role}`);
  const ids=capabilityRegistry.capabilities.map(item=>item.id);
  const facts=Object.fromEntries(capabilityRegistry.capabilities.map(item=>[item.id,{supported:true,deployed:true,entitled:true,
   administrator:'ALLOW',setup:Object.fromEntries(item.setupRequirements.map(key=>[key,true])),
   qualification:Object.fromEntries(item.qualificationRequirements.map(key=>[key,'QUALIFIED'])),lifecycle:'ACTIVE'}]));
  await env.pool.query("INSERT INTO capability_control.installations VALUES($1,'fixture-organization','qualification',true)",[installation]);
  await env.pool.query('INSERT INTO capability_control.owner_state(installation_id,owner_id,preferences) VALUES($1,$2,$3)',[installation,owner,Object.fromEntries(ids.map(id=>[id,'ENABLED']))]);
  await env.pool.query("INSERT INTO capability_control.evidence VALUES($1,'fixture-organization',$2,$3,$4,clock_timestamp()-interval '1 second',clock_timestamp()+interval '1 hour','fixture-evidence')",[installation,owner,capabilityRegistry.version,facts]);
  await env.pool.query("INSERT INTO capability_control.relay_agent_evidence VALUES($1,$2,'fixture-organization','fixture-agent',1,$3,'ACTIVE',clock_timestamp()+interval '1 hour','fixture-agent-record')",[installation,owner,JSON.stringify(ids)]);
  const url=new URL(connection!);url.pathname='/'+env.name;url.username=role;url.password=password;pool=new pg.Pool({connectionString:url.href});
  let announce!:()=>void;started=new Promise(resolve=>announce=resolve);const held=new Promise<void>(resolve=>release=resolve);
  const keys=generateKeyPairSync('ed25519'),executor=generateKeyPairSync('ed25519');
  const enrollment={...identity,revision:1,controllerKeyId:'controller',executorKeyId:'executor',profile:f.runtime,active:true,expiresAt:clock+3600000};
  const {enrollmentDigest:_unused,...enrolled}=enrollment;const {active:_active,...immutable}=enrolled;
  identity.enrollmentDigest=digest(immutable);
  trust={enrollment:async()=>enrolled,controllerPublicKey:keys.publicKey,executorPublicKey:executor.publicKey,now:()=>clock};executorKey=executor.privateKey;
  client=new RemoteAlphaTasksIsolation(trust,keys.privateKey,async()=>{throw Error('No transport installed');});
  host={runtimeId:'canonical-admission-fixture',target:'synthetic',enabled:()=>true,receivingIdentity:()=>({...identity}),assertProfile:()=>{},
   authorize:async(c,p,origin)=>{
    expect(p.ownerId).toBe(owner);expect(origin).toEqual(f.pkg.origin);
    const policy=await assertCapabilityAdmission(c,{ownerId:owner,organizationId:'fixture-organization',installationId:installation,environment:'qualification',agentId:'fixture-agent'},
     {capabilityId:'myapps',workId:origin.workId,workGeneration:1,budgetMicros:0});
    return {workVersion:1,workGeneration:1,policyRevision:policy.policyRevision};
   },source:async()=>f.closure,execute:async(pkg,source,op,input,data,operationId)=>{
    wire=await client.prepare(pkg,source,op,input,data,operationId);request=wire.document;announce();await held;
    return {operationId,output:[],data,cleanup:'CONFIRMED',sourceClosureDigest:pkg.sourceClosureDigest,runtimeDigest:digest(pkg.runtime)};
   }};
  apps=new AlphaTasksApps(pool as any,host);await apps.prepare(principal,f.pkg);
  await env.pool.query('UPDATE myapps_installations SET state=state||$1::jsonb WHERE owner_id=$2 AND app_id=$3',
   [JSON.stringify({enabled:true,installedVersion:1,installedDigest:digest(f.pkg)}),owner,id]);
 },30000);
 afterEach(async()=>{release?.();await pending;await pool?.end();if(env){if(role){await env.pool.query('DROP OWNED BY '+role);await env.pool.query('DROP ROLE '+role);}await env.close();}});
 async function reserve(preview=false,p=principal){
  pending=(preview?apps.preview(p,id,1):apps.operate(p,id,1,digest(f.pkg),'list',{},randomUUID())).then(value=>({value}),error=>({error}));
  await started;return (await env.pool.query('SELECT * FROM myapps_receipts WHERE execution_admission IS NOT NULL')).rows[0];
 }
 const authorize=(r=request,p=principal)=>apps.authorizeRemote(r,async()=>p,()=>clock);
 async function runtime(sql:string,args:unknown[]=[]){const c=await pool.connect();try{await c.query('BEGIN');await c.query("SELECT set_config('myeve.myapps_owner',$1,true)",[owner]);const result=await c.query(sql,args);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 for(const preview of [false,true])it(`positively revalidates ${preview?'preview':'invoke'} with durable exact custody`,async()=>{
  const row=await reserve(preview);expect(row.execution_admission).toMatchObject({ownerId:owner,actorId:owner,kind:'human',mode:preview?'PREVIEW':'INVOKE',receivingIdentity:identity,
   requestHash:row.request_hash,receiptId:row.id,operationId:request.binding.operationId,executionDigest:request.executionDigest});
  expect(await authorize()).toEqual({commandDigest:request.commandDigest,enrollmentDigest:identity.enrollmentDigest,action:'EXECUTE',expiresAt:request.expiresAt});
  expect(await authorize()).toEqual(await authorize());
  release();expect((await pending).error).toBeUndefined();
  expect((await env.pool.query('SELECT execution_admission FROM myapps_receipts WHERE id=$1',[row.id])).rows[0].execution_admission).toEqual(row.execution_admission);
  await expect(authorize()).rejects.toThrow('APP_REMOTE_ADMISSION');
  expect((await authorize({...request,action:'READ',execution:null})).action).toBe('READ');
 });
 for(const field of ['installationId','agentId','hostId','enrollmentDigest','operationId','packageDigest','originDigest','runtimeDigest','sourceClosureDigest'] as const)
  it(`rejects changed receiving ${field}`,async()=>{await reserve();const r=structuredClone(request);r.binding[field]=field==='operationId'?randomUUID():'b'.repeat(64);r.commandDigest=digest({binding:r.binding,executionDigest:r.executionDigest});await expect(authorize(r)).rejects.toThrow('APP_REMOTE_ADMISSION');});
 for(const change of ['foreign-owner','foreign-actor','agent-impersonation','permission','execution','request-digest','expired','future','old-wire','current-enrollment'] as const)
  it(`rejects ${change}`,async()=>{await reserve();const r=structuredClone(request),p=structuredClone(principal);
   if(change==='foreign-owner')p.ownerId='other-owner';if(change==='foreign-actor')p.actorId='other-actor';
   if(change==='agent-impersonation')(p as any).kind='agent';if(change==='permission')p.allowedOperations=['apps.read'];
   if(change==='execution')r.execution!.input={extra:true};if(change==='request-digest')r.commandDigest='b'.repeat(64);
   if(change==='expired')clock=r.expiresAt;if(change==='future')r.issuedAt=clock+1;
   if(change==='old-wire')(r as any).schema='myapps.remote-isolation.request/v1';if(change==='current-enrollment')host.receivingIdentity=()=>({...identity,hostId:'replacement'});
   await expect(authorize(r,p)).rejects.toThrow();
  });
 for(const expression of ["execution_admission='{}'::jsonb","execution_admission=NULL","execution_admission=jsonb_set(execution_admission,'{actorId}','\"other\"')","owner_id='other'","app_id='other'","request_hash='other'","id='other'"])
  it(`ordinary role cannot mutate admitted custody: ${expression}`,async()=>{const row=await reserve();await expect(runtime('UPDATE myapps_receipts SET '+expression+' WHERE id=$1',[row.id])).rejects.toThrow('MYAPPS_EXECUTION_ADMISSION_IMMUTABLE');});
 it('ordinary role cannot delete custody; legal status transition preserves it',async()=>{
  const row=await reserve();await expect(runtime('DELETE FROM myapps_receipts WHERE id=$1',[row.id])).rejects.toThrow('MYAPPS_EXECUTION_ADMISSION_IMMUTABLE');
  await runtime("UPDATE myapps_receipts SET response=response||'{\"status\":\"UNKNOWN\",\"cleanup\":\"UNKNOWN\"}'::jsonb WHERE id=$1",[row.id]);
  await expect(authorize()).rejects.toThrow('APP_REMOTE_ADMISSION');
  expect((await authorize({...request,action:'FENCE',execution:null})).action).toBe('FENCE');
  expect((await env.pool.query('SELECT execution_admission FROM myapps_receipts WHERE id=$1',[row.id])).rows[0].execution_admission).toEqual(row.execution_admission);
  release();expect((await pending).error?.message).toBe('APP_OPERATION_FENCED');
 });
 it('historical null custody cannot be filled or authorize execution',async()=>{
  const row=await reserve(),legacy=randomUUID();await runtime('INSERT INTO myapps_receipts(owner_id,app_id,id,request_hash,response) VALUES($1,$2,$3,$4,$5)',[owner,id,legacy,row.request_hash,{status:'RUNNING',operationId:legacy}]);
  await expect(runtime('UPDATE myapps_receipts SET execution_admission=$1 WHERE id=$2',[{...row.execution_admission,receiptId:legacy,operationId:legacy},legacy])).rejects.toThrow('MYAPPS_EXECUTION_ADMISSION_IMMUTABLE');
  const r=structuredClone(request);r.binding.operationId=legacy;r.commandDigest=digest({binding:r.binding,executionDigest:r.executionDigest});await expect(authorize(r)).rejects.toThrow('APP_REMOTE_ADMISSION');
 });
 for(const update of ["preferences=jsonb_set(preferences,'{myapps}','\"DISABLED\"')","controls='{\"myapps\":\"REVOKE_REQUESTED\"}'::jsonb","controls='{\"myapps\":\"PAUSE_REQUESTED\"}'::jsonb","revision=revision+1"])
  it(`current capability policy denies ${update} while retaining recovery`,async()=>{
   const row=await reserve();await env.pool.query('UPDATE capability_control.owner_state SET '+update);
   await expect(authorize()).rejects.toThrow();
   expect((await authorize({...request,action:'FENCE',execution:null})).action).toBe('FENCE');
   expect((await env.pool.query('SELECT execution_admission FROM myapps_receipts WHERE id=$1',[row.id])).rows[0].execution_admission).toEqual(row.execution_admission);
  });
 for(const update of ["UPDATE capability_control.evidence SET expires_at=clock_timestamp()-interval '1 second'","UPDATE capability_control.relay_agent_evidence SET status='REVOKED'","UPDATE myapps_candidates SET revoked=true","UPDATE myapps_installations SET state=jsonb_set(state,'{revision}',to_jsonb((state->>'revision')::int+1))","UPDATE myapps_installations SET state=jsonb_set(state,'{dataRevision}',to_jsonb((state->>'dataRevision')::int+1))","UPDATE myapps_installations SET state=jsonb_set(state,'{enabled}','false')"])
  it(`rejects stale custody or policy: ${update}`,async()=>{await reserve();await env.pool.query(update);await expect(authorize()).rejects.toThrow();});
 it('original Sofie session can execute and read but cannot owner-fence',async()=>{
  const agent={...principal,actorId:'sofie:authenticated-session',kind:'agent' as const};
  await reserve(false,agent as any);expect((await authorize(request,agent as any)).action).toBe('EXECUTE');
  expect((await authorize({...request,action:'READ',execution:null},agent as any)).action).toBe('READ');
  await expect(authorize({...request,action:'FENCE',execution:null},agent as any)).rejects.toThrow('APP_REMOTE_RECOVERY_DENIED');
  expect((await authorize({...request,action:'FENCE',execution:null},principal)).action).toBe('FENCE');
 });
 it('local-only admission remains local and cannot acquire remote identity later',async()=>{
  host.receivingIdentity=undefined;await reserve();host.receivingIdentity=()=>({...identity});await expect(authorize()).rejects.toThrow('APP_REMOTE_ADMISSION');
 });
 it('fresh authentication failure cannot use the durable owner receipt',async()=>{await reserve();await expect(apps.authorizeRemote(request,async()=>{throw Error('UNAUTHENTICATED');})).rejects.toThrow('UNAUTHENTICATED');});
 it('lease expiry during current policy validation denies authorization',async()=>{await reserve();const original=host.authorize;host.authorize=async(...args)=>{const value=await original(...args);clock=request.expiresAt;return value;};await expect(authorize()).rejects.toThrow('APP_REMOTE_ADMISSION');});
 it('recovery rejects non-owner fencing and changed command fingerprint',async()=>{
  await reserve();const recovery={...request,action:'FENCE' as const,execution:null};
  await expect(authorize(recovery,{...principal,actorId:'foreign'})).rejects.toThrow('APP_REMOTE_RECOVERY_DENIED');
  recovery.executionDigest='b'.repeat(64);recovery.commandDigest=digest({binding:recovery.binding,executionDigest:recovery.executionDigest});await expect(authorize(recovery)).rejects.toThrow('APP_REMOTE_ADMISSION');
 });

 for(const crashed of [false,true])it(`composes signed canonical admission and separate backend custody (${crashed?'lost outcome':'positive replay'})`,async()=>{
  await reserve();const remote=await Env.create();let calls=0;
  try {
   await remote.pool.query(await readFile(new URL('../src/alpha-tasks/remote-isolation.sql',import.meta.url),'utf8'));
   await remote.pool.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
   await remote.pool.query(`GRANT SELECT,INSERT,UPDATE ON myapps_remote_delivery TO ${role}`);
   const journal=new PostgresRemoteDeliveryJournal({query:async(sql,values)=>{const c=await remote.pool.connect();try{await c.query('SET ROLE '+role);return await c.query(sql,values);}finally{await c.query('RESET ROLE');c.release();}}});
   const receiver=new RemoteIsolationReceiver(trust,executorKey,journal,{execute:async(_source,_operation,_input,data,operationId)=>{
    calls++;return {operationId,data,output:[],cleanup:'CONFIRMED',sourceClosureDigest:f.pkg.sourceClosureDigest,runtimeDigest:digest(f.runtime)};
   }},r=>authorize(r));
   if(crashed)expect(await journal.claim(request.binding,request.commandDigest)).toBe(true);
   expect((await receiver.receive(wire)).document.status).toBe(crashed?'UNKNOWN':'COMPLETED');
   expect((await receiver.receive(wire)).document.status).toBe(crashed?'UNKNOWN':'COMPLETED');
   expect(calls).toBe(crashed?0:1);
   await env.pool.query("UPDATE capability_control.owner_state SET preferences=jsonb_set(preferences,'{myapps}','\"DISABLED\"')");
   await expect(receiver.receive(wire)).rejects.toThrow('Capability admission denied');
   // The client signs READ/FENCE itself; recovery keeps the exact admitted fingerprint.
   const recoveryClient=new RemoteAlphaTasksIsolation(trust,generateKeyPairSync('ed25519').privateKey,r=>receiver.receive(r));
   // A foreign key must not gain recovery authority even with exact retained identities.
   await expect(recoveryClient.observe(wire,'READ')).rejects.toThrow('APP_REMOTE_SIGNATURE');
   const retained=await journal.read(request.binding,request.commandDigest);
   expect(retained?.outcome?.status??'UNKNOWN').toBe(crashed?'UNKNOWN':'COMPLETED');
   expect((await authorize({...request,action:'FENCE',execution:null})).action).toBe('FENCE');
  } finally {await remote.pool.query('DROP OWNED BY '+role);await remote.close();}
 });
 it('ordinary-role insert rejects mismatched receipt binding and duplicate operation identity',async()=>{
  const row=await reserve();const copy={...row.execution_admission,receiptId:randomUUID()};
  await expect(runtime('INSERT INTO myapps_receipts(owner_id,app_id,id,request_hash,response,execution_admission) VALUES($1,$2,$3,$4,$5,$6)',[owner,id,copy.receiptId,row.request_hash,{status:'RUNNING',operationId:randomUUID()},copy])).rejects.toThrow('MYAPPS_EXECUTION_ADMISSION_BINDING');
  await expect(runtime('INSERT INTO myapps_receipts(owner_id,app_id,id,request_hash,response,execution_admission) VALUES($1,$2,$3,$4,$5,$6)',[owner,id,copy.receiptId,row.request_hash,row.response,copy])).rejects.toThrow('myapps_execution_operation_identity');
 });
 it('disable committed before waiting admission is observed after policy row lock',async()=>{
  await reserve();const c=await env.pool.connect();await c.query('BEGIN');await c.query("UPDATE capability_control.owner_state SET preferences=jsonb_set(preferences,'{myapps}','\"DISABLED\"')");
  const admission=authorize().then(value=>({value}),error=>({error}));await c.query('COMMIT');c.release();expect((await admission as any).error).toBeDefined();
 });
});
