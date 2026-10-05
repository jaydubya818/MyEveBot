import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {digest} from './contract.ts';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {loadMigrations,runMigrations} from '../../scripts/migration-runner.ts';
import {FactoryEvidenceStore} from './factory-evidence-store.ts';
import {FactoryReceiptStore} from './factory-receipt-store.ts';
import {evidenceReference,evidenceSha} from './factory-evidence.ts';
import {WorkStore} from './store.ts';
import {FactoryWorkDriver,factoryExecutionConfigurationHash} from './factory-work-driver.ts';
import {FactoryValidationLifecycle,saveValidationPreparation,readValidationGate} from './factory-validation-lifecycle.ts';
import {FactoryValidationGrantPending} from './factory-live-adapter.ts';

// Never accepts the application's production DATABASE_URL. Dedicated local databases only.
const connection=process.env.MYEVE_VALIDATION_POSTGRES_URL;
const pg=createRequire(import.meta.url)('pg');
describe.skipIf(!connection)('real PostgreSQL validation lifecycle, full canonical lineage',()=>{
 let admin:any,pool:any,upgrade:any;const names=['validation_fresh_','validation_upgrade_'].map(p=>p+randomUUID().replaceAll('-',''));
 const database=(p:any)=>({atomic:async<T,>(action:(db:any)=>Promise<T>)=>{const c=await p.connect();try{await c.query('BEGIN');const result=await action({query:async(sql:string,args?:unknown[])=>(await c.query(sql,args)).rows});await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}},query:async(sql:string,args?:unknown[])=>(await p.query(sql,args)).rows,transaction:async(statements:{sql:string;params?:unknown[]}[])=>{const c=await p.connect();try{await c.query('BEGIN');for(const s of statements)await c.query(s.sql,s.params);await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}});
 beforeAll(async()=>{
  const url=new URL(connection!);if(!['127.0.0.1','localhost'].includes(url.hostname))throw Error('LOCAL_TEST_DATABASE_REQUIRED');
  admin=new pg.Pool({connectionString:connection});
  for(const name of names)await admin.query('CREATE DATABASE '+name);
  url.pathname='/'+names[0];pool=new pg.Pool({connectionString:url.href,max:8});
  url.pathname='/'+names[1];upgrade=new pg.Pool({connectionString:url.href,max:5});
  const migrations=await loadMigrations();await runMigrations(database(pool),migrations,()=>{});
  await runMigrations(database(upgrade),migrations.slice(0,-1),()=>{});
 },120000);
 afterAll(async()=>{await pool?.end();await upgrade?.end();if(admin){for(const name of names)await admin.query('DROP DATABASE IF EXISTS '+name+' WITH (FORCE)');await admin.end();}},30000);
 async function fixture(options:{db?:any;legacy?:boolean;duration?:number;save?:boolean;repository?:string;factoryVersion?:string}={}){
  const p=options.db??pool,store=new WorkStore({scopeId:'disposable-validation-owner',scopeKind:'personal',actorId:'disposable-validation-owner'},database(p));
  const created=await store.create({title:'Immutable preparation regression',objective:'Offline model-free PostgreSQL qualification',repository:options.repository??'fixture/normalizer',criteria:[{id:randomUUID(),statement:'Preserve preparation',method:'test'}],maxCostUsd:1,maxDurationSeconds:180,idempotencyKey:randomUUID()});
  await store.change(created.work.id,{operation:'resume',expectedVersion:created.work.version});
  const work=await store.get(created.work.id);
  const decisionId=randomUUID(),config={connection:{releaseValidation:true,factoryVersion:options.factoryVersion??'f'.repeat(64)},engineering:{}};
  await p.query(`INSERT INTO engineering_routing_decisions(id,scope_id,scope_kind,work_id,work_version,selected_route,reason,source,profile,eligible_routes,rejected_routes,constraints,actor_id)
   VALUES($1,$2,'personal',$3,$4,'MYFACTORY','PostgreSQL regression','POLICY','{}','["MYFACTORY"]','[]','[]',$2)`,[decisionId,store.principal.scopeId,work.id,work.version]);
  const preparation={...(options.legacy?{validationState:'IDLE'}:{validationProtocol:2}),configurationHash:factoryExecutionConfigurationHash(config as never),environment:{binding:{factoryVersion:config.connection.factoryVersion,environmentId:'disposable-cloud',environmentType:'CLOUD'}},request:{requestId:randomUUID(),workId:work.id,workGeneration:work.generation,repository:work.repository,deadline:new Date(Date.now()+(options.duration??180000)).toISOString()}};
  if(options.save!==false){
   if(options.legacy)await p.query('UPDATE engineering_routing_decisions SET factory_preparation=$2 WHERE id=$1',[decisionId,preparation]);
   else await saveValidationPreparation(store,work.id,decisionId,JSON.stringify(preparation));
  }
  const driver=new FactoryWorkDriver(store,{readConfig:async()=>config} as never,{} as never,{} as never,async()=>({} as never));
  const lifecycle=new FactoryValidationLifecycle(store,decisionId);
  const cleanup=vi.spyOn(driver,'stop').mockResolvedValue({} as never);
  const bytes=async()=>(await p.query('SELECT factory_preparation::text AS bytes FROM engineering_routing_decisions WHERE id=$1',[decisionId])).rows[0].bytes;
  return {p,store,work,preparation,decisionId,driver,lifecycle,cleanup,bytes,original:await bytes()};
 }
 const attempt=(f:Awaited<ReturnType<typeof fixture>>)=>vi.spyOn(f.driver as unknown as {stepAttempt:(id:string,guard:()=>Promise<void>)=>Promise<any>},'stepAttempt');
 it('fresh installation and upgrade preserve the failed historical attempt and trigger',async()=>{
  const f=await fixture({db:upgrade,legacy:true});
  await runMigrations(database(upgrade),await loadMigrations(),()=>{});
  expect(await f.bytes()).toBe(f.original);
  expect((await upgrade.query('SELECT count(*) FROM engineering_factory_validation_lifecycle')).rows[0].count).toBe('0');
  await expect(upgrade.query(`UPDATE engineering_routing_decisions SET factory_preparation=jsonb_set(factory_preparation,'{validationState}','"IN_FLIGHT"') WHERE id=$1`,[f.decisionId])).rejects.toThrow('Factory preparation identity is immutable');
  expect(await f.driver.step(f.work.id)).toEqual({state:'HALTED'});expect(await f.lifecycle.read()).toBeNull();
  expect((await pool.query('SELECT name FROM sofie_schema_migrations ORDER BY name DESC LIMIT 1')).rows[0].name).toBe('0081_factory_validation_lifecycle.sql');
 });
 it('atomically saves preparation and lifecycle; invalid binding rolls both back',async()=>{
  const f=await fixture({save:false});const bad={...f.preparation,environment:{binding:{}}};
  await expect(saveValidationPreparation(f.store,f.work.id,f.decisionId,JSON.stringify(bad))).rejects.toThrow();
  expect(await f.bytes()).toBeNull();expect(await f.lifecycle.read()).toBeNull();
  await saveValidationPreparation(f.store,f.work.id,f.decisionId,JSON.stringify(f.preparation));expect((await f.lifecycle.read()).state).toBe('IDLE');
 });
 it('production regression: old claim fails; new actual driver reaches Factory prepare and waits without changing bytes',async()=>{
  const f=await fixture();
  await expect(f.p.query(`UPDATE engineering_routing_decisions SET factory_preparation=jsonb_set(factory_preparation,'{validationState}','"IN_FLIGHT"') WHERE id=$1`,[f.decisionId])).rejects.toThrow('Factory preparation identity is immutable');
  const prepare=vi.fn(async()=>{throw new FactoryValidationGrantPending('pending');});
  vi.spyOn(f.driver,'adapterFor').mockReturnValue({prepare} as never);
  expect(await f.driver.step(f.work.id)).toEqual({state:'WAITING_FOR_AUTHORITY'});expect(prepare).toHaveBeenCalledTimes(1);
  expect((await f.lifecycle.read()).state).toBe('WAITING_GRANT');expect(await f.bytes()).toBe(f.original);
 });
 it('two simultaneous claims have one owner; duplicate delivery is BUSY, never a second intake',async()=>{
  const f=await fixture();let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});let entered!:()=>void;const started=new Promise<void>(r=>{entered=r;});
  const intake=attempt(f).mockImplementation(async()=>{entered();await gate;return {state:'DISPATCHED'};});
  const first=f.driver.step(f.work.id);await started;expect(await f.driver.step(f.work.id)).toEqual({state:'BUSY'});expect(intake).toHaveBeenCalledTimes(1);release();await first;
  expect((await f.lifecycle.read()).state).toBe('IDLE');expect(await f.bytes()).toBe(f.original);
 });
 it('wait, claim, completion persist and terminal duplicate cannot replay',async()=>{
  const f=await fixture(),call=attempt(f).mockRejectedValueOnce(new FactoryValidationGrantPending('pending')).mockResolvedValueOnce({state:'PARTIAL',result:{id:'retained-proof'}});
  await f.driver.step(f.work.id);expect((await f.lifecycle.read()).state).toBe('WAITING_GRANT');await f.driver.step(f.work.id);
  expect((await f.lifecycle.read()).state).toBe('COMPLETED');expect(await f.driver.step(f.work.id)).toEqual({state:'COMPLETED'});expect(call).toHaveBeenCalledTimes(2);expect(await f.bytes()).toBe(f.original);
 });
 it.each(['transport UNKNOWN','digest mismatch','authority revoked','missing evidence'])('failure %s halts permanently without a retry',async reason=>{
  const f=await fixture(),call=attempt(f).mockRejectedValue(Error(reason));await expect(f.driver.step(f.work.id)).rejects.toThrow(reason);
  expect((await f.lifecycle.read()).state).toBe('HALTED');expect(await f.driver.step(f.work.id)).toEqual({state:'HALTED'});expect(call).toHaveBeenCalledTimes(1);expect(await f.bytes()).toBe(f.original);
 });
 it.each(['AWAITING_RESULT','HISTORICAL','NOT_PREPARED','WAITING_FOR_EVIDENCE','STOPPING'])('unproven return %s fails closed',async state=>{
  const f=await fixture();attempt(f).mockResolvedValue({state});expect(await f.driver.step(f.work.id)).toEqual({state:'HALTED'});expect(await f.bytes()).toBe(f.original);
 });
 it('cancellation fences stale claimant, including a delayed completion/error handler',async()=>{
  const f=await fixture(),c=await f.lifecycle.claim();if(c.state!=='CLAIMED')throw Error('claim');
  await f.lifecycle.halt('VALIDATION_CANCELLED');await expect(f.lifecycle.finish(c.claim,'COMPLETED')).rejects.toThrow('FENCED');expect(await f.lifecycle.halt('STALE_ERROR',c.claim)).toBe(false);
  expect((await f.lifecycle.read()).failure).toBe('VALIDATION_CANCELLED');expect(await f.bytes()).toBe(f.original);
 });
 it('completion racing cancellation has one immutable terminal outcome',async()=>{
  const f=await fixture(),c=await f.lifecycle.claim();if(c.state!=='CLAIMED')throw Error('claim');
  await Promise.allSettled([f.lifecycle.finish(c.claim,'COMPLETED'),f.lifecycle.halt('VALIDATION_CANCELLED')]);
  expect(['COMPLETED','HALTED']).toContain((await f.lifecycle.read()).state);expect(await f.lifecycle.halt('late')).toBe(false);expect(await f.bytes()).toBe(f.original);
 });
 it('expired authority rejects late mutations; recovery fences, never reclaims productive execution',async()=>{
  const f=await fixture({duration:1200}),c=await f.lifecycle.claim();if(c.state!=='CLAIMED')throw Error('claim');
  await new Promise(r=>setTimeout(r,1250));await expect(f.lifecycle.finish(c.claim,'COMPLETED')).rejects.toThrow('FENCED');
  expect(await f.lifecycle.claim()).toEqual({state:'HALTED'});expect(await f.lifecycle.claim()).toEqual({state:'HALTED'});expect(await f.bytes()).toBe(f.original);
 });
 it('interrupted controller lease recovery halts with zero duplicate intake',async()=>{
  const f=await fixture(),c=await f.lifecycle.claim();if(c.state!=='CLAIMED')throw Error('claim');
  await f.lifecycle.halt('VALIDATION_INTERRUPTED',c.claim);const call=attempt(f);
  expect(await f.driver.step(f.work.id)).toEqual({state:'HALTED'});expect(call).not.toHaveBeenCalled();await expect(f.lifecycle.assertActive(c.claim)).rejects.toThrow('FENCED');
 });
 it('stale epoch and cross-owner mutations cannot affect the current owner',async()=>{
  const f=await fixture(),one=await f.lifecycle.claim();if(one.state!=='CLAIMED')throw Error('claim');await f.lifecycle.finish(one.claim,'WAITING_GRANT');
  const two=await f.lifecycle.claim();if(two.state!=='CLAIMED')throw Error('claim');await expect(f.lifecycle.finish(one.claim,'COMPLETED')).rejects.toThrow('FENCED');
  expect(await f.lifecycle.halt('stale',one.claim)).toBe(false);
  const foreign=new FactoryValidationLifecycle(new WorkStore({scopeId:'other',scopeKind:'personal',actorId:'other'},f.store.database),f.decisionId);
  expect(await foreign.read()).toBeNull();expect(await foreign.halt('foreign')).toBe(false);await f.lifecycle.assertActive(two.claim);
 });
 it('missing protocol2 lifecycle never falls through to productive execution',async()=>{
  const f=await fixture({save:false});await f.p.query('UPDATE engineering_routing_decisions SET factory_preparation=$2 WHERE id=$1',[f.decisionId,f.preparation]);
  const call=attempt(f);await expect(f.driver.step(f.work.id)).rejects.toThrow('LIFECYCLE_MISSING');expect(call).not.toHaveBeenCalled();
 });
 it('transaction fence rejects a delayed custody/Proof write after cancellation wins',async()=>{
  const f=await fixture(),c=await f.lifecycle.claim();if(c.state!=='CLAIMED')throw Error('claim');
  const fenced=f.lifecycle.fencedStore(c.claim);
  await fenced.database.query('SELECT 1'); // legitimate read before remote wait
  await f.lifecycle.halt('VALIDATION_CANCELLED');
  // Same mutation boundary used by receipt, custody, evidence and Proof stores.
  await expect(fenced.database.query("UPDATE engineering_routing_decisions SET factory_observation='{}' WHERE id=$1",[f.decisionId])).rejects.toThrow('FENCED');
  expect((await f.p.query('SELECT factory_observation FROM engineering_routing_decisions WHERE id=$1',[f.decisionId])).rows[0].factory_observation).toBeNull();
  expect(await f.bytes()).toBe(f.original);
 });
 it('interrupted live lease is recovered by actual driver as cleanup only',async()=>{
  const f=await fixture(),token=randomUUID();
  await f.p.query("UPDATE engineering_factory_validation_lifecycle SET state='IN_FLIGHT',claim_token=$2,claim_epoch=claim_epoch+1,lease_until=clock_timestamp()+interval '100 milliseconds' WHERE decision_id=$1",[f.decisionId,token]);
  await new Promise(r=>setTimeout(r,150));const call=attempt(f);
  expect(await f.driver.step(f.work.id)).toEqual({state:'HALTED'});expect(f.cleanup).toHaveBeenCalled();expect(call).not.toHaveBeenCalled();expect(await f.bytes()).toBe(f.original);
 });

 it('actual EvidenceStore blocks a transport response arriving after cancellation',async()=>{
  const f=await fixture(),c=await f.lifecycle.claim();if(c.state!=='CLAIMED')throw Error('claim');
  const receiptId=randomUUID(),candidate='a'.repeat(40),bytes=Buffer.from('signed patch'),sha=evidenceSha(bytes);
  const binding={workId:f.work.id,workVersion:f.work.version,workGeneration:f.work.generation,requestId:f.preparation.request.requestId,workOrderId:randomUUID(),runId:randomUUID(),factoryVersion:'f'.repeat(64)};
  const manifest={execution:binding,candidate:{commit:candidate,patchArtifactId:'patch',patchDigest:sha},artifacts:[{id:'patch',kind:'patch',sha256:sha,size:bytes.length}],evidence:[]};
  const ref={workOrderId:binding.workOrderId,runId:binding.runId,candidateCommit:candidate,factoryVersion:binding.factoryVersion,id:randomUUID(),kind:'DiffEvidence',mediaType:'text/x-diff',sha256:sha,size:bytes.length,collectedAt:new Date().toISOString(),source:'producer'};
  const mocks=[vi.spyOn(FactoryReceiptStore.prototype,'request').mockResolvedValue({eligible:true,binding} as never),vi.spyOn(FactoryReceiptStore.prototype,'get').mockResolvedValue({state:'ADMITTED',provenance:{manifest}} as never),vi.spyOn(FactoryReceiptStore.prototype,'admission').mockResolvedValue({receipt_id:receiptId} as never)];
  let release!:()=>void,entered!:()=>void;const gate=new Promise<void>(r=>{release=r;}),started=new Promise<void>(r=>{entered=r;});
  const evidence=new FactoryEvidenceStore(f.lifecycle.fencedStore(c.claim));
  const collect=async()=>{entered();await gate;return [{scope:{ownerScope:f.store.principal.scopeId,repository:f.work.repository,...binding},ref,proofReference:evidenceReference(ref as never),bytes}];};
  try{
   const pending=evidence.ingest(f.work.id,randomUUID(),receiptId,{collect} as never);await started;await f.lifecycle.halt('VALIDATION_CANCELLED');release();
   await expect(pending).rejects.toThrow('FENCED');expect((await f.p.query('SELECT count(*) FROM engineering_factory_evidence WHERE work_id=$1',[f.work.id])).rows[0].count).toBe('0');expect(await f.bytes()).toBe(f.original);
  }finally{for(const mock of mocks)mock.mockRestore();}
 });

 it.skipIf(!process.env.MYFACTORY_SOURCE_ROOT)('composed actual Factory authority: valid intake once; revocation during claim denies intake and execution',async()=>{
  const root=process.env.MYFACTORY_SOURCE_ROOT!;
  const load=(path:string)=>import(/* @vite-ignore */ pathToFileURL(join(root,path)).href);
  const [{productionAuthority},{PostgresDispatchStore},{PostgresSpendLedger},{CloudWorkControl},plan,{productionSpendPlan}]=await Promise.all([
   load('apps/cloud-control/src/production-authority.mjs'),load('apps/cloud-control/src/postgres-dispatch.mjs'),load('apps/cloud-control/src/postgres-spend.mjs'),load('apps/cloud-control/src/cloud-work-control.mjs'),load('apps/cloud-control/src/production-validation-plan.mjs'),load('apps/cloud-control/src/production-execution-plan.mjs')]);
  const schema='validation_factory_'+randomUUID().replaceAll('-','');await pool.query('CREATE SCHEMA '+schema);
  const rewrite=(sql:string)=>sql.replace(/\bfactory\.(production_work_authority|protect_production_authority|work_spend_budgets|work_spend_operations|intake_receipts|delivery_intents|verification_resources|execution_resources|candidate_custody|work_orders|runs|events)\b/g,schema+'.$1').replace(/IN SCHEMA factory\b/g,'IN SCHEMA '+schema);
  const query=(sql:string,args?:unknown[])=>pool.query(rewrite(sql),args),isolated={connect:async()=>{const c=await pool.connect();return{query:(sql:string,args?:unknown[])=>c.query(rewrite(sql),args),release:()=>c.release()};}};
  for(const file of ['002-canonical-execution-ledger','004-canonical-dispatch','005-cloud-custody','006-cloud-verification','008-production-work-authority'])await query(await readFile(join(root,'apps/cloud-control/migrations/'+file+'.sql'),'utf8'));
  const configuration=plan.validationConfiguration,grant=plan.validationSourceGrant,sourceDigest='a'.repeat(64),configurationDigest=digest(configuration),factoryVersion=digest({sourceDigest,configurationDigest}),installation={ownerScope:'disposable-validation-owner'};
  const assertAuthority=productionAuthority({installation,sourceDigest,configuration,contractSha256:plan.validationContractSha256,clientId:grant.clientId,candidateSha256:plan.validationCandidateSha256});
  const {productionVerifierPolicy:policy,productionVerifierPolicySha256:policySha256}=await load('apps/cloud-control/src/production-verifier-policy.mjs');
  const factory=new PostgresDispatchStore(isolated,{custodyPrefix:'factory/production',assertAuthority,verificationPolicySha256:policySha256}),spend=new PostgresSpendLedger(isolated);
  const control=new CloudWorkControl({store:factory,spend,grant:{...grant,ownerScope:installation.ownerScope},configuration,sourceDigest,signing:{factoryId:'myfactory-cloud-production'},executionSpendPlan:productionSpendPlan,verificationPolicy:{policy,policySha256}});
  for(const revoked of [false,true]){
   const f=await fixture({repository:grant.source.repository,factoryVersion}),r=f.preparation.request;
   const request={protocol:'MYFACTORY_EXECUTION_V2',...r,source:grant.source,maxSpendUsd:1,input:{title:'Disposable lifecycle',description:'Actual production authority, no providers',kind:'feature',acceptanceCriteria:['Bounded'],allowedPaths:grant.allowedPaths,checkCommands:grant.commands}};
   const manifest={version:1,clientId:grant.clientId,ownerScope:installation.ownerScope,sourceDigest,configurationDigest,factoryVersion,contractSha256:plan.validationContractSha256,candidateSha256:plan.validationCandidateSha256,environment:'CLOUD_PRODUCTION',publication:false,request};
   await query("INSERT INTO factory.production_work_authority(request_id,work_id,client_id,manifest,manifest_sha256,state) VALUES($1,$2,$3,$4,$5,'AUTHORIZED')",[r.requestId,r.workId,grant.clientId,manifest,digest(manifest)]);
   let prepared:any;
   const prepare=async()=>{if(revoked)await query("UPDATE factory.production_work_authority SET state='REVOKED' WHERE request_id=$1",[r.requestId]);prepared=await control.prepare(request);throw Error('OFFLINE_STOP_AFTER_AUTHORIZED_INTAKE');};
   vi.spyOn(f.driver,'adapterFor').mockReturnValue({prepare} as never);
   await expect(f.driver.step(f.work.id)).rejects.toThrow(revoked?'PRODUCTION_WORK_NOT_AUTHORIZED':'OFFLINE_STOP_AFTER_AUTHORIZED_INTAKE');
   expect((await query('SELECT count(*) FROM factory.intake_receipts WHERE request_id=$1',[r.requestId])).rows[0].count).toBe(revoked?'0':'1');
   if(!revoked){
    expect((await control.prepare(request)).runId).toBe(prepared.runId); // Factory idempotency, no second intake
    await query("UPDATE factory.production_work_authority SET state='REVOKED' WHERE request_id=$1",[r.requestId]);
    const identity={runId:randomUUID(),dispatchIdentity:randomUUID(),writerGeneration:1,workId:r.workId,workGeneration:r.workGeneration,requestId:r.requestId,repository:r.repository,deadline:r.deadline,baseSha:grant.source.commit,allowedPaths:grant.allowedPaths,factoryId:prepared.snapshot.factoryId,factoryVersion,workOrderId:prepared.workOrderId,remoteRunId:prepared.runId};
    await expect(factory.claim(grant.clientId,identity)).rejects.toThrow('PRODUCTION_WORK_NOT_AUTHORIZED');
   }
   expect(await f.bytes()).toBe(f.original);expect((await f.lifecycle.read()).state).toBe('HALTED');
  }
  expect((await query('SELECT count(*) FROM factory.execution_resources')).rows[0].count).toBe('0');expect((await query('SELECT count(*) FROM factory.work_spend_operations')).rows[0].count).toBe('0');
 });

 it('retained Proof cannot qualify an interrupted lifecycle; only exact COMPLETED permits further verification',async()=>{
  for(const completed of [false,true]){
   const f=await fixture(),c=await f.lifecycle.claim();if(c.state!=='CLAIMED')throw Error('claim');
   const proof={outcome:'PARTIAL',fixture:'retained before lifecycle finalization'};
   await f.lifecycle.fencedStore(c.claim).database.query(`INSERT INTO engineering_native_results(id,scope_id,scope_kind,work_id,candidate_sha,work_version,work_generation,proof,content_hash)
    VALUES($1,$2,'personal',$3,$4,$5,$6,$7,$8)`,[randomUUID(),f.store.principal.scopeId,f.work.id,'a'.repeat(40),f.work.version,f.work.generation,proof,digest(proof)]);
   expect((await readValidationGate(f.store,f.work)).state).toBe('AWAITING_EVIDENCE');
   if(completed)await f.lifecycle.finish(c.claim,'COMPLETED');else await f.lifecycle.halt('VALIDATION_INTERRUPTED',c.claim);
   expect((await readValidationGate(f.store,f.work)).state).toBe(completed?'COMPLETED':'BLOCKED');
   expect((await f.p.query('SELECT count(*) FROM engineering_native_results WHERE work_id=$1',[f.work.id])).rows[0].count).toBe('1');expect(await f.bytes()).toBe(f.original);
  }
 });

});
