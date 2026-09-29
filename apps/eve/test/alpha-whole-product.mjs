import {betaTestPort} from './beta-integration/test-postgres.mjs';
import {BetaIntegration} from '../lib/beta-integration/runtime.ts';
import {CanonicalBetaWork} from '../lib/beta-integration/canonical-work.ts';
import {CanonicalCapsules} from '../lib/capsules/canonical-memory.ts';
import {EngineeringKnowledgeStore} from '../lib/engineering/knowledge.ts';
import {LearningStore} from '../lib/total-recall/store.ts';
import {LearningRuntime} from '../lib/total-recall/runtime.ts';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
const execAsync=promisify(execFile);
import {controlledCliResponses} from './factory-controlled-cli.mjs';
import {assertFactorySpendCanStart} from '../lib/engineering/factory-spend.ts';
import {createServer} from 'node:http';

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
if(process.env.FACTORY_SPEND_FIXTURE||process.env.FACTORY_INSTALLED_CLI||process.env.FACTORY_ENVELOPE_DRY_RUN)throw Error('This whole-product regression is strictly non-paid.');
const root=process.env.MYFACTORY_SOURCE_ROOT;if(!root?.startsWith('/'))throw Error('Explicit owned Factory source required');
const expectedProducer=process.env.MYFACTORY_EXPECTED_SHA ?? '925530a6ba8764df6a7b8637192fe32edcbaff97';
assert.match(expectedProducer,/^[0-9a-f]{40}$/);
const producerPin=execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();assert.equal(producerPin,expectedProducer,'Exact qualified producer pin required');
assert.equal(execFileSync('git',['-C',root,'status','--porcelain'],{encoding:'utf8'}).trim(),'','Clean producer source required');
execFileSync('git',['-C',root,'merge-base','--is-ancestor','925530a6ba8764df6a7b8637192fe32edcbaff97',producerPin]);
const {createSupervisor}=await import(pathToFileURL(join(root,'apps/supervisor/src/server.ts')));
const {sourceIdentity}=await import(pathToFileURL(join(root,'apps/supervisor/src/producer-results.ts')));
const {runCodex:installedRunCodex}=await import(pathToFileURL(join(root,'packages/agents/src/index.ts')));
const {DEFAULT_VERIFICATION_IMAGE,verifyCandidate:producerVerifyCandidate}=await import(pathToFileURL(join(root,'packages/verification/src/index.ts')));
const dir=await mkdtemp(join(tmpdir(),'factory-connected-')),repo=join(dir,'repository'),dataDir=join(dir,'producer');await mkdir(repo);await mkdir(dataDir);
const adminURL=`postgresql://postgres@127.0.0.1:${betaTestPort}/postgres`,name='factory_beta_'+randomBytes(6).toString('hex');
const admin=new Client(adminURL);await admin.connect();await admin.query('CREATE DATABASE '+name);const pool=new Pool({connectionString:adminURL.replace(/postgres$/,'')+name});
const database={query:async(s,p)=>(await pool.query(s,p)).rows};
const migrationDB={...database,transaction:async ss=>{const c=await pool.connect();try{await c.query('BEGIN');for(const s of ss)await c.query(s.sql,s.params);await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}};
let destinationPool,destinationName,supervisor,spendProvider,providerCalls=0,checks=0,composition;const spendFixture=process.env.FACTORY_SPEND_FIXTURE==='1';const installedCli=process.env.FACTORY_INSTALLED_CLI==='1';if(installedCli&&!spendFixture)throw Error('Installed CLI qualification requires loopback spend fixture');const cliProvider=controlledCliResponses({exerciseSearch:process.env.FACTORY_ENVELOPE_DRY_RUN==='1'});const cliVersion=installedCli?execFileSync('codex',['--version'],{encoding:'utf8'}).trim():'synthetic-codex-1';const envelopeDryRun=process.env.FACTORY_ENVELOPE_DRY_RUN==='1';if(envelopeDryRun&&!installedCli)throw Error('Envelope dry run requires installed CLI');const envelope=envelopeDryRun?JSON.parse(await readFile(new URL('../../../docs/verification/2026-09-28-spend-v2-integration/price-card.json',import.meta.url),'utf8')):null;const workCeiling=envelope?envelope.proposedWorkCeilingMicrousd/1e6:1.3;const perOperationReserve=envelope?.perOperationReserveMicrousd??(installedCli?108000:1200);const results=[],journeys=[],terminalReceipts=[];function pass(label){checks++;results.push(label);console.log('PASS',label);}
try{
 const migrations=await loadMigrations();assert.equal(migrations.at(-1).name,'0068_published_main_lineage_bridge.sql');
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
 const files=envelopeDryRun?Object.fromEntries(await Promise.all(git('ls-tree','-r','--name-only','HEAD').split('\n').map(async path=>[path,await readFile(join(repo,path),'utf8')]))):historical.workspace[0].source_files;for(const [path,text] of Object.entries(files)){await mkdir(join(repo,path,'..'),{recursive:true});await writeFile(join(repo,path),text);}if(!envelopeDryRun){git('add','.');git('commit','-qm','Local approved fixture');}const source={sha:git('rev-parse','HEAD'),files};
 const owner='factory-beta-'+randomUUID(),agentId='agent-'+randomUUID();await pool.query(`INSERT INTO agents(id,owner_id,name,slug,role,instructions,is_primary,status,max_estimated_cost_usd,max_runtime_seconds,max_steps) VALUES($1,$2,'Sofie','sofie','engineer','Local connected Factory qualification',true,'active',$3,3600,30)`,[agentId,owner,workCeiling]);
 const engineering=runtimeSchema.parse({...issued,ownerId:owner,agentId,nativeQualification:undefined,profile:{...issued.profile,repository:'fixture/golden'},approvedBase:manifestForSnapshot(source)});
 const beta=new BetaIntegration(pool,{repository:engineering.profile.repository,maxCostUsd:workCeiling,maxDurationSeconds:600});
 const goalId=randomUUID(),taskId=randomUUID(),service=beta.service(owner);await beta.service(owner,'owner').create({id:goalId,objective:engineering.objective,criteria:engineering.criteria.map(c=>c.statement),priority:'high'});
 const plan=await service.plan(goalId,engineering.objective,'Bounded canonical Factory fixture journey');await service.addTask(goalId,{id:taskId,objective:engineering.objective,criteria:engineering.criteria.map(c=>c.statement),provenance:{kind:'plan',reference:plan.id,depth:0}});await service.tick(goalId);
 let work=await beta.store(owner).get((await beta.queries(owner).goal(goalId)).tasks[0].currentWork);
 const oldCriteria=engineering.criteria;engineering.profile={...engineering.profile,checks:engineering.profile.checks.map(check=>({...check,criterionIds:check.criterionIds.map(id=>work.criteria[oldCriteria.findIndex(c=>c.id===id)].id)}))};engineering.criteria=work.criteria;
 await pool.query(`INSERT INTO memory_records(id,owner_id,scope_type,scope_id,content,provider,source_type) VALUES($1,$2,'owner',$2,'My morning briefing should start with original sources and delivery risks.','local','explicit')`,['memory-'+randomUUID(),owner]);
 const sourceId=randomUUID();await beta.query(`INSERT INTO knowledge_sources(id,owner_id,source_type,provider,external_id,reference_uri,content_hash) VALUES($1,$2,'file','canonical-local-fixture',$1,'fixture:quantity',$3)`,[sourceId,owner,'sha256:'+'a'.repeat(64)]);
 await new EngineeringKnowledgeStore(beta.store(owner)).save({workId:work.id,statement:'Quantity parser verification must include whitespace and invalid input.',sourceId,origin:{type:'owner'}});
 const canonicalWork=new CanonicalBetaWork(beta,()=>new NativeRouteAuthority(beta.store(owner),async()=>engineering));
 const decisionItem=await canonicalWork.requestDecision(owner,work.id,'Proceed with the bounded local Factory fixture?',['Continue','Wait']);const answer=await beta.inbox(owner).respond({itemId:decisionItem.id,actionId:decisionItem.action.id,actionBinding:decisionItem.actionBinding,expectedRevision:decisionItem.revision,idempotencyKey:randomUUID(),answer:'Continue'});await beta.deliver(owner);
 const oldWork=work;work=(await canonicalWork.control(owner,work.id,work.version,work.generation,'continue',answer.id)).work;
 await assert.rejects(canonicalWork.control(owner,oldWork.id,oldWork.version,oldWork.generation,'continue',answer.id));
 const context=await beta.recall(owner,work.id,'quantity parser whitespace','alpha-factory-context');assert(JSON.stringify(context).includes('whitespace'));pass('Owner Goal → scoped Memory → paused canonical Work → Needs You → exact continuation and stale replay rejection → retained recall');

 const pair=generateKeyPairSync('ed25519'),token='a'.repeat(64),key={factoryId:'factory-beta',keyId:'local',publicKey:pair.publicKey.export({type:'spki',format:'pem'}).toString(),activeFrom:'2020-01-01T00:00:00Z',notAfter:'2099-01-01T00:00:00Z'};
 const signing={factoryId:key.factoryId,currentKeyId:key.keyId,privateKey:pair.privateKey.export({type:'pkcs8',format:'pem'}).toString(),keys:[key]};
 await writeFile(join(dataDir,'connections.json'),JSON.stringify({clients:[{id:'myeve',name:'Local qualification',tokenSha256:createHash('sha256').update(token).digest('hex'),repositoryPaths:[repo],actions:['factory.prepare','factory.dispatch','factory.observe','factory.stop']}]}));
 let executions=0,completionExecutions=0,failCandidate=false,failedExecution=false,heldExecution=null,unknownProvider=false;
 if(spendFixture){spendProvider=createServer((req,res)=>{providerCalls++;if(unknownProvider){res.writeHead(503);res.end('synthetic response lost');return;}if(installedCli){void cliProvider.respond(req,res,providerCalls).catch(error=>{console.error('Controlled provider:',String(error));res.writeHead(500);res.end(String(error));});return;}res.writeHead(200,{'content-type':'application/json','x-request-id':'synthetic-provider-'+providerCalls});res.end(JSON.stringify({id:'fixture-response-'+providerCalls,status:'completed',usage:{input_tokens:10,output_tokens:10}}));});await new Promise(r=>spendProvider.listen(0,'127.0.0.1',r));}
 const price={revision:envelope?'openai-gpt54mini-20260928':'synthetic-v1',model:envelope?.model??'gpt-5.5',validUntil:new Date(Date.now()+3600000).toISOString(),contextLimitTokens:envelope?.contextLimitTokens??(installedCli?100000:1000),outputLimitTokens:envelope?.outputLimitTokens??(installedCli?4000:100),inputMicrousdPerMillion:envelope?.inputMicrousdPerMillion??1000000,outputMicrousdPerMillion:envelope?.outputMicrousdPerMillion??2000000};
 if(envelope)process.env.FACTORY_CODEX_MODEL=envelope.model;const settledPerCall=Math.ceil(10*price.inputMicrousdPerMillion/1e6)+Math.ceil(10*price.outputMicrousdPerMillion/1e6);
 const deps={preflightCodex:async()=>({binaryAvailable:true,authenticated:true,version:cliVersion,workerProfile:'mac',error:null}),runCodex:async input=>{const completion=input.sandbox==='read-only';if(completion)completionExecutions++;else executions++;if(failedExecution)return {success:false,status:'failed',eventsPath:'fixture',usage:null};if(heldExecution){await heldExecution;return {success:false,status:'cancelled',eventsPath:'fixture',usage:null};}if(installedCli){
 await cliProvider.begin(input,failCandidate?historical.workspace[0].candidates[0].files['quantity.mjs']:historical.workspace[0].draft_files['quantity.mjs']);
 const result=await installedRunCodex({...input,...(unknownProvider?{timeoutMs:20000}:{})});
 if(!unknownProvider&&!result.success)console.error('Controlled CLI failed:',result.error,await readFile(result.stderrPath,'utf8'),await readFile(result.eventsPath,'utf8'));
 if(!unknownProvider)assert(result.success,JSON.stringify({result,stderr:await readFile(result.stderrPath,'utf8'),events:await readFile(result.eventsPath,'utf8')}));
 return result;
 }if(spendFixture){assert(input.gateway);const paid=await fetch(input.gateway.baseUrl+'/responses',{method:'POST',headers:{authorization:'Bearer '+input.gateway.childToken,'content-type':'application/json'},body:JSON.stringify({model:'gpt-5.5',input:'synthetic bounded coding request'})});if(unknownProvider){assert.equal(paid.status,503);return {success:false,status:'failed',eventsPath:'synthetic UNKNOWN',usage:null};}assert.equal(paid.status,200);}
 if(!completion)await writeFile(join(input.workspacePath,'quantity.mjs'),failCandidate?historical.workspace[0].candidates[0].files['quantity.mjs']:historical.workspace[0].draft_files['quantity.mjs']);return {success:true,status:'completed',threadId:'local-fixture',eventsPath:'fixture',usage:null};},verifyCandidate:async input=>{if(envelopeDryRun&&!failCandidate){const result=await producerVerifyCandidate(input);if(result.checks.some(c=>c.status!=='passed')||!result.checks.length)console.error('Producer verifier diagnostic:',JSON.stringify(result),await Promise.all(result.checks.map(c=>readFile(c.logPath,'utf8'))));return result;}await mkdir(input.artifactDir,{recursive:true});const checks=[];for(const [i,command] of input.commands.entries()){const logPath=join(input.artifactDir,i+'.log');await writeFile(logPath,'Untrusted producer claims PASS; MyEve must independently verify.');const at=new Date().toISOString();checks.push({candidateCommit:input.candidateSha,candidateTree:git('rev-parse',input.candidateSha+'^{tree}'),command,status:'passed',exitCode:0,startedAt:at,finishedAt:at,logPath,reason:null});}return {checks,reason:null};}};
 supervisor=createSupervisor({dataDir,resultSigning:signing,jobDependencies:deps,localFactoryFixture:!spendFixture,...(spendFixture?{localSpendFixture:{upstreamOrigin:'http://127.0.0.1:'+spendProvider.address().port,upstreamApiKey:'synthetic-provider-only',price}}:{})});await new Promise(r=>supervisor.server.listen(0,'127.0.0.1',r));
 const configuration={model:process.env.FACTORY_CODEX_MODEL??'gpt-5.5',executor:'codex-cli',executorVersion:cliVersion,skillRevision:'fd8f20a879b507cf09feba08663a1edf7a949353',workerProfile:'mac',verificationImage:DEFAULT_VERIFICATION_IMAGE,nodeVersion:process.version,platform:process.platform,architecture:process.arch,commands:['node --test'],allowedPaths:engineering.profile.allowedPaths,timeoutMs:1800000};
 const sourceDigest=sourceIdentity(),configurationDigest=digest(configuration);
 const connection={origin:'http://127.0.0.1:'+supervisor.server.address().port,token,factoryId:key.factoryId,sourceDigest,configurationDigest,factoryVersion:digest({sourceDigest,configurationDigest}),repositoryPath:repo,keys:[key],qualification:{scopeId:owner,profileHash:digest(engineering.profile),evidenceRef:'connected local qualification',qualifiedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString(),mode:'LOCAL_FIXTURE',spendEnforced:true}};
 if(spendFixture){const proof={status:'QUALIFIED',evidenceRef:'controlled local consumer fixture; not real provider qualification'};connection.qualification.mode='LOCAL_SPEND_FIXTURE';connection.spendContract={version:'WORK_LEDGER_V2',sourceDigest};connection.spendPlan={version:'WORK_LEDGER_V2',pricingRevision:price.revision,plannedProductiveOperations:envelope?.plannedProductiveOperations??2,plannedCompletionOperations:1,maxPaidOperations:envelope?.maxPaidOperations??3,completionReserveMicrousd:perOperationReserve};connection.qualification.spendReview={environment:'LOCAL_FIXTURE',sourceDigest,factoryVersion:connection.factoryVersion,expiresAt:price.validUntil,hardCeiling:proof,preCallEnforcement:proof,accounting:proof,unknownRetention:proof,completion:proof,pricing:{...proof,model:price.model,revision:price.revision,validUntil:price.validUntil}};}
 const config={engineering,connection,commands:configuration.commands,routing:{intent:'PRODUCE',boundedOperationQualified:false}},store=new WorkStore({scopeId:owner,scopeKind:'personal',actorId:owner},database);
 const authority=new FactoryRouteAuthority(store,async()=>config),direct=new DirectDevelopmentStore(store,{profile:engineering.profile,approvedBase:engineering.approvedBase,objective:engineering.objective,criteria:engineering.criteria,agentId,issueNumber:1});
 const driver=(adapterFor)=>new FactoryWorkDriver(store,authority,direct,new DockerProtectedVerifier(),async()=>source,adapterFor);
 let state=await driver().start(work.id,work.version,work.generation);
 for(let i=0;i<200&&!['PARTIAL','FAILED','TERMINAL'].includes(state.state);i++){await new Promise(r=>setTimeout(r,50));state=await driver().step(work.id);}
 assert.equal(state.state,'PARTIAL',JSON.stringify(state));assert.equal(executions,1);
 const ws=(await direct.inspect(work.id)).workspace;assert.equal(ws.producer,'MYFACTORY');assert(ws.evidence.length>0);
 const truth=(await new EngineeringWorkerProjectionStore(store,agentId).get(work.id)).projection;assert.equal(truth.readiness.ready,false);assert(truth.factoryWriter.dispatchIdentity);
 assert.equal((await driver().step(work.id)).state,'PARTIAL');assert.equal(executions,1);
 const result=state.result;assert.equal(result.proof.outcome,'PARTIAL');
 await beta.query(`UPDATE beta_goal_work_bindings SET binding=jsonb_set(binding,'{workGeneration}',to_jsonb($3::integer)) WHERE owner_id=$1 AND work_id=$2`,[owner,work.id,work.generation]);
 await service.receiveResult(goalId,taskId,work.id,result.id);
 const after=await beta.queries(owner).goal(goalId);assert.notEqual(after.status,'completed');assert.notEqual(after.tasks[0].status,'completed');
 pass('Goal-bound Work → connected canonical Factory fixture → signed candidate custody → real independent Docker verification → immutable PARTIAL Result; no false Task/Goal completion or Ready');
 const learning=new LearningStore(store);let family=await new LearningRuntime(learning).feedback({resultHash:result.contentHash,feedback:{eventId:randomUUID(),workId:work.id,workVersion:work.version,workType:'implementation',type:'prefer_this',target:'result',targetRef:result.id,note:'Include original sources in the delivery brief.',behavior:'cite_sources',scope:'REPOSITORY'}});
 for(const action of ['evaluate','promote'])family=await learning.command(family.id,family.revision,{eventId:randomUUID(),action,version:1,hash:family.versions[0].hash,reason:'Explicit owner review in the controlled local journey'});
 assert.equal(family.versions[0].status,'PROMOTED');
 const {work:later}=await store.create({title:'Later delivery review',objective:work.objective,repository:work.repository,criteria:work.criteria,maxCostUsd:workCeiling,maxDurationSeconds:600,idempotencyKey:randomUUID()});
 const childInput={database:name,owner,agentId,workId:later.id};
 const reused=JSON.parse((await execAsync(process.execPath,['--import','tsx',new URL('./beta-integration/alpha-whole-restart.mjs',import.meta.url).pathname,JSON.stringify(childInput)])).stdout);
 assert(JSON.stringify(reused.context).includes('original source'));pass('Factory Result feedback → evaluated owner-promoted learning → fresh process reuses exact repository learning');
 const sourceCapsules=new CanonicalCapsules(beta,owner,agentId);const portable=(await sourceCapsules.catalog('fresh-eve')).candidates[0];assert(portable);
 await sourceCapsules.approve({memoryId:portable.id,itemDigest:portable.itemDigest,destinationEveRef:'fresh-eve',personal:true});const exportReview=await sourceCapsules.export('fresh-eve',[portable.id]);const capsule=await sourceCapsules.export('fresh-eve',[portable.id],exportReview.reviewDigest);
 destinationName='factory_beta_'+randomBytes(6).toString('hex');await admin.query('CREATE DATABASE '+destinationName);destinationPool=new Pool({connectionString:adminURL.replace(/postgres$/,'')+destinationName});
 const dclient=await destinationPool.connect();try{await runMigrations({query:async(s,p)=>(await dclient.query(s,p)).rows,transaction:async ss=>{await dclient.query('BEGIN');try{for(const s of ss)await dclient.query(s.sql,s.params);await dclient.query('COMMIT');}catch(e){await dclient.query('ROLLBACK');throw e;}}},migrations,()=>{});}finally{dclient.release();}
 await destinationPool.query(`INSERT INTO agents(id,owner_id,name,slug,role,instructions,is_primary,status) VALUES('fresh-eve',$1,'Sofie','sofie','assistant','Independent private Eve',true,'active')`,[owner]);
 const freshBeta=new BetaIntegration(destinationPool,beta.policy),capsuleDestination=new CanonicalCapsules(freshBeta,owner,'fresh-eve');const importReview=await capsuleDestination.preview(capsule.raw);
 const receipt=await capsuleDestination.import(capsule.raw,importReview.reviewDigest,importReview.items.map(r=>({id:r.item.id,choice:'include'})));assert.equal(receipt.activeCount,1);
 const freshRecall=JSON.parse((await execAsync(process.execPath,['--import','tsx',new URL('./beta-integration/alpha-whole-restart.mjs',import.meta.url).pathname,JSON.stringify({database:destinationName,owner,agentId:'fresh-eve'})])).stdout);
 assert(freshRecall.memories.some(r=>r.content.includes('morning briefing')));pass('Explicit Capsule export → independent fresh Eve database → atomic canonical Memory activation → useful canonical recall after process restart');
 const today=await beta.queries(owner).today(),brief=await beta.queries(owner).brief(new Date(Date.now()-3600000).toISOString());assert(JSON.stringify(today).includes(goalId));assert(JSON.stringify(brief).includes(goalId));pass('Today and Daily Brief read the retained incomplete Goal and Result state');
 const overlap=(await pool.query("SELECT work_id FROM engineering_route_runs WHERE status NOT IN ('COMPLETED','FAILED','CANCELLED') GROUP BY work_id HAVING count(*)>1")).rowCount;assert.equal(overlap,0);
 const report={status:'PARTIAL',qualification:'Connected exact pinned consolidation producer, non-paid local fixture. Real transport/Git/SQLite/PostgreSQL and independent Docker verification. Controlled executor; no live models.',producerSHA:producerPin,consumerSHA:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),upstreamConsumerSHA:'cf83e3bec6f02ca812b2e08e04c188eaa271bede',owner,goalId,taskId,workId:work.id,result,candidates:ws.candidates,verificationEvidence:ws.evidence,sourceDigest,configurationDigest,checks:results,receipt,learning:{id:family.id,hash:family.versions[0].hash},counters:{duplicateWork:0,duplicateFactoryExecution:executions-1,concurrentWriters:overlap,falseTaskCompletion:0,falseGoalCompletion:0,falseReady:0,authorityExpansion:0,crossOwnerDisclosure:0,staleContinuation:0,capsuleAuthorityTransfer:0},liveSofie:'NOT_RUN',liveMyFactory:'NOT_RUN'};
 await writeFile(new URL(`../../../docs/verification/beta-integration/${process.env.MYEVE_BETA_EVIDENCE_PHASE ?? "alpha"}/whole-product.json`,import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
} finally {
 if(supervisor)await supervisor.close();
 if(spendProvider)await new Promise(r=>spendProvider.close(r));
 if(destinationPool)await destinationPool.end();
 await pool.end();
 // Match the qualified connected harness: wait for socket close observation
 // instead of FORCE-terminating an idle pg client during teardown.
 for(const databaseName of [destinationName,name].filter(Boolean)){
  for(let i=0;i<100;i++){
   const {rows}=await admin.query('SELECT count(*)::int n FROM pg_stat_activity WHERE datname=$1',[databaseName]);
   if(rows[0].n===0){await admin.query('DROP DATABASE '+databaseName);break;}
   if(i===99)throw Error('Disposable database did not quiesce: '+databaseName);
   await new Promise(r=>setTimeout(r,10));
  }
 }
 await admin.end();await rm(dir,{recursive:true,force:true});
}
