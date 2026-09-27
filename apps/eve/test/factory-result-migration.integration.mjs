import assert from 'node:assert/strict';
import {randomUUID,createHash,generateKeyPairSync} from 'node:crypto';
import {prepareAuthenticatedFactoryInput} from '../lib/engineering/factory-authenticated-result.ts';
import {FactoryResultStore} from '../lib/engineering/factory-result-store.ts';
import {requestDescription,receiptDescription,resultDescription} from '../lib/myfactory-protocol.mjs';
import {Client} from 'pg';
import {readFile} from 'node:fs/promises';
import {loadMigrations,runMigrations} from '../scripts/migration-runner.ts';
const url=process.env.Q37_PG_URL;if(!url)throw Error('Disposable Q37_PG_URL required');
const admin=new Client({connectionString:url});await admin.connect();
const migrations=await loadMigrations();assert.equal(migrations.at(-1).name,'0054_engineering_factory_results.sql');
const name='q37_'+randomUUID().replaceAll('-','');await admin.query(`CREATE DATABASE ${name}`);
const client=new Client({connectionString:url.replace(/\/[^/]*$/,`/${name}`)});await client.connect();
const db={query:async(s,p)=>(await client.query(s,p)).rows,transaction:async list=>{await client.query('BEGIN');try{for(const x of list)await client.query(x.sql,x.params);await client.query('COMMIT')}catch(e){await client.query('ROLLBACK');throw e}}};
const sha=s=>createHash('sha256').update(s).digest('hex');
const scope='q37-'+randomUUID(),work=randomUUID(),request=randomUUID();
const data=(operationId=sha('op'),manifestDigest=sha('manifest'),attemptNumber=1)=>({receiptId:randomUUID(),scopeId:scope,scopeKind:'personal',workId:work,workVersion:1,workGeneration:1,criteriaVersion:1,agentId:'sofie',factoryRequestId:request,factoryId:'factory',factorySourceCommit:'a'.repeat(40),factorySourceTree:'b'.repeat(40),factoryConfigurationDigest:sha('config'),workOrderId:randomUUID(),runId:randomUUID(),attemptNumber,producerStatus:'ready_for_review',protocolVersion:1,signingKeyId:'key',signingKeyVersion:'ed25519-v1',operationId,manifestDigest,candidateCommit:'c'.repeat(40),candidateTree:'d'.repeat(40),evidenceManifestDigest:sha('checks'),artifactManifestDigest:sha('artifacts'),signedEnvelope:'signed',signedEnvelopeDigest:sha('signed')});
const call=async(fn,p)=>(await client.query(`SELECT ${fn}($1::jsonb) value`,[JSON.stringify(p)])).rows[0].value;
try{
 await runMigrations(db,migrations.slice(0,-1),()=>{});
 const historicalWork=randomUUID();await client.query(`INSERT INTO engineering_work(id,scope_id,scope_kind,created_by,title,objective,repository,lifecycle,control,version,generation,criteria_version,max_cost_usd,max_duration_seconds,idempotency_key,request_hash) VALUES($1,$2,'personal',$2,'Before 0054','Preserve row','owner/repo','active','paused',1,1,1,1,3600,$3,$4)`,[historicalWork,scope,randomUUID(),sha('historical')]);
 const broken=[...migrations.slice(0,-1),{...migrations.at(-1),statements:[...migrations.at(-1).statements,'SELECT q37_injected_failure()']}];
 await assert.rejects(runMigrations(db,broken,()=>{}),/q37_injected_failure/);
 assert.equal((await client.query("SELECT to_regclass('engineering_factory_results') present")).rows[0].present,null);
 await runMigrations(db,migrations,()=>{});await runMigrations(db,migrations,()=>{});
 assert.equal((await client.query('SELECT count(*)::int n FROM sofie_schema_migrations')).rows[0].n,54);
 assert.equal((await client.query('SELECT count(*)::int n FROM engineering_work WHERE id=$1',[historicalWork])).rows[0].n,1);
 await client.query(`INSERT INTO engineering_work(id,scope_id,scope_kind,created_by,title,objective,repository,lifecycle,control,version,generation,criteria_version,max_cost_usd,max_duration_seconds,idempotency_key,request_hash) VALUES($1,$2,'personal',$2,'Factory fixture','Receipt','owner/repo','active','agent',1,1,1,1,3600,$3,$4)`,[work,scope,randomUUID(),sha('work')]);
 const p=data(),first=await call('engineering_factory_receive',p);assert.equal(first.state,'RECEIVED');
 const peers=await Promise.all(Array.from({length:6},async()=>{const peer=new Client({connectionString:url.replace(/\/[^/]*$/,`/${name}`)});await peer.connect();return peer}));
 const replay=await Promise.all(peers.map(async peer=>(await peer.query('SELECT engineering_factory_receive($1::jsonb) value',[JSON.stringify({...p,receiptId:randomUUID()})])).rows[0].value));
 await Promise.all(peers.map(peer=>peer.end()));assert(replay.every(x=>x.receiptId===first.receiptId));
 assert.equal((await call('engineering_factory_receive',{...p,receiptId:randomUUID(),manifestDigest:sha('different')})).state,'CONFLICT');
 const step=(id,expected,target)=>call('engineering_factory_advance',{scopeId:scope,scopeKind:'personal',workId:work,receiptId:id,expected,target,proofDigest:sha('signed'),trustStatus:'CURRENT'});
 for(const [a,b] of [['RECEIVED','AUTHENTICATED'],['AUTHENTICATED','ATTESTED'],['ATTESTED','INTEGRITY_VERIFIED'],['INTEGRITY_VERIFIED','ADMITTED']])await step(first.receiptId,a,b);
 assert.equal((await step(first.receiptId,'INTEGRITY_VERIFIED','ADMITTED')).replay,true);
 const newer=data(sha('newer'),sha('newer'),2),n=await call('engineering_factory_receive',newer);
 for(const [a,b] of [['RECEIVED','AUTHENTICATED'],['AUTHENTICATED','ATTESTED'],['ATTESTED','INTEGRITY_VERIFIED']])await step(n.receiptId,a,b);
 await client.query('UPDATE engineering_work SET generation=2 WHERE id=$1',[work]);assert.equal((await step(n.receiptId,'INTEGRITY_VERIFIED','ADMITTED')).state,'STALE');
 assert.equal((await client.query('SELECT count(*)::int n FROM engineering_direct_workspaces')).rows[0].n,0);
 const role='q37_role_'+randomUUID().replaceAll('-','');await client.query(`CREATE ROLE ${role} NOLOGIN`);try{await client.query(`GRANT USAGE ON SCHEMA public TO ${role}`);await client.query(`GRANT SELECT ON engineering_factory_results TO ${role}`);await client.query(`SET ROLE ${role}`);await assert.rejects(client.query('DELETE FROM engineering_factory_results'),/permission denied/);await assert.rejects(client.query("SELECT engineering_factory_advance('{}'::jsonb)"),/permission denied/)}finally{await client.query('RESET ROLE');await client.query(`DROP OWNED BY ${role}`);await client.query(`DROP ROLE ${role}`)}
 const liveWork=randomUUID(),base='b'.repeat(40),tree='a'.repeat(40);
 await client.query(`INSERT INTO engineering_work(id,scope_id,scope_kind,created_by,title,objective,repository,lifecycle,control,version,generation,criteria_version,max_cost_usd,max_duration_seconds,idempotency_key,request_hash) VALUES($1,$2,'personal',$2,'Golden fixture','Receipt','owner/repo','active','agent',1,1,1,1,3600,$3,$4)`,[liveWork,scope,randomUUID(),sha('work2')]);
 const pin={kind:'TRUSTED_FACTORY_EXPECTATION',factoryId:'q37-factory',factoryVersion:{myFactoryCommit:'c'.repeat(40),sourceTree:'d'.repeat(40),configurationDigest:sha('config')}};
 const submission={ownerId:scope,agentId:'sofie',workId:liveWork,workVersion:1,workGeneration:1,criteriaVersion:1,objective:'Bounded change',criteria:['Check passes'],kind:'feature',repository:'owner/repo',baseCommit:base,allowedPaths:['answer.ts'],sourcePin:pin,clientId:'myeve',idempotencyKey:'q37-store-'+randomUUID(),policyReference:null,budgetReference:null,submittedAt:new Date().toISOString()};
 const {binding,hostedInput}=prepareAuthenticatedFactoryInput(submission,'Golden fixture',pin);
 const keys=generateKeyPairSync('ed25519'),config={clientId:'myeve',repository:'owner/repo',teamId:'team',token:'a'.repeat(64),receiptPublicKey:keys.publicKey.export({type:'spki',format:'pem'}).toString()};
 const workOrderId=randomUUID(),runId=randomUUID(),rawCommit=`tree ${tree}\nparent ${base}\nauthor Factory <factory@example.invalid> 1 +0000\ncommitter Factory <factory@example.invalid> 1 +0000\n\nCandidate\n`;
 const candidateCommit=createHash('sha1').update(`commit ${Buffer.byteLength(rawCommit)}\0`).update(rawCommit).digest('hex');
 const artifact=(kind,value)=>{const b=Buffer.from(value);return{id:`${kind}:${sha(b)}`,kind,byteLength:b.length,sha256:sha(b),bytes:b.toString('base64url')}};
 const patch=artifact('patch','bounded patch'),log=artifact('log','check passed');
 const manifest={requestBindingDigest:sha(JSON.stringify(hostedInput.factoryBinding)),workOrderId,runId,attemptNumber:1,inputCommit:base,candidateCommit,candidateTree:tree,changedPaths:['answer.ts'],commitObject:Buffer.from(rawCommit).toString('base64url'),checks:[{id:randomUUID(),command:'npm test',candidateCommit,status:'passed',exitCode:0,startedAt:new Date().toISOString(),finishedAt:new Date().toISOString(),logSha256:log.sha256}],artifacts:[patch,log]};
 const result={version:1,keyVersion:'ed25519-v1',issueId:binding.requestId,operationId:sha(JSON.stringify(['myfactory-result-v1',binding.requestId,runId])),factoryId:pin.factoryId,factoryVersion:hostedInput.factoryBinding.expectedFactoryVersion,manifestDigest:sha(JSON.stringify(manifest)),manifest,issuedAt:new Date().toISOString()};
 let description=requestDescription(config,hostedInput);description=receiptDescription(description,{version:1,issueId:binding.requestId,workOrderId,state:'ready_for_review',updatedAt:new Date().toISOString(),workOrderUrl:`http://127.0.0.1:8788/?workOrder=${workOrderId}`},keys.privateKey);description=resultDescription(description,Buffer.from(JSON.stringify(result)).toString('base64url'),keys.privateKey);
 const issue={id:binding.requestId,identifier:'Q37-1',url:'https://linear.app/fixture/issue/Q37-1',title:'Golden fixture',team:{id:'team'},description};
 const admission={binding,hostedInput,currentWork:{ownerId:scope,agentId:'sofie',workId:liveWork,workVersion:1,workGeneration:1,criteriaVersion:1,lifecycle:'active',control:'agent'},expectedWorkOrderId:workOrderId,expectedRunId:runId,expectedAttempt:1,requiredChecks:['npm test'],trustedPin:pin,config,graphql:async()=>({issues:{nodes:[issue]}}),scopeKind:'personal'};
 const store=new FactoryResultStore(db),admitted=await store.admit(admission);assert.equal(admitted.status,'ADMITTED');
 const restarted=new FactoryResultStore(db),replayed=await restarted.admit(admission);assert.equal(replayed.status,'ADMITTED');assert.equal(replayed.receiptId,admitted.receiptId);assert.equal(replayed.readiness,'NOT_READY');assert.equal(replayed.authorityGranted,false);
 for(const state of ['RECEIVED','AUTHENTICATED','ATTESTED','INTEGRITY_VERIFIED']){await client.query('UPDATE engineering_factory_results SET admission_state=$1,cryptographically_valid=$2 WHERE id=$3',[state,state!=='RECEIVED',admitted.receiptId]);const resumed=await new FactoryResultStore(db).admit(admission);assert.equal(resumed.status,'ADMITTED');assert.equal(resumed.receiptId,admitted.receiptId)}
 assert.equal((await client.query('SELECT count(*)::int n FROM engineering_factory_results WHERE work_id=$1',[liveWork])).rows[0].n,1);
 for(const [label,change] of [['cancel',"control='human'"],['supersede','version=3']]){
  const p4=data(sha(label),sha(label+'-manifest'),3);p4.workGeneration=2;const r4=await call('engineering_factory_receive',p4);
  for(const [a,b] of [['RECEIVED','AUTHENTICATED'],['AUTHENTICATED','ATTESTED'],['ATTESTED','INTEGRITY_VERIFIED']])await step(r4.receiptId,a,b);
  const rival=new Client({connectionString:url.replace(/\/[^/]*$/,`/${name}`)});await rival.connect();
  try{await client.query('BEGIN');await client.query(`UPDATE engineering_work SET ${change} WHERE id=$1`,[work]);
   const racing=rival.query('SELECT engineering_factory_advance($1::jsonb) value',[JSON.stringify({scopeId:scope,scopeKind:'personal',workId:work,receiptId:r4.receiptId,expected:'INTEGRITY_VERIFIED',target:'ADMITTED',proofDigest:sha('signed')})]);
   await new Promise(resolve=>setTimeout(resolve,20));await client.query('COMMIT');
   assert.equal((await racing).rows[0].value.state,'STALE');
  }finally{await client.query('ROLLBACK').catch(()=>{});await rival.end()}
 }
 let completeAttempt='NOT_RUN';
 if(process.env.Q37_GOLDEN_PRODUCER){const f=JSON.parse(await readFile(process.env.Q37_GOLDEN_PRODUCER,'utf8')),s=f.submission;
  await client.query(`INSERT INTO engineering_work(id,scope_id,scope_kind,created_by,title,objective,repository,lifecycle,control,version,generation,criteria_version,max_cost_usd,max_duration_seconds,idempotency_key,request_hash) VALUES($1,$2,'personal',$2,'Golden Factory return',$3,$4,'active','agent',1,1,1,1,3600,$5,$6)`,[s.workId,s.ownerId,s.objective,s.repository,randomUUID(),sha('golden-work')]);
  const prepared=prepareAuthenticatedFactoryInput(s,f.hostedInput.title,s.sourcePin);assert.deepEqual(prepared.hostedInput,f.hostedInput);
  const graphql=async q=>q.includes('FactoryArtifactChunks')?{issue:{id:f.issue.id,comments:{nodes:f.comments,pageInfo:{hasNextPage:false,endCursor:null}}}}:{issues:{nodes:[f.issue]}};
  const request={binding:prepared.binding,hostedInput:prepared.hostedInput,currentWork:{ownerId:s.ownerId,agentId:s.agentId,workId:s.workId,workVersion:1,workGeneration:1,criteriaVersion:1,lifecycle:'active',control:'agent'},expectedWorkOrderId:f.workOrderId,expectedRunId:f.runId,expectedAttempt:f.attemptNumber,requiredChecks:['git diff --check'],trustedPin:s.sourcePin,config:{...f.config,receiptPublicKey:f.publicKey},graphql,scopeKind:'personal'};
  const accepted=await new FactoryResultStore(db).admit(request);assert.equal(accepted.status,'ADMITTED');assert.equal(accepted.readiness,'NOT_READY');assert.equal(accepted.independentVerification,'NOT_RUN');
  const replay=await new FactoryResultStore(db).admit(request);assert.equal(replay.receiptId,accepted.receiptId);completeAttempt='PASS';}
 const freshName='q37_fresh_'+randomUUID().replaceAll('-','');await admin.query(`CREATE DATABASE ${freshName}`);
 const fresh=new Client({connectionString:url.replace(/\/[^/]*$/,`/${freshName}`)});await fresh.connect();
 try{const freshDb={query:async(q,p)=>(await fresh.query(q,p)).rows,transaction:async statements=>{await fresh.query('BEGIN');try{for(const x of statements)await fresh.query(x.sql,x.params);await fresh.query('COMMIT')}catch(e){await fresh.query('ROLLBACK');throw e}}};await runMigrations(freshDb,migrations,()=>{});assert.equal((await fresh.query('SELECT count(*)::int n FROM sofie_schema_migrations')).rows[0].n,54)}finally{await fresh.end();await admin.query(`DROP DATABASE ${freshName} WITH (FORCE)`)}
 console.log(JSON.stringify({migration:54,upgrade:'PASS',rollback:'PASS',rerun:'PASS',replay:'PASS',conflict:'PASS',stale:'PASS',durableAdmission:'PASS',restart:'PASS',completeAttempt,factoryGrantedAuthority:0}));
}finally{await client.end();await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);await admin.end()}
