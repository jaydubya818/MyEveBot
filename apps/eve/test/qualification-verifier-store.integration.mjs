/** PostgresVerifierStore on a disposable localhost PostgreSQL: once-only begin, immutable history, restart-safe FINAL, and the real service/port on top.
 * Run: MYEVE_ISOLATED_COHORT_TEST_DATABASE=postgres://user@127.0.0.1:PORT/postgres node --import tsx --test apps/eve/test/qualification-verifier-store.integration.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,randomBytes} from 'node:crypto';
import {Client} from 'pg';
import {PostgresVerifierStore,VERIFIER_SCHEMA} from '../lib/qualification/verifier-store-pg.ts';
import {createVerifierHandler,ed25519Signer} from '../lib/qualification/verifier-service.ts';
import {HttpVerifierPort} from '../lib/qualification/verifier-port.ts';
import {verifyVerdict} from '../lib/qualification/verdict.ts';
import {buildVerifierHandoff} from '../lib/qualification/verifier-handoff.ts';
import {qualificationBinding,QDEV_BASELINE} from '../lib/external-alpha/qualification-accounting.ts';
import {syntheticFactory,h} from './qualification-synthetic.mjs';

const connection=process.env.MYEVE_ISOLATED_COHORT_TEST_DATABASE;
assert(connection,'Dedicated localhost PostgreSQL fixture URL required; never use DATABASE_URL');
const root=new URL(connection);
assert(['localhost','127.0.0.1'].includes(root.hostname)&&root.pathname==='/postgres','Dedicated localhost admin database required');
const name='myeve_qdev_vs_'+randomBytes(6).toString('hex');
const admin=new Client({connectionString:connection});await admin.connect();
await admin.query('CREATE DATABASE '+name);
const dbUrl=new URL(root);dbUrl.pathname='/'+name;
const clients=[];
async function open(){const c=new Client({connectionString:dbUrl.href});await c.connect();clients.push(c);return {raw:c,db:{query:async(s,p)=>(await c.query(s,p)).rows}};}
const first=await open();await first.raw.query(VERIFIER_SCHEMA);
test.after(async()=>{for(const c of clients)await c.end().catch(()=>{});await admin.query('DROP DATABASE IF EXISTS '+name+' WITH (FORCE)');await admin.end();});

const fx=syntheticFactory();
const project={...QDEV_BASELINE,operatingProfileSha256:h('1'),factoryVersionSha256:fx.factoryVersion,protectedSpecificationSha256:h('3'),
  sources:{myeve:'a'.repeat(40),factory:'b'.repeat(40),relay:'c'.repeat(40),missioncontrol:'d'.repeat(40)}};
const binding=qualificationBinding(project);
const candidate={commit:'1'.repeat(40),tree:'2'.repeat(40),buildArtifactSha256:h('4')};
const key=c=>c.commit+':'+c.tree+':'+c.buildArtifactSha256;
const signed=(outcome='PASS')=>({verdict:{schema:'myeve.qualification-verdict/v1',verifierKeyId:'verifier-key-1',projectSha256:binding.projectSha256,sourceSha256:binding.sourceSha256,protectedSpecificationSha256:project.protectedSpecificationSha256,
  candidateCommit:candidate.commit,candidateTree:candidate.tree,buildArtifactSha256:candidate.buildArtifactSha256,outcome,issuedAt:'2026-10-30T12:00:00.000Z'},signatureBase64:Buffer.from('sig').toString('base64')});

test('lifecycle HANDED_OFF -> RUNNING -> FINAL; begin and finish are once-only; handoff is idempotent and conflicts are visible',async()=>{
  const store=new PostgresVerifierStore(first.db),k=key(candidate);
  assert.equal(await store.get(k),null);
  assert.deepEqual(await store.putHandoff(k,h('a')),{handoffSha256:h('a')});
  assert.deepEqual(await store.putHandoff(k,h('b')),{handoffSha256:h('a')},'a different digest never replaces the first');
  assert.equal((await store.get(k)).phase,'HANDED_OFF');
  const results=await Promise.all([store.begin(k,650_000,1000),store.begin(k,650_000,2000),store.begin(k,650_000,3000)]);
  assert.equal(results.filter(Boolean).length,1,'the single charged evaluation is claimed exactly once');
  const running=await store.get(k);assert.equal(running.phase,'RUNNING');assert.equal(running.reserveMicrousd,650_000);assert.ok([1000,2000,3000].includes(running.beganAtMs));
  const fin=await store.finish(k,{settledMicrousd:0,quiescent:true},signed());
  assert.equal(fin.phase,'FINAL');assert.deepEqual(fin.usage,{settledMicrousd:0,quiescent:true});assert.equal(fin.signed.verdict.outcome,'PASS');
  const again=await store.finish(k,{settledMicrousd:1,quiescent:false},signed('FAIL')).catch(e=>e);
  if(!(again instanceof Error))assert.equal(again.signed.verdict.outcome,'PASS','a second finish returns the first record');
  assert.equal((await store.get(k)).signed.verdict.outcome,'PASS','a FINAL row never changes');
  assert.equal((await store.get(k)).usage.settledMicrousd,0);
  assert.equal(await store.begin(k,650_000,4000),false);
});

test('the history is immutable at the database: no delete, no identity or reserve rewrite, no phase regression',async()=>{
  const store=new PostgresVerifierStore(first.db);
  const c2={...candidate,commit:'5'.repeat(40)},k=key(c2);
  await store.putHandoff(k,h('c'));await store.begin(k,650_000,1);
  const bad=[
    ['DELETE FROM qdev_verifier_candidate WHERE candidate_key=$1',[k]],
    ["UPDATE qdev_verifier_candidate SET handoff_sha256=$2 WHERE candidate_key=$1",[k,h('d')]],
    ["UPDATE qdev_verifier_candidate SET reserve_microusd=1 WHERE candidate_key=$1",[k]],
    ["UPDATE qdev_verifier_candidate SET phase='HANDED_OFF',reserve_microusd=NULL,began_at_ms=NULL WHERE candidate_key=$1",[k]],
  ];
  for(const [sql,p] of bad)await assert.rejects(first.raw.query(sql,p),/QDEV_VERIFIER_HISTORY_IMMUTABLE|violates check/);
  await store.finish(k,{settledMicrousd:12,quiescent:true},signed());
  await assert.rejects(first.raw.query("UPDATE qdev_verifier_candidate SET settled_microusd=0 WHERE candidate_key=$1",[k]),/QDEV_VERIFIER_HISTORY_IMMUTABLE/);
  await assert.rejects(first.raw.query("UPDATE qdev_verifier_candidate SET phase='RUNNING' WHERE candidate_key=$1",[k]),/QDEV_VERIFIER_HISTORY_IMMUTABLE|violates check/);
  const rec=await store.get(k);assert.equal(rec.phase,'FINAL');assert.equal(rec.usage.settledMicrousd,12);
});

test('schema checks refuse malformed keys, out-of-range reserves and a FINAL row without a signed verdict',async()=>{
  await assert.rejects(first.raw.query("INSERT INTO qdev_verifier_candidate(candidate_key,handoff_sha256,phase) VALUES('bad',$1,'HANDED_OFF')",[h('e')]),/violates check/);
  await assert.rejects(first.raw.query("INSERT INTO qdev_verifier_candidate(candidate_key,handoff_sha256,phase,reserve_microusd,began_at_ms) VALUES($1,$2,'RUNNING',1300001,1)",[key({...candidate,commit:'6'.repeat(40)}),h('e')]),/violates check/);
  await assert.rejects(first.raw.query("INSERT INTO qdev_verifier_candidate(candidate_key,handoff_sha256,phase) VALUES($1,$2,'FINAL')",[key({...candidate,commit:'7'.repeat(40)}),h('e')]),/violates check/);
});

test('the real service and port on the durable store: charged submit, pure verdict, and a restarted handler never re-evaluates',async()=>{
  const c3={...candidate,commit:'8'.repeat(40)};
  const handoff=buildVerifierHandoff({project,binding,candidate:c3});
  const pair=generateKeyPairSync('ed25519'),pem=pair.privateKey.export({type:'pkcs8',format:'pem'}).toString();
  const verifierKey={keyId:'verifier-key-1',publicKeyPem:pair.publicKey.export({type:'spki',format:'pem'}).toString(),activeFrom:'2020-01-01T00:00:00Z',notAfter:'2099-01-01T00:00:00Z'};
  const CRED='verifier-credential-'+'y'.repeat(24);
  const expected={projectSha256:binding.projectSha256,sourceSha256:binding.sourceSha256,protectedSpecificationSha256:project.protectedSpecificationSha256};
  let runs=0;
  const mk=async()=>{
    const conn=await open();
    const handler=createVerifierHandler({credentialSha256:[createHash('sha256').update(CRED).digest('hex')],expected,evaluationDeadlineMs:500,quiescenceGraceMs:50,paid:false,
      store:new PostgresVerifierStore(conn.db),signer:ed25519Signer('verifier-key-1',pem),evaluator:{run:async()=>{runs++;return {outcome:'PASS',usedMicrousd:0};}}});
    return new HttpVerifierPort({enabled:true,origin:'https://verifier.example',credential:()=>CRED,fetch:async(url,init)=>handler(new Request(url,init))});
  };
  const a=await mk();
  const settled=await a.submit(handoff,650_000);
  assert.equal(settled.known,true);assert.equal(settled.value.settledMicrousd,0);assert.equal(runs,1);
  const v=await a.fetchVerdict(c3);
  assert.equal(verifyVerdict({signed:v,verifierKeys:[verifierKey],producerKeyIds:[fx.key.keyId],producerPublicKeysPem:[fx.producerPem],
    expected:{...expected,candidateCommit:c3.commit,candidateTree:c3.tree,buildArtifactSha256:c3.buildArtifactSha256}}).outcome,'PASS');
  const b=await mk();   // a second handler (a restarted process) over the same database
  assert.equal((await b.submit(handoff,650_000)).known,true);
  assert.deepEqual(await b.fetchVerdict(c3),v);
  assert.equal(runs,1,'the durable begin and FINAL record stop any second evaluation');
});
