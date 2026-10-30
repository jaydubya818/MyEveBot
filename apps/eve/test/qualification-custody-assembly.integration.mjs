/** Non-secret custody assembly over disposable PostgreSQL and a temporary git repository. Synthetic identities only; no network, provider, docker or spend.
 * Run: MYEVE_ISOLATED_COHORT_TEST_DATABASE=postgres://postgres@127.0.0.1:PORT/postgres node --import tsx --test apps/eve/test/qualification-custody-assembly.integration.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash,generateKeyPairSync} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,existsSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Client} from 'pg';
import {RETAINED_ADMISSION_SCHEMA,RetainedAdmissionRefused} from '../lib/qualification/retained-admissions.ts';
import {acceptedPredecessor,expectedFromAdmission,QdevStageChain,storeBackedStageChain,candidateStaticBuildSource,ed25519Signer,assembleQdevCustody,CustodyAssemblyRefused} from '../lib/qualification/custody-assembly.ts';
import {StaticBuildMyAppsPort} from '../lib/qualification/static-build.ts';
import {canonical} from '../../../packages/myapps/src/contracts.ts';
import {factoryNativeBody} from '../lib/engineering/factory-capability-source.ts';
import {digest} from '../lib/engineering/factory-producer-protocol.ts';
import {syntheticFactory} from './qualification-synthetic.mjs';

const connection=process.env.MYEVE_ISOLATED_COHORT_TEST_DATABASE;
assert(connection,'Dedicated localhost PostgreSQL fixture URL required; never use DATABASE_URL');
const root=new URL(connection);
assert(['localhost','127.0.0.1'].includes(root.hostname)&&root.pathname==='/postgres','Dedicated localhost admin database required');
const admin=new Client({connectionString:connection});admin.on('error',()=>{});await admin.connect();
const name='myeve_qdev_ca_'+randomBytes(6).toString('hex');
await admin.query('CREATE DATABASE '+name);
const u=new URL(root);u.pathname='/'+name;
const db=new Client({connectionString:u.href});db.on('error',()=>{});await db.connect();await db.query(RETAINED_ADMISSION_SCHEMA);
const sql={query:async(q,p)=>(await db.query(q,p)).rows};

const fx=syntheticFactory(),s=fx.stage(1,fx.baseline),e=s.manifest.execution;
const raw=()=>({workId:randomUUID(),workVersion:1,workGeneration:1,criteriaVersion:1,agentId:'synthetic-agent',factoryId:fx.factoryId,factoryVersion:fx.factoryVersion,
  requestId:e.requestId,requestDigest:e.requestDigest,sourceDigest:fx.sourceDigest,configurationDigest:fx.configurationDigest,workOrderId:e.workOrderId,runId:e.runId,attemptNumber:1,
  inputCommit:e.inputCommit,inputTree:e.inputTree,localSnapshotVersion:4,configuration:fx.configuration});
function admission(){
  const binding=raw();
  const request={requestId:e.requestId,workId:binding.workId,workGeneration:1,repository:'synthetic/repo',deadline:'2099-01-01T00:00:00.000Z',maxSpendUsd:1,
    input:{baseRef:e.inputCommit,allowedPaths:fx.configuration.allowedPaths}};
  const identity={runId:randomUUID(),writerGeneration:1,dispatchIdentity:'d',workId:binding.workId,workGeneration:1,factoryId:fx.factoryId,factoryVersion:fx.factoryVersion,requestId:e.requestId,
    workOrderId:e.workOrderId,remoteRunId:e.runId,repository:request.repository,baseSha:e.inputCommit,allowedPaths:request.input.allowedPaths,deadline:request.deadline};
  return {binding,identity,request};
}
const accepted=(stage,commit,tree)=>({kind:'STAGE_ACCEPTED',stage,digest:'d'.repeat(64),candidate:{commit,tree}});
const c1={commit:'1'.repeat(40),tree:'2'.repeat(40)},c2={commit:'3'.repeat(40),tree:'4'.repeat(40)};

try{
 await test('predecessor start is the journal-accepted candidate only: absent before acceptance, ambiguous or malformed acceptance refuses',()=>{
  assert.equal(acceptedPredecessor([],2),null);
  assert.equal(acceptedPredecessor([{kind:'STAGE_BOUND',stage:1,workId:'w',allowanceId:'a'}],2),null);
  assert.deepEqual(acceptedPredecessor([accepted(1,c1.commit,c1.tree)],2),c1);
  assert.deepEqual(acceptedPredecessor([accepted(1,c1.commit,c1.tree),accepted(1,c1.commit,c1.tree)],2),c1,'an identical re-record is the same acceptance');
  assert.deepEqual(acceptedPredecessor([accepted(1,c1.commit,c1.tree),accepted(2,c2.commit,c2.tree)],3),c2,'stage 3 starts at stage 2, never stage 1');
  assert.equal(acceptedPredecessor([accepted(1,c1.commit,c1.tree)],3),null);
  assert.throws(()=>acceptedPredecessor([accepted(1,c1.commit,c1.tree),accepted(1,c2.commit,c2.tree)],2),{code:'QDEV_CHAIN_PREDECESSOR_AMBIGUOUS'});
  assert.throws(()=>acceptedPredecessor([{kind:'STAGE_ACCEPTED',stage:1,digest:'d'.repeat(64)}],2),{code:'QDEV_CHAIN_PREDECESSOR_CANDIDATE'});
  assert.throws(()=>acceptedPredecessor([accepted(1,'x',c1.tree)],2),{code:'QDEV_CHAIN_PREDECESSOR_CANDIDATE'});
 });

 await test('capability source authorizes the ACTUAL native body: local V4 = the persisted prepare request on the configured path and mac profile; cloud keeps its projected body',()=>{
  const request={requestId:'r',workId:'w',workGeneration:1,repository:'o/r',deadline:'2099-01-01T00:00:00.000Z',maxSpendUsd:1,
    input:{title:'t',description:'d',kind:'feature',repositoryPath:'/synthetic',baseRef:'a'.repeat(40),acceptanceCriteria:['c'],reproductionCommand:null,expectedFailureText:null,checkCommands:['npm test'],allowedPaths:['src/a.ts'],workerProfile:'mac'}};
  const local={origin:'http://127.0.0.1:1',repositoryPath:'/synthetic'};
  assert.equal(factoryNativeBody(local,request),request);
  assert.notEqual(digest(factoryNativeBody(local,{...request,input:{...request.input,baseRef:'b'.repeat(40)}})),digest(request),'the base commit is part of the authorized action');
  assert.throws(()=>factoryNativeBody({...local,repositoryPath:'/other'},request),/FACTORY_SOURCE_PREPARATION/);
  assert.throws(()=>factoryNativeBody(local,{...request,input:{...request.input,workerProfile:'container'}}),/FACTORY_SOURCE_PREPARATION/);
  assert.throws(()=>factoryNativeBody({origin:'http://127.0.0.1:1'},request),/FACTORY_SOURCE_PREPARATION/);
  const cloud={protocol:'MYFACTORY_EXECUTION_V2',source:{repository:'o/r',commit:'a'.repeat(40)}};
  const body=factoryNativeBody(cloud,request);
  assert.deepEqual(Object.keys(body).sort(),['deadline','input','maxSpendUsd','protocol','repository','requestId','source','workGeneration','workId']);
  assert.equal(body.input.repositoryPath,undefined,'cloud never carries a local path');
 });

 await test('the frozen expectation is derived from the authenticated retained binding, not from any returned Result',()=>{
  const a=admission();
  assert.deepEqual(expectedFromAdmission(a),{factoryId:fx.factoryId,configurationDigest:fx.configurationDigest,configuration:fx.configuration,requestId:e.requestId,
    requestDigest:e.requestDigest,workOrderId:e.workOrderId,runId:e.runId,attemptNumber:1});
  assert.throws(()=>expectedFromAdmission({...a,binding:{...a.binding,configurationDigest:'0'.repeat(64)}}),/Untrusted local V4 request binding/);
 });

 await test('stage chain: expectations exist only after retention or an explicit read-only warm; warm never claims or prepares',async()=>{
  const journey='j-'+randomUUID(),calls=[];
  const inner={retained:async stage=>{calls.push(stage);return admission();}};
  const chain=new QdevStageChain({db:sql,journeyId:journey,inner});
  assert.throws(()=>chain.expectedFor(1),{code:'QDEV_CHAIN_EXPECTATION_UNAVAILABLE'});
  await chain.warm();
  assert.deepEqual(calls,[]);assert.equal((await db.query('SELECT count(*)::int n FROM qdev_admission_claim WHERE journey_id=$1',[journey])).rows[0].n,0);
  const first=await chain.retained(1);
  assert.deepEqual(chain.expectedFor(1),expectedFromAdmission(first));
  assert.throws(()=>chain.expectedFor(2),{code:'QDEV_CHAIN_EXPECTATION_UNAVAILABLE'});
  // restart: a new process has no cache until warm, then reproduces the identical expectation without preparing again
  const restarted=new QdevStageChain({db:sql,journeyId:journey,inner});
  assert.throws(()=>restarted.expectedFor(1),{code:'QDEV_CHAIN_EXPECTATION_UNAVAILABLE'});
  await restarted.warm();
  assert.deepEqual(restarted.expectedFor(1),chain.expectedFor(1));
  assert.deepEqual(await restarted.retained(1),first);
  assert.deepEqual(calls,[1],'prepared exactly once across both processes');
  // a claim without an admission still halts (reconcile), and warm tolerates it
  const pending='j-'+randomUUID();
  await db.query('INSERT INTO qdev_admission_claim(journey_id,stage) VALUES($1,2)',[pending]);
  const halted=new QdevStageChain({db:sql,journeyId:pending,inner});
  await halted.warm();
  await assert.rejects(halted.retained(2),RetainedAdmissionRefused);
  assert.deepEqual(calls,[1]);
 });

 await test('store-backed chain reads the stage 2/3 start from the durable journal at call time and refuses before acceptance',async()=>{
  const events=[];
  const {sources}=storeBackedStageChain({db:sql,journeyId:'j-'+randomUUID(),journal:{read:async()=>structuredClone(events)},sources:{enabled:true,store:{},authority:{},receipts:{},writers:{},adapterFor:()=>({}),workIds:{1:'a',2:'b',3:'c'},baseline:c1}});
  assert.deepEqual(await sources.start(1),c1);
  await assert.rejects(sources.start(2),{code:'QDEV_STAGE_START_UNAVAILABLE'});
  events.push(accepted(1,c2.commit,c2.tree));
  assert.deepEqual(await sources.start(2),c2);
  await assert.rejects(sources.start(3),{code:'QDEV_STAGE_START_UNAVAILABLE'});
  events.push(accepted(1,c1.commit,c1.tree));
  await assert.rejects(sources.start(2),{code:'QDEV_CHAIN_PREDECESSOR_AMBIGUOUS'});
 });

 await test('candidate static build: archives the accepted commit, re-proves its tree, builds once, signs with the issuer custody and retains through the real claim verifier',async()=>{
  const git=(cwd,...args)=>execFileSync('git',args,{cwd,encoding:'utf8',env:{...process.env,GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_SYSTEM:'/dev/null',GIT_AUTHOR_NAME:'t',GIT_AUTHOR_EMAIL:'t@example.invalid',GIT_COMMITTER_NAME:'t',GIT_COMMITTER_EMAIL:'t@example.invalid'}}).trim();
  const repo=mkdtempSync(join(tmpdir(),'qdev-assembly-repo-'));
  git(repo,'init','-q');
  const lock='{"lockfileVersion":3}',pkg='{"name":"d"}';
  mkdirSync(join(repo,'src'));writeFileSync(join(repo,'package.json'),pkg);writeFileSync(join(repo,'package-lock.json'),lock);writeFileSync(join(repo,'src/main.tsx'),'export {}');
  git(repo,'add','-A');git(repo,'commit','-q','-m','candidate');
  const commit=git(repo,'rev-parse','HEAD'),tree=git(repo,'rev-parse','HEAD^{tree}');
  const sha=v=>createHash('sha256').update(v).digest('hex');
  const dist=()=>{const d=mkdtempSync(join(tmpdir(),'qdev-assembly-dist-'));mkdirSync(join(d,'dist'));writeFileSync(join(d,'dist/index.html'),'<!doctype html><title>x</title>');
    return new Uint8Array(execFileSync('tar',['--format=ustar','-C',d,'-cf','-','dist'],{maxBuffer:1<<26}));};
  const keys=generateKeyPairSync('ed25519'),spki=keys.publicKey.export({type:'spki',format:'der'});
  const a=admission();
  const factoryVersion=a.binding.factoryVersion;
  const issuer={keyId:'build-issuer-1',purpose:'STATIC_BUILD_PROVENANCE_V1',ownerId:'owner-1',factoryId:fx.factoryId,factoryVersion,buildProfileDigest:'3'.repeat(64),
    publicKeyPem:keys.publicKey.export({type:'spki',format:'pem'}),spkiSha256:sha(spki),notBefore:'2020-01-01T00:00:00.000Z',notAfter:'2100-01-01T00:00:00.000Z',revoked:false};
  const dockerCalls=[];
  const make=over=>candidateStaticBuildSource({repositoryPath:repo,ownerId:'owner-1',appId:'app-1',
    profile:{lockSha256:sha(lock),packageSha256:sha(pkg),image:'sha256:'+'a'.repeat(64),nodeVersion:'v24.18.1',buildProfileDigest:'3'.repeat(64)},
    docker:async args=>{dockerCalls.push(args);return dist();},retained:async stage=>{assert.equal(stage,3);return a;},issuer,
    sign:ed25519Signer(keys.privateKey.export({type:'pkcs8',format:'pem'})),now:()=>Date.parse('2026-10-30T20:00:00Z'),...over});
  const port=src=>new StaticBuildMyAppsPort({source:src,delivery:{},now:()=>Date.parse('2026-10-30T20:00:01Z')});
  const retained=await port(make()).retainBuild({commit,tree});
  assert.match(retained.buildArtifactSha256,/^[a-f0-9]{64}$/);
  assert.equal(dockerCalls.length,1,'exactly one bounded build');
  assert.deepEqual(await port(make()).retainBuild({commit,tree}),retained,'deterministic');
  // refusals happen before any build: tree not the commit\'s, commit absent from the repository, signer not the configured issuer
  const before=dockerCalls.length;
  await assert.rejects(port(make()).retainBuild({commit,tree:'d'.repeat(40)}),{code:'QDEV_ASSEMBLY_CANDIDATE_TREE'});
  await assert.rejects(port(make()).retainBuild({commit:'e'.repeat(40),tree}),CustodyAssemblyRefused);
  await assert.rejects(port(make()).retainBuild({commit:'x',tree}),{code:'QDEV_ASSEMBLY_CANDIDATE'});
  assert.equal(dockerCalls.length,before);
  const other=generateKeyPairSync('ed25519');
  await assert.rejects(port(make({sign:ed25519Signer(other.privateKey.export({type:'pkcs8',format:'pem'}))})).retainBuild({commit,tree}),{code:'APP_BUILD_CLAIM_INVALID'});
  assert.throws(()=>ed25519Signer(generateKeyPairSync('ec',{namedCurve:'P-256'}).privateKey.export({type:'pkcs8',format:'pem'})),{code:'QDEV_ASSEMBLY_SIGNER_ALGORITHM'});
  // the private candidate directories are removed after every attempt
  assert.equal(readdirSync(tmpdir()).filter(n=>n.startsWith('qdev-candidate-')).length,0);
 });

 await test('assembly is local-V4 only and wires the chain: retained/expectedFor come from the durable chain',async()=>{
  const chain=new QdevStageChain({db:sql,journeyId:'j-'+randomUUID(),inner:{retained:async()=>admission()}});
  const base={slot:'Q1',project:{},approvedRequest:'Build a dashboard',chain,capability:{},sofie:{model:{},price:{inputMicrousdPerMillionTokens:1000000,outputMicrousdPerMillionTokens:2000000},system:'You are Sofie.'},verifier:{},myapps:{}};
  assert.throws(()=>assembleQdevCustody({...base,connection:{transport:'CLOUD',origin:'https://x.example'}}),{code:'QDEV_ASSEMBLY_LOCAL_CONNECTION'});
  assert.throws(()=>assembleQdevCustody({...base,connection:{origin:'http://127.0.0.1:1'}}),{code:'QDEV_ASSEMBLY_LOCAL_CONNECTION'});
  const local={origin:'http://127.0.0.1:12345',repositoryPath:'/synthetic',factoryId:fx.factoryId,sourceDigest:fx.sourceDigest,keys:[{keyId:'k'}]};
  const custody=assembleQdevCustody({...base,connection:local});
  assert.equal(custody.agent.slot,'Q1');assert.ok(custody.agent.factoryCoding.sofie.available());
  assert.equal(custody.factory.retained,chain.retained);assert.equal(custody.expectedFor,chain.expectedFor);
  assert.equal(custody.sourceDigest,fx.sourceDigest);assert.deepEqual(custody.resultKeys,local.keys);
  assert.match(custody.newAllowanceId(1),/^[0-9a-f-]{36}$/);
 });
}finally{
 await db.end().catch(()=>{});
 await admin.query('DROP DATABASE IF EXISTS '+name+' WITH (FORCE)').catch(()=>{});
 await admin.end().catch(()=>{});
}
