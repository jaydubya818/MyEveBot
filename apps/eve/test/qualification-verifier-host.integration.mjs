/** Verifier host launcher over a disposable localhost PostgreSQL: real loopback HTTP (HttpVerifierPort -> transport -> handler -> durable store -> owned child evaluator),
 * duplicate/restart/dropped-ack/crash fencing, and fail-closed launch. Synthetic keys and evaluator only; no custody, tunnel, provisioning or paid call.
 * Run: MYEVE_ISOLATED_COHORT_TEST_DATABASE=postgres://user@127.0.0.1:PORT/postgres node --import tsx --test apps/eve/test/qualification-verifier-host.integration.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,randomBytes} from 'node:crypto';
import {chmodSync,mkdtempSync,readFileSync,readdirSync,writeFileSync,existsSync} from 'node:fs';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import pg from 'pg';
import {spawn} from 'node:child_process';
import {startVerifierHost,VerifierHostRefused} from '../lib/qualification/verifier-host.ts';
import {EvaluatorNotQuiescent} from '../lib/qualification/verifier-service.ts';
import {PostgresVerifierStore,VERIFIER_SCHEMA} from '../lib/qualification/verifier-store-pg.ts';
import {HttpVerifierPort} from '../lib/qualification/verifier-port.ts';
import {verifyVerdict} from '../lib/qualification/verdict.ts';
import {buildVerifierHandoff} from '../lib/qualification/verifier-handoff.ts';
import {qualificationBinding,QDEV_BASELINE} from '../lib/external-alpha/qualification-accounting.ts';
import {StaticArtifactCandidate} from '../../../packages/myapps/src/static-artifact.ts';
import {syntheticFactory,h} from './qualification-synthetic.mjs';

const connection=process.env.MYEVE_ISOLATED_COHORT_TEST_DATABASE;
assert(connection,'Dedicated localhost PostgreSQL fixture URL required; never use DATABASE_URL');
const root=new URL(connection);
assert(['localhost','127.0.0.1'].includes(root.hostname)&&root.pathname==='/postgres','Dedicated localhost admin database required');
const suffix=randomBytes(6).toString('hex'),name='myeve_qdev_vh_'+suffix,emptyName='myeve_qdev_vh_empty_'+suffix;
const admin=new pg.Client({connectionString:connection});await admin.connect();
await admin.query('CREATE DATABASE '+name);await admin.query('CREATE DATABASE '+emptyName);
const urlFor=n=>{const u=new URL(root);u.pathname='/'+n;return u.href;};
const pools=[];
const open=url=>{const pool=new pg.Pool({connectionString:url,max:4});pool.on('error',()=>{});pools.push(pool);return {query:async(s,p)=>(await pool.query(s,p)).rows};};
const setup=new pg.Client({connectionString:urlFor(name)});await setup.connect();await setup.query(VERIFIER_SCHEMA);await setup.end();
const hosts=[],extraDatabases=[];
test.after(async()=>{for(const x of extraDatabases)await admin.query('DROP DATABASE IF EXISTS '+x+' WITH (FORCE)').catch(()=>{});for(const x of hosts)await x.close().catch(()=>{});for(const p of pools)await p.end().catch(()=>{});await admin.query('DROP DATABASE IF EXISTS '+name+' WITH (FORCE)');await admin.query('DROP DATABASE IF EXISTS '+emptyName+' WITH (FORCE)');await admin.end();});

const dir=mkdtempSync(join(tmpdir(),'qdev-vh-'));
const runLog=join(dir,'runs.log');
const evaluatorPath=join(dir,'evaluator.mjs');
writeFileSync(evaluatorPath,`#!/usr/bin/env node
import {appendFileSync,readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
let input='';for await(const c of process.stdin)input+=c;
const {handoff,candidate,budgetMicrousd,artifact}=JSON.parse(input);
let staged=!!artifact&&artifact.artifactSha256===candidate.buildArtifactSha256;
for(const f of artifact?.files??[]){if(createHash('sha256').update(readFileSync(artifact.dir+'/'+f.path)).digest('hex')!==f.sha256)staged=false;}
appendFileSync(process.env.QDEV_TEST_RUNLOG,candidate.commit+'\\n');
await new Promise(r=>setTimeout(r,Number(process.env.QDEV_TEST_DELAY_MS||0)));
process.stdout.write(JSON.stringify({outcome:staged&&handoff.candidateCommit===candidate.commit&&budgetMicrousd>0?'PASS':'FAIL',usedMicrousd:0}));
`);
chmodSync(evaluatorPath,0o755);
const evaluatorSha=createHash('sha256').update(readFileSync(evaluatorPath)).digest('hex');
const runs=()=>existsSync(runLog)?readFileSync(runLog,'utf8').split('\n').filter(Boolean):[];

const fx=syntheticFactory();
const project={...QDEV_BASELINE,operatingProfileSha256:h('1'),factoryVersionSha256:fx.factoryVersion,protectedSpecificationSha256:h('3'),
  sources:{myeve:'a'.repeat(40),factory:'b'.repeat(40),relay:'c'.repeat(40),missioncontrol:'d'.repeat(40)}};
const binding=qualificationBinding(project);
const expected={projectSha256:binding.projectSha256,sourceSha256:binding.sourceSha256,protectedSpecificationSha256:project.protectedSpecificationSha256};
const pair=generateKeyPairSync('ed25519'),pem=pair.privateKey.export({type:'pkcs8',format:'pem'}).toString();
const verifierKey={keyId:'verifier-key-vh',publicKeyPem:pair.publicKey.export({type:'spki',format:'pem'}).toString(),activeFrom:'2020-01-01T00:00:00Z',notAfter:'2099-01-01T00:00:00Z'};
const CRED='verifier-host-credential-'+'z'.repeat(24);
const freePort=()=>new Promise((resolve,reject)=>{const s=createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const {port}=s.address();s.close(()=>resolve(port));});});
const sha=b=>createHash('sha256').update(b).digest('hex');
const sources=new Map();
for(const n of [1,2,3,4,5,6,7,8,9]){
  const files={'dist/index.html':Buffer.from('<html>host '+n+'</html>'),'dist/app.js':Buffer.from('console.log('+n+')')};
  const commit=String(n).repeat(40),tree='2'.repeat(40);
  const inventory={schema:'myeve.dashboard.build-inventory/v1',scope:'BROWSER_BUILD_ONLY',sourceCommit:commit,sourceTree:tree,lockSha256:h('a'),node:'v24.0.0',
    files:Object.entries(files).map(([path,b])=>({path,bytes:b.length,sha256:sha(b)})),independentVerification:'NOT_ESTABLISHED',signedResult:false,releaseQualified:false};
  const pins={sourceCommit:commit,sourceTree:tree,lockSha256:h('a')};
  sources.set(n,{inventory,pins,artifact:await StaticArtifactCandidate.retain(inventory,pins,async p=>files[p])});
}
const candidate=n=>{const s=sources.get(n);return {commit:s.pins.sourceCommit,tree:s.pins.sourceTree,buildArtifactSha256:s.artifact.artifactDigest.slice('sha256:'.length)};};
const stagingFor=c=>{for(const s of sources.values())if(s.pins.sourceCommit===c.commit&&s.pins.sourceTree===c.tree)return s;throw new Error('no retained artifact');};
const artifactRoot=join(dir,'artifacts');

async function profile(over={}){
  return {version:1,notAfter:'2099-01-01T00:00:00.000Z',listenPort:await freePort(),expected,credentialSha256:[createHash('sha256').update(CRED).digest('hex')],
    signer:{keyId:'verifier-key-vh',pemEnv:'QDEV_TEST_SIGNER_PEM'},databaseUrlEnv:'QDEV_TEST_VERIFIER_DB',artifactRoot,
    evaluator:{command:evaluatorPath,sha256:evaluatorSha,args:[],envNames:['PATH','QDEV_TEST_RUNLOG','QDEV_TEST_DELAY_MS'],paid:false,deadlineMs:3000,graceMs:500},...over};
}
const envFor=(p,extra={})=>({MYEVE_QDEV_VERIFIER_ENABLED:'true',MYEVE_QDEV_VERIFIER_PROFILE:JSON.stringify(p),QDEV_TEST_SIGNER_PEM:pem,QDEV_TEST_VERIFIER_DB:urlFor(name),
  PATH:process.env.PATH,QDEV_TEST_RUNLOG:runLog,QDEV_TEST_DELAY_MS:'0',...extra});
async function launch(p,extra={},deps={}){
  const host=await startVerifierHost({env:envFor(p,extra),database:url=>open(url),...deps});
  if(host)hosts.push(host);return host;
}
const portFor=(host,over={})=>new HttpVerifierPort({enabled:true,origin:host.origin,credential:()=>CRED,staging:stagingFor,...over});
const verify=(signed,c,now)=>verifyVerdict({now,signed,verifierKeys:[verifierKey],producerKeyIds:[fx.key.keyId],producerPublicKeysPem:[fx.producerPem],expected:{...expected,candidateCommit:c.commit,candidateTree:c.tree,buildArtifactSha256:c.buildArtifactSha256}});

test('disabled by default: nothing is read, opened or listening without the explicit switch; an enabled but incomplete start is refused',async()=>{
  const boom=()=>{throw new Error('OPENED');};
  assert.equal(await startVerifierHost({env:{},database:boom}),null);
  assert.equal(await startVerifierHost({env:{MYEVE_QDEV_VERIFIER_PROFILE:JSON.stringify(await profile())},database:boom}),null);
  await assert.rejects(startVerifierHost({env:{MYEVE_QDEV_VERIFIER_ENABLED:'true'},database:boom}),e=>e instanceof VerifierHostRefused&&e.code==='QDEV_VERIFIER_HOST_PROFILE');
});

test('launch is fail-closed on profile, expiry, evaluator digest, signer, database and schema, and the bind host is not configurable',async()=>{
  const code=async(p,extra={},deps={})=>{try{await launch(p,extra,deps);return 'STARTED';}catch(e){return e.code??e.message;}};
  const base=await profile();
  assert.equal(await code({...base,host:'0.0.0.0'}),'QDEV_VERIFIER_HOST_PROFILE');
  assert.equal(await code({...base,artifactRoot:undefined}),'QDEV_VERIFIER_HOST_PROFILE');       // a verifier that cannot receive bytes cannot evaluate them
  assert.equal(await code({...base,artifactRoot:'relative/artifacts'}),'QDEV_VERIFIER_HOST_PROFILE');
  assert.equal(await code({...base,artifactRoot:evaluatorPath}),'QDEV_VERIFIER_HOST_ARTIFACT_ROOT');   // not a directory
  assert.equal(await code({...base,listenPort:80}),'QDEV_VERIFIER_HOST_PROFILE');
  assert.equal(await code({...base,evaluator:{...base.evaluator,command:'evaluator.mjs'}}),'QDEV_VERIFIER_HOST_PROFILE');
  assert.equal(await code({...base,notAfter:'2020-01-01T00:00:00.000Z'}),'QDEV_VERIFIER_HOST_EXPIRED');
  assert.equal(await code({...base,evaluator:{...base.evaluator,sha256:h('f')}}),'QDEV_VERIFIER_HOST_EVALUATOR_DIGEST');
  assert.equal(await code({...base,evaluator:{...base.evaluator,command:join(dir,'missing')}}),'QDEV_VERIFIER_HOST_EVALUATOR');
  assert.equal(await code(base,{QDEV_TEST_SIGNER_PEM:undefined}),'QDEV_VERIFIER_HOST_SIGNER');
  assert.equal(await code(base,{QDEV_TEST_SIGNER_PEM:generateKeyPairSync('ec',{namedCurve:'P-256'}).privateKey.export({type:'pkcs8',format:'pem'}).toString()}),'QDEV_VERIFIER_HOST_SIGNER');
  assert.equal(await code(base,{QDEV_TEST_VERIFIER_DB:'mysql://x'}),'QDEV_VERIFIER_HOST_DATABASE');
  assert.equal(await code(base,{QDEV_TEST_VERIFIER_DB:urlFor(emptyName)}),'QDEV_VERIFIER_HOST_SCHEMA');   // never applies a schema itself
  assert.equal((await open(urlFor(emptyName)).query("SELECT to_regclass('public.qdev_verifier_candidate') AS t",[]))[0].t,null);
});

test('real loopback: charged submit through the transport and durable store, signed verdict, authentication, bounded bodies and method/route refusals',async()=>{
  const p=await profile(),host=await launch(p),c=candidate(1);
  assert.match(host.origin,/^http:\/\/127\.0\.0\.1:\d+$/);assert.equal(host.origin,'http://127.0.0.1:'+p.listenPort);
  const port=portFor(host),handoff=buildVerifierHandoff({project,binding,candidate:c});
  const settled=await port.submit(handoff,650_000);
  assert.equal(settled.known,true);assert.equal(settled.value.settledMicrousd,0);assert.deepEqual(runs(),[c.commit]);   // the POST bodies reached the handler and the owned child ran once
  assert.equal(verify(await port.fetchVerdict(c),c).outcome,'PASS');
  const post=(path,body,headers={})=>fetch(host.origin+path,{method:'POST',headers:{'content-type':'application/json',...headers},body});
  assert.equal((await post('/qdev/v1/verdict',JSON.stringify({candidate:c}),{authorization:'Bearer wrong-credential-wrong-credential'})).status,401);
  assert.equal((await post('/qdev/v1/verdict',JSON.stringify({candidate:c}))).status,401);
  assert.equal((await post('/qdev/v1/verdict','x'.repeat(8193),{authorization:'Bearer '+CRED})).status,413);
  assert.equal((await post('/qdev/v1/verdict','{"candidate":',{authorization:'Bearer '+CRED})).status,400);
  assert.equal((await fetch(host.origin+'/qdev/v1/verdict',{method:'GET',headers:{authorization:'Bearer '+CRED}})).status,405);
  assert.equal((await post('/elsewhere','{}',{authorization:'Bearer '+CRED})).status,404);
  assert.equal((await post('/qdev/v1/handoff',JSON.stringify({...handoff,projectSha256:h('9')}),{authorization:'Bearer '+CRED})).status,400);   // digest no longer matches
  assert.equal((await post('//evil.example/qdev/v1/verdict','{}',{authorization:'Bearer '+CRED})).status,400);
  assert.deepEqual(runs(),[c.commit]);
});

test('duplicate and restart: a second submit and a restarted host return the same final record and never re-evaluate',async()=>{
  const c=candidate(1),handoff=buildVerifierHandoff({project,binding,candidate:c});
  const first=await launch(await profile()),port1=portFor(first);
  const before=await port1.fetchVerdict(c);
  assert.equal((await port1.submit(handoff,650_000)).known,true);
  await first.close();
  const restarted=await launch(await profile()),port2=portFor(restarted);
  assert.deepEqual(await port2.fetchVerdict(c),before);
  assert.equal((await port2.submit(handoff,650_000)).known,true);
  assert.deepEqual(runs(),[c.commit],'the durable begin and FINAL record stop any second evaluation');
  // a different reserve for an already-final candidate is a conflict, not a re-run
  const response=await fetch(restarted.origin+'/qdev/v1/evaluate',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+CRED},body:JSON.stringify({candidate:c,reserveMicrousd:700_000})});
  assert.equal(response.status,409);assert.deepEqual(runs(),[c.commit]);
});

test('dropped acknowledgment: a client that gives up mid-evaluation sees ambiguity, the evaluation still completes once, and nothing is resent',async()=>{
  const c=candidate(2),handoff=buildVerifierHandoff({project,binding,candidate:c});
  const host=await launch(await profile(),{QDEV_TEST_DELAY_MS:'800'}),impatient=portFor(host,{evaluationTimeoutMs:150}),patient=portFor(host);
  await assert.rejects(impatient.submit(handoff,650_000),/QDEV_VERIFIER_POST_SEND_AMBIGUOUS/);
  await assert.rejects(patient.fetchVerdict(c),/QDEV_VERIFIER_STATUS_409/);        // not FINAL yet: a pure read never evaluates
  let verdict;for(let i=0;i<60&&!verdict;i++){try{verdict=await patient.fetchVerdict(c);}catch{await new Promise(r=>setTimeout(r,100));}}
  assert.ok(verdict,'the abandoned request still ran to a durable FINAL');assert.equal(verify(verdict,c).outcome,'PASS');
  assert.equal((await patient.submit(handoff,650_000)).known,true);
  assert.deepEqual(runs().filter(x=>x===c.commit),[c.commit]);
});

test('crash while RUNNING: a restarted host never re-evaluates; it reports in-progress, then finalizes a signed non-quiescent NOT_RUN only after the orphan window',async()=>{
  const T0=Date.now(),c=candidate(3),handoff=buildVerifierHandoff({project,binding,candidate:c});
  const store=new PostgresVerifierStore(open(urlFor(name))),key=c.commit+':'+c.tree+':'+c.buildArtifactSha256;
  await store.putHandoff(key,handoff.handoffSha256);assert.equal(await store.begin(key,650_000,T0),true);   // the previous process died after the durable begin
  const evaluate=host=>fetch(host.origin+'/qdev/v1/evaluate',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+CRED},body:JSON.stringify({candidate:c,reserveMicrousd:650_000})});
  const early=await launch(await profile(),{},{now:()=>T0+500});
  assert.equal((await evaluate(early)).status,409);
  assert.equal((await portFor(early).fetchVerdict(c).catch(e=>e.message)),'QDEV_VERIFIER_STATUS_409');
  const late=await launch(await profile(),{},{now:()=>T0+120_000});
  const response=await evaluate(late),body=await response.json();
  assert.equal(response.status,200);assert.deepEqual(body.usage,{settledMicrousd:null,quiescent:false});
  const verdict=await portFor(late).fetchVerdict(c);assert.equal(verdict.verdict.outcome,'NOT_RUN');assert.throws(()=>verify(verdict,c,T0+130_000),/QDEV_VERDICT_NOT_RUN/);   // signed, but the journey can never accept it
  // the client treats it as unsettled exposure, and nothing ran
  assert.equal((await portFor(late).submit(handoff,650_000)).known,false);
  assert.equal(runs().filter(x=>x===c.commit).length,0);
});

test('the profile expiry also applies to requests after a successful start',async()=>{
  let clock=Date.parse('2030-01-01T00:00:00Z');
  const host=await launch(await profile({notAfter:'2030-01-01T01:00:00.000Z'}),{},{now:()=>clock});
  const call=()=>fetch(host.origin+'/qdev/v1/verdict',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+CRED},body:JSON.stringify({candidate:candidate(1)})});
  assert.equal((await call()).status,200);clock+=2*3600_000;assert.equal((await call()).status,503);
});

// ---- QVHOST-02: the immutability guard must be the exact intended, enabled trigger on the exact public relation ----
async function guardVariant(label,statements){
  const variant=`${name}_g${extraDatabases.length}`;extraDatabases.push(variant);
  await admin.query('CREATE DATABASE '+variant);
  const client=new pg.Client({connectionString:urlFor(variant)});await client.connect();
  try{await client.query(VERIFIER_SCHEMA);for(const statement of statements)await client.query(statement);}finally{await client.end();}
  try{await launch(await profile(),{QDEV_TEST_VERIFIER_DB:urlFor(variant)});return 'STARTED';}catch(e){return e.code??e.message;}
}
test('QVHOST-02: a disabled, replica-only, misattached, replaced, extra, wrong-event or relocated guard refuses startup; the intended guard starts',async()=>{
  const T='qdev_verifier_candidate',G='qdev_verifier_guard';
  assert.equal(await guardVariant('healthy',[]),'STARTED');
  const cases={
    disabled:[`ALTER TABLE ${T} DISABLE TRIGGER ${G}`],
    replicaOnly:[`ALTER TABLE ${T} ENABLE REPLICA TRIGGER ${G}`],
    wrongFunction:[`DROP TRIGGER ${G} ON ${T}`,'CREATE FUNCTION public.evil_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$',`CREATE TRIGGER ${G} BEFORE UPDATE OR DELETE ON ${T} FOR EACH ROW EXECUTE FUNCTION public.evil_guard()`],
    replacedBody:['CREATE OR REPLACE FUNCTION public.qdev_verifier_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$'],
    misattached:[`DROP TRIGGER ${G} ON ${T}`,'CREATE TABLE decoy(x int)',`CREATE TRIGGER ${G} BEFORE UPDATE OR DELETE ON decoy FOR EACH ROW EXECUTE FUNCTION public.qdev_verifier_guard()`],
    extraTrigger:[`CREATE TRIGGER extra_audit BEFORE INSERT ON ${T} FOR EACH ROW EXECUTE FUNCTION public.qdev_verifier_guard()`],
    wrongEvent:[`DROP TRIGGER ${G} ON ${T}`,`CREATE TRIGGER ${G} BEFORE UPDATE ON ${T} FOR EACH ROW EXECUTE FUNCTION public.qdev_verifier_guard()`],
    statementLevel:[`DROP TRIGGER ${G} ON ${T}`,`CREATE TRIGGER ${G} BEFORE UPDATE OR DELETE ON ${T} FOR EACH STATEMENT EXECUTE FUNCTION public.qdev_verifier_guard()`],
    relocated:['CREATE SCHEMA other',`ALTER TABLE ${T} SET SCHEMA other`],
  };
  for(const [label,statements] of Object.entries(cases))assert.equal(await guardVariant(label,statements),'QDEV_VERIFIER_HOST_SCHEMA',label);
});

// ---- QVHOST-01: orderly shutdown drains and reaps every running evaluation before reporting a clean stop ----
const pidScript=join(dir,'evaluator-pids.mjs');
writeFileSync(pidScript,`#!/usr/bin/env node
import {spawn} from 'node:child_process';import {writeFileSync} from 'node:fs';
let input='';for await(const c of process.stdin)input+=c;
const child=spawn('sleep',['120'],{stdio:'ignore'});
writeFileSync(process.env.QDEV_TEST_PIDFILE,JSON.stringify({evaluator:process.pid,child:child.pid}));
await new Promise(()=>{});
`);
chmodSync(pidScript,0o755);
const pidSha=createHash('sha256').update(readFileSync(pidScript)).digest('hex');
const alive=pid=>{try{process.kill(pid,0);return true;}catch(e){return e.code!=='ESRCH';}};
const until=async(check,ms=15_000)=>{const end=Date.now()+ms;for(;;){const value=await check();if(value)return value;if(Date.now()>end)throw new Error('timeout');await new Promise(r=>setTimeout(r,50));}};

test('QVHOST-01: SIGTERM to the actual CLI stops accepting, aborts and reaps the running evaluation (owned process group, disconnected client) before a clean exit 0',async()=>{
  const c=candidate(5),handoff=buildVerifierHandoff({project,binding,candidate:c}),pidFile=join(dir,'cli.pids');
  const p=await profile({evaluator:{command:pidScript,sha256:pidSha,args:[],envNames:['PATH','QDEV_TEST_PIDFILE'],paid:false,deadlineMs:2000,graceMs:500}});
  const cli=spawn(process.execPath,['--import','tsx',new URL('../scripts/qdev-verifier-host.ts',import.meta.url).pathname],
    {env:{...envFor(p),QDEV_TEST_PIDFILE:pidFile},stdio:['ignore','pipe','pipe']});
  let out='',exit;const done=new Promise(resolve=>cli.on('exit',(code,signal)=>{exit={code,signal};resolve();}));
  cli.stdout.on('data',d=>{out+=d;});cli.stderr.on('data',d=>{out+=d;});
  const listening=await until(()=>/\{"listening":"(http:\/\/127\.0\.0\.1:\d+)"/.exec(out)?.[1]);
  assert.equal(listening,'http://127.0.0.1:'+p.listenPort);
  const port=new HttpVerifierPort({enabled:true,origin:listening,credential:()=>CRED,evaluationTimeoutMs:600,staging:stagingFor});
  await assert.rejects(port.submit(handoff,650_000),/QDEV_VERIFIER_POST_SEND_AMBIGUOUS/);   // the client disconnects while the evaluation is running
  const pids=await until(()=>existsSync(pidFile)&&JSON.parse(readFileSync(pidFile,'utf8')));
  assert.ok(alive(pids.evaluator)&&alive(pids.child));
  cli.kill('SIGTERM');await done;
  assert.deepEqual(exit,{code:0,signal:null},out);
  assert.equal(alive(pids.evaluator),false,'the owned evaluator was reaped before the CLI exited');
  assert.equal(alive(pids.child),false,'no descendant of the owned process group remains');
  const record=await new PostgresVerifierStore(open(urlFor(name))).get(c.commit+':'+c.tree+':'+c.buildArtifactSha256);
  assert.equal(record.phase,'FINAL');assert.equal(record.signed.verdict.outcome,'NOT_RUN');   // aborted like an expired deadline; never a PASS and never re-evaluated
  const restarted=await launch(await profile());
  assert.equal((await portFor(restarted).fetchVerdict(c)).verdict.outcome,'NOT_RUN');assert.equal(runs().filter(x=>x===c.commit).length,0);
});

test('shutdown in process: new requests are refused while draining, an in-flight evaluation is aborted and awaited, and the stop is clean only when cessation is proven',async()=>{
  const c=candidate(6),handoff=buildVerifierHandoff({project,binding,candidate:c});
  let started;const running=new Promise(r=>{started=r;});
  const evaluator={run:(input,{signal})=>{started();return new Promise((_,reject)=>signal.addEventListener('abort',()=>setTimeout(()=>reject(new Error('aborted')),50)));}};
  const host=await launch(await profile(),{},{evaluator}),port=portFor(host,{evaluationTimeoutMs:30_000});
  const submitting=port.submit(handoff,650_000).catch(e=>e);
  await running;
  const closing=host.close();
  assert.deepEqual(await closing,{clean:true});
  const settled=await submitting;                      // the in-flight request received its response before sockets were torn down
  assert.equal(settled.known,true);
  const record=await new PostgresVerifierStore(open(urlFor(name))).get(c.commit+':'+c.tree+':'+c.buildArtifactSha256);
  assert.equal(record.phase,'FINAL');assert.equal(record.signed.verdict.outcome,'NOT_RUN');
  await assert.rejects(fetch(host.origin+'/qdev/v1/verdict',{method:'POST'}));   // no longer listening

  const c2=candidate(7),handoff2=buildVerifierHandoff({project,binding,candidate:c2});
  const stuck=await launch(await profile(),{},{evaluator:{run:async()=>{throw new EvaluatorNotQuiescent('group still alive');}}});
  assert.equal((await portFor(stuck).submit(handoff2,650_000)).known,false);
  assert.deepEqual(await stuck.close(),{clean:false},'unproven cessation is reported, never as a clean stop');
});

test('host end to end: the producer stages the exact retained bytes through the real listener, the evaluator consumes them, an unstaged or tampered artifact never evaluates',async()=>{
  const c=candidate(8),handoff=buildVerifierHandoff({project,binding,candidate:c});
  const host=await launch(await profile());
  // an unstaged handoff is refused by the host itself
  const raw=await fetch(host.origin+'/qdev/v1/handoff',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+CRED},body:JSON.stringify(handoff)});
  assert.equal(raw.status,409);assert.equal((await raw.json()).error,'QDEV_ARTIFACT_NOT_STAGED');assert.equal(runs().filter(x=>x===c.commit).length,0);
  await assert.rejects(portFor(host,{staging:undefined}).submit(handoff,650_000),/QDEV_VERIFIER_POST_SEND_AMBIGUOUS/);
  assert.equal(runs().filter(x=>x===c.commit).length,0);
  const settled=await portFor(host).submit(handoff,650_000);
  assert.equal(settled.known,true);assert.equal(runs().filter(x=>x===c.commit).length,1);
  assert.equal(verify(await portFor(host).fetchVerdict(c),c).outcome,'PASS','PASS requires the evaluator to have verified the staged exact bytes');
  await host.close();
  // the staged bytes are durable: a restarted host (same artifactRoot) serves the same FINAL record and re-staging is idempotent
  const restarted=await launch(await profile());
  assert.equal((await portFor(restarted).submit(handoff,650_000)).known,true);assert.equal(runs().filter(x=>x===c.commit).length,1);
  // a candidate whose retained bytes were altered on disk before the evaluation never starts
  const t=candidate(9),th=buildVerifierHandoff({project,binding,candidate:t});
  await stageViaPort(restarted,t);
  const staged=join(artifactRoot,readdirSync(artifactRoot).find(x=>!x.endsWith('.pending')&&readFileSync(join(artifactRoot,x,'manifest.json'),'utf8').includes(t.commit)),'files','dist','app.js');
  chmodSync(staged,0o644);writeFileSync(staged,'console.log("tampered")');
  await assert.rejects(portFor(restarted).submit(th,650_000),/artifact staging failed: QDEV_ARTIFACT_STATUS_409/);
  assert.equal(runs().filter(x=>x===t.commit).length,0);
});
async function stageViaPort(host,c){
  const {stageArtifact}=await import('../lib/qualification/artifact-staging.ts');
  await stageArtifact({origin:host.origin,authorization:'Bearer '+CRED,source:stagingFor(c),candidate:c,binding});
}
