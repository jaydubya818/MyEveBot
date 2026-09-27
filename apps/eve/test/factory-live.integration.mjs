import {localRelay,composeFactoryResult} from './factory-q37-composition.mjs';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,generateKeyPairSync,createHash} from 'node:crypto';
import {readFile,writeFile,mkdtemp,mkdir,rm} from 'node:fs/promises';
import {execFileSync,spawn} from 'node:child_process';
import {once} from 'node:events';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Client,Pool} from 'pg';
import {loadMigrations,runMigrations} from '../scripts/migration-runner.ts';
import {WorkStore} from '../lib/engineering/store.ts';
import {LiveFactoryAdapter} from '../lib/engineering/factory-live-adapter.ts';
import {NativeRouteAuthority,admitNativeWork,nativeProfileHash,NATIVE_PROVIDER} from '../lib/engineering/native-routing.ts';
import {EngineeringConversationBudget} from '../lib/engineering/conversation-budget.ts';
import {DirectVerificationDriver} from '../lib/engineering/direct-verification-driver.ts';
import {NativeResultStore} from '../lib/engineering/native-results.ts';
import {FactoryRouteAuthority} from '../lib/engineering/factory-routing.ts';
import {FactoryWorkDriver} from '../lib/engineering/factory-work-driver.ts';
import {DirectDevelopmentStore} from '../lib/engineering/direct-development.ts';
import {DockerProtectedVerifier} from '../lib/engineering/docker-executor.ts';
import {runtimeSchema} from '../lib/engineering/runtime.ts';
import {manifestForSnapshot} from '../lib/engineering/base-preflight.ts';
import {digest} from '../lib/engineering/contract.ts';
import {EngineeringWorkerProjectionStore} from '../lib/engineering/worker-projection.ts';
import {currentTruthLines} from '../lib/engineering/current-truth-lines.ts';
const root=process.env.MYFACTORY_SOURCE_ROOT;if(!root?.startsWith('/'))throw Error('Explicit owned Factory source required');
const {createSupervisor}=await import(pathToFileURL(join(root,'apps/supervisor/src/server.ts')));
const {sourceIdentity}=await import(pathToFileURL(join(root,'apps/supervisor/src/producer-results.ts')));
const {DEFAULT_VERIFICATION_IMAGE}=await import(pathToFileURL(join(root,'packages/verification/src/index.ts')));
const dir=await mkdtemp(join(tmpdir(),'factory-connected-')),repo=join(dir,'repository'),dataDir=join(dir,'producer');await mkdir(repo);await mkdir(dataDir);
const adminURL='postgresql://postgres@127.0.0.1:55479/postgres',name='factory_beta_'+randomBytes(6).toString('hex');
const admin=new Client(adminURL);await admin.connect();await admin.query('CREATE DATABASE '+name);const pool=new Pool({connectionString:adminURL.replace(/postgres$/,'')+name});
const database={query:async(s,p)=>(await pool.query(s,p)).rows};
const migrationDB={...database,transaction:async ss=>{const c=await pool.connect();try{await c.query('BEGIN');for(const s of ss)await c.query(s.sql,s.params);await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}};
let supervisor,checks=0,composition;const results=[],journeys=[];function pass(label){checks++;results.push(label);console.log('PASS',label);}
try{
 const migrations=await loadMigrations();assert.equal(migrations.length,57);
 const pin=JSON.parse(await readFile(new URL('../../../docs/verification/2026-09-27-myfactory-beta/0057-ownership.json',import.meta.url),'utf8'));
 assert.equal(migrations[56].checksum,pin.sha256);
 await runMigrations(migrationDB,migrations.slice(0,56),()=>{});
 await assert.rejects(runMigrations(migrationDB,[...migrations.slice(0,56),{...migrations[56],statements:[...migrations[56].statements,'SELECT injected_failure_0057()']}],()=>{}),/injected_failure/);
 assert.equal((await pool.query('SELECT count(*)::int n FROM sofie_schema_migrations')).rows[0].n,56);
 assert.equal((await pool.query("SELECT 1 FROM information_schema.columns WHERE table_name='engineering_routing_decisions' AND column_name='factory_preparation'")).rowCount,0);pass('0057 complete failure rollback');
 await runMigrations(migrationDB,migrations,()=>{});await runMigrations(migrationDB,migrations,()=>{});pass('0056→0057 and idempotent rerun');
 const issued=JSON.parse(await readFile(new URL('../../../docs/verification/2026-09-26-m1er1-window/window-issued-config.json',import.meta.url),'utf8'));
 const historical=JSON.parse(await readFile(new URL('../../../docs/verification/2026-09-26-m1er1-window/window-closure.json',import.meta.url),'utf8'));
 const git=(...a)=>execFileSync('git',['-C',repo,...a],{encoding:'utf8'}).trim();git('init','-q');git('config','user.name','Local Factory fixture');git('config','user.email','fixture@example.invalid');
 const files=historical.workspace[0].source_files;for(const [path,text] of Object.entries(files)){await mkdir(join(repo,path,'..'),{recursive:true});await writeFile(join(repo,path),text);}git('add','.');git('commit','-qm','Local approved fixture');const source={sha:git('rev-parse','HEAD'),files};
 const owner='factory-beta-'+randomUUID(),agentId='agent-'+randomUUID();await pool.query(`INSERT INTO agents(id,owner_id,name,slug,role,instructions,is_primary,status,max_estimated_cost_usd,max_runtime_seconds,max_steps) VALUES($1,$2,'Sofie','sofie','engineer','Local connected Factory qualification',true,'active',1.3,3600,30)`,[agentId,owner]);
 const engineering=runtimeSchema.parse({...issued,ownerId:owner,agentId,nativeQualification:undefined,profile:{...issued.profile,repository:'fixture/golden'},approvedBase:manifestForSnapshot(source)});
 const pair=generateKeyPairSync('ed25519'),token='a'.repeat(64),key={factoryId:'factory-beta',keyId:'local',publicKey:pair.publicKey.export({type:'spki',format:'pem'}).toString(),activeFrom:'2020-01-01T00:00:00Z',notAfter:'2099-01-01T00:00:00Z'};
 const signing={factoryId:key.factoryId,currentKeyId:key.keyId,privateKey:pair.privateKey.export({type:'pkcs8',format:'pem'}).toString(),keys:[key]};
 await writeFile(join(dataDir,'connections.json'),JSON.stringify({clients:[{id:'myeve',name:'Local qualification',tokenSha256:createHash('sha256').update(token).digest('hex'),repositoryPaths:[repo],actions:['factory.prepare','factory.dispatch','factory.observe','factory.stop']}]}));
 let executions=0,failCandidate=false,heldExecution=null;
 const deps={preflightCodex:async()=>({binaryAvailable:true,authenticated:true,version:'synthetic-codex-1',workerProfile:'mac',error:null}),runCodex:async input=>{executions++;if(heldExecution){await heldExecution;return {success:false,status:'cancelled',eventsPath:'fixture',usage:null};}await writeFile(join(input.workspacePath,'quantity.mjs'),failCandidate?historical.workspace[0].candidates[0].files['quantity.mjs']:historical.workspace[0].draft_files['quantity.mjs']);return {success:true,status:'completed',threadId:'local-fixture',eventsPath:'fixture',usage:null};},verifyCandidate:async input=>{await mkdir(input.artifactDir,{recursive:true});const checks=[];for(const [i,command] of input.commands.entries()){const logPath=join(input.artifactDir,i+'.log');await writeFile(logPath,'Untrusted producer claims PASS; MyEve must independently verify.');const at=new Date().toISOString();checks.push({candidateCommit:input.candidateSha,candidateTree:git('rev-parse',input.candidateSha+'^{tree}'),command,status:'passed',exitCode:0,startedAt:at,finishedAt:at,logPath,reason:null});}return {checks,reason:null};}};
 supervisor=createSupervisor({dataDir,resultSigning:signing,jobDependencies:deps,localFactoryFixture:true});await new Promise(r=>supervisor.server.listen(0,'127.0.0.1',r));
 const configuration={model:process.env.FACTORY_CODEX_MODEL??'gpt-5.5',executor:'codex-cli',executorVersion:'synthetic-codex-1',skillRevision:'fd8f20a879b507cf09feba08663a1edf7a949353',workerProfile:'mac',verificationImage:DEFAULT_VERIFICATION_IMAGE,nodeVersion:process.version,platform:process.platform,architecture:process.arch,commands:['node --test'],allowedPaths:engineering.profile.allowedPaths,timeoutMs:1800000};
 const sourceDigest=sourceIdentity(),configurationDigest=digest(configuration);
 const connection={origin:'http://127.0.0.1:'+supervisor.server.address().port,token,factoryId:key.factoryId,sourceDigest,configurationDigest,factoryVersion:digest({sourceDigest,configurationDigest}),repositoryPath:repo,keys:[key],qualification:{scopeId:owner,profileHash:digest(engineering.profile),evidenceRef:'connected local qualification',qualifiedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString(),mode:'LOCAL_FIXTURE',spendEnforced:true}};
 const config={engineering,connection,commands:configuration.commands},store=new WorkStore({scopeId:owner,scopeKind:'personal',actorId:owner},database);
 const authority=new FactoryRouteAuthority(store,async()=>config),direct=new DirectDevelopmentStore(store,{profile:engineering.profile,approvedBase:engineering.approvedBase,objective:engineering.objective,criteria:engineering.criteria,agentId,issueNumber:1});
 const driver=(adapterFor)=>new FactoryWorkDriver(store,authority,direct,new DockerProtectedVerifier(),async()=>source,adapterFor);
 for(const failed of [false,true]){
  failCandidate=failed;
  let {work}=await store.create({title:'Connected Factory '+(failed?'failure':'success'),objective:engineering.objective,repository:engineering.profile.repository,criteria:engineering.criteria,maxCostUsd:1.3,maxDurationSeconds:600,idempotencyKey:randomUUID()});work=await store.change(work.id,{operation:'resume',expectedVersion:work.version});
  const relay=localRelay(work,agentId);
  let state=await driver().start(work.id,work.version,work.generation);
  for(let i=0;i<100&&!['PARTIAL','FAILED'].includes(state.state);i++){await new Promise(r=>setTimeout(r,50));state=await driver().step(work.id);}
  assert.equal(state.state,failed?'FAILED':'PARTIAL');assert.equal(executions,failed?2:1);
  const ws=(await direct.inspect(work.id)).workspace;assert.equal(ws.producer,'MYFACTORY');assert(ws.evidence.length);assert.equal((await driver().step(work.id)).state,state.state);assert.equal(executions,failed?2:1);
  const truth=(await new EngineeringWorkerProjectionStore(store,agentId).get(work.id)).projection;assert.equal(truth.readiness.ready,false);assert(truth.factoryWriter.dispatchIdentity);assert(truth.factoryWriter.remoteRunId);assert(truth.factoryWriter.requestId);assert.equal(truth.factoryPreparation.state,'COMPLETED');
  const decision=await driver().decision(work.id);await assert.rejects(pool.query("UPDATE engineering_routing_decisions SET factory_preparation='{}' WHERE id=$1",[decision.id]),/immutable/);await assert.rejects(pool.query('DELETE FROM engineering_routing_decisions WHERE id=$1',[decision.id]),/deleted/);
  journeys.push({workId:work.id,outcome:state.state,writer:truth.factoryWriter,explanation:currentTruthLines(truth),candidate:ws.candidates[0].sha,evidenceCount:ws.evidence.length,resultId:state.result.id});
  pass('Actual HTTP/SQLite/Git signed candidate → PostgreSQL custody → real Docker verification '+(failed?'FAIL':'PASS')+'; restarted driver replay cannot dispatch twice');
  if(!failed&&process.env.FACTORY_UI_FIXTURE){const detail=await new EngineeringWorkerProjectionStore(store,agentId).get(work.id);await writeFile(process.env.FACTORY_UI_FIXTURE,JSON.stringify({...detail,events:await store.events(work.id),criteriaHistory:await store.criteriaHistory(work.id),executionHistory:[]}));}
  if(!failed){composition=await composeFactoryResult({work,agentId,profile:engineering.profile,source,workspace:(await direct.inspect(work.id)).workspace,result:state.result,relay,store});pass("Connected Q37 local Relay → Factory → verifier → trusted publisher/CI/review → scoped advisory learning contract");}
  if(failed){
   // Existing native admission and workspace chain, not a second repair architecture.
   engineering.nativeQualification={provider:NATIVE_PROVIDER,modelId:'anthropic/'+engineering.model,scopeId:owner,profileHash:nativeProfileHash(engineering),evidenceRef:'local native repair regression',qualifiedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()};
   const nativeAuthority=new NativeRouteAuthority(store,async()=>engineering),nativeDirect=new DirectDevelopmentStore(store,{...direct.config,assertCurrentAuthority:id=>nativeAuthority.assertEffect(id)});
   const run=await driver().writers.inspect(work.id,truth.factoryWriter.runId);await driver().writers.advance(run,work.version);const next=await store.get(work.id),session='local-repair';
   const budget=new EngineeringConversationBudget(store,nativeAuthority),payment={workId:work.id,sessionId:session,stepKey:'repair-intent:0',modelId:'anthropic/'+engineering.model,requestHash:digest('local repair intent'),microUsd:70000,maxCalls:30,pricing:{input:'0.000002',output:'0.000010',cachedInputTokens:'0.0000002',cacheCreationInputTokens:'0.0000025'},bounds:{inputBytes:5000,maxOutputTokens:2048}};
   await budget.reserve(payment);await budget.assertDispatch(payment);await budget.settle(payment,1000,{content:[{type:'text',text:'Repair the failed independently checked candidate.'}]});
   const admitted=await admitNativeWork(store,work.id,next.version,next.generation,nativeAuthority,session);assert.notEqual(admitted.runId,run.id);
   await nativeDirect.open(work.id,source);let repair=(await nativeDirect.inspect(work.id)).workspace;assert.deepEqual(repair.draftFiles,ws.candidates[0].files);
   await nativeDirect.plan(work.id,repair.revision,'Repair only the failed approved parser behavior.');repair=(await nativeDirect.inspect(work.id)).workspace;
   // First bounded repair deliberately still fails; this must not manufacture Ready.
   await nativeDirect.write(work.id,repair.revision,'quantity.mjs','console.log("bad repair");\n');repair=(await nativeDirect.inspect(work.id)).workspace;await nativeDirect.submit(work.id,repair.revision);
   await new DirectVerificationDriver(nativeDirect,new DockerProtectedVerifier()).run(work.id);assert.equal((await new NativeResultStore(nativeDirect).retain(work.id)).proof.outcome,'FAILED');
   repair=(await nativeDirect.inspect(work.id)).workspace;await nativeDirect.write(work.id,repair.revision,'quantity.mjs',historical.workspace[0].draft_files['quantity.mjs']);repair=(await nativeDirect.inspect(work.id)).workspace;await nativeDirect.submit(work.id,repair.revision);
   await new DirectVerificationDriver(nativeDirect,new DockerProtectedVerifier()).run(work.id);assert.equal((await new NativeResultStore(nativeDirect).retain(work.id)).proof.outcome,'PARTIAL');
   const old=await driver().writers.inspect(work.id,run.id);assert.deepEqual(old.custody_snapshot.workspace.candidates,ws.candidates);assert.deepEqual(old.custody_snapshot.workspace.evidence,ws.evidence);
   pass('Connected Factory failure → normal new native Run → failed repair stays FAILED → bounded repair PASS; immutable Factory history survives');
   delete engineering.nativeQualification;
  }

 }

 async function fresh(title){let {work}=await store.create({title,objective:engineering.objective,repository:engineering.profile.repository,criteria:engineering.criteria,maxCostUsd:1.3,maxDurationSeconds:600,idempotencyKey:randomUUID()});return store.change(work.id,{operation:'resume',expectedVersion:work.version});}
 failCandidate=false;
 for(const boundary of ['RESPONSE_LOST','BEFORE_HTTP']){
  const work=await fresh(boundary);let injected=false;const before=executions;
  const broken=config=>new LiveFactoryAdapter(config,async(url,init)=>{if(String(url).endsWith('/dispatch')&&!injected){injected=true;if(boundary==='RESPONSE_LOST')await fetch(url,init);throw Error('Injected dispatch loss');}return fetch(url,init);});
  await assert.rejects(driver(broken).start(work.id,work.version,work.generation),/Injected dispatch loss/);assert(injected);
  let result;
  if(boundary==='RESPONSE_LOST'){
   const engineeringFile=join(dir,'engineering.json'),factoryFile=join(dir,'factory.json');
   await writeFile(engineeringFile,JSON.stringify(engineering));await writeFile(factoryFile,JSON.stringify({connection,commands:config.commands}));
   const worker=spawn(process.execPath,['--import','tsx',new URL('../scripts/factory-worker.ts',import.meta.url).pathname],{env:{...process.env,MYEVE_ENGINEERING_MODE:'dogfood',VERCEL_ENV:'development',MYEVE_ENGINEERING_CONFIG:engineeringFile,MYEVE_FACTORY_CONFIG:factoryFile,MYEVE_FACTORY_DATABASE_URL:adminURL.replace(/postgres$/,'')+name},stdio:['ignore','pipe','pipe']});
   let output='';worker.stderr.on('data',x=>output+=x);const exited=once(worker,'exit');
   try{
    let saved=false;for(let i=0;i<200;i++){const rows=await database.query('SELECT proof FROM engineering_native_results WHERE work_id=$1',[work.id]);if(rows.length){assert.equal(rows[0].proof.outcome,'PARTIAL');saved=true;break;}if(worker.exitCode!==null)break;await new Promise(r=>setTimeout(r,100));}
    assert(saved,'Autonomous worker did not retain result: '+output);
   }finally{worker.kill('SIGTERM');await exited;}
   pass('Separate restarted MyEve worker autonomously reconciles response loss, admits receipt, takes custody, verifies and retains PARTIAL');
  }
  for(let i=0;i<100;i++){result=await driver().step(work.id);if(['PARTIAL','TERMINAL'].includes(result.state))break;await new Promise(r=>setTimeout(r,50));}
  assert.equal(result.state,boundary==='RESPONSE_LOST'?'PARTIAL':'TERMINAL');assert.equal(executions-before,boundary==='RESPONSE_LOST'?1:0);
  const decision=await driver().decision(work.id);const [route]=await database.query('SELECT * FROM engineering_route_runs WHERE decision_id=$1',[decision.id]);assert.equal(route.dispatch_state,'TERMINAL');
  await driver().step(work.id);assert.equal(executions-before,boundary==='RESPONSE_LOST'?1:0);
  pass(boundary+': durable UNKNOWN → restarted readback → exact terminal fence, never resend dispatch');
 }
 // Keep a real producer job active until the fixture explicitly settles it.
 // STOP must retain the sole writer throughout that interval.
 const stoppingWork=await fresh('Connected stop');let release;
 heldExecution=new Promise(r=>release=r);const priorExecutions=executions;
 await driver().start(stoppingWork.id,stoppingWork.version,stoppingWork.generation);
 for(let i=0;i<100&&executions===priorExecutions;i++)await new Promise(r=>setTimeout(r,10));
 assert.equal(executions-priorExecutions,1);
 const stoppingDecision=await driver().decision(stoppingWork.id);
 const [stoppingRow]=await database.query('SELECT id FROM engineering_route_runs WHERE decision_id=$1',[stoppingDecision.id]);
 const stoppingRun=await driver().writers.inspect(stoppingWork.id,stoppingRow.id);
 const stopIdentity=await driver().writers.identity(stoppingRun),realAdapter=new LiveFactoryAdapter(connection);
 assert.equal((await realAdapter.read(stopIdentity)).state,'RUNNING');
 const stopped=await driver().stop(stoppingWork.id);assert.equal(stopped.dispatch_state,'STOPPING');
 assert.equal((await realAdapter.read(stopIdentity)).state,'STOPPING');assert.equal(await realAdapter.observe(stopIdentity),null);
 const activeFacts=await new NativeRouteAuthority(store,async()=>engineering).read(await store.get(stoppingWork.id));assert.equal(activeFacts.facts.writerState,'ACTIVE');
 await assert.rejects(driver().writers.advance(stoppingRun,stoppingWork.version),/terminal|quiesc|fenc/i);
 release();heldExecution=null;
 let settled;for(let i=0;i<100;i++){settled=await driver().step(stoppingWork.id);if(settled.state==='TERMINAL')break;await new Promise(r=>setTimeout(r,20));}
 assert.equal(settled.state,'TERMINAL');assert.equal((await realAdapter.read(stopIdentity)).quiescent,true);
 await realAdapter.dispatch(stopIdentity);assert.equal(executions-priorExecutions,1);
 assert.equal((await realAdapter.read(stopIdentity)).state,'CANCELLED');
 pass('Connected RUNNING → STOPPING retains writer until actual executor settles → terminal tombstone rejects delayed START');
 const unavailable=await fresh('Factory unavailable');let called=0;
 const offline=config=>new LiveFactoryAdapter(config,async()=>{called++;throw Error('Offline fixture');});
 await assert.rejects(driver(offline).start(unavailable.id,unavailable.version,unavailable.generation));assert(called>0);
 assert.equal((await database.query('SELECT * FROM engineering_route_runs WHERE work_id=$1',[unavailable.id])).length,0);
 const pendingTruth=(await new EngineeringWorkerProjectionStore(store,agentId).get(unavailable.id)).projection;assert.equal(pendingTruth.factoryPreparation.state,'BLOCKED');assert(pendingTruth.factoryPreparation.blocker.includes('Offline'));assert(currentTruthLines(pendingTruth).some(line=>line.includes('Offline')));pass('Unavailable preparation retains request and grants no writer');
 const overlap=(await pool.query("SELECT work_id FROM engineering_route_runs WHERE status NOT IN ('COMPLETED','FAILED','CANCELLED') GROUP BY work_id HAVING count(*)>1")).rowCount;assert.equal(overlap,0);
 const output={checks,results,journeys,composition,executions,counters:{concurrentWriters:overlap,duplicateDispatches:executions-4,falseReady:0,unauthenticatedAdmissions:0},liveMyFactory:'NOT_RUN',qualification:'Local real transport, synthetic executor, real independent Docker verifier'};
 if(process.env.FACTORY_BETA_EVIDENCE)await writeFile(process.env.FACTORY_BETA_EVIDENCE,JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output));
}finally{if(supervisor)await supervisor.close();await pool.end();await admin.query('DROP DATABASE '+name+' WITH (FORCE)');await admin.end();await rm(dir,{recursive:true,force:true});}
