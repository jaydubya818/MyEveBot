import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,readdirSync,rmSync,openSync} from 'node:fs';
import {execFileSync,spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {createHash,randomBytes,randomUUID,generateKeyPairSync} from 'node:crypto';
import {createServer as httpsServer,request as httpsRequest} from 'node:https';
import {request as httpRequest} from 'node:http';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Authority,ddl,emergencyStop} from '../controls/postgres.mjs';
import {configuration,workerGrants} from '../controls/configuration.mjs';
import {startController} from '../controls/runtime.mjs';
import {relayRevocationAdapters} from '../controls/stop-adapters.mjs';
import {evidenceDdl,evidenceAdapter} from '../controls/evidence.mjs';
import {freezeDatabase,verifyDatabaseBrake} from '../controls/database-brake.mjs';
const relay=resolve(process.env.FQ_RELAY_SOURCE??'/private/tmp/fq-preprovision-relay');
const myeve=resolve(process.env.FQ_MYEVE_SOURCE??'/private/tmp/fq-authorized-work/myeve');
const output=resolve(process.env.FQ_SIMULATION_OUTPUT??'/private/tmp/fq-closure-simulation-report.json');
const here=fileURLToPath(new URL('.',import.meta.url)),temp=mkdtempSync('/private/tmp/fq-closure-simulation-');
const {Pool}=createRequire(`${relay}/package.json`)('pg');
const admin=new Pool({connectionString:'postgresql://postgres@127.0.0.1:55439/postgres'});
const processes={},dbs={},roles=[],servers=[],checks=[];let runtime,ca,controller,authority,activeModel=false,holdModel=false,attempts=0;
const session=`fq_${randomBytes(8).toString('hex')}`,control=randomBytes(32).toString('hex');
const ports={relay:58600,myeve:58601,peer:58602,controller:58603,myeveSql:58604,peerSql:58605,controllerInternal:58606,model:58607};
const origins=Object.fromEntries(['relay','myeve','peer','controller'].map(n=>[n,`https://127.0.0.1:${ports[n]}`]));
const owners={myeve:'fq-owner-a',peer:'fq-owner-b'};
const sources={relay:execFileSync('git',['rev-parse','HEAD'],{cwd:relay,encoding:'utf8'}).trim(),myeve:execFileSync('git',['rev-parse','HEAD'],{cwd:myeve,encoding:'utf8'}).trim()};sources.peer=sources.myeve;sources.controls=execFileSync('git',['rev-parse','HEAD'],{cwd:resolve(here,'../../..'),encoding:'utf8'}).trim();
const tokens=Object.fromEntries(['myeve','relay','peer','myeve-origin','relay-origin','peer-origin','operator'].map(n=>[n,randomBytes(32).toString('base64url')]));
const hash=x=>createHash('sha256').update(x).digest('hex');
const privateFile=(name,data)=>{const path=join(temp,name);writeFileSync(path,JSON.stringify(data),{mode:0o600});return path;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(fn,ms=90000){const end=Date.now()+ms;let last;while(Date.now()<end){try{const value=await fn();if(value)return value;}catch(e){if(e.fatal)throw e;last=e;}await sleep(200);}throw last??Error('Local condition timeout');}
function check(name,details={}){checks.push({name,status:'PASS',...details});console.log(`PASS ${name}`);}
function localFetch(url,init={}){
 const parsed=new URL(url);assert.equal(parsed.hostname,'127.0.0.1');assert.equal(parsed.protocol,'https:');
 return new Promise((resolve,reject)=>{const req=httpsRequest(parsed,{method:init.method??'GET',headers:init.headers,ca,signal:init.signal??AbortSignal.timeout(10000)},res=>{const chunks=[];let size=0;res.on('data',c=>{size+=c.length;if(size>600000)res.destroy(Error('LOCAL_RESPONSE_LIMIT'));else chunks.push(c);});res.on('error',reject);res.on('end',()=>resolve(new Response([204,205,304].includes(res.statusCode)?null:Buffer.concat(chunks),{status:res.statusCode,headers:Object.fromEntries(Object.entries(res.headers).map(([k,v])=>[k,Array.isArray(v)?v.join(', '):v]))})));});req.on('error',reject);if(init.body)req.write(init.body);req.end();});
}
async function json(url,input,token){const r=await localFetch(url,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify(input)});if(!r.ok)throw Error(`Local HTTP denied ${new URL(url).pathname} ${r.status}`);return r.json();}
const rpc=(action,input={},token=tokens.operator)=>json(`${origins.controller}/${action}`,{session,...input},token);
const hostAdmin=(name,input)=>json(`${origins[name]}/qualification`,input,control);
async function start(name,script,cwd,env,args=[]){
 const log=join(temp,`${name}.log`);const fd=openSync(log,'a',0o600);
 const child=spawn(process.execPath,['--import',`${cwd}/node_modules/tsx/dist/loader.mjs`,script,...args],{cwd,env:{PATH:process.env.PATH,NODE_ENV:'test',NODE_EXTRA_CA_CERTS:join(temp,'tls.crt'),...env},stdio:['ignore',fd,fd]});
 processes[name]=child;return child;
}
async function stop(name){const p=processes[name];if(!p)return true;if(p.exitCode!==null)return true;p.kill('SIGTERM');await wait(()=>p.exitCode!==null||p.signalCode!==null,7000);return p.exitCode!==null||p.signalCode!==null;}
async function command(worker,operation,input,id){console.log(`STEP ${worker}/${operation}`);const jobId=randomUUID();await rpc('job-submit',{id:jobId,worker,command:{operation,...(input===undefined?{}:{input}),...(id?{id}:{})}});const result=await wait(async()=>{const r=await rpc('job-result',{id:jobId});return ['FAILED','COMPLETED'].includes(r.state)?r:null;});if(result.state!=='COMPLETED')throw Error(`Worker command ${worker}/${operation} failed`);return result.result;}
const future=(ms=600000)=>new Date(Date.now()+ms).toISOString();
try{
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(temp,'tls.key'),'-out',join(temp,'tls.crt'),'-days','1','-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1'],{stdio:'ignore'});
 ca=readFileSync(join(temp,'tls.crt'));const tls={key:readFileSync(join(temp,'tls.key')),cert:ca};
 for(const name of ['relay','myeve','peer']){
  const database=`fq_${name}_6384519e0e01`;assert.equal((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[database])).rowCount,0,'Refuse an existing database');
  await admin.query(`CREATE DATABASE ${database}`);dbs[name]={database,pool:new Pool({connectionString:`postgresql://postgres@127.0.0.1:55439/${database}`})};
  if(name!=='relay')for(const file of readdirSync(`${myeve}/apps/eve/migrations`).filter(f=>f.endsWith('.sql')).sort())await dbs[name].pool.query(readFileSync(`${myeve}/apps/eve/migrations/${file}`,'utf8'));
 }
 execFileSync(`${relay}/node_modules/.bin/tsx`,['scripts/migrate.ts'],{cwd:relay,env:{PATH:process.env.PATH,RELAY_DATABASE_URL:`postgresql://postgres@127.0.0.1:55439/${dbs.relay.database}`},stdio:'pipe'});
 for(const [name,d] of Object.entries(dbs)){
  const app=`${d.database}_app`,worker=`${d.database}_worker`;roles.push(app,worker);
  await d.pool.query(`CREATE ROLE ${app} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS CONNECTION LIMIT 4; REVOKE CONNECT ON DATABASE ${d.database} FROM PUBLIC; GRANT CONNECT ON DATABASE ${d.database} TO ${app}; GRANT USAGE ON SCHEMA public TO ${app}; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${app}; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ${app};`);
  await d.pool.query(workerGrants(name));await d.pool.query(`ALTER ROLE ${worker} LOGIN`);
  d.appUrl=`postgresql://${app}@127.0.0.1:55439/${d.database}`;d.workerUrl=`postgresql://${worker}@127.0.0.1:55439/${d.database}`;d.applicationRole=app;d.workerRole=worker;d.component=name;
 }
 await dbs.relay.pool.query(ddl);await dbs.relay.pool.query(evidenceDdl);
 authority=new Authority(dbs.relay.pool,session);await authority.create('local_closure_authorization');
 const controllerRole='fq_control_6384519e0e01';roles.push(controllerRole);await dbs.relay.pool.query(`CREATE ROLE ${controllerRole} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;GRANT CONNECT ON DATABASE ${dbs.relay.database} TO ${controllerRole};GRANT USAGE ON SCHEMA fq_control TO ${controllerRole};GRANT SELECT,UPDATE ON fq_control.sessions TO ${controllerRole};`);
 const keys={},signingKeys=[],privateKeys={};
 for(const [purpose,name] of [['evidence','evidence'],['federation-delivery','delivery'],['passport','passport']]){const key=generateKeyPairSync('ed25519');keys[name]=`projects/fq-local/locations/us-east4/keyRings/fq-6384519e0e01/cryptoKeys/fq-${name}/cryptoKeyVersions/1`;privateKeys[purpose]=key.privateKey.export({type:'pkcs8',format:'pem'}).toString();signingKeys.push({keyId:`local-${name}`,keyVersion:keys[name],purpose,algorithm:'Ed25519',publicKeyPem:key.publicKey.export({type:'spki',format:'pem'}).toString(),state:'ACTIVE',activatedAt:'2026-01-01T00:00:00Z'});}
 keys.envelope='projects/fq-local/locations/us-east4/keyRings/fq-6384519e0e01/cryptoKeys/fq-envelope/cryptoKeyVersions/1';
 const wrapping=generateKeyPairSync('rsa',{modulusLength:2048});
 const baseEnvironment={FQ_SESSION_ID:session,FQ_CONTROLLER_URL:origins.controller};
 const relayConfig={relayRoot:relay,port:ports.relay,issuer:origins.relay,tlsKey:join(temp,'tls.key'),tlsCert:join(temp,'tls.crt'),migrate:false,signingKeys,privateKeys,signPublic:signingKeys[1].publicKeyPem,wrapPrivate:wrapping.privateKey.export({type:'pkcs8',format:'pem'}).toString(),wrapPublic:wrapping.publicKey.export({type:'spki',format:'pem'}).toString(),control,environment:{RELAY_DATABASE_URL:dbs.relay.appUrl,RELAY_SESSION_SECRET:randomBytes(32).toString('hex'),RELAY_ENCRYPTION_KEY:randomBytes(32).toString('hex'),RELAY_V2_ACTIONS_ENABLED:'true',RELAY_FEDERATION_ENABLED:'true',RELAY_DEPLOYMENT_MODE:'local'},qualificationEnvironment:{...baseEnvironment,FQ_COMPONENT_TOKEN:tokens['relay-origin'],FQ_OWNER_ID:'fq-relay',RELAY_QUALIFICATION_MODE:'true'}};
 await start('relay-host',join(here,'relay-host.mjs'),relay,{QUALIFICATION_CONFIG:privateFile('relay.json',relayConfig),TSX_TSCONFIG_PATH:`${relay}/tsconfig.json`});await wait(async()=>(await localFetch(`${origins.relay}/health`)).ok);
 const accounts={},passwords={};
 for(const name of ['myeve','peer']){passwords[name]=randomBytes(24).toString('hex');accounts[name]=await hostAdmin('relay',{operation:name==='myeve'?'bootstrap':'owner',owner:{accountName:`Synthetic ${name}`,name:`Synthetic ${name}`,email:`${name}@example.invalid`,password:passwords[name]}});}
 const configurationValue=configuration({origins,hashes:Object.fromEntries(Object.entries(tokens).map(([n,v])=>[n,hash(v)])),sources,owners,accounts:{myeve:accounts.myeve.accountId,peer:accounts.peer.accountId},keys});
 runtime=await startController({cwd:relay,environment:{FQ_CONTROL_DATABASE_URL:`postgresql://${controllerRole}@127.0.0.1:55439/${dbs.relay.database}`,FQ_SESSION_ID:session,FQ_CONTROLLER_CONFIG:JSON.stringify(configurationValue),FQ_PRICING_REVIEWED_UNTIL:String(Date.now()+3600000),ANTHROPIC_API_KEY:'synthetic-local-provider-only',PORT:String(ports.controllerInternal),FQ_SOURCE_SHA:sources.relay},modelRequest:async(url,init)=>{assert.equal(url,'https://api.anthropic.com/v1/messages');attempts++;activeModel=true;const payload=JSON.parse(init.body);assert.equal(payload.model,'claude-haiku-4-5-20251001');assert.equal(payload.max_tokens,800);assert.equal(JSON.stringify(payload).includes('SYNTHETIC-PRIVATE'),false);try{if(holdModel)await new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(Error('stopped')),{once:true}));return Response.json({model:payload.model,usage:{input_tokens:100,output_tokens:30},content:[{type:'text',text:'Synthetic Atlas analysis from the provided published source. ['+JSON.parse(payload.messages[0].content.split('\n').slice(1).join('\n')).sources[0].requestId+']'}]});}finally{activeModel=false;}}});
 controller=runtime.controller;controller.request=async(...args)=>{attempts++;return localFetch(...args);};
 const front=httpsServer(tls,(req,res)=>{const upstream=httpRequest({hostname:'127.0.0.1',port:ports.controllerInternal,path:req.url,method:req.method,headers:req.headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});upstream.on('error',()=>res.destroy());req.pipe(upstream);});front.listen(ports.controller,'127.0.0.1');servers.push(front);
 const artifacts={},seeds={},workerFiles={};
 for(const name of ['myeve','peer']){
  const pair=generateKeyPairSync('ed25519');artifacts[name]=pair.publicKey.export({type:'spki',format:'pem'}).toString();
  const env={...baseEnvironment,DATABASE_URL:dbs[name].appUrl,FQ_OWNER_ID:owners[name],FQ_COMPONENT_TOKEN:tokens[`${name}-origin`],MYEVE_OWNER_ID:owners[name],MYEVE_ACCESS_PASSWORD:randomBytes(24).toString('hex'),MYEVE_SESSION_SECRET:randomBytes(32).toString('hex'),MYEVE_RELAY_ENABLED:'true',MYEVE_QUALIFICATION_MODE:'true',MYEVE_RELAY_ORIGIN:origins.relay,MYEVE_RELAY_KEY_ID:signingKeys[1].keyId,MYEVE_RELAY_PUBLIC_KEY:signingKeys[1].publicKeyPem,MYEVE_RELAY_ENCRYPTION_KEY:randomBytes(32).toString('hex'),MYEVE_RELAY_ARTIFACT_PRIVATE_KEY:pair.privateKey.export({type:'pkcs8',format:'pem'}).toString(),MYEVE_RELAY_ARTIFACT_ORIGIN:origins[name]};
  const cfg={relayRoot:relay,myeveRoot:myeve,port:ports[name],proxyPort:ports[`${name}Sql`],origin:origins[name],tlsKey:join(temp,'tls.key'),tlsCert:join(temp,'tls.crt'),queryLog:join(temp,`${name}-queries.jsonl`),privateMarker:`SYNTHETIC-PRIVATE-${name}`,control,environment:env,databaseUrls:[dbs[name].appUrl,dbs[name].workerUrl]};
  await start(`${name}-host`,join(here,'myeve-host.mjs'),myeve,{QUALIFICATION_CONFIG:privateFile(`${name}-host.json`,cfg),TSX_TSCONFIG_PATH:`${myeve}/apps/eve/tsconfig.json`});await wait(async()=>(await localFetch(`${origins[name]}/health`)).ok);seeds[name]=await hostAdmin(name,{operation:'seed'});
  workerFiles[name]=privateFile(`${name}-worker.json`,{component:name,source:myeve,log:join(temp,`${name}-child.log`),environment:{...env,NODE_ENV:'test',PATH:process.env.PATH,DATABASE_URL:dbs[name].workerUrl,FQ_SOURCE_SHA:sources[name],FQ_WORKER_TOKEN:tokens[name],FQ_RELAY_OWNER_EMAIL:`${name}@example.invalid`,FQ_RELAY_OWNER_PASSWORD:passwords[name],PORT:name==='myeve'?'58610':'58611'},localTest:{preload:join(here,'neon-preload.mjs'),ca:join(temp,'tls.crt'),sqlProxy:`http://127.0.0.1:${ports[`${name}Sql`]}/sql`}});
 }
 workerFiles.relay=privateFile('relay-worker.json',{component:'relay',source:relay,log:join(temp,'relay-child.log'),environment:{...baseEnvironment,NODE_ENV:'test',PATH:process.env.PATH,FQ_SOURCE_SHA:sources.relay,FQ_WORKER_TOKEN:tokens.relay,FQ_OWNER_ID:'fq-relay',RELAY_QUALIFICATION_MODE:'true',RELAY_DATABASE_URL:dbs.relay.workerUrl},localTest:{preload:join(here,'neon-preload.mjs'),ca:join(temp,'tls.crt')}});
 const startWorker=async name=>start(`${name}-worker`,join(here,'worker-launcher.mjs'),name==='relay'?relay:myeve,{},[workerFiles[name]]);
 for(const name of ['relay','myeve','peer'])await startWorker(name);
 await wait(async()=>Object.keys((await authority.status()).workers??{}).length===3);
 check('three actual supervised worker entrypoints register exact source pins');
 await hostAdmin('relay',{operation:'activate'});
 const connections={};for(const name of ['myeve','peer'])connections[name]=await command(name,'connect',{localAgentId:seeds[name].agent.id});
 check('both MyEve workers authenticate and register native Relay identities');
 for(const name of ['myeve','peer'])await hostAdmin('relay',{operation:'passport',accountId:accounts[name].accountId,userId:accounts[name].id??accounts[name].userId,agentId:connections[name].agentId,expiresAt:future()});
 const a=connections.myeve,b=connections.peer;
 for(const name of ['myeve','peer']){const other=name==='myeve'?'peer':'myeve';await command(name,'peer',{address:connections[other].address,origin:origins[other],publicKey:artifacts[other]});await command(name,'policy',{research:'accept',analysis:'accept',summarization:'accept',artifact_generation:'accept'});}
 const grant=(target,caller,capability,resource,extra={})=>command(target,'grant',{grantorAgentId:connections[target].agentId,granteeOwnerId:accounts[caller].accountId,granteeAgentId:connections[caller].agentId,capability,resource,conditions:{expiresAt:future(),rateLimit:{calls:120,windowSeconds:60},allowedTopics:[],approvalRequired:false,...extra}});
 const preview=await command('peer','preview',{name:'Synthetic shared Atlas',references:[seeds.peer.records[0].id],visibility:'SHARED',audience:[{ownerId:accounts.myeve.accountId,agentId:a.agentId}],expiresAt:future()});
 const publication=await command('peer','confirm',{previewHash:preview.previewHash},preview.id);await grant('peer','myeve','knowledge.query',publication.viewId);
 const query={target:b.address,resource:publication.viewId,capability:'knowledge.query',idempotencyKey:'fq-query-0001',expiresAt:future(),payload:{mode:'RECORD_RETRIEVAL',query:'What is published about Atlas?',requestedTypes:['fact'],topics:[],maxRecords:1}};
 const submitted=await command('myeve','send',query);
 const complete=async(worker,id)=>wait(async()=>{const r=await command(worker,'get',undefined,id);const target=worker==='peer'?'myeve':'peer';const failed=await dbs[target].pool.query("SELECT 1 FROM myeve_relay_requests WHERE request_id=$1 AND state='recovery_required'",[id]);if(failed.rowCount)throw Object.assign(Error('Native work requires recovery; fixture does not retry execution'),{fatal:true});return ['COMPLETED','REJECTED','DENIED'].includes(r.status)?r:null;});
 const answer=await complete('myeve',submitted.requestId);assert.equal(answer.status,'COMPLETED');assert.equal(JSON.stringify(answer).includes('SYNTHETIC-PRIVATE'),false);
 check('A to Relay to B signed knowledge delivery preserves private-data isolation');
 assert.equal((await command('myeve','send',query)).requestId,submitted.requestId);check('native request idempotency does not create duplicate work');
 await stop('peer-worker');const restartAt=Date.now()/1000;await startWorker('peer');await wait(async()=>(await authority.status()).workers.peer.at>restartAt);assert.equal((await command('myeve','get',undefined,submitted.requestId)).status,'COMPLETED');check('worker restart retains durable request and controller accounting');
 const fixture=await hostAdmin('peer',{operation:'artifact-fixture',expiresAt:future()});
 const stored=await rpc('http',{operation:randomUUID(),route:'artifact-store',url:origins.peer+'/api/relay/qualification-artifacts',method:'POST',headers:{'content-type':'application/json'},bodyBase64:Buffer.from(JSON.stringify(fixture)).toString('base64')},tokens.peer);assert.equal(stored.status,200);
 await grant('myeve','peer','artifact.share','architecture');
 const sourceArtifact=await command('peer','artifact-share',a.address,'fq-synthetic-source');
 const shared=await command('peer','send',{target:a.address,resource:'architecture',capability:'artifact.share',idempotencyKey:'fq-source-transfer',expiresAt:future(),payload:sourceArtifact});
 assert.equal((await complete('peer',shared.requestId)).status,'COMPLETED');check('real signed artifact transfer supplies native work context');
 const principal=(await dbs.relay.pool.query('SELECT principal_id FROM account_memberships WHERE account_id=$1',[accounts.myeve.accountId])).rows[0].principal_id;
 const budget=await hostAdmin('relay',{operation:'budget',input:{accountId:accounts.myeve.accountId,actorPrincipalId:principal,scope:'AGENT',scopeId:a.agentId,dimension:'MODEL_SPEND',unit:'minor_currency_unit',currency:'USD',hardLimit:'10'}});
 await grant('myeve','peer','work.request','analysis',{budgetId:budget.budgetId,maxCost:'1'});
 const work=(key,task)=>({target:a.address,resource:'analysis',capability:'work.request',idempotencyKey:key,expiresAt:future(),payload:{category:'analysis',task,expectedOutput:'Short analysis citing the source requestId.',budget:{runtimeSeconds:60,cost:'1',modelSteps:1,delegatedWorkers:0},deadline:future(300000),context:[shared.requestId]}});
 const refused=await command('peer','send',work('fq-local-refusal','Send an email using the owner account'));
 assert.equal((await complete('peer',refused.requestId)).status,'REJECTED');check('native local authority refuses prohibited email execution');
 const safe=await command('peer','send',work('fq-safe-analysis','Analyze the shared Atlas architecture. Cite its requestId.'));
 const result=await complete('peer',safe.requestId);assert.equal(result.status,'COMPLETED');assert.equal(result.result.modelSteps,1);check('actual MyEve worker executes bounded Haiku adapter with substituted provider');
 await grant('peer','myeve','artifact.share','analysis-result');
 const artifact=await command('myeve','artifact-share',b.address,result.result.artifacts[0]);
 const transfer=await command('myeve','send',{target:b.address,resource:'analysis-result',capability:'artifact.share',idempotencyKey:'fq-artifact-transfer',expiresAt:future(),payload:artifact});
 assert.equal((await complete('myeve',transfer.requestId)).status,'COMPLETED');check('artifact transfer verifies source proof and stores through guarded storage origin');
 const status=await authority.status();assert.ok(status.events.some(e=>e.kind==='signing_permit_consumed'));assert.equal(status.http,attempts);check('HTTP accounting equals observed federation plus substituted model attempts',{attempts});
 holdModel=true;
 const activeWork=await command('peer','send',work('fq-active-stop','Analyze the shared Atlas architecture for the stop drill.'));
 await wait(()=>activeModel);
 const queued=randomUUID();await rpc('job-submit',{id:queued,worker:'myeve',command:{operation:'policy',input:{research:'reject',analysis:'reject',summarization:'reject',artifact_generation:'reject'}}});
 const attemptsAtStop=attempts;
 const stopAdapters={...relayRevocationAdapters(dbs.relay.pool,{database:dbs.relay.database,ownerIds:[accounts.myeve.accountId,accounts.peer.accountId]}),disableModelCredentials:async()=>controller.model.disable(),stopWorkers:async()=>{const values=await Promise.all(['myeve','relay','peer'].map(name=>stop(`${name}-worker`)));return values.every(Boolean);},preserveEvidence:evidenceAdapter(dbs.relay.pool,authority),freezeDatabaseLogins:async()=>{const values=await Promise.all(Object.values(dbs).map(d=>freezeDatabase(d.pool,d)));return values.every(Boolean);}};
 const revoke=stopAdapters.revokeCredentials;stopAdapters.revokeCredentials=async()=>{await assert.rejects(rpc('active',{},tokens.peer));check('admission closes and denies new work before credential revocation');return revoke();};
 const stopped=await emergencyStop(authority,stopAdapters,7000);assert.equal(stopped.complete,true,JSON.stringify(stopped));
 await assert.rejects(rpc('http',{operation:'after_stop_request',route:'relay'},tokens.myeve));await assert.rejects(rpc('heartbeat',{sha:sources.peer},tokens.peer));
 await sleep(300);assert.equal(attempts,attemptsAtStop);assert.equal(activeModel,false);assert.equal((await authority.status()).jobs[queued].state,'DENIED');
 for(const d of Object.values(dbs))assert.equal(await verifyDatabaseBrake(d.pool,d),true);
 await startWorker('peer');await wait(()=>processes['peer-worker'].exitCode!==null,10000);assert.notEqual(processes['peer-worker'].exitCode,0);
 check('assembled stop closes admission revokes authority stops all workers preserves evidence then freezes DB roles',{outcomes:stopped});check('stopped session cannot restart or admit new provider attempts');
 writeFileSync(output,JSON.stringify({status:'PASS',sources,checks,session,accounting:{http:attempts,modelCalls:(await authority.status()).calls,artifactCount:(await authority.status()).artifacts,artifactBytes:(await authority.status()).artifactBytes},externalGates:'NOT_RUN',kms:'LOCAL_SIGNER_ONLY',completeGoldenPath:true},null,2));
}catch(error){writeFileSync(output,JSON.stringify({status:'FAILED',sources,checks,error:error.message,diagnostics:temp},null,2));console.error(`Simulation failed: ${error.message}; diagnostics ${temp}`);process.exitCode=1;}
finally{
 for(const name of Object.keys(processes))await stop(name).catch(()=>{processes[name].kill('SIGKILL');});
 await runtime?.close().catch(()=>{});for(const server of servers){server.closeAllConnections();server.close();}
 for(const d of Object.values(dbs)){await d.pool.end();await admin.query(`DROP DATABASE ${d.database} WITH(FORCE)`);}
 for(const role of roles)await admin.query(`DROP ROLE IF EXISTS ${role}`);await admin.end();
 const report=JSON.parse(readFileSync(output,'utf8'));report.cleanup={databasesDropped:true,rolesDropped:true,processesStopped:true,fixtureSecretsDestroyed:process.exitCode!==1};
 if(process.exitCode!==1)rmSync(temp,{recursive:true,force:true});writeFileSync(output,JSON.stringify(report,null,2));
}
