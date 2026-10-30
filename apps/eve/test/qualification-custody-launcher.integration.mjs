/** Production custody launcher: a non-secret bundle `assembly` profile + protected values read by NAME -> QdevCustody -> the real composeRuntimePorts.
 * Synthetic only (scripted capability/MissionControl rows, disposable PostgreSQL journal): no network, provider, docker, deployment or spend.
 * Run: MYEVE_ISOLATED_COHORT_TEST_DATABASE=postgres://postgres@127.0.0.1:PORT/postgres node --import tsx --test apps/eve/test/qualification-custody-launcher.integration.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash,generateKeyPairSync} from 'node:crypto';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Client} from 'pg';
import {assemblyProfileSchema,qdevJourneyId} from '../lib/qualification/custody-profile.ts';
import {assembleFromProfile} from '../lib/qualification/custody-launcher.ts';
import {loadCustody} from '../lib/qualification/custody-loader.ts';
import {composeRuntimePorts} from '../lib/qualification/runtime-ports.ts';
import {RETAINED_ADMISSION_SCHEMA} from '../lib/qualification/retained-admissions.ts';
import {JOURNAL_SCHEMA,PostgresJournal} from '../lib/qualification/journal.ts';
import {QDEV_BASELINE,qualificationBinding} from '../lib/external-alpha/qualification-accounting.ts';
import {WorkStore} from '../lib/engineering/store.ts';
import {factoryRelayLeaseEnrollmentDigest} from '../lib/engineering/factory-relay-lease-client.ts';
import {FileActivationPermits,signActivationApproval} from '../lib/qualification/static-activation.ts';
import {mkdirSync,chmodSync,writeFileSync} from 'node:fs';
import {syntheticFactory,h} from './qualification-synthetic.mjs';

const connection=process.env.MYEVE_ISOLATED_COHORT_TEST_DATABASE;
assert(connection,'Dedicated localhost PostgreSQL fixture URL required; never use DATABASE_URL');
const root=new URL(connection);
assert(['localhost','127.0.0.1'].includes(root.hostname)&&root.pathname==='/postgres','Dedicated localhost admin database required');
const admin=new Client({connectionString:connection});admin.on('error',()=>{});await admin.connect();
const name='myeve_qdev_cl_'+randomBytes(6).toString('hex');
await admin.query('CREATE DATABASE '+name);
const u=new URL(root);u.pathname='/'+name;
const db=new Client({connectionString:u.href});db.on('error',()=>{});await db.connect();
await db.query(JOURNAL_SCHEMA);await db.query(RETAINED_ADMISSION_SCHEMA);
const journalDb={query:async(q,p)=>(await db.query(q,p)).rows};

const fx=syntheticFactory(),sha=c=>c.repeat(64);
const OWNER='owner-1',INSTALL='install-1';
const project={...QDEV_BASELINE,operatingProfileSha256:h('1'),factoryVersionSha256:fx.factoryVersion,protectedSpecificationSha256:h('3'),
  sources:{myeve:'a'.repeat(40),factory:'b'.repeat(40),relay:'c'.repeat(40),missioncontrol:'d'.repeat(40)}};
const enrollment={schema:'mc-owner-enrollment/v1',environment:'APPROVED_NONPRODUCTION',installationId:INSTALL,revision:1,ownerId:OWNER,ownerSubject:'sub-1',missionControlOwnerId:'mco-1',
  tenantId:'tenant-1',projectId:'project-1',connectionId:'conn-1',issuer:'https://mc.example.com',audience:'https://myeve.example.com',clerkIssuer:'https://clerk.example.com',
  clerkAudience:'aud-1',clerkAuthorizedParty:'https://app.example.com',activeFrom:0,expiresAt:4e12,revokedAt:null,factoryVersion:fx.factoryVersion,executionContractSha256:sha('1'),
  capabilityPolicySha256:sha('2'),maxCostMicrousd:1300000,maxDurationSeconds:600,permitKeys:[{keyId:sha('3'),publicKey:'pem',activeFrom:0,notAfter:4e12,revokedAt:null}]};
const relayEnrollment={schema:'factory-relay-lease-enrollment/v1',ownerId:OWNER,installationId:INSTALL,connectionId:'conn-1',enrollmentRevision:1,origin:'https://relay.example.com',
  activeFrom:0,expiresAt:4e12,accountId:'acct_abcdefgh',agentId:'agt_abcdefgh',runtimeClientId:'rtc_abcdefgh',taskId:'tsk_abcdefgh',workloadId:'wkl_abcdefgh',audience:'myfactory',
  capability:{name:'myfactory.submit',version:'1.0'},resource:{type:'repository'},parameters:{},relayKey:{keyId:'relay-key-1',jwk:{kty:'EC',crv:'P-256',x:'x'.repeat(43),y:'y'.repeat(43)}}};
const verifierPair=generateKeyPairSync('ed25519'),issuerPair=generateKeyPairSync('ed25519');
const issuerSpki=issuerPair.publicKey.export({type:'spki',format:'der'});
const releaseRoot=join(mkdtempSync(join(tmpdir(),'qdev-launcher-')),'releases');
const profile=()=>({slot:'Q1',workIds:{stage1:randomUUID(),stage2:randomUUID(),stage3:randomUUID()},baseline:{commit:fx.baseline.commit,tree:fx.baseline.tree},
  capability:{clientId:'myeve',backendId:'backend-1',missionId:'mission-1',signerEnv:'QDEV_CAPABILITY_PROPAGATION',
    relay:{enrollment:relayEnrollment,enrollmentSha256:factoryRelayLeaseEnrollmentDigest(relayEnrollment),revision:1,credentialEnv:'QDEV_FACTORY_RELAY_CREDENTIAL',workloadTokenEnv:'QDEV_FACTORY_RELAY_WORKLOAD_TOKEN'}},
  model:{id:'provider/synthetic-model',apiKeyEnv:'QDEV_MODEL_GATEWAY_KEY',price:{inputMicrousdPerMillionTokens:3000000,outputMicrousdPerMillionTokens:15000000},system:'You are Sofie.'},
  verifier:{origin:'https://verifier.example.com',credentialEnv:'QDEV_VERIFIER_CREDENTIAL',keys:[{keyId:'verifier-1',publicKeyPem:verifierPair.publicKey.export({type:'spki',format:'pem'}),activeFrom:'2026-01-01T00:00:00.000Z',notAfter:'2100-01-01T00:00:00.000Z'}]},
  build:{appId:'app-1',lockSha256:sha('4'),packageSha256:sha('5'),image:'sha256:'+sha('6'),nodeVersion:'v24.18.1',buildProfileDigest:sha('7'),
    issuer:{keyId:'build-issuer-1',purpose:'STATIC_BUILD_PROVENANCE_V1',ownerId:OWNER,factoryId:fx.factoryId,factoryVersion:fx.factoryVersion,buildProfileDigest:sha('7'),
      publicKeyPem:issuerPair.publicKey.export({type:'spki',format:'pem'}),spkiSha256:createHash('sha256').update(issuerSpki).digest('hex'),notBefore:'2020-01-01T00:00:00.000Z',notAfter:'2100-01-01T00:00:00.000Z',revoked:false},
    signerEnv:'QDEV_BUILD_ISSUER_KEY'},
  publishing:{root:releaseRoot,installationId:INSTALL},servedOrigin:'https://apps.example.com'});
const bundleFor=(over={})=>({version:1,ownerId:OWNER,notAfter:'2099-01-01T00:00:00.000Z',project,
  credentials:{accounting:'QDEV_ACCOUNTING_CREDENTIAL',relay:'QDEV_RELAY_CREDENTIAL',accountingDatabaseUrl:'QDEV_ACCOUNTING_DATABASE_URL',journalDatabaseUrl:'QDEV_JOURNAL_DATABASE_URL'},
  conversation:{approvedRequest:'Build the approved dashboard'},assembly:profile(),...over});
const secrets=()=>({QDEV_CAPABILITY_PROPAGATION:JSON.stringify({signer:{keyId:'signer-1',jwk:{kty:'EC',crv:'P-256',x:'x'.repeat(43),y:'y'.repeat(43),d:'d'.repeat(43)}}}),
  QDEV_FACTORY_RELAY_CREDENTIAL:'relay-cred-'+randomBytes(6).toString('hex'),QDEV_FACTORY_RELAY_WORKLOAD_TOKEN:'workload-'+randomBytes(6).toString('hex'),
  QDEV_MODEL_GATEWAY_KEY:'gateway-'+randomBytes(6).toString('hex'),QDEV_BUILD_ISSUER_KEY:issuerPair.privateKey.export({type:'pkcs8',format:'pem'}),
  QDEV_VERIFIER_CREDENTIAL:'verifier-'+randomBytes(6).toString('hex'),QDEV_JOURNAL_DATABASE_URL:'postgres://journal.invalid/j'});
const conn={origin:'http://127.0.0.1:12345',token:'a'.repeat(64),factoryId:fx.factoryId,sourceDigest:fx.sourceDigest,configurationDigest:fx.configurationDigest,factoryVersion:fx.factoryVersion,
  repositoryPath:'/synthetic',keys:[fx.key],qualification:{scopeId:OWNER,profileHash:sha('e'),evidenceRef:'synthetic',qualifiedAt:'2026-01-01T00:00:00Z',expiresAt:'2099-01-01T00:00:00Z',mode:'LOCAL_FIXTURE',spendEnforced:false}};
const fakeStore=(rows={})=>{
  const database={async atomic(fn){return fn(database);},async query(sql){
    if(/set_config/.test(sql))return [];
    if(/missioncontrol_owner_enrollments/.test(sql))return rows.enrollment===null?[]:[{document:rows.enrollment??enrollment}];
    if(/capability_control\.installations/.test(sql))return [{organization_id:'org-1'}];
    if(/capability_control\.policy_destinations/.test(sql))return rows.destination===null?[]:[{key_id:'destination-key',public_jwk:{kty:'EC',crv:'P-256',x:'x'.repeat(43),y:'y'.repeat(43)},incarnation:'epoch-1',enrollment_version:1}];
    throw new Error('unexpected query '+sql.slice(0,80));}};
  return new WorkStore({scopeId:OWNER,scopeKind:'personal',actorId:OWNER},database);
};
const deps=(over={})=>({database:()=>journalDb,store:()=>fakeStore(),runtimeConfig:async()=>({engineering:{agentId:'agent-1',ownerId:OWNER},routing:{intent:'PRODUCE'},commands:['npm test'],connection:conn}),
  languageModel:()=>({specificationVersion:'v2',provider:'synthetic',modelId:'synthetic'}),docker:async()=>{throw new Error('docker must not run');},...over});
const context=(bundle,env)=>({bundle,credential:n=>env[n]});

try{
 await test('the profile is non-secret and strict: unknown keys (such as a literal credential) and malformed pins are refused',()=>{
  assert.ok(assemblyProfileSchema.safeParse(profile()).success);
  const p=profile();
  for(const mutate of [x=>{x.model.apiKey='sk-live'},x=>{x.capability.signerEnv='lower_case'},x=>{x.build.privateKey='-----BEGIN'},x=>{x.publishing.activation={permit:true}},
    x=>{x.baseline.commit='abc'},x=>{x.build.image='node:latest'},x=>{x.workIds.stage4='x'},x=>{x.model.price.inputMicrousdPerMillionTokens=0}]){
   const bad=structuredClone(p);mutate(bad);assert.equal(assemblyProfileSchema.safeParse(bad).success,false,JSON.stringify(bad).slice(0,120));
  }
  assert.equal(qdevJourneyId(OWNER,project).length,64);
 });

 await test('launcher: profile + named protected values -> QdevCustody -> the real composeRuntimePorts (verifier/producer independence, release controller, no activation permit)',async()=>{
  const env=secrets(),b=bundleFor(),calls=[];
  const custody=await assembleFromProfile(context(b,env),deps({database:url=>{calls.push(url);return journalDb;}}));
  assert.ok(custody);assert.deepEqual(calls,[env.QDEV_JOURNAL_DATABASE_URL]);
  assert.equal(custody.agent.slot,'Q1');assert.ok(custody.agent.factoryCoding.sofie.available());
  assert.equal(custody.factory.capability.binding.backendId,'backend-1');assert.equal(custody.factory.capability.binding.incarnation,'epoch-1');
  assert.equal(custody.factory.capability.binding.organizationId,'org-1');assert.equal(custody.factory.capability.binding.installationId,INSTALL);
  assert.equal(custody.factory.capability.binding.agentId,'agent-1');assert.equal(custody.factory.capability.key.keyId,'destination-key');
  assert.equal(custody.sourceDigest,fx.sourceDigest);assert.equal(custody.verifier.credentialName,'QDEV_VERIFIER_CREDENTIAL');
  assert.equal(custody.myapps.publishing.activation,undefined,'no activation permit is conveyed');
  const ports=composeRuntimePorts({bundle:b,credential:n=>env[n]},custody);
  assert.ok(ports.agent&&ports.factory&&ports.verifier&&ports.myapps&&typeof ports.expectedFor==='function');
  // nothing protected appears anywhere in the non-secret bundle
  for(const v of Object.values(env))assert.equal(JSON.stringify(b).includes(v),false);
 });

 await test('activation: absent profile keeps publishing refused; a configured owner-approver is independent of every pipeline key and authorizes only a matching signed approval, once',async()=>{
  const env=secrets();
  const none=await assembleFromProfile(context(bundleFor(),env),deps());
  assert.equal(none.myapps.publishing.activation,undefined);
  const approver=generateKeyPairSync('ed25519'),actDir=mkdtempSync(join(tmpdir(),'qdev-launcher-act-'));chmodSync(actDir,0o700);mkdirSync(join(actDir,'approvals'),{mode:0o700});
  const withActivation=(keys)=>{const b=bundleFor();b.assembly.publishing.activation={dir:actDir,approverKeys:keys};return b;};
  const key=(pair,keyId='owner-approver')=>({keyId,publicKeyPem:pair.publicKey.export({type:'spki',format:'pem'}),activeFrom:'2026-01-01T00:00:00.000Z',notAfter:'2100-01-01T00:00:00.000Z'});
  const b=withActivation([key(approver)]);
  const custody=await assembleFromProfile(context(b,env),deps());
  const permit=custody.myapps.publishing.activation.permit;
  const request={operation:'PUBLISH',appId:'app-1',ownerId:OWNER,projectSha256:qualificationBinding(project).projectSha256,digest:'sha256:'+'a'.repeat(64)};
  assert.equal(await permit(request),false,'configured but no approval: still denied');
  const approval={schema:'myeve.qdev-activation-approval/v1',...request,keyId:'owner-approver',notBefore:new Date(Date.now()-60000).toISOString(),notAfter:new Date(Date.now()+3600000).toISOString(),nonce:randomBytes(12).toString('hex')};
  const file=join(actDir,'approvals','a.json');writeFileSync(file,signActivationApproval(approval,approver.privateKey.export({type:'pkcs8',format:'pem'})),{mode:0o600});
  assert.equal(await permit(request),true);assert.equal(await permit(request),false,'single use');
  // the approver may not be a key the pipeline already holds (verifier, build issuer, Factory producer)
  assert.equal(await assembleFromProfile(context(withActivation([key(verifierPair)]),env),deps()),null,'verifier key');
  assert.equal(await assembleFromProfile(context(withActivation([key(issuerPair)]),env),deps()),null,'build issuer key');
  assert.equal(await assembleFromProfile(context(withActivation([{...key(approver),publicKeyPem:fx.key.publicKey}]),env),deps()),null,'Factory producer key');
 });

 await test('resume: the journey id is the host journal id, so retained stage admissions are restored (warm) without preparing again',async()=>{
  const env=secrets(),b=bundleFor();
  const journey=qdevJourneyId(OWNER,project),e=fx.stage(1,fx.baseline).manifest.execution;
  const binding={workId:b.assembly.workIds.stage1,workVersion:1,workGeneration:1,criteriaVersion:1,agentId:'agent-1',factoryId:fx.factoryId,factoryVersion:fx.factoryVersion,requestId:e.requestId,
    requestDigest:e.requestDigest,sourceDigest:fx.sourceDigest,configurationDigest:fx.configurationDigest,workOrderId:e.workOrderId,runId:e.runId,attemptNumber:1,inputCommit:e.inputCommit,
    inputTree:e.inputTree,localSnapshotVersion:4,configuration:fx.configuration};
  const request={requestId:e.requestId,workId:binding.workId,workGeneration:1,repository:'synthetic/repo',deadline:'2099-01-01T00:00:00.000Z',maxSpendUsd:1,input:{baseRef:e.inputCommit,allowedPaths:fx.configuration.allowedPaths}};
  const identity={runId:randomUUID(),writerGeneration:1,dispatchIdentity:'d',workId:binding.workId,workGeneration:1,factoryId:fx.factoryId,factoryVersion:fx.factoryVersion,requestId:e.requestId,
    workOrderId:e.workOrderId,remoteRunId:e.runId,repository:request.repository,baseSha:e.inputCommit,allowedPaths:request.input.allowedPaths,deadline:request.deadline};
  await db.query('INSERT INTO qdev_admission_claim(journey_id,stage) VALUES($1,1)',[journey]);
  await db.query('INSERT INTO qdev_retained_admission(journey_id,stage,admission) VALUES($1,1,$2::jsonb)',[journey,JSON.stringify({binding,identity,request})]);
  const custody=await assembleFromProfile(context(b,env),deps());
  assert.equal(custody.expectedFor(1).requestId,e.requestId);assert.equal(custody.expectedFor(1).runId,e.runId);
  assert.throws(()=>custody.expectedFor(2),{code:'QDEV_CHAIN_EXPECTATION_UNAVAILABLE'});
  assert.deepEqual((await custody.factory.retained(1)).binding.inputCommit,e.inputCommit);
  // the journal the host reads and the journey the chain reads are one id
  assert.deepEqual(await new PostgresJournal(journalDb,journey).read(),[]);
 });

 await test('loader: an assembly bundle launches through loadCustody; custody module + assembly together, or any missing/foreign input, leaves the ports disabled (null)',async()=>{
  const env=secrets(),b=bundleFor();
  assert.ok(await loadCustody(context(b,env),{launcher:deps()}));
  assert.equal(await loadCustody(context({...b,assembly:undefined},env),{launcher:deps()}),null,'no custody pin and no assembly');
  assert.equal(await assembleFromProfile(context({...b,custody:{module:'/x.mjs',sha256:sha('a')}},env),deps()),null,'the two are exclusive');
  for(const key of ['QDEV_CAPABILITY_PROPAGATION','QDEV_FACTORY_RELAY_CREDENTIAL','QDEV_FACTORY_RELAY_WORKLOAD_TOKEN','QDEV_MODEL_GATEWAY_KEY','QDEV_BUILD_ISSUER_KEY','QDEV_JOURNAL_DATABASE_URL']){
   const partial={...env};delete partial[key];
   assert.equal(await assembleFromProfile(context(b,partial),deps()),null,key);
  }
  const missingSchema={query:async q=>/to_regclass/.test(q)?[{journal:null,claim:null,retained:null}]:journalDb.query(q)};
  assert.equal(await assembleFromProfile(context(b,env),deps({database:()=>missingSchema})),null,'journal/retention tables must have been applied by the operator');
  const foreign=bundleFor();foreign.assembly.build.issuer.ownerId='someone-else';
  assert.equal(await assembleFromProfile(context(foreign,env),deps()),null,'issuer must belong to this owner');
  // canonical authorities must exist: no enrollment, no capability destination, or a non-local connection each refuse
  await assert.rejects(assembleFromProfile(context(b,env),deps({store:()=>fakeStore({enrollment:null})})));
  await assert.rejects(assembleFromProfile(context(b,env),deps({store:()=>fakeStore({destination:null})})),{code:'QDEV_ASSEMBLY_CAPABILITY_DESTINATION'});
  assert.equal(await assembleFromProfile(context(b,env),deps({runtimeConfig:async()=>({engineering:{agentId:'agent-1',ownerId:OWNER},connection:{transport:'CLOUD',origin:'https://x.example.com'}})})),null);
  // a tampered Factory relay enrollment (digest pin) is refused before any request
  const tampered=bundleFor();tampered.assembly.capability.relay.enrollment={...relayEnrollment,audience:'other'};
  await assert.rejects(assembleFromProfile(context(tampered,env),deps()),/FACTORY_RELAY_ENROLLMENT_CHANGED/);
 });
}finally{
 await db.end().catch(()=>{});
 await admin.query('DROP DATABASE IF EXISTS '+name+' WITH (FORCE)').catch(()=>{});
 await admin.end().catch(()=>{});
}
