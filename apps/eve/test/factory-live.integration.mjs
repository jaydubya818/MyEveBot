import {qualifyAlphaConversation} from './alpha-conversation-fixture.mjs';
import {enqueueFactoryCommand} from '../lib/engineering/factory-commands.ts';
import {CURRENT_DATABASE_MIGRATION} from "../lib/database-schema.ts";
import {controlledCliResponses} from './factory-controlled-cli.mjs';
import {assertFactorySpendCanStart} from '../lib/engineering/factory-spend.ts';
import {createServer} from 'node:http';
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
const attempt4=process.env.FACTORY_ATTEMPT4==='1';
const liveBase=attempt4?JSON.parse(await readFile(new URL('./fixtures/quantity-live-base.json',import.meta.url),'utf8')):null;
const root=process.env.MYFACTORY_SOURCE_ROOT;if(!root?.startsWith('/'))throw Error('Explicit owned Factory source required');
const {createSupervisor}=await import(pathToFileURL(join(root,'apps/supervisor/src/server.ts')));
const {sourceIdentity}=await import(pathToFileURL(join(root,'apps/supervisor/src/producer-results.ts')));
const {runCodex:installedRunCodex}=await import(pathToFileURL(join(root,'packages/agents/src/index.ts')));
const {DEFAULT_VERIFICATION_IMAGE,verifyCandidate:producerVerifyCandidate}=await import(pathToFileURL(join(root,'packages/verification/src/index.ts')));
const dir=await mkdtemp(join(tmpdir(),'factory-connected-')),repo=join(dir,'repository'),dataDir=join(dir,'producer');await mkdir(repo);await mkdir(dataDir);
const adminURL=process.env.FACTORY_TEST_DATABASE_URL??'postgresql://postgres@127.0.0.1:55479/postgres';if(new URL(adminURL).hostname!=='127.0.0.1'||new URL(adminURL).pathname!=='/postgres')throw Error('Disposable local database server required');const name='factory_beta_'+randomBytes(6).toString('hex');
const admin=new Client(adminURL);await admin.connect();await admin.query('CREATE DATABASE '+name);const pool=new Pool({connectionString:adminURL.replace(/postgres$/,'')+name});
const database={query:async(s,p)=>(await pool.query(s,p)).rows};
const migrationDB={...database,transaction:async ss=>{const c=await pool.connect();try{await c.query('BEGIN');for(const s of ss)await c.query(s.sql,s.params);await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}};
let supervisor,spendProvider,providerCalls=0,checks=0,composition;const spendFixture=process.env.FACTORY_SPEND_FIXTURE==='1';const installedCli=process.env.FACTORY_INSTALLED_CLI==='1';if(installedCli&&!spendFixture)throw Error('Installed CLI qualification requires loopback spend fixture');const cliProvider=controlledCliResponses({exerciseLocalChecks:attempt4,exerciseSearch:process.env.FACTORY_ENVELOPE_DRY_RUN==='1'});const cliVersion=installedCli?execFileSync('codex',['--version'],{encoding:'utf8'}).trim():'synthetic-codex-1';const modelBoundary=process.env.FACTORY_MODEL_BOUNDARY==='1';if(modelBoundary&&!installedCli)throw Error('Model boundary requires installed CLI and loopback provider');let boundaryEnabled=false,boundaryCapture=null,boundaryError=null;const boundaryAbort=new AbortController();const envelopeDryRun=process.env.FACTORY_ENVELOPE_DRY_RUN==='1';if(envelopeDryRun&&!installedCli)throw Error('Envelope dry run requires installed CLI');const envelope=envelopeDryRun?JSON.parse(await readFile(new URL('../../../docs/verification/2026-09-28-spend-v2-integration/price-card.json',import.meta.url),'utf8')):null;const workCeiling=attempt4?1.35:envelope?envelope.proposedWorkCeilingMicrousd/1e6:1.3;const perOperationReserve=attempt4?336864:envelope?.perOperationReserveMicrousd??(installedCli?108000:1200);const results=[],journeys=[],terminalReceipts=[];function pass(label){checks++;results.push(label);console.log('PASS',label);}
try{
 const migrations=await loadMigrations();assert.equal(migrations.at(-1).name,CURRENT_DATABASE_MIGRATION);
 const pin=JSON.parse(await readFile(new URL('../../../docs/verification/2026-09-27-myfactory-beta/0057-ownership.json',import.meta.url),'utf8'));
 assert.equal(migrations[56].checksum,pin.sha256);
 await runMigrations(migrationDB,migrations.slice(0,56),()=>{});
 await assert.rejects(runMigrations(migrationDB,[...migrations.slice(0,56),{...migrations[56],statements:[...migrations[56].statements,'SELECT injected_failure_0057()']}],()=>{}),/injected_failure/);
 assert.equal((await pool.query('SELECT count(*)::int n FROM sofie_schema_migrations')).rows[0].n,56);
 assert.equal((await pool.query("SELECT 1 FROM information_schema.columns WHERE table_name='engineering_routing_decisions' AND column_name='factory_preparation'")).rowCount,0);pass('0057 complete failure rollback');
 await runMigrations(migrationDB,migrations,()=>{});await runMigrations(migrationDB,migrations,()=>{});pass('0056→0057 and idempotent rerun');
 const issued=JSON.parse(await readFile(new URL('../../../docs/verification/2026-09-26-m1er1-window/window-issued-config.json',import.meta.url),'utf8'));
 const historical=JSON.parse(await readFile(new URL('../../../docs/verification/2026-09-26-m1er1-window/window-closure.json',import.meta.url),'utf8'));
 const git=(...a)=>execFileSync('git',['-C',repo,...a],{encoding:'utf8'}).trim();if(envelopeDryRun){execFileSync('git',['clone','-q',new URL('../../../docs/verification/2026-09-27-live-readiness/live-fixture.bundle',import.meta.url).pathname,repo]);git('checkout','--detach','024bab53fbde4577deab812a1e9705f8118b176f');git('remote','remove','origin');}else git('init','-q');git('config','user.name','Local Factory fixture');git('config','user.email','fixture@example.invalid');
 const files=attempt4?liveBase.files:envelopeDryRun?Object.fromEntries(await Promise.all(git('ls-tree','-r','--name-only','HEAD').split('\n').map(async path=>[path,await readFile(join(repo,path),'utf8')]))):historical.workspace[0].source_files;for(const [path,text] of Object.entries(files)){await mkdir(join(repo,path,'..'),{recursive:true});await writeFile(join(repo,path),text);}if(!envelopeDryRun){git('add','.');git('commit','-qm','Local approved fixture');}const source={sha:git('rev-parse','HEAD'),files};
 const owner='factory-beta-'+randomUUID(),agentId='agent-'+randomUUID();await pool.query(`INSERT INTO agents(id,owner_id,name,slug,role,instructions,is_primary,status,max_estimated_cost_usd,max_runtime_seconds,max_steps) VALUES($1,$2,'Sofie','sofie','engineer','Local connected Factory qualification',true,'active',$3,3600,30)`,[agentId,owner,workCeiling]);
 const engineering=runtimeSchema.parse({...issued,ownerId:owner,agentId,nativeQualification:undefined,profile:{...issued.profile,repository:'fixture/golden'},approvedBase:manifestForSnapshot(source)});
 const pair=generateKeyPairSync('ed25519'),token='a'.repeat(64),key={factoryId:'factory-beta',keyId:'local',publicKey:pair.publicKey.export({type:'spki',format:'pem'}).toString(),activeFrom:'2020-01-01T00:00:00Z',notAfter:'2099-01-01T00:00:00Z'};
 const signing={factoryId:key.factoryId,currentKeyId:key.keyId,privateKey:pair.privateKey.export({type:'pkcs8',format:'pem'}).toString(),keys:[key]};
 await writeFile(join(dataDir,'connections.json'),JSON.stringify({clients:[{id:'myeve',name:'Local qualification',tokenSha256:createHash('sha256').update(token).digest('hex'),repositoryPaths:[repo],actions:['factory.prepare','factory.dispatch','factory.observe','factory.stop']}]}));
 let executions=0,completionExecutions=0,failCandidate=false,failedExecution=false,heldExecution=null,unknownProvider=false;
 if(spendFixture){spendProvider=createServer((req,res)=>{providerCalls++;if(boundaryEnabled){void (async()=>{const chunks=[];for await(const chunk of req)chunks.push(chunk);const request=JSON.parse(Buffer.concat(chunks).toString());assert.equal(request.model,'openai/gpt-5.4-mini');assert.equal(req.url,'/v1/responses');assert.equal(boundaryCapture,null,'Duplicate controlled boundary request');boundaryCapture={model:request.model,path:req.url,realModelOperations:0,forwarded:false};res.writeHead(503);res.end('Controlled boundary: stop before model generation');setTimeout(()=>boundaryAbort.abort(),100);})().catch(error=>{boundaryError=error.message;res.writeHead(500);res.end('Fixture assertion failed');boundaryAbort.abort();});return;}if(unknownProvider){res.writeHead(503);res.end('synthetic response lost');return;}if(installedCli){void cliProvider.respond(req,res,providerCalls).catch(error=>{console.error('Controlled provider:',String(error));res.writeHead(500);res.end(String(error));});return;}res.writeHead(200,{'content-type':'application/json','x-request-id':'synthetic-provider-'+providerCalls});res.end(JSON.stringify({id:'fixture-response-'+providerCalls,status:'completed',usage:{input_tokens:10,output_tokens:10}}));});await new Promise(r=>spendProvider.listen(0,'127.0.0.1',r));}
 const price={revision:envelope?'openai-gpt54mini-20260928':'synthetic-v1',model:envelope?.model??'openai/gpt-5.4-mini',validUntil:new Date(Date.now()+3600000).toISOString(),contextLimitTokens:attempt4?400000:envelope?.contextLimitTokens??(installedCli?100000:1000),outputLimitTokens:attempt4?8192:envelope?.outputLimitTokens??(installedCli?4000:100),inputMicrousdPerMillion:attempt4?750000:envelope?.inputMicrousdPerMillion??1000000,outputMicrousdPerMillion:attempt4?4500000:envelope?.outputMicrousdPerMillion??2000000};
 process.env.FACTORY_CODEX_MODEL=price.model;const settledPerCall=Math.ceil(10*price.inputMicrousdPerMillion/1e6)+Math.ceil(10*price.outputMicrousdPerMillion/1e6);
 const deps={preflightCodex:async()=>({binaryAvailable:true,authenticated:true,version:cliVersion,workerProfile:'mac',error:null}),runCodex:async input=>{const completion=input.sandbox==='read-only';if(completion)completionExecutions++;else executions++;if(failedExecution)return {success:false,status:'failed',eventsPath:'fixture',usage:null};if(heldExecution){await heldExecution;return {success:false,status:'cancelled',eventsPath:'fixture',usage:null};}if(installedCli){
 assert.equal(input.model,price.model);
 if(boundaryEnabled)return installedRunCodex({...input,timeoutMs:10000,signal:AbortSignal.any([input.signal,boundaryAbort.signal])});
 await cliProvider.begin(input,failCandidate?historical.workspace[0].candidates[0].files['quantity.mjs']:historical.workspace[0].draft_files['quantity.mjs']);
 const result=await installedRunCodex({...input,...(unknownProvider?{timeoutMs:20000}:{})});
 if(!unknownProvider&&!result.success)console.error('Controlled CLI failed:',result.error,await readFile(result.stderrPath,'utf8'),await readFile(result.eventsPath,'utf8'));
 if(!unknownProvider)assert(result.success,JSON.stringify({result,stderr:await readFile(result.stderrPath,'utf8'),events:await readFile(result.eventsPath,'utf8')}));
 return result;
 }if(spendFixture){assert(input.gateway);const paid=await fetch(input.gateway.baseUrl+'/responses',{method:'POST',headers:{authorization:'Bearer '+input.gateway.childToken,'content-type':'application/json'},body:JSON.stringify({model:input.model,input:'synthetic bounded coding request'})});if(unknownProvider){assert.equal(paid.status,503);return {success:false,status:'failed',eventsPath:'synthetic UNKNOWN',usage:null};}assert.equal(paid.status,200);}
 if(!completion)await writeFile(join(input.workspacePath,'quantity.mjs'),failCandidate?historical.workspace[0].candidates[0].files['quantity.mjs']:historical.workspace[0].draft_files['quantity.mjs']);return {success:true,status:'completed',threadId:'local-fixture',eventsPath:'fixture',usage:null};},verifyCandidate:async input=>{if((envelopeDryRun||attempt4)&&!failCandidate){const result=await producerVerifyCandidate(input);if(result.checks.some(c=>c.status!=='passed')||!result.checks.length)console.error('Producer verifier diagnostic:',JSON.stringify(result),await Promise.all(result.checks.map(c=>readFile(c.logPath,'utf8'))));return result;}await mkdir(input.artifactDir,{recursive:true});const checks=[];for(const [i,command] of input.commands.entries()){const logPath=join(input.artifactDir,i+'.log');await writeFile(logPath,'Untrusted producer claims PASS; MyEve must independently verify.');const at=new Date().toISOString();checks.push({candidateCommit:input.candidateSha,candidateTree:git('rev-parse',input.candidateSha+'^{tree}'),command,status:'passed',exitCode:0,startedAt:at,finishedAt:at,logPath,reason:null});}return {checks,reason:null};}};
 supervisor=createSupervisor({dataDir,resultSigning:signing,jobDependencies:deps,localFactoryFixture:!spendFixture,...(spendFixture?{localSpendFixture:{upstreamOrigin:'http://127.0.0.1:'+spendProvider.address().port,upstreamApiKey:'synthetic-provider-only',price}}:{})});await new Promise(r=>supervisor.server.listen(0,'127.0.0.1',r));
 const configuration={model:price.model,executor:'codex-cli',executorVersion:cliVersion,skillRevision:'fd8f20a879b507cf09feba08663a1edf7a949353',workerProfile:'mac',verificationImage:DEFAULT_VERIFICATION_IMAGE,nodeVersion:process.version,platform:process.platform,architecture:process.arch,commands:['node --test'],allowedPaths:engineering.profile.allowedPaths,timeoutMs:1800000};
 const sourceDigest=sourceIdentity(),configurationDigest=digest(configuration);
 const connection={origin:'http://127.0.0.1:'+supervisor.server.address().port,token,factoryId:key.factoryId,sourceDigest,configurationDigest,factoryVersion:digest({sourceDigest,configurationDigest}),repositoryPath:repo,keys:[key],qualification:{scopeId:owner,profileHash:digest(engineering.profile),evidenceRef:'connected local qualification',qualifiedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString(),mode:'LOCAL_FIXTURE',spendEnforced:true}};
 if(spendFixture){const proof={status:'QUALIFIED',evidenceRef:'controlled local consumer fixture; not real provider qualification'};connection.qualification.mode='LOCAL_SPEND_FIXTURE';connection.spendContract={version:'WORK_LEDGER_V2',sourceDigest};connection.spendPlan={version:'WORK_LEDGER_V2',pricingRevision:price.revision,plannedProductiveOperations:envelope?.plannedProductiveOperations??2,plannedCompletionOperations:1,maxPaidOperations:envelope?.maxPaidOperations??3,completionReserveMicrousd:perOperationReserve};connection.qualification.spendReview={environment:'LOCAL_FIXTURE',sourceDigest,factoryVersion:connection.factoryVersion,expiresAt:price.validUntil,hardCeiling:proof,preCallEnforcement:proof,accounting:proof,unknownRetention:proof,completion:proof,pricing:{...proof,model:price.model,revision:price.revision,validUntil:price.validUntil}};}
 const config={engineering,connection,commands:configuration.commands,routing:{intent:'PRODUCE',boundedOperationQualified:false}},store=new WorkStore({scopeId:owner,scopeKind:'personal',actorId:owner},database);
 const authority=new FactoryRouteAuthority(store,async()=>config),direct=new DirectDevelopmentStore(store,{profile:engineering.profile,approvedBase:engineering.approvedBase,objective:engineering.objective,criteria:engineering.criteria,agentId,issueNumber:1});
 const driver=(adapterFor)=>new FactoryWorkDriver(store,authority,direct,new DockerProtectedVerifier(),async()=>source,adapterFor);
 // The real action driver reads backend policy before source acquisition or PREPARE.
 for(const routingConnection of [connection,{...connection,qualification:{...connection.qualification,mode:'LIVE',spendEnforced:false}},{...connection,origin:'https://unqualified.invalid',qualification:{...connection.qualification,mode:'LIVE',spendEnforced:false}}])
 for(const [intent,qualified,route] of [['INVESTIGATE',false,'DIRECT'],['PLAN',false,'DIRECT'],['BOUNDED_OPERATION',true,'DIRECT'],['BOUNDED_OPERATION',false,'HUMAN'],['UNSUPPORTED',false,'HUMAN'],['APPROVE',false,'HUMAN'],['JUDGMENT',false,'HUMAN'],[null,false,'HUMAN']]){
  const selected=await fresh('Backend routing '+intent),before=executions;
  const selectedConfig={...config,connection:routingConnection,routing:intent?{intent,boundedOperationQualified:qualified}:undefined};
  const selectedDriver=new FactoryWorkDriver(store,new FactoryRouteAuthority(store,async()=>selectedConfig),direct,new DockerProtectedVerifier(),async()=>{throw Error('Non-production route acquired source');},()=>{throw Error('Non-production route called Factory');});
  const result=await selectedDriver.start(selected.id,selected.version,selected.generation);
  assert.equal(result.route,route);assert.equal(result.state,'ROUTED');
  const saved=await selectedDriver.decision(selected.id);assert.equal(saved.selected_route,route);assert.equal(saved.status,'PROPOSED');assert.equal(saved.factory_preparation,null);
  assert.equal((await database.query('SELECT id FROM engineering_route_runs WHERE work_id=$1',[selected.id])).length,0);assert.equal(executions,before);
  assert.equal((await selectedDriver.start(selected.id,selected.version,selected.generation)).route,route);
 }
 for(const origin of [connection.origin,'https://unqualified.invalid']){
  const selected=await fresh('Unqualified paid production'),before=executions;
  const deniedConfig={...config,connection:{...connection,origin,qualification:{...connection.qualification,mode:'LIVE',spendEnforced:false}}};
  const deniedDriver=new FactoryWorkDriver(store,new FactoryRouteAuthority(store,async()=>deniedConfig),direct,new DockerProtectedVerifier(),async()=>{throw Error('Unqualified production acquired source');},()=>{throw Error('Unqualified production called Factory');});
  await assert.rejects(deniedDriver.start(selected.id,selected.version,selected.generation),error=>error.code==='factory_spend_unqualified');
  assert.equal(await deniedDriver.decision(selected.id),null);assert.equal(executions,before);
  assert.equal((await database.query('SELECT id FROM engineering_route_runs WHERE work_id=$1',[selected.id])).length,0);
 }
 pass('LIVE spend-unqualified or unusable Factory transport does not block DIRECT/HUMAN; PRODUCE is denied before transport or preparation');
 pass('Backend Work-bound intent routes investigation/planning/qualified bounded operations DIRECT and unsupported/judgment/unclassified HUMAN before Factory preparation; replay grants no writer');
 if(spendFixture){
  for(const field of ['pricing','completion','accounting']){
   const review=structuredClone(connection.qualification.spendReview);review[field].status='PENDING';review[field].evidenceRef=null;
   const pending={...config,connection:{...connection,qualification:{...connection.qualification,spendReview:review}}};
   const rejected=new FactoryWorkDriver(store,new FactoryRouteAuthority(store,async()=>pending),direct,new DockerProtectedVerifier(),async()=>{throw Error('Pending spend qualification acquired source');},()=>{throw Error('Pending spend qualification called Factory');});
   const work=await fresh('Missing '+field);await assert.rejects(rejected.start(work.id,work.version,work.generation),error=>error.code==='factory_spend_unqualified');assert.equal(await rejected.decision(work.id),null);
   for(const [intent,route] of [['PLAN','DIRECT'],['INVESTIGATE','DIRECT'],['JUDGMENT','HUMAN']]){
    const directConfig={...pending,routing:{intent,boundedOperationQualified:false}},unaffected=new FactoryWorkDriver(store,new FactoryRouteAuthority(store,async()=>directConfig),direct,new DockerProtectedVerifier(),async()=>{throw Error('Non-Factory scope acquired source');},()=>{throw Error('Non-Factory scope called Factory');});
    const selected=await fresh(field+' '+intent);assert.equal((await unaffected.start(selected.id,selected.version,selected.generation)).route,route);
   }
  }
  pass('Actual producer admission denies pending pricing/completion/accounting while PLAN, INVESTIGATE and HUMAN remain available');
 }
 for(const failed of [false,true]){
  failCandidate=failed;
  let {work}=await store.create({title:'Connected Factory '+(failed?'failure':'success'),objective:engineering.objective,repository:engineering.profile.repository,criteria:engineering.criteria,maxCostUsd:workCeiling,maxDurationSeconds:600,idempotencyKey:randomUUID()});work=await store.change(work.id,{operation:'resume',expectedVersion:work.version});
  const relay=localRelay(work,agentId);
  let state=await driver().start(work.id,work.version,work.generation);
  for(let i=0;i<(installedCli?600:100)&&!['PARTIAL','FAILED','TERMINAL'].includes(state.state);i++){await new Promise(r=>setTimeout(r,50));state=await driver().step(work.id);}
  if(installedCli&&!['PARTIAL','FAILED','TERMINAL'].includes(state.state))console.error('Controlled journey:',JSON.stringify(state),JSON.stringify(supervisor.storage.listWorkOrders().flatMap(o=>supervisor.storage.listEvents(o.id)).filter(e=>e.type.startsWith('run.')&&e.type!=='run.signed_result')));
  assert.equal(state.state,failed?'FAILED':'PARTIAL');assert.equal(executions,failed?2:1);
  const ws=(await direct.inspect(work.id)).workspace;assert.equal(ws.producer,'MYFACTORY');assert(ws.evidence.length);assert.equal((await driver().step(work.id)).state,state.state);assert.equal(executions,failed?2:1);
  const truth=(await new EngineeringWorkerProjectionStore(store,agentId).get(work.id)).projection;assert.equal(truth.readiness.ready,false);assert(truth.factoryWriter.dispatchIdentity);assert(truth.factoryWriter.remoteRunId);assert(truth.factoryWriter.requestId);assert.equal(truth.factoryPreparation.state,'COMPLETED');
  if(spendFixture){assert.equal(truth.factoryAccounting.settledMicrousd,settledPerCall*(envelope?4:installedCli?3:2));assert.equal(truth.factoryAccounting.reservedMicrousd,0);assert.equal(truth.factoryAccounting.paidOperationsUsed,envelope?4:installedCli?3:2);assert.equal(truth.factoryAccounting.ceilingMicrousd,Math.floor(workCeiling*1e6));assert(currentTruthLines(truth).some(line=>line.includes('Factory Work budget:')));}
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

 async function fresh(title){let {work}=await store.create({title,objective:engineering.objective,repository:engineering.profile.repository,criteria:engineering.criteria,maxCostUsd:workCeiling,maxDurationSeconds:600,idempotencyKey:randomUUID()});return store.change(work.id,{operation:'resume',expectedVersion:work.version});}
 failCandidate=false;
 // Deployed transport composition: enqueue intent, then a separate local process
 // enters the unchanged canonical driver. All model replies remain fixtures.
 {
  const work=await fresh('Private-alpha durable queue'),before=executions;
  const action={operation:'start',expectedWorkVersion:work.version,expectedWorkGeneration:work.generation};
  const policy={ownerId:owner,repository:work.repository,maxCostUsd:1.35,maxDurationSeconds:600};
  const queued=await enqueueFactoryCommand(store,work.id,action,policy);
  assert.equal((await enqueueFactoryCommand(store,work.id,action,policy)).command.id,queued.command.id);
  const engineeringFile=join(dir,'queue-engineering.json'),factoryFile=join(dir,'queue-factory.json');
  await writeFile(engineeringFile,JSON.stringify(engineering));await writeFile(factoryFile,JSON.stringify({connection,commands:config.commands,routing:config.routing}));
  const env={...process.env,MYEVE_ENGINEERING_MODE:'dogfood',MYEVE_BETA_MODE:'private-alpha',MYEVE_FACTORY_LOCAL_WORKER:'true',MYEVE_OWNER_ID:owner,DATABASE_URL:adminURL.replace(/postgres$/,'')+name,VERCEL_ENV:'development',MYEVE_ENGINEERING_CONFIG:engineeringFile,MYEVE_FACTORY_CONFIG:factoryFile,MYEVE_FACTORY_DATABASE_URL:adminURL.replace(/postgres$/,'')+name};
  const launch=()=>spawn(process.execPath,['--import','tsx',new URL('../scripts/factory-worker.ts',import.meta.url).pathname],{env,stdio:['ignore','pipe','pipe']});
  let worker=launch(),exit=once(worker,'exit'),output='';worker.stderr.on('data',x=>output+=x);
  try {
   let ready=false;worker.stdout.on('data',x=>{if(String(x).includes('connected'))ready=true;});
   for(let i=0;i<100&&!ready&&worker.exitCode===null;i++)await new Promise(r=>setTimeout(r,50));
   assert(ready,'Queue worker did not start: '+output);
   const contender=launch();let denied='';contender.stderr.on('data',x=>denied+=x);await once(contender,'exit');assert.match(denied,/Another Factory worker owns this scope/);
   let saved=false;for(let i=0;i<400;i++){const rows=await database.query('SELECT proof FROM engineering_native_results WHERE work_id=$1',[work.id]);if(rows.length){assert.equal(rows[0].proof.outcome,'PARTIAL');saved=true;break;}if(worker.exitCode!==null)break;await new Promise(r=>setTimeout(r,100));}
   assert(saved,'Queued Work did not produce verified result: '+output);
  } finally {worker.kill('SIGTERM');await exit;}
  assert.equal(executions-before,1);
  worker=launch();exit=once(worker,'exit');worker.stderr.resume();worker.stdout.resume();await new Promise(r=>setTimeout(r,2500));worker.kill('SIGTERM');await exit;
  assert.equal(executions-before,1);
  assert.equal((await database.query('SELECT status FROM engineering_factory_commands WHERE id=$1',[queued.command.id]))[0].status,'done');
  pass('Private-alpha queue: duplicate intent deduplicates; exclusive worker; canonical dispatch/custody/protected verification; restart never redispatches');
 }
 for(const boundary of ['RESPONSE_LOST','BEFORE_HTTP']){
  const work=await fresh(boundary);let injected=false;const before=executions;
  const broken=config=>new LiveFactoryAdapter(config,async(url,init)=>{if(String(url).endsWith('/dispatch')&&!injected){injected=true;if(boundary==='RESPONSE_LOST')await fetch(url,init);throw Error('Injected dispatch loss');}return fetch(url,init);});
  await assert.rejects(driver(broken).start(work.id,work.version,work.generation),/Injected dispatch loss/);assert(injected);
  let result;
  if(boundary==='RESPONSE_LOST'){
   const engineeringFile=join(dir,'engineering.json'),factoryFile=join(dir,'factory.json');
   await writeFile(engineeringFile,JSON.stringify(engineering));await writeFile(factoryFile,JSON.stringify({connection,commands:config.commands,routing:config.routing}));
   const worker=spawn(process.execPath,['--import','tsx',new URL('../scripts/factory-worker.ts',import.meta.url).pathname],{env:{...process.env,MYEVE_ENGINEERING_MODE:'dogfood',MYEVE_BETA_MODE:'private-alpha',MYEVE_FACTORY_LOCAL_WORKER:'true',MYEVE_OWNER_ID:owner,DATABASE_URL:adminURL.replace(/postgres$/,'')+name,VERCEL_ENV:'development',MYEVE_ENGINEERING_CONFIG:engineeringFile,MYEVE_FACTORY_CONFIG:factoryFile,MYEVE_FACTORY_DATABASE_URL:adminURL.replace(/postgres$/,'')+name},stdio:['ignore','pipe','pipe']});
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
 await retainedTerminalReceipt(stoppingWork,stoppingRun,'CANCELLED');
 pass('Connected RUNNING → STOPPING retains writer until actual executor settles → terminal tombstone rejects delayed START');
 async function retainedTerminalReceipt(work,run,status){
  const rows=await database.query('SELECT id,state,envelope,provenance FROM engineering_factory_receipts WHERE request_id=$1',[run.factory_request_id]);
  assert.equal(rows.length,1,JSON.stringify({state:await driver().step(work.id),events:supervisor.storage.listWorkOrders().flatMap(o=>supervisor.storage.listEvents(o.id)).filter(e=>e.type==='run.result_unavailable'||e.type==='run.agent_failed')}));assert(['ADMITTED','STALE'].includes(rows[0].state));assert.equal(rows[0].provenance.manifest.status,status);
  const retained=JSON.stringify(rows[0]);
  const replay=await driver().step(work.id);assert.equal(replay.state,'TERMINAL');assert.equal(replay.receiptStatus,rows[0].state);
  assert.equal(JSON.stringify((await database.query('SELECT id,state,envelope,provenance FROM engineering_factory_receipts WHERE request_id=$1',[run.factory_request_id]))[0]),retained);
  assert.equal((await database.query('SELECT 1 FROM engineering_direct_workspaces WHERE work_id=$1',[work.id])).length,0);
  assert.equal((await database.query('SELECT 1 FROM engineering_direct_verification_jobs WHERE work_id=$1',[work.id])).length,0);
  const fenced=await driver().writers.inspect(work.id,run.id);assert.equal(fenced.dispatch_state,'TERMINAL');assert(fenced.fenced_at);
  assert.equal((await new EngineeringWorkerProjectionStore(store,agentId).get(work.id)).projection.readiness.ready,false);
  terminalReceipts.push({workId:work.id,receiptId:rows[0].id,state:rows[0].state,producerStatus:status,envelopeSha256:createHash('sha256').update(rows[0].envelope).digest('hex'),replayBytesChanged:0,candidateWorkspaces:0,verificationJobs:0,writerState:fenced.dispatch_state});
 }
 failedExecution=true;const failedWork=await fresh('Producer failed execution');
 let maskedFailedRead=false;
 const terminalRace=c=>{const a=new LiveFactoryAdapter(c),read=a.read.bind(a);a.read=async identity=>{const r=await read(identity);if(r.state==='FAILED'&&!maskedFailedRead){maskedFailedRead=true;return {...r,state:'RUNNING',quiescent:false};}return r;};return a;};
 let failedState=await driver(terminalRace).start(failedWork.id,failedWork.version,failedWork.generation);
 for(let i=0;i<100&&failedState.state!=='TERMINAL';i++){await new Promise(r=>setTimeout(r,20));failedState=await driver(terminalRace).step(failedWork.id);}
 assert.equal(failedState.state,'TERMINAL');assert.equal(failedState.outcome,'FAILED');assert(maskedFailedRead,'Fixture must race old RUNNING observation with terminal reconciliation');
 const failedDecision=await driver().decision(failedWork.id);const [failedRow]=await database.query('SELECT id FROM engineering_route_runs WHERE decision_id=$1',[failedDecision.id]);
 await retainedTerminalReceipt(failedWork,await driver().writers.inspect(failedWork.id,failedRow.id),'FAILED');failedExecution=false;
 pass('Real signed CANCELLED and FAILED receipts survive terminal fencing and reconstructed-driver replay without candidate, verifier or writer authority');
 const unavailable=await fresh('Factory unavailable');let called=0;
 const offline=config=>new LiveFactoryAdapter(config,async()=>{called++;throw Error('Offline fixture');});
 await assert.rejects(driver(offline).start(unavailable.id,unavailable.version,unavailable.generation));assert(called>0);
 assert.equal((await database.query('SELECT * FROM engineering_route_runs WHERE work_id=$1',[unavailable.id])).length,0);
 const pendingTruth=(await new EngineeringWorkerProjectionStore(store,agentId).get(unavailable.id)).projection;assert.equal(pendingTruth.factoryPreparation.state,'BLOCKED');assert(pendingTruth.factoryPreparation.blocker.includes('Offline'));assert(currentTruthLines(pendingTruth).some(line=>line.includes('Offline')));pass('Unavailable preparation retains request and grants no writer');
 if(spendFixture){
  unknownProvider=true;failedExecution=false;const work=await fresh('UNKNOWN accounting'),before=executions;
  let state=await driver().start(work.id,work.version,work.generation);
  for(let i=0;i<(installedCli?800:100)&&state.state!=='TERMINAL';i++){await new Promise(r=>setTimeout(r,40));state=await driver().step(work.id);}
  assert.equal(state.state,'TERMINAL');assert.equal(executions,before+1);
  let truth=(await new EngineeringWorkerProjectionStore(store,agentId).get(work.id)).projection;
  assert.equal(truth.factoryWriter.state,'TERMINAL');assert.equal(truth.factoryAccounting.unknownMicrousd,perOperationReserve);assert.equal(truth.factoryAccounting.reservedMicrousd,perOperationReserve);assert.equal(truth.factoryAccounting.safeAllowanceMicrousd,0);
  assert(currentTruthLines(truth).some(line=>line.includes('uncertain $'+(perOperationReserve/1000000).toFixed(6))));assert(truth.nextStep.includes('reconcile'));
  const spent=truth.factoryWriter.observation.spend;assert.throws(()=>assertFactorySpendCanStart(spent),/reconciliation/);
  await driver().step(work.id);truth=(await new EngineeringWorkerProjectionStore(store,agentId).get(work.id)).projection;
  assert.equal(truth.factoryAccounting.unknownMicrousd,perOperationReserve);assert.equal(executions,before+1);assert.equal(truth.readiness.ready,false);
  pass('Real gateway UNKNOWN exposure survives terminal writer fencing and reconstructed consumer replay; Current Truth retains exposure and denies another paid operation');
 }
 let alphaExecutions=0,alphaJourney=null;
 if(spendFixture&&(!installedCli||modelBoundary||attempt4)){unknownProvider=false;failedExecution=false;failCandidate=false;boundaryEnabled=modelBoundary;alphaExecutions=await qualifyAlphaConversation({store,pool,engineering,connection,direct,source,commands:configuration.commands,pass,executionCount:()=>executions,recordJourney:e=>{alphaJourney=e;},stopAtProviderBoundary:modelBoundary?()=>{assert.equal(boundaryError,null);assert(boundaryCapture,'Controlled provider boundary not reached');return boundaryCapture;}:undefined});}
 const overlap=(await pool.query("SELECT work_id FROM engineering_route_runs WHERE status NOT IN ('COMPLETED','FAILED','CANCELLED') GROUP BY work_id HAVING count(*)>1")).rowCount;assert.equal(overlap,0);
 const output={alphaJourney,attempt4,additionalRealModelOperations:0,...cliProvider.stats(),modelBoundary,boundaryCapture,spendFixture,installedCli,envelopeDryRun,price,workCeiling,fixtureBase:source.sha,factoryVersion:connection.factoryVersion,sourceDigest,configurationDigest,configuration,cliVersion,completionExecutions,providerCalls,checks,results,journeys,terminalReceipts,composition,executions,counters:{concurrentWriters:overlap,duplicateDispatches:executions-(spendFixture?7:6)-alphaExecutions,falseReady:0,unauthenticatedAdmissions:0},liveMyFactory:'NOT_RUN',qualification:installedCli?'Installed CLI, controlled loopback Responses, real transport/custody and independent Docker verifier; no live provider':'Local real transport, synthetic executor, real independent Docker verifier'};
 if(process.env.FACTORY_BETA_EVIDENCE)await writeFile(process.env.FACTORY_BETA_EVIDENCE,JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output));
}finally{
 if(supervisor)await supervisor.close();
 if(spendProvider)await new Promise(r=>spendProvider.close(r));
 await pool.end();
 // Pool.end may resolve before PostgreSQL has observed every socket close.
 // Wait for our disposable database; FORCE can race the closing pg client.
 for(let i=0;i<100;i++){
  const {rows}=await admin.query('SELECT count(*)::int n FROM pg_stat_activity WHERE datname=$1',[name]);
  if(rows[0].n===0){await admin.query('DROP DATABASE '+name);break;}
  if(i===99)throw Error('Disposable database did not quiesce: '+name);
  await new Promise(r=>setTimeout(r,10));
 }
 await admin.end();await rm(dir,{recursive:true,force:true});
}
