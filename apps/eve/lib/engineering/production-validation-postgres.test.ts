import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
import {readFile,writeFile} from 'node:fs/promises';
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
import * as productionRuntime from './production-runtime-guard.ts';
import * as routing from '../digital-worker/routing.ts';
import {manifestForSnapshot} from './base-preflight.ts';
import {materializeValidationGrant} from '../../scripts/production-validation-materializer.ts';
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
  await runMigrations(database(upgrade),migrations.filter(m => m.name <= '0081_factory_validation_lifecycle.sql'),()=>{});
 },120000);
 afterAll(async()=>{await pool?.end();await upgrade?.end();if(admin){for(const name of names)await admin.query('DROP DATABASE IF EXISTS '+name+' WITH (FORCE)');await admin.end();}},30000);
 async function fixture(options:{db?:any;legacy?:boolean;duration?:number;save?:boolean;repository?:string;factoryVersion?:string;owner?:string;maxCost?:number;noDecision?:boolean}={}){
  const p=options.db??pool,owner=options.owner??'disposable-validation-owner',store=new WorkStore({scopeId:owner,scopeKind:'personal',actorId:owner},database(p));
  const created=await store.create({title:'Immutable preparation regression',objective:'Offline model-free PostgreSQL qualification',repository:options.repository??'fixture/normalizer',criteria:[{id:randomUUID(),statement:'Preserve preparation',method:'test'}],maxCostUsd:options.maxCost??1,maxDurationSeconds:180,idempotencyKey:randomUUID()});
  await store.change(created.work.id,{operation:'resume',expectedVersion:created.work.version});
  const work=await store.get(created.work.id);
  const decisionId=randomUUID(),config={connection:{releaseValidation:true,factoryVersion:options.factoryVersion??'f'.repeat(64)},engineering:{}};
  if(!options.noDecision)await p.query(`INSERT INTO engineering_routing_decisions(id,scope_id,scope_kind,work_id,work_version,selected_route,reason,source,profile,eligible_routes,rejected_routes,constraints,actor_id)
   VALUES($1,$2,'personal',$3,$4,'MYFACTORY','PostgreSQL regression','POLICY','{}','["MYFACTORY"]','[]','[]',$2)`,[decisionId,store.principal.scopeId,work.id,work.version]);
  const preparation={...(options.legacy?{validationState:'IDLE'}:{validationProtocol:2}),configurationHash:factoryExecutionConfigurationHash(config as never),environment:{binding:{factoryVersion:config.connection.factoryVersion,environmentId:'disposable-cloud',environmentType:'CLOUD'}},request:{requestId:randomUUID(),workId:work.id,workGeneration:work.generation,repository:work.repository,deadline:new Date(Date.now()+(options.duration??180000)).toISOString()}};
  if(options.save!==false){
   if(options.legacy)await p.query('UPDATE engineering_routing_decisions SET factory_preparation=$2 WHERE id=$1',[decisionId,preparation]);
   else await saveValidationPreparation(store,work.id,decisionId,JSON.stringify(preparation));
  }
  const driver=new FactoryWorkDriver(store,{readConfig:async()=>config} as never,{} as never,{} as never,async()=>({} as never));
  const lifecycle=new FactoryValidationLifecycle(store,decisionId);
  const cleanup=vi.spyOn(driver,'stop').mockResolvedValue({} as never);
  const bytes=async()=>(await p.query('SELECT factory_preparation::text AS bytes FROM engineering_routing_decisions WHERE id=$1',[decisionId])).rows[0]?.bytes;
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
  expect((await pool.query('SELECT name FROM sofie_schema_migrations ORDER BY name DESC LIMIT 1')).rows[0].name).toBe('0090_external_alpha_terminal_settlement.sql');
 });
 it('deterministically reproduces the legacy materializer state-read race twice with the exact failing predicate',async()=>{
  const evidence=[];
  for(let repeat=0;repeat<2;repeat++){
   const f=await fixture(),first=await f.lifecycle.claim();if(first.state!=='CLAIMED')throw Error('claim');
   await f.lifecycle.finish(first.claim,'WAITING_GRANT');
   const sample=async()=>{const [row]=(await pool.query(`SELECT l.decision_id,l.work_id,l.work_version,l.work_generation,l.request_id,l.state,l.claim_epoch,l.claim_token,l.updated_at,l.deadline,l.xmin::text AS row_version,
    txid_current()::text AS transaction_id,pg_backend_pid() AS backend_pid,clock_timestamp() AS observed_at FROM engineering_factory_validation_lifecycle l WHERE decision_id=$1`,[f.decisionId])).rows;const {claim_token,...safe}=row;return {...safe,fencingTokenDigest:claim_token?digest(claim_token):null};};
   // The original operator ended its poll on this unlocked state.
   const preliminary=await sample();expect(preliminary.state).toBe('WAITING_GRANT');
   // Controlled barrier: the actual controller claims the same request before
   // the operator's later authoritative predicate read. No fake SQL responses.
   const claimant=await f.lifecycle.claim();if(claimant.state!=='CLAIMED')throw Error('claim');
   const row=(await pool.query('SELECT w.version,d.factory_preparation FROM engineering_work w JOIN engineering_routing_decisions d ON d.work_id=w.id WHERE d.id=$1',[f.decisionId])).rows[0];
   const authoritative=await sample(),p=row.factory_preparation.request;
   const predicates={work_version:row.version===2,protocol:row.factory_preparation.validationProtocol===2,no_mutable_preparation:!('validationState' in row.factory_preparation),lifecycle_present:!!authoritative,request_identity:authoritative.request_id===p.requestId,lifecycle_state_is_waiting:authoritative.state==='WAITING_GRANT',lifecycle_work_version:authoritative.work_version===2,lifecycle_work_generation:authoritative.work_generation===2};
   const failed=Object.entries(predicates).filter(([,ok])=>!ok).map(([name])=>name);
   expect(failed).toEqual(['lifecycle_state_is_waiting']);expect(authoritative.state).toBe('IN_FLIGHT');
   expect(authoritative.transaction_id).not.toBe(preliminary.transaction_id);expect(authoritative.row_version).not.toBe(preliminary.row_version);
   expect(await f.bytes()).toBe(f.original);
   evidence.push({repeat,classification:'CONFIRMED_REPRODUCED_DEFECT_NOT_RETROSPECTIVE_INCIDENT_PROOF',error:'LIFECYCLE_GRANT_WAIT_REQUIRED',failedPredicates:failed,preliminary,authoritative,changedBetweenReads:true,preparationDigest:digest(f.preparation),grantMaterialized:false});
   await f.lifecycle.finish(claimant.claim,'WAITING_GRANT');
  }
  if(process.env.MYEVE_GRANT_RACE_EVIDENCE_PATH)await writeFile(process.env.MYEVE_GRANT_RACE_EVIDENCE_PATH,JSON.stringify(evidence,null,2)+'\n');
 });
 it('atomically saves preparation and lifecycle; invalid binding rolls both back',async()=>{
  const f=await fixture({save:false});const bad={...f.preparation,environment:{binding:{}}};
  await expect(saveValidationPreparation(f.store,f.work.id,f.decisionId,JSON.stringify(bad))).rejects.toThrow();
  expect(await f.bytes()).toBeNull();expect(await f.lifecycle.read()).toBeNull();
  await saveValidationPreparation(f.store,f.work.id,f.decisionId,JSON.stringify(f.preparation));expect((await f.lifecycle.read()).state).toBe('IDLE');
 });
 it('a lifecycle cannot be born with a concrete grant binding',async()=>{
  const f=await fixture({save:false});
  const p={...f.preparation,authorizationEnvelopeSha256:'a'.repeat(64)};
  await pool.query('UPDATE engineering_routing_decisions SET factory_preparation=$2 WHERE id=$1',[f.decisionId,p]);
  await expect(pool.query(`INSERT INTO engineering_factory_validation_lifecycle(decision_id,scope_id,scope_kind,work_id,work_version,work_generation,request_id,configuration_hash,factory_version,environment_binding,deadline,grant_sha256)
   VALUES($1,$2,'personal',$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[f.decisionId,f.store.principal.scopeId,f.work.id,f.work.version,f.work.generation,p.request.requestId,p.configurationHash,p.environment.binding.factoryVersion,p.environment.binding,p.request.deadline,'b'.repeat(64)])).rejects.toThrow('initial state');
  expect(await f.lifecycle.read()).toBeNull();
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


 it.skipIf(!process.env.MYFACTORY_SOURCE_ROOT)('exact paid successor materializer preserves predecessor and installs only after canonical lifecycle checks',async()=>{
  const root=process.env.MYFACTORY_SOURCE_ROOT!,load=(path:string)=>import(/* @vite-ignore */ pathToFileURL(join(root,path)).href);
  const plan=await load('apps/cloud-control/src/production-execution-plan.mjs');
  const sourceDigest='a'.repeat(64),configurationDigest=digest(plan.productionConfiguration),factoryVersion=digest({sourceDigest,configurationDigest});
  const f=await fixture({save:false,repository:plan.productionSourceGrant.source.repository,factoryVersion,owner:'successor-owner-a'});
  const schema='successor_operator_'+randomUUID().replaceAll('-',''),rewrite=(s:string)=>s.replaceAll("'factory.","'EVENTPREFIX.").replace(/\bfactory\./g,schema+'.').replace(/\bfactory\b/g,schema).replaceAll("'EVENTPREFIX.","'factory.");
  const query=(s:string,a?:unknown[])=>pool.query(rewrite(s),a);
  for(const file of ['001-staging-boundary','002-canonical-execution-ledger','004-canonical-dispatch','005-cloud-custody','006-cloud-verification','007-production-installation-boundary','008-production-work-authority','009-paid-operation-release','010-three-owner-authority'])await query(await readFile(join(root,'apps/cloud-control/migrations/'+file+'.sql'),'utf8'));
  const binding={slot:'A',clientId:'sofie-alpha-a',ownerScope:f.store.principal.scopeId,sourceProjectId:'prj_fixtureA',factoryProjectId:'prj_4hfceCN8l6wN1gUyYOzZLQ7aJapK',environment:'production',rosterSha256:'e'.repeat(64)};
  const installation={projectId:binding.factoryProjectId,databaseResourceId:'dry-morning-22844424',custodyStoreId:'store_qBuivS8MmRxnBNnU',ownerScope:'owner'};
  await query("UPDATE factory.environment SET environment='production',project_id=$1,database_resource_id=$2,custody_store_id=$3,owner_scope='owner'",[installation.projectId,installation.databaseResourceId,installation.custodyStoreId]);
  const oldRequest={workId:randomUUID(),requestId:randomUUID(),workGeneration:2},oldRun=randomUUID(),oldOrder=randomUUID(),now=new Date().toISOString();
  const oldManifest={request:oldRequest,ownerScope:binding.ownerScope,authorizationEnvelope:{approval:{ownerBinding:binding}}};
  await query("INSERT INTO factory.work_orders(id,record,state) VALUES($1,'{}','cancelled')",[oldOrder]);await query("INSERT INTO factory.runs(id,work_order_id,record,state) VALUES($1,$2,'{}','cancelled')",[oldRun,oldOrder]);
  await query("INSERT INTO factory.intake_receipts(client_id,request_id,work_id,work_generation,input_digest,work_order_id,run_id,request,snapshot,deadline) VALUES($1,$2,$3,2,$4,$5,$6,$7,'{}',clock_timestamp())",[binding.clientId,oldRequest.requestId,oldRequest.workId,digest(oldRequest),oldOrder,oldRun,oldRequest]);
  await query("INSERT INTO factory.production_work_authority(request_id,work_id,client_id,manifest,manifest_sha256,state,consumed_at) VALUES($1,$2,$3,$4,$5,'REVOKED',$6)",[oldRequest.requestId,oldRequest.workId,binding.clientId,oldManifest,digest(oldManifest),now]);
  await query("INSERT INTO factory.work_spend_budgets(work_id,work_generation,request_id,work_order_id,ceiling_microusd,deadline,cancelled_at,created_at,contract_version,authority_state) VALUES($1,2,$2,$3,1000000,$4,$4,$4,'WORK_LEDGER_V2','fenced')",[oldRequest.workId,oldRequest.requestId,oldOrder,now]);
  await query("INSERT INTO factory.execution_resources(run_id,provider_name,state,lease_owner,lease_expires_at,deadline,cleanup_confirmed) VALUES($1,$2,'DESTROYED',$3,clock_timestamp(),clock_timestamp(),true)",[oldRun,'fixture-'+oldRun,randomUUID()]);
  for(const type of ['factory.stop_requested','factory.terminal'])await query("INSERT INTO factory.events(work_order_id,run_id,type,payload) VALUES($1,$2,$3,$4)",[oldOrder,oldRun,type,{status:'CANCELLED'}]);
  const before=(await query('SELECT * FROM factory.intake_receipts')).rows;
  const {version,pricingRevision,plannedProductiveOperations,plannedCompletionOperations,maxPaidOperations,completionReserveMicrousd}=plan.productionSpendPlan;
  const spend={version,pricingRevision,plannedProductiveOperations,plannedCompletionOperations,maxPaidOperations,completionReserveMicrousd};
  const request={protocol:'MYFACTORY_EXECUTION_V2',requestId:null,deadline:null,workId:f.work.id,workGeneration:2,repository:f.work.repository,source:plan.productionSourceGrant.source,maxSpendUsd:1,input:{title:f.work.title,description:f.work.objective,kind:'feature',acceptanceCriteria:f.work.criteria.map(c=>c.statement),checkCommands:plan.productionSourceGrant.commands,allowedPaths:plan.productionSourceGrant.allowedPaths}};
  const configurationHash='c'.repeat(64),environmentBinding={factoryVersion,environmentId:'disposable-cloud',environmentType:'CLOUD'};
  const approval={workVersion:2,configurationHash,environmentBinding,criteria:f.work.criteria,canonicalSpendPlan:spend,ownerBinding:binding,installation,historicalGrants:[{requestId:oldRequest.requestId,workId:oldRequest.workId,manifestSha256:digest(oldManifest),consumedAt:now}],manifestTemplate:{version:1,clientId:binding.clientId,ownerScope:binding.ownerScope,sourceDigest,configurationDigest,factoryVersion,contractSha256:plan.productionExecutionContractSha256,candidateSha256:null,environment:'CLOUD_PRODUCTION',publication:false,request},successorIntake:{version:1,clientId:binding.clientId,workId:f.work.id,workGeneration:2,maxIntakes:1,predecessor:{...oldRequest,runId:oldRun,inputDigest:digest(oldRequest),manifestSha256:digest(oldManifest)}}};
  const envelope={version:1,expiresAt:new Date(Date.now()+300000).toISOString(),approval},sha256=digest(envelope),deadline=new Date(Date.now()+170000).toISOString(),requestId=randomUUID();
  const p={validationProtocol:2,configurationHash,authorizationEnvelopeSha256:sha256,environment:{binding:environmentBinding},request:{spendContract:spend,requestId,deadline,workId:f.work.id,workGeneration:2,repository:f.work.repository,maxSpendUsd:1,input:{...request.input,reproductionCommand:null,expectedFailureText:null,baseRef:request.source.commit,workerProfile:'container'}}};
  await saveValidationPreparation(f.store,f.work.id,f.decisionId,JSON.stringify(p));const claim=await f.lifecycle.claim();if(claim.state!=='CLAIMED')throw Error('claim');await f.lifecycle.finish(claim.claim,'WAITING_GRANT');
  const o=await pool.connect(),g=await pool.connect(),events:any[]=[];try{
   const result=await materializeValidationGrant(o,{query:(s,a)=>g.query(rewrite(s),a)},approval,async e=>{events.push(e);},{maxAttempts:1,maxWaitMs:0,waitMs:1},{envelope,sha256});expect(result.state).toBe('INSTALLED');
   expect((await query('SELECT * FROM factory.intake_receipts')).rows).toEqual(before);expect((await query("SELECT count(*) FROM factory.production_work_authority WHERE state='AUTHORIZED'")).rows[0].count).toBe('1');expect((await query('SELECT count(*) FROM factory.work_spend_operations')).rows[0].count).toBe('0');
   expect((await f.lifecycle.read()).state).toBe('WAITING_GRANT');expect(JSON.parse(await f.bytes())).toEqual(p);expect(events.at(-1).event).toBe('INSTALLED');
  }finally{o.release();g.release();}
 });

 describe.skipIf(!process.env.MYFACTORY_SOURCE_ROOT)('atomic operator grant boundary',()=>{
  const operatorEvidence:any[]=[];
  afterAll(async()=>{if(process.env.MYEVE_GRANT_OPERATOR_EVIDENCE_PATH)await writeFile(process.env.MYEVE_GRANT_OPERATOR_EVIDENCE_PATH,JSON.stringify(operatorEvidence,null,2)+'\n');});
  async function operatorFixture(duration=180000){
   const root=process.env.MYFACTORY_SOURCE_ROOT!,load=(path:string)=>import(/* @vite-ignore */ pathToFileURL(join(root,path)).href);
   const plan=await load('apps/cloud-control/src/production-validation-plan.mjs');
   const sourceDigest='a'.repeat(64),configurationDigest=digest(plan.validationConfiguration),factoryVersion=digest({sourceDigest,configurationDigest});
   const f=await fixture({save:false,duration,repository:plan.validationSourceGrant.source.repository,factoryVersion});
   const {productionSpendPlan}=await load('apps/cloud-control/src/production-execution-plan.mjs');
   const {version,pricingRevision,plannedProductiveOperations,plannedCompletionOperations,maxPaidOperations,completionReserveMicrousd}=productionSpendPlan;
   const spendPlan={version,pricingRevision,plannedProductiveOperations,plannedCompletionOperations,maxPaidOperations,completionReserveMicrousd};
   const source={sha:plan.validationSourceGrant.source.commit,files:{'fixture.txt':'offline serializer qualification'}};
   const config={connection:{releaseValidation:true,factoryVersion,source:plan.validationSourceGrant.source,spendPlan},engineering:{profile:{repository:f.work.repository,allowedPaths:plan.validationSourceGrant.allowedPaths},approvedBase:manifestForSnapshot(source)},commands:plan.validationSourceGrant.commands};
   const authority={readConfig:async()=>config,assess:async()=>({selection:{route:'MYFACTORY'},contract:{deadline:f.preparation.request.deadline,budgetUsd:1},environment:f.preparation.environment})};
   const driver=new FactoryWorkDriver(f.store,authority as never,{} as never,{} as never,async()=>source);
   // Only route eligibility and the subsequent external step are stubbed. The
   // real production start serializer, preparation save and SQL trigger execute.
   const route=vi.spyOn(routing,'decideExecutionRoute').mockReturnValue({admitted:true} as never),step=vi.spyOn(driver,'step').mockResolvedValue({state:'OFFLINE_SERIALIZER_STOP'} as never);
   try{await driver.start(f.work.id,f.work.version,f.work.generation);}finally{route.mockRestore();step.mockRestore();}
   const preparation=(await pool.query('SELECT factory_preparation FROM engineering_routing_decisions WHERE id=$1',[f.decisionId])).rows[0].factory_preparation;
   expect(preparation.request.input.reproductionCommand).toBeNull();expect(preparation.request.input.expectedFailureText).toBeNull();expect(preparation.request.spendContract).toEqual(spendPlan);
   const {requestId,workId,workGeneration,repository,deadline,maxSpendUsd}=preparation.request;
   const {title,description,kind,acceptanceCriteria,checkCommands,allowedPaths}=preparation.request.input;
   const r={requestId,workId,workGeneration,repository,deadline,maxSpendUsd,input:{title,description,kind,acceptanceCriteria,checkCommands,allowedPaths}};
   const schema='operator_factory_'+randomUUID().replaceAll('-','');
   const rewrite=(sql:string)=>sql.replace(/\bfactory\b/g,schema);
   const query=(sql:string,args?:unknown[])=>pool.query(rewrite(sql),args);
   for(const file of ['001-staging-boundary','002-canonical-execution-ledger','004-canonical-dispatch','007-production-installation-boundary','008-production-work-authority','009-paid-operation-release','010-three-owner-authority'])await query(await readFile(join(root,'apps/cloud-control/migrations/'+file+'.sql'),'utf8'));
   const installation={projectId:'prj_4hfceCN8l6wN1gUyYOzZLQ7aJapK',databaseResourceId:'dry-morning-22844424',custodyStoreId:'store_qBuivS8MmRxnBNnU'};
   await query(`UPDATE factory.environment SET environment='production',project_id=$1,database_resource_id=$2,custody_store_id=$3,owner_scope=$4`,[installation.projectId,installation.databaseResourceId,installation.custodyStoreId,f.store.principal.scopeId]);
   const manifestTemplate={version:1,clientId:plan.validationSourceGrant.clientId,ownerScope:f.store.principal.scopeId,sourceDigest,configurationDigest,factoryVersion,contractSha256:plan.validationContractSha256,candidateSha256:plan.validationCandidateSha256,environment:'CLOUD_PRODUCTION',publication:false,
    request:{protocol:'MYFACTORY_EXECUTION_V2',...r,source:plan.validationSourceGrant.source,requestId:null,deadline:null}};
   const approval={canonicalSpendPlan:spendPlan,workVersion:f.work.version,configurationHash:preparation.configurationHash,environmentBinding:preparation.environment.binding,criteria:f.work.criteria,manifestTemplate,installation,historicalGrants:[] as {requestId:string;workId:string;manifestSha256:string}[]};
   const evidence:any[]=[],clients:any[]=[];
   async function connection(factory=false){const c=await pool.connect();clients.push(c);return {query:(sql:string,args?:unknown[])=>c.query(factory?rewrite(sql):sql,args),raw:c};}
   const owner=await connection(),factory=await connection(true);
   async function wait(){const claim=await f.lifecycle.claim();if(claim.state!=='CLAIMED')throw Error('claim');await f.lifecycle.finish(claim.claim,'WAITING_GRANT');}
   async function run(audit:(event:any)=>Promise<void>=async()=>{},bounds={maxAttempts:20,maxWaitMs:5000,waitMs:1},o:any=owner,g:any=factory){return materializeValidationGrant(o,g,approval,async event=>{evidence.push(event);operatorEvidence.push(event);await audit(event);},bounds);}
   const original=await f.bytes();
   const check=async(count:number)=>{expect((await query('SELECT count(*) FROM factory.production_work_authority')).rows[0].count).toBe(String(count));expect(await f.bytes()).toBe(original);expect((await query('SELECT count(*) FROM factory.work_spend_operations')).rows[0].count).toBe('0');};
   return {...f,approval,preparation,owner,factory,query,connection,wait,run,evidence,check,close:()=>clients.forEach(c=>c.release())};
  }
  it('A: eligible lifecycle installs once; exact readback never duplicates authority',async()=>{
   const f=await operatorFixture();try{await f.wait();expect((await f.run()).alreadyPresent).toBe(false);expect((await f.run()).alreadyPresent).toBe(true);await f.check(1);expect((await f.lifecycle.read()).state).toBe('WAITING_GRANT');
    expect(f.evidence.find(e=>e.event==='LOCKED_DECISION').failedPredicates).toEqual([]);
   }finally{f.close();}
  });
  it('B: early materializer waits within the original request and deadline',async()=>{
   const f=await operatorFixture();try{let madeEligible=false;await f.run(async e=>{if(e.event==='BOUNDED_WAIT'&&!madeEligible){madeEligible=true;await f.wait();}});await f.check(1);
    expect(f.evidence.some(e=>e.event==='BOUNDED_WAIT'&&e.predicate==='LIFECYCLE_GRANT_WAIT_REQUIRED')).toBe(true);
   }finally{f.close();}
  });
  it('C: controlled change after preliminary read cannot drive a stale decision',async()=>{
   const f=await operatorFixture();try{await f.wait();let barrier=false,controllerClaim:any;
    const owner={query:async(sql:string,args?:unknown[])=>{const result=await f.owner.query(sql,args);if(sql.includes('l.xmin')&&!sql.includes('FOR UPDATE')&&!barrier){barrier=true;controllerClaim=await f.lifecycle.claim();expect(controllerClaim.state).toBe('CLAIMED');}return result;}};
    await f.run(async e=>{if(e.event==='BOUNDED_WAIT'&&controllerClaim){await f.lifecycle.finish(controllerClaim.claim,'WAITING_GRANT');controllerClaim=null;}},undefined,owner);
    const decision=f.evidence.find(e=>e.event==='LOCKED_DECISION');expect(decision.preliminary.state).toBe('WAITING_GRANT');expect(decision.authoritative.state).toBe('IN_FLIGHT');expect(decision.changedBetweenReads).toBe(true);expect(decision.failedPredicates).toEqual(['lifecycle_state_is_waiting']);await f.check(1);
   }finally{f.close();}
  });
  it('D: two independent materializers install exactly one authority',async()=>{
   const f=await operatorFixture();try{await f.wait();const o2=await f.connection(),g2=await f.connection(true);let release!:()=>void,entered!:()=>void;const gate=new Promise<void>(r=>release=r),ready=new Promise<void>(r=>entered=r);
    const first=f.run(async e=>{if(e.event==='CLAIM_DURABLE'){entered();await gate;}});await ready;
    const second=f.run(async e=>{if(e.event==='BOUNDED_WAIT')release();},undefined,o2,g2);const results=await Promise.all([first,second]);expect(results.map(r=>r.alreadyPresent).sort()).toEqual([false,true]);await f.check(1);
   }finally{f.close();}
  });
  it('E: original deadline expiry during wait installs no authority',async()=>{
   const f=await operatorFixture(600);try{await expect(f.run(async e=>{if(e.event==='BOUNDED_WAIT')await pool.query('SELECT pg_sleep(0.7)');})).rejects.toThrow('DEADLINE_EXPIRED');await f.check(0);}finally{f.close();}
  });
  it('F: lifecycle halt during wait installs no authority',async()=>{
   const f=await operatorFixture();try{await expect(f.run(async e=>{if(e.event==='BOUNDED_WAIT')await f.lifecycle.halt('VALIDATION_CANCELLED');})).rejects.toThrow('TERMINAL_ATTEMPT');await f.check(0);}finally{f.close();}
  });
  it('F: a committed stop command before eligibility denies authority',async()=>{
   const f=await operatorFixture();try{await f.wait();await pool.query(`INSERT INTO engineering_factory_commands(id,scope_id,scope_kind,work_id,work_version,work_generation,operation) VALUES($1,$2,'personal',$3,$4,$5,'stop')`,[randomUUID(),f.store.principal.scopeId,f.work.id,f.work.version,f.work.generation]);await expect(f.run()).rejects.toThrow('no_stop_command');await f.check(0);}finally{f.close();}
  });
  it('G: revoked historical authority is byte-preserved beside a single successor',async()=>{
   const f=await operatorFixture();try{const old={...f.approval.manifestTemplate,request:{...f.preparation.request,workId:randomUUID(),requestId:randomUUID()}};
    await f.query(`INSERT INTO factory.production_work_authority(request_id,work_id,client_id,manifest,manifest_sha256,state) VALUES($1,$2,'sofie-production-validation',$3,$4,'REVOKED')`,[old.request.requestId,old.request.workId,old,digest(old)]);
    const before=(await f.query('SELECT row_to_json(a)::text AS bytes FROM factory.production_work_authority a')).rows[0].bytes;
    f.approval.historicalGrants.push({requestId:old.request.requestId,workId:old.request.workId,manifestSha256:digest(old)});await f.wait();await f.run();await f.check(2);
    expect((await f.query('SELECT row_to_json(a)::text AS bytes FROM factory.production_work_authority a WHERE request_id=$1',[old.request.requestId])).rows[0].bytes).toBe(before);
   }finally{f.close();}
  });
  it('H: restarting a bounded pre-effect waiter cannot duplicate authority',async()=>{
   const f=await operatorFixture();try{await expect(f.run(undefined,{maxAttempts:1,maxWaitMs:1,waitMs:1})).rejects.toThrow('WAIT_BOUND_EXHAUSTED');await f.check(0);await f.wait();await f.run();expect((await f.run()).alreadyPresent).toBe(true);await f.check(1);}finally{f.close();}
  });
  it('deadline crossing before Factory commit rolls the grant back and halts',async()=>{
   const f=await operatorFixture(1000);try{await f.wait();await expect(f.run(async e=>{if(e.event==='FACTORY_COMMIT_DECISION')await pool.query('SELECT pg_sleep(1.1)');})).rejects.toThrow('GRANT_UNKNOWN_REQUIRES_READBACK');await f.check(0);expect((await f.lifecycle.read()).state).toBe('HALTED');}finally{f.close();}
  });
  it('halt after durable claim and before Factory installation denies the write',async()=>{
   const f=await operatorFixture();try{await f.wait();await expect(f.run(async e=>{if(e.event==='CLAIM_DURABLE')await f.lifecycle.halt('VALIDATION_CANCELLED');})).rejects.toThrow('GRANT_UNKNOWN_REQUIRES_READBACK');await f.check(0);}finally{f.close();}
  });
  it('Factory operator lock contention is bounded and cannot install late authority',async()=>{
   const f=await operatorFixture();const blocker=await pool.connect();try{await f.wait();await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock(81427601)');await expect(f.run()).rejects.toThrow('GRANT_UNKNOWN_REQUIRES_READBACK');await f.check(0);expect((await f.lifecycle.read()).state).toBe('HALTED');}finally{await blocker.query('ROLLBACK');blocker.release();f.close();}
  });
  it('a revoked matching grant is never revived by restart',async()=>{
   const f=await operatorFixture();try{await f.wait();await f.run();await f.query("UPDATE factory.production_work_authority SET state='REVOKED'");await expect(f.run()).rejects.toThrow('GRANT_UNKNOWN_REQUIRES_READBACK');await f.check(1);expect((await f.query('SELECT state FROM factory.production_work_authority')).rows[0].state).toBe('REVOKED');}finally{f.close();}
  });
  it('connection loss after durable claim cannot activate the controller',async()=>{
   const f=await operatorFixture();try{
    await f.wait();await expect(f.run(async e=>{if(e.event==='CLAIM_DURABLE'){const pid=(await f.owner.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;f.owner.raw.on('error',()=>{});await pool.query('SELECT pg_terminate_backend($1)',[pid]);}})).rejects.toThrow('GRANT_UNKNOWN_REQUIRES_READBACK');
    expect((await f.lifecycle.claim()).state).toBe('BUSY');await f.check(0);
    const next=await f.connection();await expect(f.run(undefined,{maxAttempts:1,maxWaitMs:1,waitMs:1},next)).rejects.toThrow('WAIT_BOUND_EXHAUSTED');await f.lifecycle.halt('DISPOSABLE_CLEANUP');await f.check(0);
   }finally{f.close();}
  });
  it('ambiguous Factory commit never releases the durable claim or retries installation',async()=>{
   const f=await operatorFixture();try{await f.wait();let commits=0;
    const factory={query:async(sql:string,args?:unknown[])=>{const result=await f.factory.query(sql,args);if(sql==='COMMIT'){commits++;throw Error('injected lost commit acknowledgement');}return result;}};
    await expect(f.run(undefined,undefined,undefined,factory)).rejects.toThrow('GRANT_UNKNOWN_REQUIRES_READBACK');expect(commits).toBe(1);expect((await f.lifecycle.read()).state).toBe('HALTED');expect((await f.query('SELECT state FROM factory.production_work_authority')).rows[0].state).toBe('REVOKED');await f.check(1);
    expect(f.evidence.some(e=>e.event==='ACTIVATION_COMMIT_DECISION')).toBe(false);expect(f.evidence.at(-1).possiblyActivated).toBe(false);
   }finally{f.close();}
  });
  it('lost activation acknowledgement is possibly activated; no second release or grant',async()=>{
   const f=await operatorFixture();try{await f.wait();let commits=0;const owner={query:async(sql:string,args?:unknown[])=>{const result=await f.owner.query(sql,args);if(sql==='COMMIT'&&++commits===2)throw Error('injected lost activation acknowledgement');return result;}};
    await expect(f.run(undefined,undefined,owner)).rejects.toThrow('GRANT_UNKNOWN_REQUIRES_READBACK');expect(commits).toBe(2);expect(f.evidence.at(-1).possiblyActivated).toBe(true);expect((await f.lifecycle.read()).state).toBe('HALTED');expect((await f.query('SELECT state FROM factory.production_work_authority')).rows[0].state).toBe('REVOKED');await f.check(1);
   }finally{f.close();}
  });
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
 describe.skipIf(!process.env.MYFACTORY_SOURCE_ROOT)('paid approval materialization: real PostgreSQL',()=>{
  async function paidFixture(options:{slot?:string;schema?:string;historicalGrants?:any[]}={}){
   const root=process.env.MYFACTORY_SOURCE_ROOT!,load=(path:string)=>import(/* @vite-ignore */ pathToFileURL(join(root,path)).href);
   const plan=await load('apps/cloud-control/src/production-execution-plan.mjs');
   const sourceDigest='a'.repeat(64),configurationDigest=digest(plan.productionConfiguration),factoryVersion=digest({sourceDigest,configurationDigest});
   const alpha=!!options.slot,owner=alpha?'disposable-alpha-'+options.slot:'disposable-validation-owner';
   const f=await fixture({save:false,repository:plan.productionSourceGrant.source.repository,factoryVersion,owner,maxCost:alpha?1.3:1,noDecision:alpha});
   const {version,pricingRevision,plannedProductiveOperations,plannedCompletionOperations,maxPaidOperations,completionReserveMicrousd}=plan.productionSpendPlan;
   const spendPlan={version,pricingRevision,plannedProductiveOperations,plannedCompletionOperations,maxPaidOperations,completionReserveMicrousd};
   const source={sha:plan.productionSourceGrant.source.commit,files:{'fixture.txt':'offline qualification'}};
   const config={connection:{productionCanary:true,factoryVersion,source:plan.productionSourceGrant.source,spendPlan,authorizationEnvelopeSha256:''},engineering:{profile:{repository:f.work.repository,allowedPaths:plan.productionSourceGrant.allowedPaths},approvedBase:manifestForSnapshot(source)},commands:plan.productionSourceGrant.commands};
   const request={protocol:'MYFACTORY_EXECUTION_V2',requestId:null,deadline:null,workId:f.work.id,workGeneration:f.work.generation,repository:f.work.repository,source:plan.productionSourceGrant.source,maxSpendUsd:1,input:{title:f.work.title,description:f.work.objective,kind:'feature',acceptanceCriteria:f.work.criteria.map(c=>c.statement),checkCommands:config.commands,allowedPaths:config.engineering.profile.allowedPaths}};
   const pins=await load('apps/cloud-control/src/production-installation.mjs');
   const installation={projectId:pins.productionProjectId,databaseResourceId:pins.productionDatabaseResourceId,custodyStoreId:pins.productionCustodyStoreId,...(alpha?{ownerScope:'disposable-personal-host'}:{})};
   const ownerBinding=alpha?{slot:options.slot,clientId:'sofie-alpha-'+options.slot!.toLowerCase(),ownerScope:owner,sourceProjectId:'prj_disposable'+options.slot,rosterSha256:'d'.repeat(64),environment:'production',factoryProjectId:pins.productionProjectId}:undefined;
   const manifestTemplate={version:1,clientId:ownerBinding?.clientId??'sofie-production',ownerScope:f.store.principal.scopeId,sourceDigest,configurationDigest,factoryVersion,contractSha256:plan.productionExecutionContractSha256,candidateSha256:null,environment:'CLOUD_PRODUCTION',publication:false,request};
   if(alpha){
    const agentId='disposable-sofie-'+options.slot;
    await pool.query(`INSERT INTO agents(id,owner_id,name,slug,role,instructions,is_primary,status,max_estimated_cost_usd,max_runtime_seconds,max_steps)
      VALUES($1,$2,'Sofie','sofie','engineer','Disposable SQL qualification',true,'active',1.3,180,5) ON CONFLICT(id) DO NOTHING`,[agentId,owner]);
    const agent=(await pool.query('SELECT updated_at::text AS revision FROM agents WHERE id=$1',[agentId])).rows[0];
    Object.assign(config.engineering,{conversationQualification:{mode:'THREE_OWNER_CONVERSATION_V1',factoryCeilingMicrousd:1000000}});
    const reservation={id:randomUUID(),token:randomUUID(),scope:owner,actor:owner,work:f.work.id,version:f.work.version,generation:f.work.generation,agent:agentId,agentRevision:agent.revision,policyHash:digest(config),policyVersion:1,budgetVersion:1,ceiling:300000,deadline:f.preparation.request.deadline,maxCalls:2,session:'disposable',step:'disposable:0',request:'a'.repeat(64),purpose:'CONVERSATION_REASONING',provider:'vercel-gateway/openai',model:'openai/gpt-5.4-mini',exposure:150000,pricing:{input:'0.00000075',output:'0.0000045'},bounds:{inputBytes:100,maxOutputTokens:1024,alphaFactory:{mode:'THREE_OWNER_CONVERSATION_V1',stage:'admission'}}};
    // Canonical reservation/custody/accounting SQL with no provider dispatch.
    await pool.query('SELECT engineering_model_reserve($1::jsonb)',[reservation]);
    for(const patch of [{operation:'dispatch',policyHash:reservation.policyHash},{operation:'retain',result:{disposable:true},resultHash:'b'.repeat(64),receipt:{microUsd:2000},semantics:'INCREMENTAL'},{operation:'reconcile',actual:2000}])await pool.query('SELECT engineering_model_transition($1::jsonb)',[{...reservation,...patch}]);
    const allocation=(await pool.query('SELECT * FROM engineering_alpha_work_budget WHERE work_id=$1',[f.work.id])).rows[0];
    expect(allocation.authority_class).toBe('THREE_OWNER_CONVERSATION_V1');expect(Number(allocation.factory_microusd)).toBe(1000000);
    await expect(pool.query('UPDATE engineering_alpha_work_budget SET factory_microusd=1050000 WHERE work_id=$1',[f.work.id])).rejects.toThrow();
    await pool.query(`INSERT INTO engineering_routing_decisions(id,scope_id,scope_kind,work_id,work_version,selected_route,reason,source,profile,eligible_routes,rejected_routes,constraints,actor_id)
      VALUES($1,$2,'personal',$3,$4,'MYFACTORY','Disposable SQL qualification','POLICY','{}','["MYFACTORY"]','[]','[]',$2)`,[f.decisionId,owner,f.work.id,f.work.version]);
   }
   const approval={canonicalSpendPlan:spendPlan,workVersion:f.work.version,configurationHash:factoryExecutionConfigurationHash(config as never),environmentBinding:f.preparation.environment.binding,criteria:f.work.criteria,manifestTemplate,installation,historicalGrants:options.historicalGrants??[],...(ownerBinding?{ownerBinding}:{})};
   const envelope={version:1,expiresAt:new Date(Date.now()+300000).toISOString(),approval},sha256=digest(envelope);
   config.connection.authorizationEnvelopeSha256=sha256;
   const authority={readConfig:async()=>config,assess:async()=>({selection:{route:'MYFACTORY'},contract:{deadline:f.preparation.request.deadline,budgetUsd:1},environment:f.preparation.environment})};
   const driver=new FactoryWorkDriver(f.store,authority as never,{} as never,{} as never,async()=>source);
   const guard=vi.spyOn(productionRuntime,'productionCloudConfiguration').mockReturnValue({mode:'CLOUD_PRODUCTION_CANARY',authorizationEnvelope:envelope,authorizationSha256:sha256} as never);
   const route=vi.spyOn(routing,'decideExecutionRoute').mockReturnValue({admitted:true} as never);
   try{await Promise.all([driver.start(f.work.id,f.work.version,f.work.generation),driver.start(f.work.id,f.work.version,f.work.generation)]);}finally{guard.mockRestore();route.mockRestore();}
   const preparation=(await pool.query('SELECT factory_preparation FROM engineering_routing_decisions WHERE id=$1',[f.decisionId])).rows[0].factory_preparation;
   const schema=options.schema??'paid_operator_'+randomUUID().replaceAll('-',''),rewrite=(sql:string)=>sql.replace(/\bfactory\b/g,schema);
   const query=(sql:string,args?:unknown[])=>pool.query(rewrite(sql),args);
   if(!options.schema)for(const file of ['001-staging-boundary','002-canonical-execution-ledger','004-canonical-dispatch','007-production-installation-boundary','008-production-work-authority','009-paid-operation-release','010-three-owner-authority'])await query(await readFile(join(root,'apps/cloud-control/migrations/'+file+'.sql'),'utf8'));
   if(!options.schema)await query("UPDATE factory.environment SET environment='production',project_id=$1,database_resource_id=$2,custody_store_id=$3,owner_scope=$4",[installation.projectId,installation.databaseResourceId,installation.custodyStoreId,installation.ownerScope??f.store.principal.scopeId]);
   const clients:any[]=[];
   const client=async(factory=false)=>{const c=await pool.connect();clients.push(c);return {query:(sql:string,args?:unknown[])=>c.query(factory?rewrite(sql):sql,args),release:()=>{clients.splice(clients.indexOf(c),1);c.release();}};};
   const run=async(approved=envelope,expected=sha256)=>{
    const owner=await client(),factory=await client(true);
    try{return await materializeValidationGrant(owner,factory,approval,async()=>{},{maxAttempts:2,maxWaitMs:100,waitMs:1},{envelope:approved,sha256:expected});}
    finally{owner.release();factory.release();}
   };
   return {...f,schema,plan,sourceDigest,configurationDigest,factoryVersion,installation,preparation,envelope,sha256,approval,query,run,load,close:()=>clients.forEach(c=>c.release())};
  }
  it('three alpha owners preserve settled personal and prior-owner history through real accounting and preparation',async()=>{
   const fixtures:Awaited<ReturnType<typeof paidFixture>>[]=[],history:any[]=[];let schema:string|undefined;
   async function settled(query:(sql:string,args?:unknown[])=>Promise<any>,clientId:string){
    const work=randomUUID(),order=randomUUID(),run=randomUUID(),request=randomUUID(),now=new Date().toISOString();
    await query("INSERT INTO factory.work_orders(id,record,state) VALUES($1,'{}','ready_for_review')",[order]);
    await query("INSERT INTO factory.runs(id,work_order_id,record,state) VALUES($1,$2,'{}','ready_for_review')",[run,order]);
    await query("INSERT INTO factory.intake_receipts(client_id,request_id,work_id,work_generation,input_digest,work_order_id,run_id,request,snapshot,deadline) VALUES($1,$2,$3,1,$4,$5,$6,'{}','{}',$7)",[clientId,request,work,'a'.repeat(64),order,run,now]);
    await query("INSERT INTO factory.work_spend_budgets(work_id,work_generation,request_id,work_order_id,ceiling_microusd,deadline,created_at,contract_version) VALUES($1,1,$2,$3,1000000,$4,$4,'WORK_LEDGER_V2')",[work,request,order,now]);
    await query("INSERT INTO factory.work_spend_operations(operation_id,work_id,work_generation,dispatch_identity,request_id,work_order_id,factory_version,run_id,model,pricing_revision,reserved_microusd,actual_microusd,state,created_at,updated_at,phase) VALUES($1,$2,1,$3,$4,$5,$6,$7,'disposable','disposable',100,1,'settled',$8,$8,'productive')",[randomUUID(),work,randomUUID(),request,order,'f'.repeat(64),run,now]);
   }
   try{
    let retained='';
    for(const slot of ['A','B','C']){
     const f=await paidFixture({slot,schema,historicalGrants:structuredClone(history)});fixtures.push(f);schema=f.schema;
     if(slot==='A')await settled(f.query,'sofie-production');
     if(retained)expect(digest((await f.query('SELECT * FROM factory.work_spend_operations ORDER BY operation_id')).rows)).toBe(retained);
     expect((await f.run()).state).toBe('INSTALLED');await expect(f.run()).rejects.toThrow();
     const g=(await f.query('SELECT * FROM factory.production_work_authority WHERE work_id=$1',[f.work.id])).rows[0];
     expect(g.manifest.ownerScope).toBe(f.store.principal.scopeId);
     await f.query("UPDATE factory.production_work_authority SET state='REVOKED' WHERE request_id=$1",[g.request_id]);
     history.push({requestId:g.request_id,workId:g.work_id,manifestSha256:g.manifest_sha256,consumedAt:null});
     await settled(f.query,f.approval.manifestTemplate.clientId);
     retained=digest((await f.query('SELECT * FROM factory.work_spend_operations ORDER BY operation_id')).rows);
     expect((await f.query('SELECT owner_scope FROM factory.environment')).rows[0].owner_scope).toBe('disposable-personal-host');
     await expect(pool.query("UPDATE engineering_routing_decisions SET factory_preparation='{}' WHERE id=$1",[f.decisionId])).rejects.toThrow('immutable');
    }
    const final=fixtures.at(-1)!;
    expect((await final.query("SELECT count(*) FROM factory.production_work_authority WHERE state='AUTHORIZED'")).rows[0].count).toBe('0');
    expect((await final.query('SELECT count(*) FROM factory.work_spend_operations')).rows[0].count).toBe('4');
    for(const a of fixtures)for(const b of fixtures.filter(f=>f!==a))await expect(a.store.get(b.work.id)).rejects.toThrow();
    const repeat=await paidFixture({slot:'A',schema,historicalGrants:history});fixtures.push(repeat);await expect(repeat.run()).rejects.toThrow();
    expect((await repeat.query("SELECT count(*) FROM factory.production_work_authority WHERE state='AUTHORIZED'")).rows[0].count).toBe('0');
   }finally{fixtures.forEach(f=>f.close())}
  });
  it('concurrent activation and installation produce one request/grant; immutable approval differs from concrete digest',async()=>{
   const f=await paidFixture();try{
    const results=await Promise.allSettled([f.run(),f.run()]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    const grants=(await f.query('SELECT * FROM factory.production_work_authority')).rows;expect(grants).toHaveLength(1);
    const g=grants[0];expect(g.manifest_sha256).toBe(digest(g.manifest));expect(g.manifest_sha256).not.toBe(f.sha256);
    await expect(pool.query("UPDATE engineering_factory_validation_lifecycle SET grant_sha256=$2 WHERE decision_id=$1",[f.decisionId,'e'.repeat(64)])).rejects.toThrow();
    expect(g.request_id).toBe(f.preparation.request.requestId);expect((await f.lifecycle.read()).grant_sha256).toBe(g.manifest_sha256);
    expect((await pool.query('SELECT count(*) FROM engineering_factory_validation_lifecycle WHERE work_id=$1',[f.work.id])).rows[0].count).toBe('1');
    const {assertConcreteProductionGrant}=await f.load('apps/cloud-control/src/production-approval.mjs');
    expect(assertConcreteProductionGrant(g.manifest,f.sha256)).toEqual(f.approval);
    const {productionAuthority}=await f.load('apps/cloud-control/src/production-authority.mjs');
    const authorize=productionAuthority({installation:{ownerScope:f.store.principal.scopeId},sourceDigest:f.sourceDigest,configuration:f.plan.productionConfiguration,contractSha256:f.plan.productionExecutionContractSha256,clientId:'sofie-production',authorizationSha256:f.sha256});
    await authorize({query:f.query},g.manifest.request,Date.now(),'prepare');
    await expect(authorize({query:f.query},{...g.manifest.request,deadline:new Date(Date.now()+10000).toISOString()},Date.now(),'prepare')).rejects.toThrow();
    await expect(f.run()).rejects.toThrow(); // restart cannot mint or release authority again
    await f.query("UPDATE factory.production_work_authority SET state='REVOKED'");
    await expect(f.run()).rejects.toThrow();
    await expect(authorize({query:f.query},g.manifest.request,Date.now(),'prepare')).rejects.toThrow();
    expect((await f.query('SELECT manifest_sha256 FROM factory.production_work_authority')).rows[0].manifest_sha256).toBe(g.manifest_sha256);
   }finally{f.close();}
  });
  it('altered or expired approvals, stale lifecycle and mutated request/deadline fail before authority',async()=>{
   const f=await paidFixture();try{
    await expect(f.run({...f.envelope,expiresAt:new Date(0).toISOString()})).rejects.toThrow();
    const expired={...f.envelope,expiresAt:new Date(0).toISOString()};await expect(f.run(expired,digest(expired))).rejects.toThrow();
    await expect(pool.query("UPDATE engineering_factory_validation_lifecycle SET deadline=deadline+interval '1 second' WHERE decision_id=$1",[f.decisionId])).rejects.toThrow('immutable');
    await expect(pool.query("UPDATE engineering_routing_decisions SET factory_preparation=jsonb_set(factory_preparation,'{request,requestId}',to_jsonb($2::text)) WHERE id=$1",[f.decisionId,randomUUID()])).rejects.toThrow('immutable');
    await f.lifecycle.halt('DISPOSABLE_STALE_LIFECYCLE');await expect(f.run()).rejects.toThrow();
    expect((await f.query('SELECT count(*) FROM factory.production_work_authority')).rows[0].count).toBe('0');
   }finally{f.close();}
  });
 });

});
