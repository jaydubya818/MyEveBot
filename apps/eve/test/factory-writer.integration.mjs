import assert from 'node:assert/strict';
import {z} from 'zod';
import {nativeDevelopmentToolSchema} from '../lib/engineering/native-input.ts';
import {randomUUID,randomBytes,createHash,generateKeyPairSync} from 'node:crypto';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {execFileSync,fork} from 'node:child_process';
import {once} from 'node:events';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Client,Pool} from 'pg';
import {loadMigrations,runMigrations} from '../scripts/migration-runner.ts';
import {WorkStore} from '../lib/engineering/store.ts';
import {RoutingStore} from '../lib/engineering/routing-store.ts';
import {RouteAdmissionService} from '../lib/engineering/route-admission.ts';
import {NativeRouteAuthority,admitNativeWork,nativeProfileHash,NATIVE_PROVIDER} from '../lib/engineering/native-routing.ts';
import {EngineeringConversationBudget} from '../lib/engineering/conversation-budget.ts';
import {runtimeSchema} from '../lib/engineering/runtime.ts';
import {digest,profileSchema} from '../lib/engineering/contract.ts';
import {FactoryWriterStore} from '../lib/engineering/factory-writer.ts';
import {FactoryReceiptStore} from '../lib/engineering/factory-receipt-store.ts';
import {prepareAuthenticatedFactoryInput} from '../lib/engineering/factory-authenticated-result.ts';
import {admitFactoryResult} from '../lib/engineering/factory-result-consumer.ts';
import {signResult,digest as protocolDigest,sha256,operationId} from '../lib/engineering/factory-producer-protocol.ts';
import {DirectDevelopmentStore} from '../lib/engineering/direct-development.ts';
import {DirectVerificationDriver} from '../lib/engineering/direct-verification-driver.ts';
import {DockerVerificationResourceInspector} from '../lib/engineering/direct-verification-driver.ts';
import {nativeBudgetedModel} from '../lib/engineering/native-model.ts';
import {NativeModelBudget} from '../lib/engineering/native-model-budget.ts';
import {DockerProtectedVerifier} from '../lib/engineering/docker-executor.ts';
import {NativeResultStore} from '../lib/engineering/native-results.ts';
import {fixture as receiptFixture,golden} from './factory-receipt-fixture.mjs';
import {EngineeringWorkerProjectionStore} from '../lib/engineering/worker-projection.ts';

const adminURL='postgresql://postgres@127.0.0.1:55479/postgres';
const admin=new Client(adminURL);await admin.connect();const name='gateb_'+randomBytes(7).toString('hex');await admin.query('CREATE DATABASE '+name);
const url=adminURL.replace(/\/postgres$/,'/'+name),pool=new Pool({connectionString:url}),roles=[];
const database={query:async(s,p)=>(await pool.query(s,p)).rows};
const migrationDB={...database,transaction:async ss=>{const c=await pool.connect();try{await c.query('BEGIN');for(const s of ss)await c.query(s.sql,s.params);await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}};
let checks=0;const results=[],journeys=[];function pass(label){checks++;results.push(label);console.log('PASS',label);}
async function snapshot(){const out={};for(const {tablename:t} of (await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows)out[t]=(await pool.query('SELECT to_jsonb(t) row FROM "'+t+'" t ORDER BY to_jsonb(t)::text')).rows;return out;}
try{
 const allMigrations=await loadMigrations(),migrations=allMigrations.slice(0,56);assert.equal(migrations.length,56);
 const pin=JSON.parse(await readFile(new URL('../../../docs/verification/2026-09-27-gate-b/0056-ownership-and-checksum.json',import.meta.url),'utf8'));assert.equal(migrations[55].checksum,pin.sha256);
 await runMigrations(migrationDB,migrations.slice(0,55),()=>{});
 const old=await receiptFixture(pool);assert.equal((await admitFactoryResult(old.store,old.request.id,golden.result,{keys:async()=>golden.expected.keys})).status,'ADMITTED');
 const freshName='gateb_fresh_'+randomBytes(5).toString('hex');await admin.query('CREATE DATABASE '+freshName);const fc=new Client(adminURL.replace(/\/postgres$/,'/'+freshName));await fc.connect();try{await runMigrations({query:async(s,p)=>(await fc.query(s,p)).rows,transaction:async ss=>{await fc.query('BEGIN');try{for(const s of ss)await fc.query(s.sql,s.params);await fc.query('COMMIT');}catch(e){await fc.query('ROLLBACK');throw e;}}},migrations,()=>{});assert.equal((await fc.query('SELECT count(*)::int n FROM sofie_schema_migrations')).rows[0].n,56);}finally{await fc.end();await admin.query('DROP DATABASE '+freshName);}pass('fresh complete 56-migration chain');
 const before=await snapshot();
 await assert.rejects(runMigrations(migrationDB,[...migrations.slice(0,55),{...migrations[55],statements:[...migrations[55].statements,'SELECT gate_b_injected_failure()']}],()=>{}),/gate_b_injected_failure/);
 assert.deepEqual(await snapshot(),before);pass('0056 injected failure rolls back complete schema and migration ledger');
 await runMigrations(migrationDB,migrations,()=>{});
 const after=await snapshot();for(const [table,rows] of Object.entries(before))if(table!=='sofie_schema_migrations')assert.deepEqual(after[table],rows,table);
 pass('0055→0056 preserves every populated historical row and Gate C custody');
 const stable=await snapshot();await runMigrations(migrationDB,migrations,()=>{});assert.deepEqual(await snapshot(),stable);pass('0056 rerun is exact no-op');
 assert.equal((await old.store.get(old.request.id,(await old.store.admission(old.request.id)).receipt_id)).state,'ADMITTED');
 assert.equal((await pool.query('SELECT count(*)::int n FROM engineering_route_runs')).rows[0].n,0);pass('migration and authenticated receipts create no writer authority');
 await runMigrations(migrationDB,allMigrations,()=>{});
 const owner='gate-b-'+randomUUID(),agentId='agent-'+randomUUID();
 await pool.query(`INSERT INTO agents(id,owner_id,name,slug,role,instructions,is_primary,status,max_estimated_cost_usd,max_runtime_seconds,max_steps) VALUES($1,$2,'Sofie','sofie','engineer','Gate B local qualification',true,'active',1.3,3600,30)`,[agentId,owner]);
 const store=new WorkStore({scopeId:owner,scopeKind:'personal',actorId:owner},database),writers=new FactoryWriterStore(store),receipts=new FactoryReceiptStore(store.principal,database);
 const issued=JSON.parse(await readFile(new URL('../../../docs/verification/2026-09-26-m1er1-window/window-issued-config.json',import.meta.url),'utf8'));
 const historical=JSON.parse(await readFile(new URL('../../../docs/verification/2026-09-26-m1er1-window/window-closure.json',import.meta.url),'utf8'));
 const source={sha:historical.workspace[0].base_sha,files:historical.workspace[0].source_files};const profile=profileSchema.parse(issued.profile);
 const config=runtimeSchema.parse({...issued,ownerId:owner,agentId,profile,nativeQualification:undefined});config.nativeQualification={provider:NATIVE_PROVIDER,modelId:'anthropic/claude-sonnet-5',scopeId:owner,profileHash:nativeProfileHash(config),evidenceRef:'Gate B controlled local',qualifiedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()};
 const authority=new NativeRouteAuthority(store,async()=>config),budget=new EngineeringConversationBudget(store,authority);
 const direct=new DirectDevelopmentStore(store,{profile,approvedBase:config.approvedBase,objective:config.objective,criteria:config.criteria,agentId,issueNumber:1,assertCurrentAuthority:id=>authority.assertEffect(id)});
 let serial=0;
 async function payConversation(work,session){const req={workId:work.id,sessionId:session,stepKey:'gate-b:'+serial++,modelId:'anthropic/claude-sonnet-5',requestHash:digest(randomUUID()),microUsd:70000,maxCalls:30,pricing:{input:'0.000002',output:'0.000010',cachedInputTokens:'0.0000002',cacheCreationInputTokens:'0.0000025'},bounds:{inputBytes:5000,maxOutputTokens:2048}};await budget.reserve(req);await budget.assertDispatch(req);await budget.settle(req,1000,{content:[{type:'text',text:'Local controlled admission'}]});}
 async function fresh(label){let {work}=await store.create({title:label,objective:config.objective,repository:profile.repository,criteria:config.criteria,maxCostUsd:1.3,maxDurationSeconds:3600,idempotencyKey:randomUUID()});work=await store.change(work.id,{operation:'resume',expectedVersion:work.version});return work;}
 async function native(work,session='writer'){await payConversation(work,session);const a=await admitNativeWork(store,work.id,work.version,work.generation,authority,session);return writers.inspect(work.id,a.runId);}
 async function turnFactory(work){const n=await native(work);await direct.open(work.id,source);await writers.fenceNative(n);await writers.advance(n,work.version);work=await store.get(work.id);return {work,n,...await factoryRequest(work)};}
 const {privateKey,publicKey}=generateKeyPairSync('ed25519');
 const producerConfig={model:'local-controlled',executor:'bounded-fixture',executorVersion:'1',skillRevision:'1',workerProfile:'Gate B',verificationImage:profile.image,nodeVersion:process.version,platform:process.platform,architecture:process.arch,commands:['producer claim'],allowedPaths:profile.allowedPaths,timeoutMs:10000};
 const sourceDigest=sha256('Gate B controlled producer source'),configurationDigest=protocolDigest(producerConfig),factoryVersion=protocolDigest({sourceDigest,configurationDigest});
 const key={factoryId:'factory-gate-b',keyId:'gate-b-key',publicKey:publicKey.export({type:'spki',format:'pem'}).toString(),activeFrom:new Date(Date.now()-3600000).toISOString(),notAfter:new Date(Date.now()+3600000).toISOString()};
 const keys={keys:async()=>[key]};
 async function factoryRequest(work){const binding=prepareAuthenticatedFactoryInput({workId:work.id,workVersion:work.version,workGeneration:work.generation,criteriaVersion:work.criteriaVersion,agentId,factoryId:key.factoryId,factoryVersion,requestId:randomUUID(),workOrderId:randomUUID(),runId:randomUUID(),attemptNumber:1,inputCommit:source.sha,requestDigest:sha256(randomUUID()),sourceDigest,configurationDigest});const request=await receipts.register(binding);return {binding,request};}
 async function factoryAuthority(work,request){const s=await authority.read(work);delete s.binding;const provider={id:key.factoryId,version:factoryVersion};s.contract.allowedRoutes=['MYFACTORY'];s.contract.allowedOperations=['factory.submit'];s.facts.allowedRoutes=['MYFACTORY'];s.facts.allowedOperations=['factory.submit'];s.facts.factoryAdmission='ALLOW';s.facts.routePolicy={...s.facts.routePolicy,allowedRoutes:['MYFACTORY'],providers:{DIRECT:null,DEEP_AGENT:null,EXECUTOR:null,MYFACTORY:provider,RELAY:null}};s.facts.qualifications={DIRECT:null,DEEP_AGENT:null,EXECUTOR:null,MYFACTORY:{provider,scope:s.contract.scope,status:'QUALIFIED',health:'HEALTHY',evidenceRef:'local bounded producer',observedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()},RELAY:null};s.factory={requestId:request.id,repository:profile.repository,baseSha:source.sha,profileHash:digest(profile),allowedPaths:profile.allowedPaths,deadline:s.contract.deadline};return s;}
 async function proposal(work,request){const s=await factoryAuthority(work,request);return new RoutingStore(store).recordProposal(work.id,{expectedWorkVersion:work.version,selectedRoute:'MYFACTORY',source:'POLICY',profile:s.contract.routingProfile,reason:'One bounded explicitly selected Factory',eligibleRoutes:['MYFACTORY','HUMAN'],rejectedRoutes:[],constraints:['One writer; no Ready'],providerId:key.factoryId,providerVersion:factoryVersion});}
 async function acquire(work,request,p){p??=await proposal(work,request);const service=new RouteAdmissionService(store,{read:w=>factoryAuthority(w,request)});const a=await service.admit(work.id,{decisionId:p.id,expectedWorkVersion:work.version,expectedWorkGeneration:work.generation,request:{route:'MYFACTORY',requiredOperations:['factory.submit'],resourceRefs:['repository:'+work.repository]}});return writers.inspect(work.id,a.runId);}
 // Durable synthetic producer: no remote calls. Identity/state retained in a task-local file,
 // separate from MyEve's writer; accepted dispatch is consequential only once.
 const producerDir=await mkdtemp(join(tmpdir(),'gate-b-producer-'));let dispatches=0;
 const transport={async dispatch(id){const path=join(producerDir,id.dispatchIdentity+'.json');try{await writeFile(path,JSON.stringify({identity:id,state:'RUNNING'}),{flag:'wx'});dispatches++;}catch(e){if(e.code!=='EEXIST')throw e;assert.deepEqual(JSON.parse(await readFile(path,'utf8')).identity,id);}},async stop(id){const path=join(producerDir,id.dispatchIdentity+'.json');await writeFile(path,JSON.stringify({identity:id,state:'CANCELLED'}));},async observe(id){try{const value=JSON.parse(await readFile(join(producerDir,id.dispatchIdentity+'.json'),'utf8'));if(value.state==='RUNNING')return null;return {...value.identity,state:value.state,quiescent:true,evidenceRef:'local-process-terminal:'+id.dispatchIdentity};}catch(e){if(e.code==='ENOENT'){try{await writeFile(join(producerDir,id.dispatchIdentity+'.json'),JSON.stringify({identity:id,state:'NOT_DISPATCHED'}),{flag:'wx'});}catch(race){if(race.code==='EEXIST')return null;throw race;}return {...id,state:'NOT_DISPATCHED',quiescent:true,evidenceRef:'local-request-tombstoned:'+id.dispatchIdentity};}throw e;}}};
 async function complete(run,state='COMPLETED'){const identity=await writers.identity(run);await writeFile(join(producerDir,identity.dispatchIdentity+'.json'),JSON.stringify({identity,state}));return writers.reconcile(run,transport);}
 async function produce(binding,files){const dir=await mkdtemp(join(tmpdir(),'gate-b-git-'));try{execFileSync('git',['init','--quiet'],{cwd:dir});const fs=await import('node:fs/promises');for(const [path,text] of Object.entries(source.files)){await fs.mkdir(join(dir,path,'..'),{recursive:true});await fs.writeFile(join(dir,path),text);}execFileSync('git',['add','--all'],{cwd:dir});const beforeTree=execFileSync('git',['write-tree'],{cwd:dir,encoding:'utf8'}).trim();for(const [path,text] of Object.entries(files))await fs.writeFile(join(dir,path),text);execFileSync('git',['add','--all'],{cwd:dir});const tree=execFileSync('git',['write-tree'],{cwd:dir,encoding:'utf8'}).trim();const patch=execFileSync('git',['diff','--cached','--binary',beforeTree],{cwd:dir});const date=new Date(Math.floor(Date.now()/1000)*1000).toISOString(),seconds=Date.parse(date)/1000;const commit=Buffer.from(`tree ${tree}\nparent ${source.sha}\nauthor MyFactory <factory@localhost.invalid> ${seconds} +0000\ncommitter MyFactory <factory@localhost.invalid> ${seconds} +0000\n\nBounded Factory candidate\n`);const sha=createHash('sha1').update(`commit ${commit.length}\0`).update(commit).digest('hex');const treeBytes=execFileSync('git',['cat-file','tree',tree],{cwd:dir});const capturedAt=new Date(Date.now()-1000).toISOString(),at=new Date().toISOString();const execution={version:1,factoryId:binding.factoryId,factoryVersion:binding.factoryVersion,sourceDigest,configurationDigest,configuration:producerConfig,requestId:binding.requestId,requestDigest:binding.requestDigest,workOrderId:binding.workOrderId,runId:binding.runId,attemptNumber:1,inputCommit:source.sha,capturedAt};const artifacts=[['candidate.commit','git-commit',commit],['candidate.tree','git-tree',treeBytes],['candidate.patch','patch',patch],['producer.log','check-log',Buffer.from('Producer claims PASS; independent checks still required')]].map(([id,kind,bytes])=>({id,kind,producer:binding.factoryId,runId:binding.runId,candidateCommit:sha,sha256:sha256(bytes),size:bytes.length,createdAt:at,bytes}));const evidence=[{id:'producer-check',producer:binding.factoryId,runId:binding.runId,candidateCommit:sha,command:'producer claim',status:'passed',exitCode:0,startedAt:capturedAt,finishedAt:at,logArtifactId:'producer.log'}];const m={protocol:'MYFACTORY_RESULT_V1',keyId:key.keyId,producer:binding.factoryId,operationId:operationId(execution),execution,status:'COMPLETED',candidate:{commit:sha,tree,base:source.sha,patchDigest:sha256(patch),commitArtifactId:'candidate.commit',treeArtifactId:'candidate.tree',patchArtifactId:'candidate.patch'},evidence,artifacts:artifacts.map(({bytes,...a})=>a),evidenceDigest:protocolDigest(evidence),artifactDigest:protocolDigest(artifacts.map(({bytes,...a})=>a)),completedAt:at,issuedAt:at};return signResult(m,artifacts.map(a=>({id:a.id,base64:a.bytes.toString('base64')})),privateKey);}finally{await rm(dir,{recursive:true,force:true});}}
 const active=await fresh('Native acquisition blocks Factory');const nativeRun=await native(active);const requestWhileNative=await factoryRequest(active);await assert.rejects(proposal(active,requestWhileNative.request),/admitted|writer|proposal/i);pass('native writer active denies Factory admission');
 for(const fail of [false,true]){
  const {work,n,binding,request}=await turnFactory(await fresh(fail?'Factory failure and native repair':'Factory success'));
  const run=await acquire(work,request);
  await assert.rejects(direct.write(work.id,1,'quantity.mjs','stale'),/changed|fenced|admitted/i);
  const attempts=await Promise.all([writers.dispatch(run,transport),writers.dispatch(run,transport),writers.dispatch(run,transport)]);assert.equal(attempts.filter(x=>x.dispatched).length,1);
  await assert.rejects(admitNativeWork(store,work.id,work.version,work.generation,authority,'new-writer'),/completion|denied|writer/i);
  const produced=await produce(binding,{...source.files,'quantity.mjs':fail?historical.workspace[0].candidates[0].files['quantity.mjs']:historical.workspace[0].draft_files['quantity.mjs']});
  const admitted=await admitFactoryResult(receipts,request.id,produced,keys);assert.equal(admitted.status,'ADMITTED');assert.equal(admitted.factoryGrantedAuthority,0);
  assert.equal((await writers.takeCustody(run,admitted.receiptId,source,profile,keys)).historical,true);assert.equal((await writers.inspect(work.id,run.id)).factory_candidate,null);
  await complete(run);const custody=await writers.takeCustody(run,admitted.receiptId,source,profile,keys);assert(custody.factory_candidate);
  assert.deepEqual((await writers.takeCustody(run,admitted.receiptId,source,profile,keys)).factory_candidate,custody.factory_candidate);
  const ws=(await direct.inspect(work.id)).workspace;assert.equal(ws.producer,'MYFACTORY');assert.equal(ws.candidates[0].sha,JSON.parse(Buffer.from(produced.encoded,'base64url')).candidate.commit);
  await new DirectVerificationDriver(direct,new DockerProtectedVerifier()).run(work.id);const result=await new NativeResultStore(direct).retain(work.id);assert.equal(result.proof.outcome,fail?'FAILED':'PARTIAL');assert(result.proof.artifactRefs.some(x=>x.startsWith('factory-receipt:')));assert.equal((await new EngineeringWorkerProjectionStore(store,agentId).get(work.id)).projection.readiness.ready,false);
  journeys.push({kind:fail?'factory-failure':'factory-success',workId:work.id,workGeneration:work.generation,nativeRunId:n.id,factoryRun:await writers.inspect(work.id,run.id),request:binding,receiptId:admitted.receiptId,candidate:ws.candidates[0],protectedEvidence:(await direct.inspect(work.id)).workspace.evidence,result:result.proof});
  pass('Factory '+(fail?'failure':'success')+': native fenced → Factory dispatch → Gate C → terminal custody → real protected verification '+(fail?'FAIL':'PASS'));
  if(fail){const snapshot=(await direct.inspect(work.id)).workspace;await writers.advance(run,work.version);const next=await store.get(work.id);const repair=await native(next,'repair-writer');assert.notEqual(repair.id,n.id);assert.notEqual(repair.id,run.id);await direct.open(next.id,source);assert.deepEqual((await direct.inspect(next.id)).workspace.draftFiles,snapshot.candidates[0].files);let x=(await direct.inspect(next.id)).workspace;await direct.plan(next.id,x.revision,'Repair the exact retained Factory candidate after normal admission.');x=(await direct.inspect(next.id)).workspace;const repairModel=nativeBudgetedModel({store,workId:next.id,sessionId:'repair-writer',stepKey:'repair:0',modelId:'anthropic/claude-sonnet-5'}, {authority,budget:new NativeModelBudget(store,authority),catalog:async()=>({models:[{id:'anthropic/claude-sonnet-5',pricing:{input:'0.000002',output:'0.000010',cachedInputTokens:'0.0000002',cacheCreationInputTokens:'0.0000025'}}]}),model:()=>({doGenerate:async()=>({content:[{type:'tool-call',toolName:'engineering_direct',toolCallId:'repair',input:JSON.stringify({request:{operation:'write',expectedRevision:x.revision,path:'quantity.mjs',content:historical.workspace[0].draft_files['quantity.mjs']}})}],usage:{inputTokens:{total:1000},outputTokens:{total:100}},finishReason:{unified:'tool-calls'},warnings:[],providerMetadata:{gateway:{cost:'0.003'}}})})});const repaired=await repairModel.doGenerate({prompt:[{role:'user',content:[{type:'text',text:'Repair the retained Factory failure within the approved source scope.'}]}],tools:[{type:'function',name:'engineering_direct',inputSchema:z.toJSONSchema(nativeDevelopmentToolSchema,{target:'draft-7'})}]});const edit=JSON.parse(repaired.content[0].input).request;await direct.write(next.id,edit.expectedRevision,edit.path,edit.content);x=(await direct.inspect(next.id)).workspace;await direct.submit(next.id,x.revision);await new DirectVerificationDriver(direct,new DockerProtectedVerifier()).run(next.id);assert.equal((await new NativeResultStore(direct).retain(next.id)).proof.outcome,'PARTIAL');const archived=await writers.inspect(work.id,run.id);assert.deepEqual(archived.custody_snapshot.workspace.candidates,snapshot.candidates);assert.deepEqual(archived.custody_snapshot.workspace.evidence,snapshot.evidence);assert.equal(archived.factory_candidate.candidates[0].producer,'MYFACTORY');const repairTruth=(await new EngineeringWorkerProjectionStore(store,agentId).get(next.id)).projection;assert.equal(repairTruth.readiness.ready,false);assert(repairTruth.candidateHistory.some(c=>c.sha===snapshot.candidates[0].sha));journeys.push({kind:'native-repair',workId:next.id,workGeneration:next.generation,nativeRunId:repair.id,priorFactoryRunId:run.id,candidateHistory:repairTruth.candidateHistory,workspace:(await direct.inspect(next.id)).workspace,result:(await new NativeResultStore(direct).retain(next.id)).proof});pass('new normal native Run repairs after failed Factory verification; complete Factory candidate/evidence history preserved');}
 }

 // Race independent PostgreSQL clients/statements against the canonical Work lock.
 for(const race of ['native-vs-factory','factory-vs-factory']){
  const w=await fresh(race);await payConversation(w,'racing-native');const f=await factoryRequest(w);
  let outcomes;
  if(race==='factory-vs-factory'){const p=await proposal(w,f.request);outcomes=await Promise.allSettled([acquire(w,f.request,p),acquire(w,f.request,p)]);}
  else outcomes=await Promise.allSettled([admitNativeWork(store,w.id,w.version,w.generation,authority,'racing-native'),acquire(w,f.request)]);
  assert(outcomes.some(x=>x.status==='fulfilled'));
  assert.equal((await pool.query("SELECT count(*)::int n FROM engineering_route_runs WHERE work_id=$1 AND status NOT IN ('COMPLETED','FAILED','CANCELLED')",[w.id])).rows[0].n,1);
  pass('real PostgreSQL '+race+': exactly one authoritative writer');
 }
 for(const reason of ['cancel','takeover']){
  const x=await turnFactory(await fresh('completion race '+reason)),run=await acquire(x.work,x.request);await writers.dispatch(run,transport);
  const identity=await writers.identity(run);const observation={...identity,state:'COMPLETED',quiescent:true,evidenceRef:'controlled-terminal-after-execution'};
  await Promise.all([writers.reconcile(run,{...transport,observe:async()=>observation}),writers.stop(run,transport,reason)]);
  const done=await writers.inspect(x.work.id,run.id);assert.equal(done.dispatch_state,'TERMINAL');assert(done.fenced_at);assert(done.quiescence);
  if(reason==='takeover'){await writers.advance(run,x.work.version,'HUMAN');assert.equal((await store.get(x.work.id)).control,'human');}
  pass('Factory completion vs '+reason+' serializes; authority only after proven quiescence');
 }
 const unknown=await turnFactory(await fresh('UNKNOWN timeout')),unknownRun=await acquire(unknown.work,unknown.request);
 await assert.rejects(writers.dispatch(unknownRun,{...transport,dispatch:async()=>{throw Error('lost response');}}),/lost response/);
 assert.equal((await writers.inspect(unknown.work.id,unknownRun.id)).dispatch_state,'UNKNOWN');
 await assert.rejects(store.change(unknown.work.id,{operation:'takeover',expectedVersion:unknown.work.version}),/quiescence/);
 const timeoutRace=await Promise.allSettled([writers.stop(unknownRun,{...transport,stop:async()=>{}},'timeout'),admitNativeWork(store,unknown.work.id,unknown.work.version,unknown.work.generation,authority,'timeout-native')]);
 assert.equal(timeoutRace[1].status,'rejected');assert.equal((await writers.inspect(unknown.work.id,unknownRun.id)).dispatch_state,'STOPPING');
 assert.equal((await writers.dispatch(unknownRun,transport)).dispatched,false);
 const uProjection=(await new EngineeringWorkerProjectionStore(store,agentId).get(unknown.work.id)).projection;assert.equal(uProjection.readiness.ready,false);assert.match(uProjection.nextStep,/blocked/);
 pass('UNKNOWN/timeout/STOPPING blocks native reacquisition, human mutation and duplicate dispatch; Current Truth explains reconciliation');
 const failed=await turnFactory(await fresh('Factory failure')),failedRun=await acquire(failed.work,failed.request);await writers.dispatch(failedRun,transport);await complete(failedRun,'FAILED');
 assert.equal((await writers.inspect(failed.work.id,failedRun.id)).status,'FAILED');assert.equal((await pool.query("SELECT count(*)::int n FROM engineering_route_runs WHERE work_id=$1 AND status IN ('QUEUED','RUNNING')",[failed.work.id])).rows[0].n,0);pass('Factory FAILED preserves attempt and grants no automatic native writer');
 // A sent stop is not quiescence; reconciliation must also fence a delayed dispatch.
 const delayed=await turnFactory(await fresh('delayed dispatch after stop')),delayedRun=await acquire(delayed.work,delayed.request);
 let entered,release;const dispatchEntered=new Promise(resolve=>entered=resolve),releaseDispatch=new Promise(resolve=>release=resolve);
 const beforeDelayed=dispatches;
 const pendingDispatch=writers.dispatch(delayedRun,{...transport,dispatch:async identity=>{entered();await releaseDispatch;await transport.dispatch(identity);}});
 await dispatchEntered;await writers.stop(delayedRun,transport,'cancel');await writers.reconcile(delayedRun,transport);
 await writers.advance(delayedRun,delayed.work.version);const delayedSuccessor=await native(await store.get(delayed.work.id),'after-cancel');
 release();await pendingDispatch;
 assert.equal(dispatches,beforeDelayed);assert.equal((await writers.inspect(delayed.work.id,delayedRun.id)).dispatch_state,'TERMINAL');
 assert.equal((await writers.inspect(delayed.work.id,delayedSuccessor.id)).status,'QUEUED');
 pass('remote terminal tombstone rejects delayed dispatch after cancellation, reconciliation and native succession');
 // Receipt processing and normal new admission compete through independent PG connections.
 const late=await turnFactory(await fresh('late receipt racing native admission')),lateRun=await acquire(late.work,late.request);
 await writers.dispatch(lateRun,transport);
 const lateResult=await admitFactoryResult(receipts,late.request.id,await produce(late.binding,{...source.files,'quantity.mjs':historical.workspace[0].draft_files['quantity.mjs']}),keys);
 assert.equal(lateResult.status,'ADMITTED');await complete(lateRun);
 const arrival=await Promise.allSettled([writers.takeCustody(lateRun,lateResult.receiptId,source,profile,keys),(async()=>{await writers.advance(lateRun,late.work.version);return native(await store.get(late.work.id),'racing-successor');})()]);
 assert.equal(arrival[1].status,'fulfilled');
 if(arrival[0].status==='rejected')assert.equal(arrival[0].reason.code,'factory_receipt_historical');
 await direct.open(late.work.id,source);
 const currentLate=(await direct.inspect(late.work.id)).workspace,oldLate=await writers.inspect(late.work.id,lateRun.id);
 assert.equal(currentLate.routeRunId,arrival[1].value.id);assert.equal(currentLate.producer,'NATIVE_SOFIE');
 if(oldLate.factory_candidate)assert.deepEqual(oldLate.custody_snapshot.workspace.candidates,oldLate.factory_candidate.candidates);
 assert.equal((await receipts.get(late.request.id,lateResult.receiptId)).state,'ADMITTED');
 pass('real PostgreSQL late Factory custody vs new native admission preserves receipt/history and current native authority');
 const stale=await turnFactory(await fresh('stale dispatch racing current generation')),staleRun=await acquire(stale.work,stale.request);
 await complete(staleRun,'CANCELLED');await writers.advance(staleRun,stale.work.version);
 const currentGeneration=await store.get(stale.work.id);
 const staleOutcomes=await Promise.allSettled([writers.stop({...staleRun,writer_generation:staleRun.writer_generation+1},transport,'cancel'),native(currentGeneration,'current-generation')]);
 assert.equal(staleOutcomes[0].status,'rejected');assert.match(staleOutcomes[0].reason.message,/Stale writer fence/);assert.equal(staleOutcomes[1].status,'fulfilled');
 assert.equal((await writers.dispatch(staleRun,transport)).dispatched,false);
 pass('real PostgreSQL stale Factory attempt vs current generation denies stale mutation and redispatch');
 // Eight real process-loss boundaries, recovered only from committed state.
 async function crash(stage,data){const child=fork(new URL('./factory-writer-process.mjs',import.meta.url),[],{execArgv:['--import','tsx'],stdio:['ignore','ignore','pipe','ipc']});let stderr='';child.stderr.on('data',v=>stderr+=v);try{const done=Promise.race([once(child,'message'),once(child,'exit').then(()=>{throw Error('Checkpoint child exited: '+stderr);}),new Promise((_,reject)=>{const t=setTimeout(()=>reject(Error('Checkpoint timeout '+stderr)),15000);t.unref();})]);child.send({stage,url,principal:store.principal,...data});const [m]=await done;assert.equal(m.ready,true);const exited=once(child,'exit');child.kill('SIGKILL');assert.equal((await exited)[1],'SIGKILL');}finally{child.kill('SIGKILL');}}
 let cw=await fresh('restart all handoff boundaries');const cn=await native(cw);await direct.open(cw.id,source);await crash('NATIVE_FENCED',{run:cn});assert((await writers.inspect(cw.id,cn.id)).fenced_at);await writers.advance(cn,cw.version);cw=await store.get(cw.id);
 const cf=await factoryRequest(cw),cp=await proposal(cw,cf.request);
 await crash('FACTORY_ACQUIRED',{workId:cw.id,authority:await factoryAuthority(cw,cf.request),admission:{decisionId:cp.id,expectedWorkVersion:cw.version,expectedWorkGeneration:cw.generation,request:{route:'MYFACTORY',requiredOperations:['factory.submit'],resourceRefs:['repository:'+cw.repository]}}});
 const cr=await writers.inspect(cw.id,(await pool.query("SELECT id FROM engineering_route_runs WHERE work_id=$1 AND route='MYFACTORY'",[cw.id])).rows[0].id);
 await crash('DISPATCH_RECORDED',{run:cr,producerDir});assert.equal((await writers.dispatch(cr,transport)).dispatched,false);
 const signed=await produce(cf.binding,{...source.files,'quantity.mjs':historical.workspace[0].draft_files['quantity.mjs']});
 await crash('RECEIVED',{requestId:cf.request.id,result:signed,keys:[key]});
 await crash('ADMITTED',{requestId:cf.request.id,result:signed,keys:[key]});
 const receiptId=(await receipts.admission(cf.request.id)).receipt_id;
 const ci=await writers.identity(cr);await crash('FACTORY_FENCED',{run:cr,observation:{...ci,state:'COMPLETED',quiescent:true,evidenceRef:'synthetic-execution-finished'}});
 await crash('CUSTODY',{run:cr,receiptId,source,profile,keys:[key]});
 const priorCustody=(await writers.inspect(cw.id,cr.id)).factory_candidate;
 const directConfig={profile,approvedBase:config.approvedBase,objective:config.objective,criteria:config.criteria,agentId,issueNumber:1};
 await crash('VERIFICATION_STARTED',{workId:cw.id,directConfig});
 await new Promise(resolve=>setTimeout(resolve,2100));
 const driver=new DirectVerificationDriver(direct,new DockerProtectedVerifier(),2);assert.equal((await driver.run(cw.id)).status,'RECOVERY_REQUIRED');
 await driver.retryAfterResourceCheck(cw.id,priorCustody.candidates[0].sha,new DockerVerificationResourceInspector());await driver.run(cw.id);assert.equal((await new NativeResultStore(direct).retain(cw.id)).proof.outcome,'PARTIAL');
 assert.deepEqual((await writers.inspect(cw.id,cr.id)).factory_candidate,priorCustody);pass('SIGKILL after all eight handoff boundaries: no redispatch, automatic acquisition or lost candidate; verifier requires resource reconciliation');
 // A newer native generation wins over an authenticated late Factory receipt.
 await writers.advance(cr,cw.version);const later=await store.get(cw.id);const nextNative=await native(later,'later-native');
 await assert.rejects(writers.takeCustody(cr,receiptId,source,profile,keys),e=>e.code==='factory_receipt_historical');
 assert.equal((await writers.dispatch(cr,transport)).dispatched,false);
 await assert.rejects(writers.stop({...cr,writer_generation:cr.writer_generation+1},transport,'cancel'),/Stale writer fence/);
 assert.equal((await writers.inspect(later.id,nextNative.id)).status,'QUEUED');assert.deepEqual((await writers.inspect(cw.id,cr.id)).factory_candidate,priorCustody);
 pass('late result vs newer native writer and stale Factory fence vs current generation cannot overwrite custody or dispatch');
 // Preserve the canonical native agent binding at the final evidence write,
 // including revocation after the application's last admission recheck.
 const revoked=await fresh('agent revoked at final evidence attachment');await native(revoked,'revocation-writer');await direct.open(revoked.id,source);
 let revws=(await direct.inspect(revoked.id)).workspace;await direct.plan(revoked.id,revws.revision,'Bounded native revocation regression');revws=(await direct.inspect(revoked.id)).workspace;
 await direct.write(revoked.id,revws.revision,'quantity.mjs',historical.workspace[0].draft_files['quantity.mjs']);revws=(await direct.inspect(revoked.id)).workspace;await direct.submit(revoked.id,revws.revision);
 let revokedAtWrite=false;
 const revocationDB={query:async(sql,params)=>{if(sql.includes('SET evidence=d.evidence')){revokedAtWrite=true;await pool.query("UPDATE agents SET is_primary=false WHERE id=$1",[agentId]);}return database.query(sql,params);}};
 const revocationDirect=new DirectDevelopmentStore(new WorkStore(store.principal,revocationDB),direct.config);
 await assert.rejects(new DirectVerificationDriver(revocationDirect,new DockerProtectedVerifier()).run(revoked.id),e=>e.code==='direct_verification_changed');
 assert(revokedAtWrite);assert.deepEqual((await direct.inspect(revoked.id)).workspace.evidence,[]);
 assert.equal((await direct.inspect(revoked.id)).workspace.phase,'VERIFICATION_REQUESTED');
 pass('native agent revocation at final SQL evidence attachment cannot retain a protected PASS');
 for(const kind of ['application','worker']){
  const role='gateb_'+kind+'_'+randomBytes(4).toString('hex');roles.push(role);await pool.query('CREATE ROLE '+role);const c=await pool.connect();try{await c.query('SET ROLE '+role);await assert.rejects(c.query("SELECT engineering_writer_handoff('{}'::jsonb)"),e=>e.code==='42501');await c.query('RESET ROLE');await pool.query('GRANT EXECUTE ON FUNCTION engineering_writer_handoff(jsonb) TO '+role);await c.query('SET ROLE '+role);await assert.rejects(c.query("SELECT engineering_writer_handoff('{}'::jsonb)"),/Owner scope/);for(const sql of ["UPDATE engineering_route_runs SET status='COMPLETED'",'DELETE FROM engineering_direct_workspaces',"UPDATE engineering_factory_receipts SET state='ADMITTED'",'CREATE TABLE public.gateb_unapproved(id int)'])await assert.rejects(c.query(sql),e=>e.code==='42501');}finally{await c.query('RESET ROLE');c.release();}pass('restricted '+kind+' role has no implicit handoff, direct writer/custody/receipt writes or DDL authority');
 }
 const overlaps=(await pool.query("SELECT work_id FROM engineering_route_runs WHERE status NOT IN ('COMPLETED','FAILED','CANCELLED') GROUP BY scope_id,scope_kind,work_id HAVING count(*)>1")).rows;assert.equal(overlaps.length,0);
 const manifests=(await pool.query('SELECT factory_candidate FROM engineering_route_runs WHERE factory_candidate IS NOT NULL')).rows;assert(manifests.every(r=>r.factory_candidate.candidates[0].producer==='MYFACTORY'));
 const counters={concurrentProductiveWriters:overlaps.length,duplicateFactoryDispatches:0,staleWriterMutations:0,lostHistoricalCustody:0,factoryGrantedAuthority:0,falseReady:0};
 const evidence=process.env.GATE_B_EVIDENCE;if(evidence)await writeFile(evidence,JSON.stringify({checks,results,journeys,counters,migrationChecksum:pin.sha256,liveMyFactory:'NOT_RUN'},null,2)+'\n');
 console.log(JSON.stringify({checks,counters,migrationChecksum:pin.sha256,liveMyFactory:'NOT_RUN'}));
 await rm(producerDir,{recursive:true,force:true});
 console.log(JSON.stringify({checks,results,dispatches,status:'PASS'}));
}finally{for(const role of roles){await pool.query('DROP OWNED BY '+role);await pool.query('DROP ROLE '+role);}await pool.end();await admin.query('DROP DATABASE '+name+' WITH (FORCE)');await admin.end();}
