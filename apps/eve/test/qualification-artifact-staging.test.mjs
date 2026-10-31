/** Artifact staging over a real loopback listener: the producer's retained exact bytes reach the independent verifier host BEFORE the charged evaluation, and the owned
 * child evaluator consumes exactly those bytes. Tamper, wrong project/source/candidate, bounds, duplicate and restart controls. Synthetic keys and evaluator only; no
 * custody, tunnel, provisioning, paid call or publication. Run: node --import tsx --test apps/eve/test/qualification-artifact-staging.test.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync} from 'node:crypto';
import {chmodSync,existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {StaticArtifactCandidate} from '../../../packages/myapps/src/static-artifact.ts';
import {ArtifactStagingStore,ARTIFACT_COMMIT_BODY_LIMIT,ARTIFACT_FILE_BODY_LIMIT,ARTIFACT_PATHS,stageArtifact} from '../lib/qualification/artifact-staging.ts';
import {createVerifierHandler,ed25519Signer,memoryVerifierStore} from '../lib/qualification/verifier-service.ts';
import {processEvaluator} from '../lib/qualification/verifier-runner.ts';
import {listenVerifierLoopback} from '../lib/qualification/verifier-transport.ts';
import {HttpVerifierPort} from '../lib/qualification/verifier-port.ts';
import {StaticBuildMyAppsPort} from '../lib/qualification/static-build.ts';
import {buildVerifierHandoff} from '../lib/qualification/verifier-handoff.ts';
import {qualificationBinding,QDEV_BASELINE} from '../lib/external-alpha/qualification-accounting.ts';
import {h} from './qualification-synthetic.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const dir=mkdtempSync(join(tmpdir(),'qdev-stage-'));
const log=join(dir,'consumed.log'),script=join(dir,'evaluator.mjs');
writeFileSync(script,`import {appendFileSync,readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
let input='';for await(const c of process.stdin)input+=c;
const {handoff,candidate,artifact}=JSON.parse(input);
let ok=!!artifact&&handoff.buildArtifactSha256===candidate.buildArtifactSha256&&artifact.artifactSha256===candidate.buildArtifactSha256;
const seen=[];
for(const f of artifact?.files??[]){const b=readFileSync(artifact.dir+'/'+f.path);const s=createHash('sha256').update(b).digest('hex');seen.push(f.path+':'+s+':'+b.length);if(s!==f.sha256||b.length!==f.bytes)ok=false;}
appendFileSync(process.env.QDEV_TEST_LOG,JSON.stringify({commit:candidate.commit,staged:!!artifact,seen})+'\\n');
process.stdout.write(JSON.stringify({outcome:ok?'PASS':'FAIL',usedMicrousd:0}));
`);
const consumed=()=>existsSync(log)?readFileSync(log,'utf8').split('\n').filter(Boolean).map(x=>JSON.parse(x)):[];

const project={...QDEV_BASELINE,operatingProfileSha256:h('1'),factoryVersionSha256:h('2'),protectedSpecificationSha256:h('3'),sources:{myeve:'a'.repeat(40),factory:'b'.repeat(40),relay:'c'.repeat(40),missioncontrol:'d'.repeat(40)}};
const binding=qualificationBinding(project);
const expected={projectSha256:binding.projectSha256,sourceSha256:binding.sourceSha256,protectedSpecificationSha256:project.protectedSpecificationSha256};
const CRED='artifact-staging-credential-'+'q'.repeat(24);
const pem=generateKeyPairSync('ed25519').privateKey.export({type:'pkcs8',format:'pem'}).toString();
const bound=`${binding.projectSha256}:${binding.sourceSha256}`;

const filesFor=n=>({'dist/index.html':Buffer.from('<html>exact bytes '+n+'</html>'),'dist/app.js':Buffer.from('console.log('+n+')'),'dist/assets/style.css':Buffer.from('b{color:red}')});
async function sourceFor(n,files=filesFor(n),commit=String(n).repeat(40),tree='2'.repeat(40)){
  const inventory={schema:'myeve.dashboard.build-inventory/v1',scope:'BROWSER_BUILD_ONLY',sourceCommit:commit,sourceTree:tree,lockSha256:h('a'),node:'v24.0.0',
    files:Object.entries(files).map(([path,b])=>({path,bytes:b.length,sha256:sha(b)})),independentVerification:'NOT_ESTABLISHED',signedResult:false,releaseQualified:false};
  const pins={sourceCommit:commit,sourceTree:tree,lockSha256:h('a')};
  return {inventory,pins,files,artifact:await StaticArtifactCandidate.retain(inventory,pins,async p=>files[p])};
}
const candidateOf=s=>({commit:s.pins.sourceCommit,tree:s.pins.sourceTree,buildArtifactSha256:s.artifact.artifactDigest.slice('sha256:'.length)});
const limits=path=>path===ARTIFACT_PATHS.file?ARTIFACT_FILE_BODY_LIMIT:path===ARTIFACT_PATHS.commit?ARTIFACT_COMMIT_BODY_LIMIT:8192;

const closers=[];
test.after(async()=>{for(const c of closers)await c().catch(()=>{});});
/** A verifier service over a real loopback listener. `root`/`store` may be shared to model a restart. */
async function service({root=join(dir,'root-'+closers.length),store=memoryVerifierStore(),withArtifacts=true}={}){
  const artifacts=new ArtifactStagingStore({root});
  const handler=createVerifierHandler({credentialSha256:[sha(CRED)],expected,paid:false,signer:ed25519Signer('staging-key',pem),store,evaluationDeadlineMs:5000,quiescenceGraceMs:500,
    ...(withArtifacts?{artifacts}:{}),evaluator:processEvaluator({command:process.execPath,args:[script],env:{QDEV_TEST_LOG:log}})});
  const listening=await listenVerifierLoopback(handler,{port:0,maxBodyBytes:limits});closers.push(listening.close);
  const requests=[];
  const spy=(url,init)=>{requests.push({path:new URL(url).pathname,body:typeof init?.body==='string'?init.body:null});return fetch(url,init);};
  const port=source=>new HttpVerifierPort({enabled:true,origin:listening.origin,credential:()=>CRED,fetch:spy,...(source?{staging:()=>source}:{})});
  return {origin:listening.origin,artifacts,store,root,port,requests,listening};
}
const post=(origin,path,body,headers={})=>fetch(origin+path,{method:'POST',headers:{authorization:'Bearer '+CRED,...headers},body});
const upload=(origin,c,path,bytes,over={})=>post(origin,ARTIFACT_PATHS.file,bytes,{'content-type':'application/octet-stream','x-qdev-candidate':`${c.commit}:${c.tree}:${c.buildArtifactSha256}`,
  'x-qdev-binding':bound,'x-qdev-path':path,'x-qdev-sha256':sha(bytes),...over});
const commit=(origin,s,over={})=>post(origin,ARTIFACT_PATHS.commit,JSON.stringify({candidate:candidateOf(s),binding:{projectSha256:binding.projectSha256,sourceSha256:binding.sourceSha256},pins:s.pins,inventory:s.inventory,...over}),{'content-type':'application/json'});
const code=async response=>(await response.json()).error;

test('real loopback: exact bytes are staged before the digest-only handoff and the owned evaluator consumes exactly those bytes',async()=>{
  const s=await sourceFor(1),c=candidateOf(s),svc=await service(),port=svc.port(s);
  const handoff=buildVerifierHandoff({project,binding,candidate:c});
  const settled=await port.submit(handoff,650_000);
  assert.equal(settled.known,true);assert.equal(settled.value.settledMicrousd,0);
  const order=svc.requests.map(r=>r.path);
  assert.deepEqual(order,[...Array(3).fill(ARTIFACT_PATHS.file),ARTIFACT_PATHS.commit,'/qdev/v1/handoff','/qdev/v1/evaluate'],'staging strictly precedes the handoff and the charged evaluation');
  const handoffBody=JSON.parse(svc.requests.find(r=>r.path==='/qdev/v1/handoff').body);
  assert.deepEqual(handoffBody,handoff);assert.ok(!JSON.stringify(handoffBody).includes('exact bytes'),'the proof handoff carries digests only, never bytes');
  const run=consumed().find(x=>x.commit===c.commit);
  assert.equal(run.staged,true);
  assert.deepEqual(run.seen.sort(),Object.entries(s.files).map(([p,b])=>`${p}:${sha(b)}:${b.length}`).sort(),'the evaluator read the exact producer bytes from the staged directory');
  assert.equal((await port.fetchVerdict(c)).verdict.outcome,'PASS');
  // The staged area is private and read-only; nothing is served or published from it.
  const stagedFiles=readdirSync(join(svc.root,readdirSync(svc.root).find(x=>!x.endsWith('.pending')),'files','dist'));assert.ok(stagedFiles.includes('index.html'));
  assert.equal((await fetch(svc.origin+'/dist/index.html')).status,404);
});

test('a handoff for bytes this host does not hold is refused: nothing is registered and nothing evaluates',async()=>{
  const s=await sourceFor(2),c=candidateOf(s),svc=await service(),before=consumed().length;
  const handoff=buildVerifierHandoff({project,binding,candidate:c});
  const raw=await post(svc.origin,'/qdev/v1/handoff',JSON.stringify(handoff),{'content-type':'application/json'});
  assert.equal(raw.status,409);assert.equal(await code(raw),'QDEV_ARTIFACT_NOT_STAGED');
  // A producer without a staging source cannot get its bytes evaluated either (ambiguous, fenced; never a digest-only run).
  await assert.rejects(svc.port(null).submit(handoff,650_000),/QDEV_VERIFIER_POST_SEND_AMBIGUOUS/);
  assert.equal((await post(svc.origin,'/qdev/v1/verdict',JSON.stringify({candidate:c}),{'content-type':'application/json'})).status,409);
  assert.equal(consumed().length,before);
});

test('producer-side staging failure is a pre-handoff refusal: nothing reaches the handoff or evaluation',async()=>{
  const s=await sourceFor(3),other=await sourceFor(4),c=candidateOf(s),svc=await service();
  const handoff=buildVerifierHandoff({project,binding,candidate:c});
  // The retained bytes do not match the candidate being verified (wrong candidate / wrong source).
  await assert.rejects(svc.port(other).submit(handoff,650_000),/ProviderNotSent|artifact staging failed: QDEV_ARTIFACT_CANDIDATE_MISMATCH/);
  assert.deepEqual(svc.requests,[],'nothing was sent');
  // A verifier that rejects the upload leaves the handoff unsent.
  const down=new HttpVerifierPort({enabled:true,origin:svc.origin,credential:()=>'wrong-credential-wrong-credential',staging:()=>s});
  await assert.rejects(down.submit(handoff,650_000),/artifact staging failed: QDEV_ARTIFACT_STATUS_401/);
  assert.ok(!consumed().some(x=>x.commit===c.commit));
});

test('upload and commit controls: digest, path, binding, source, candidate, file set, limits and authentication',async()=>{
  const s=await sourceFor(5),c=candidateOf(s),svc=await service(),bytes=s.files['dist/index.html'];
  assert.equal((await fetch(svc.origin+ARTIFACT_PATHS.file,{method:'POST',headers:{'content-type':'application/octet-stream'},body:bytes})).status,401);
  assert.equal((await fetch(svc.origin+ARTIFACT_PATHS.commit,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer wrong-credential-wrong-credential'},body:'{}'})).status,401);
  assert.equal((await upload(svc.origin,c,'dist/index.html',bytes,{'x-qdev-sha256':h('9')})).status,400);              // claimed digest != body
  for(const bad of ['dist/../x','etc/passwd','dist/a b','dist/.hidden/../../x','dist//x','/dist/index.html','dist/x.'])
    assert.equal((await upload(svc.origin,c,bad,bytes)).status,400,bad);
  assert.equal((await upload(svc.origin,c,'dist/index.html',bytes,{'x-qdev-binding':`${h('9')}:${binding.sourceSha256}`})).status,403);   // foreign project
  assert.equal((await upload(svc.origin,c,'dist/index.html',bytes,{'x-qdev-binding':`${binding.projectSha256}:${h('9')}`})).status,403);   // foreign source
  assert.equal((await upload(svc.origin,c,'dist/index.html',bytes,{'content-type':'application/json'})).status,400);
  assert.deepEqual(readdirSync(svc.root),[],'no refused request wrote anything');
  // The size bound is enforced by the transport before the body is read.
  const huge=await upload(svc.origin,c,'dist/big.bin',Buffer.alloc(ARTIFACT_FILE_BODY_LIMIT+1)).then(r=>r.status,()=>'closed');assert.ok(huge===413||huge==='closed');
  // Upload everything, but the commit is for a different candidate / source / project.
  for(const [p,b] of Object.entries(s.files))assert.equal((await upload(svc.origin,c,p,b)).status,200);
  const wrong={...c,buildArtifactSha256:h('7')};                                                            // same bytes presented under a build identity they do not have
  for(const [p,b] of Object.entries(s.files))assert.equal((await upload(svc.origin,wrong,p,b)).status,200);
  assert.equal(await code(await commit(svc.origin,s,{candidate:wrong})),'QDEV_ARTIFACT_MISMATCH');
  assert.equal(await svc.artifacts.has(wrong),false);
  assert.equal(await code(await commit(svc.origin,s,{candidate:{...c,buildArtifactSha256:h('6')}})),'QDEV_ARTIFACT_UNAVAILABLE');   // nothing was staged under that identity
  assert.equal(await code(await commit(svc.origin,s,{candidate:{...c,tree:'9'.repeat(40)}})),'QDEV_ARTIFACT_SOURCE_MISMATCH');
  assert.equal(await code(await commit(svc.origin,s,{candidate:{...c,commit:'9'.repeat(40)}})),'QDEV_ARTIFACT_SOURCE_MISMATCH');
  assert.equal((await commit(svc.origin,s,{binding:{projectSha256:h('9'),sourceSha256:binding.sourceSha256}})).status,403);
  assert.equal((await commit(svc.origin,s,{binding:{projectSha256:binding.projectSha256,sourceSha256:h('9')}})).status,403);
  assert.equal((await commit(svc.origin,s,{extra:true})).status,400);
  assert.equal(await svc.artifacts.has(c),false,'no refused commit committed anything');
  // An inventory that disagrees with the uploaded bytes (tampered inventory digest) cannot commit.
  const tampered={...s,inventory:{...s.inventory,files:s.inventory.files.map((f,i)=>i?f:{...f,sha256:h('8')})}};
  assert.equal((await commit(svc.origin,tampered)).status,422);
  // Success, then an idempotent duplicate commit returns the identical receipt.
  const receipt=await (await commit(svc.origin,s)).json();
  assert.deepEqual(receipt,{staged:true,artifactSha256:c.buildArtifactSha256,inventoryDigest:s.artifact.inventoryDigest,files:3,bytes:Object.values(s.files).reduce((n,b)=>n+b.length,0)});
  assert.deepEqual(await (await commit(svc.origin,s)).json(),receipt);
  assert.equal((await upload(svc.origin,c,'dist/index.html',bytes)).status,200);                                          // duplicate upload of an identical committed file
  assert.equal(await code(await upload(svc.origin,c,'dist/index.html',Buffer.from('different'))),'QDEV_ARTIFACT_CONFLICT');
});

test('wrong, missing and extra bytes cannot commit; a corrected upload then recovers',async()=>{
  const s=await sourceFor(6),c=candidateOf(s),svc=await service();
  const [first,...rest]=Object.entries(s.files);
  assert.equal((await upload(svc.origin,c,first[0],Buffer.from('not the built bytes'))).status,200);   // self-consistent digest, but not the inventoried bytes
  for(const [p,b] of rest)assert.equal((await upload(svc.origin,c,p,b)).status,200);
  assert.equal((await commit(svc.origin,s)).status,422);                                                // BYTES_MISMATCH
  assert.equal((await upload(svc.origin,c,'dist/extra.js',Buffer.from('x'))).status,200);
  assert.equal((await upload(svc.origin,c,first[0],first[1])).status,200);                              // corrected bytes
  assert.equal(await code(await commit(svc.origin,s)),'QDEV_ARTIFACT_FILESET');                        // an extra, uninventoried file
  // case alias / file-directory collisions are refused at upload
  assert.equal(await code(await upload(svc.origin,c,'dist/INDEX.html',Buffer.from('a'))),'QDEV_ARTIFACT_CONFLICT');
  assert.equal(await code(await upload(svc.origin,c,'dist/assets',Buffer.from('a'))),'QDEV_ARTIFACT_CONFLICT');
  assert.equal(await svc.artifacts.has(c),false);
});

test('tamper after staging is detected before the durable begin: no evaluation starts, no charge, the record stays unevaluated',async()=>{
  const s=await sourceFor(7),c=candidateOf(s),svc=await service(),port=svc.port(s),handoff=buildVerifierHandoff({project,binding,candidate:c});
  // Stage via the real client and register the handoff only (the first two requests of submit), then corrupt the staged bytes on disk.
  await stageArtifact({origin:svc.origin,authorization:'Bearer '+CRED,source:s,candidate:c,binding});
  assert.equal((await post(svc.origin,'/qdev/v1/handoff',JSON.stringify(handoff),{'content-type':'application/json'})).status,200);
  const stagedDir=join(svc.root,readdirSync(svc.root).find(x=>!x.endsWith('.pending')),'files');
  chmodSync(join(stagedDir,'dist/app.js'),0o644);writeFileSync(join(stagedDir,'dist/app.js'),'console.log("tampered")');
  const before=consumed().length;
  const evaluate=await post(svc.origin,'/qdev/v1/evaluate',JSON.stringify({candidate:c,reserveMicrousd:650_000}),{'content-type':'application/json'});
  assert.equal(evaluate.status,409);assert.equal(await code(evaluate),'QDEV_ARTIFACT_INVALID');
  assert.equal(consumed().length,before,'the evaluator never ran on tampered bytes');
  assert.equal((await svc.store.get(c.commit+':'+c.tree+':'+c.buildArtifactSha256)).phase,'HANDED_OFF');
  // The same refusal covers an added file and a replaced symlink.
  writeFileSync(join(stagedDir,'dist/app.js'),s.files['dist/app.js']);
  writeFileSync(join(stagedDir,'dist','added.js'),'x');
  assert.equal(await code(await post(svc.origin,'/qdev/v1/evaluate',JSON.stringify({candidate:c,reserveMicrousd:650_000}),{'content-type':'application/json'})),'QDEV_ARTIFACT_INVALID');
  // The producer's own submit re-stages first; the host's commit re-verification refuses, so the handoff/evaluate are never even sent.
  await assert.rejects(port.submit(handoff,650_000),/artifact staging failed: QDEV_ARTIFACT_STATUS_409/);
  assert.equal(consumed().length,before);
});

test('duplicate and restart: staged bytes are durable, re-staging is idempotent and nothing is re-evaluated',async()=>{
  const s=await sourceFor(8),c=candidateOf(s),first=await service(),handoff=buildVerifierHandoff({project,binding,candidate:c});
  const [one,...others]=Object.entries(s.files);
  // A partial upload survives a restart of the host and completes afterwards.
  assert.equal((await upload(first.origin,c,one[0],one[1])).status,200);
  await first.listening.close();
  const second=await service({root:first.root,store:first.store});
  for(const [p,b] of others)assert.equal((await upload(second.origin,c,p,b)).status,200);
  assert.equal((await upload(second.origin,c,one[0],one[1])).status,200);
  const port=second.port(s);
  assert.equal((await port.submit(handoff,650_000)).known,true);
  const runs=()=>consumed().filter(x=>x.commit===c.commit).length;assert.equal(runs(),1);
  await second.listening.close();
  const third=await service({root:first.root,store:first.store}),again=third.port(s);
  assert.equal((await third.artifacts.open(c)).artifactSha256,c.buildArtifactSha256);
  assert.equal((await again.submit(handoff,650_000)).known,true);                                        // re-stages idempotently, never re-evaluates
  assert.equal(runs(),1);assert.equal((await again.fetchVerdict(c)).verdict.outcome,'PASS');
});

test('staging source is retained-only and the staging store refuses unsafe roots',async()=>{
  const port=new StaticBuildMyAppsPort({source:async()=>{throw new Error('unused');},delivery:{}});
  assert.throws(()=>port.stagingSource({commit:'a'.repeat(40),tree:'b'.repeat(40)}),/QDEV_BUILD_NOT_RETAINED/);
  assert.throws(()=>new ArtifactStagingStore({root:'relative/path'}),/QDEV_ARTIFACT_ROOT/);
  assert.throws(()=>new ArtifactStagingStore({root:'/tmp/../etc'}),/QDEV_ARTIFACT_ROOT/);
  const real=join(dir,'real');mkdirSync(real);
  assert.ok(new ArtifactStagingStore({root:real}));
});
