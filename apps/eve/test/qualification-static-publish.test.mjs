/** MyApps static release controller: immutable verified releases, atomic pointer, verifying handler, exact rollback, gated delivery port. Synthetic only; no network egress, provider, spend or deployment. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {consumeStageResult} from '../lib/qualification/result.ts';
import {verifyVerdict} from '../lib/qualification/verdict.ts';
import {acceptDelivery} from '../lib/qualification/delivery.ts';
import {StaticBuildMyAppsPort,StaticBuildRefused} from '../lib/qualification/static-build.ts';
import {DeliveryObservationError} from '../lib/qualification/delivery-observer.ts';
import {qualificationBinding,QDEV_BASELINE} from '../lib/external-alpha/qualification-accounting.ts';
import {canonical} from '../../../packages/myapps/src/contracts.ts';
import {StaticArtifactCandidate} from '../../../packages/myapps/src/static-artifact.ts';
import {STATIC_BUILD_CLAIM_DOMAIN} from '../../../packages/myapps/src/static-build-claim.ts';
import {syntheticFactory,syntheticVerifier,verdictFor,h} from './qualification-synthetic.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const files={'dist/index.html':Buffer.from('<html><script src="/app.js"></script></html>'),'dist/app.js':Buffer.from('console.log("synthetic dashboard")')};
const NOW=Date.parse('2026-10-30T01:00:00.000Z');

async function compose(){
  const fx=syntheticFactory(),vf=syntheticVerifier();
  const project={...QDEV_BASELINE,operatingProfileSha256:h('1'),factoryVersionSha256:fx.factoryVersion,protectedSpecificationSha256:h('3'),sources:{myeve:'a'.repeat(40),factory:'b'.repeat(40),relay:'c'.repeat(40),missioncontrol:'d'.repeat(40)}};
  const binding=qualificationBinding(project);
  const r1=fx.stage(1,fx.baseline),r2=fx.stage(2,r1.candidate),r3=fx.stage(3,r2.candidate);
  const accepted=consumeStageResult({signed:r3.signed,keys:[fx.key],project,stage:3,precedingCandidate:r2.candidate,expected:fx.expectedByStage[3],sourceDigest:fx.sourceDigest,baseline:fx.baseline});
  const candidate={commit:accepted.candidateCommit,tree:accepted.candidateTree};
  const inventory={schema:'myeve.dashboard.build-inventory/v1',scope:'BROWSER_BUILD_ONLY',sourceCommit:candidate.commit,sourceTree:candidate.tree,lockSha256:h('a'),node:'v24.0.0',
    files:Object.entries(files).map(([path,b])=>({path,bytes:b.length,sha256:sha(b)})),independentVerification:'NOT_ESTABLISHED',signedResult:false,releaseQualified:false};
  const pins={sourceCommit:candidate.commit,sourceTree:candidate.tree,lockSha256:h('a')};
  const load=async p=>{const b=files[p];if(!b)throw new Error('missing');return b;};
  const retained=await StaticArtifactCandidate.retain(inventory,pins,load);
  const pair=generateKeyPairSync('ed25519');
  const issuer={keyId:'synthetic-build-key',purpose:'STATIC_BUILD_PROVENANCE_V1',ownerId:'synthetic-owner',factoryId:fx.factoryId,factoryVersion:fx.factoryVersion,buildProfileDigest:h('c'),
    publicKeyPem:pair.publicKey.export({type:'spki',format:'pem'}).toString(),spkiSha256:sha(pair.publicKey.export({type:'spki',format:'der'})),notBefore:'2020-01-01T00:00:00.000Z',notAfter:'2099-01-01T00:00:00.000Z',revoked:false};
  const bind={ownerId:'synthetic-owner',agentId:'synthetic-agent',appId:'synthetic-app',workId:'synthetic-work',workVersion:1,workGeneration:1,requestId:'synthetic-request-3',runId:'synthetic-run-3',
    factoryId:fx.factoryId,factoryVersion:fx.factoryVersion,sourceDigest:fx.sourceDigest,configurationDigest:fx.configurationDigest,inputCommit:r2.candidate.commit,inputTree:r2.candidate.tree,
    candidateCommit:candidate.commit,candidateTree:candidate.tree,lockSha256:h('a'),buildProfileDigest:h('c'),deadline:'2099-01-01T00:00:00.000Z'};
  const claimFor=(b=bind,key=pair.privateKey)=>{const payload={schema:'myeve.static-build-claim/v1',keyId:'synthetic-build-key',binding:b,inventoryDigest:retained.inventoryDigest,artifactDigest:retained.artifactDigest,builtAt:'2026-10-30T00:00:00.000Z'};
    return canonical({payload,signature:sign(null,Buffer.from(STATIC_BUILD_CLAIM_DOMAIN+canonical(payload)),key).toString('base64url')});};
  return {fx,vf,project,binding,accepted,candidate,inventory,load,retained,issuer,bind,claimFor,pair};
}
const portFor=(c,{claim=c.claimFor(),issuer=c.issuer,served=files,load=c.load,enabled=true}={})=>{
  const seen=[];
  const port=new StaticBuildMyAppsPort({now:()=>NOW,source:async()=>({inventory:c.inventory,claim,load,lockSha256:h('a'),binding:c.bind,issuer}),
    delivery:{enabled,environment:'myeve-qdev-20261029',servedOrigin:'https://app.invalid',projectSha256:c.binding.projectSha256,sourceSha256:c.binding.sourceSha256,
      priorRevision:async()=>({kind:'ABSENT',authenticationSha256:h('5')}),restorePointId:async()=>'rp-1',now:()=>new Date('2026-10-30T01:00:00Z'),
      fetcher:async url=>{seen.push(new URL(url).pathname);const b=served['dist'+new URL(url).pathname];return b?new Response(b):new Response('',{status:404});}}});
  return {port,seen};
};
const verdictFrom=(c,buildArtifactSha256)=>{
  const signed=c.vf.signVerdict(verdictFor({projectSha256:c.binding.projectSha256,sourceSha256:c.binding.sourceSha256,protectedSpecificationSha256:c.project.protectedSpecificationSha256,
    candidateCommit:c.candidate.commit,candidateTree:c.candidate.tree,buildArtifactSha256}));
  return verifyVerdict({signed,verifierKeys:[c.vf.key],producerKeyIds:[c.fx.key.keyId],producerPublicKeysPem:[c.fx.producerPem],now:Date.parse('2026-10-28T00:00:00Z'),
    expected:{projectSha256:c.binding.projectSha256,sourceSha256:c.binding.sourceSha256,protectedSpecificationSha256:c.project.protectedSpecificationSha256,candidateCommit:c.candidate.commit,candidateTree:c.candidate.tree,buildArtifactSha256}});
};


import {mkdtempSync,mkdirSync,writeFileSync,chmodSync,statSync,symlinkSync,readFileSync,readdirSync,existsSync,rmSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {StaticReleaseController,StaticPublishRefused,listenLoopback} from '../lib/qualification/static-publish.ts';
import {StaticPublishingMyAppsPort} from '../lib/qualification/static-publish-port.ts';
import {MyAppsRevisionReader} from '../lib/qualification/myapps-revisions.ts';
import {planRollback} from '../lib/qualification/rollback.ts';

const PROJECT=h('9'),ENV='myeve-qdev-20261029',INST={environment:ENV,installationId:'inst-1'};
const dirs=[];
const mkroot=()=>{const d=mkdtempSync(join(tmpdir(),'qdev-pub-'));chmodSync(d,0o700);dirs.push(d);return d;};
test.after(()=>{for(const d of dirs){try{execFileSync('chmod',['-R','u+w',d]);rmSync(d,{recursive:true,force:true});}catch{}}});
const ctl=(root,extra={})=>new StaticReleaseController({root,environment:ENV,appId:'app-1',ownerId:'owner-q1',projectSha256:PROJECT,installationId:'inst-1',activation:{permit:async()=>true},...extra});
const art=async(map,seed='1')=>{const commit=seed.repeat(40),tree=seed.repeat(40);
  const inv={schema:'myeve.dashboard.build-inventory/v1',scope:'BROWSER_BUILD_ONLY',sourceCommit:commit,sourceTree:tree,lockSha256:h('a'),node:'v24.0.0',
    files:Object.entries(map).map(([path,b])=>({path,bytes:b.length,sha256:sha(b)})),independentVerification:'NOT_ESTABLISHED',signedResult:false,releaseQualified:false};
  return StaticArtifactCandidate.retain(inv,{sourceCommit:commit,sourceTree:tree,lockSha256:h('a')},async p=>{if(!map[p])throw new Error('x');return map[p];});};
const F1={'dist/index.html':Buffer.from('<html>v1</html>'),'dist/assets/app.js':Buffer.from('console.log(1)')};
const F2={'dist/index.html':Buffer.from('<html>v2</html>'),'dist/assets/app.js':Buffer.from('console.log(2)')};
const get=(hd,path,method='GET')=>hd(new Request('https://app.invalid'+path,{method}));
const text=async r=>Buffer.from(await r.arrayBuffer()).toString();
const hexOf=a=>a.artifactDigest.slice(7);
const readerFor=c=>new MyAppsRevisionReader({source:c.stateSource(),appId:'app-1',ownerId:'owner-q1',projectSha256:PROJECT});
const planFrom=async r=>planRollback({environment:ENV,priorRevision:await r.priorRevision(),rollbackRestorePointId:await r.restorePointId()},INST);
const code=c=>e=>e instanceof StaticPublishRefused&&e.code===c;

test('publish writes an immutable verified release and serves exactly the retained bytes',async()=>{
  const root=mkroot(),c=ctl(root),a1=await art(F1);
  const r=await c.publish(a1);
  assert.deepEqual({v:r.version,changed:r.changed,d:r.digest},{v:1,changed:true,d:a1.artifactDigest});
  const hd=c.handler();
  const idx=await get(hd,'/');assert.equal(idx.status,200);assert.equal(await text(idx),'<html>v1</html>');
  assert.match(idx.headers.get('content-type'),/^text\/html/);assert.equal(idx.headers.get('x-content-type-options'),'nosniff');assert.match(idx.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  assert.equal(await text(await get(hd,'/assets/app.js')),'console.log(1)');
  const head=await get(hd,'/assets/app.js','HEAD');assert.equal(head.status,200);assert.equal(head.headers.get('content-length'),'14');assert.equal((await head.arrayBuffer()).byteLength,0);
  for(const p of ['/missing.js','/assets','/manifest.json','/state.json','/%2e%2e/state.json','/..%2fstate.json','/assets/%2e','/a b'])assert.equal((await get(hd,p)).status,404,p);
  assert.equal((await get(hd,'/','POST')).status,405);
  assert.equal(statSync(join(root,'releases',hexOf(a1),'dist/index.html')).mode&0o777,0o444);
  assert.equal(statSync(join(root,'releases',hexOf(a1),'dist')).mode&0o777,0o555);
});

test('nothing installed serves 404; the same artifact is idempotent; a new artifact is a new version; rollback restores the exact prior revision',async()=>{
  const root=mkroot(),c=ctl(root),hd=c.handler(),a1=await art(F1,'1'),a2=await art(F2,'2');
  assert.equal((await get(hd,'/')).status,404);
  await c.publish(a1);const reader=readerFor(c);await reader.capture();
  assert.equal((await c.publish(a1)).changed,false);
  const r2=await c.publish(a2);assert.equal(r2.version,2);assert.equal(await text(await get(hd,'/')),'<html>v2</html>');
  const plan=await planFrom(reader);assert.equal(plan.kind,'RESTORE_REVISION');assert.equal(plan.revisionId,'app-1@1');
  assert.deepEqual(await c.rollback(plan),{installed:1,changed:true,seq:3});
  assert.equal(await text(await get(hd,'/')),'<html>v1</html>');
  assert.deepEqual(await c.rollback(plan),{installed:1,changed:false,seq:3});
  assert.equal((await c.publish(a2)).version,3,'versions are never reused');
  assert.deepEqual(await c.stateSource().read('app-1'),{installedVersion:3,installedDigest:a2.artifactDigest,restorableVersions:[1,2,3]});
});

test('rollback refuses any plan that is not exactly a retained revision of this installation',async()=>{
  const root=mkroot(),c=ctl(root),a1=await art(F1,'1'),a2=await art(F2,'2');
  await c.publish(a1);const reader=readerFor(c);await reader.capture();await c.publish(a2);
  const good=await planFrom(reader);
  for(const [name,plan,expected] of [
    ['sha',{...good,revisionSha256:'f'.repeat(64)},'QDEV_PUBLISH_ROLLBACK_TARGET'],
    ['restore point',{...good,restorePointId:'myapps-restore:app-1@1:0000000000000000'},'QDEV_PUBLISH_ROLLBACK_TARGET'],
    ['other app',{...good,revisionId:'other@1'},'QDEV_PUBLISH_ROLLBACK_TARGET'],
    ['unknown version',{...good,revisionId:'app-1@9'},'QDEV_PUBLISH_ROLLBACK_TARGET'],
    ['installation',{...good,installation:{...INST,installationId:'inst-2'}},'QDEV_PUBLISH_INSTALLATION_IDENTITY'],
    ['environment',{...good,installation:{...INST,environment:'other'}},'QDEV_PUBLISH_INSTALLATION_IDENTITY'],
    ['absence on an installed history',{kind:'REMOVE_INSTALLATION',installation:INST,absenceAuthenticationSha256:'a'.repeat(64),restorePointId:'myapps-absent:'+'a'.repeat(32)},'QDEV_PUBLISH_ROLLBACK_TARGET'],
  ])await assert.rejects(c.rollback(plan),code(expected),name);
  assert.equal((await c.stateSource().read('app-1')).installedVersion,2,'a refused plan changes nothing');
});

test('a first installation is removed back to authenticated absence',async()=>{
  const root=mkroot(),c=ctl(root),hd=c.handler(),reader=readerFor(c);await reader.capture();
  await c.publish(await art(F1));assert.equal((await get(hd,'/')).status,200);
  const plan=await planFrom(reader);assert.equal(plan.kind,'REMOVE_INSTALLATION');
  assert.deepEqual(await c.rollback(plan),{installed:null,changed:true,seq:2});
  const gone=await get(hd,'/');assert.equal(gone.status,404);
  assert.deepEqual(await c.stateSource().read('app-1'),{installedVersion:null,installedDigest:null,restorableVersions:[1]});
  assert.deepEqual(await c.rollback(plan),{installed:null,changed:false,seq:2});
});

test('a modified, extended or linked release is never served, restorable or reinstalled',async()=>{
  const root=mkroot(),c=ctl(root),hd=c.handler(),a1=await art(F1);
  await c.publish(a1);const dir=join(root,'releases',hexOf(a1));
  execFileSync('chmod',['-R','u+w',dir]);
  writeFileSync(join(dir,'dist/assets/app.js'),'console.log("evil")');
  const bad=await get(hd,'/assets/app.js');assert.equal(bad.status,500);assert.equal((await bad.json()).error,'QDEV_PUBLISH_SERVE_INTEGRITY');
  assert.deepEqual((await c.stateSource().read('app-1')).restorableVersions,[]);
  await assert.rejects(c.publish(a1),code('QDEV_PUBLISH_RELEASE_TAMPERED'));
  const root2=mkroot(),c2=ctl(root2),b1=await art(F1,'3'),d2=join(root2,'releases',hexOf(b1));
  await c2.publish(b1);execFileSync('chmod',['-R','u+w',d2]);
  writeFileSync(join(d2,'dist/extra.txt'),'x');
  await assert.rejects(c2.publish(b1),code('QDEV_PUBLISH_RELEASE_TAMPERED'));
  rmSync(join(d2,'dist/extra.txt'));symlinkSync('/etc/hosts',join(d2,'dist/link'));
  await assert.rejects(c2.publish(b1),code('QDEV_PUBLISH_RELEASE_TAMPERED'));
});

test('every mutation needs the host activation permit; without it nothing is written',async()=>{
  const root=mkroot(),a1=await art(F1),seen=[];
  const off=ctl(root,{activation:undefined});
  await assert.rejects(off.publish(a1),code('QDEV_PUBLISH_NOT_AUTHORIZED'));
  const no=ctl(root,{activation:{permit:async r=>{seen.push(r);return false;}}});
  await assert.rejects(no.publish(a1),code('QDEV_PUBLISH_NOT_AUTHORIZED'));
  assert.deepEqual(seen,[{operation:'PUBLISH',appId:'app-1',ownerId:'owner-q1',projectSha256:PROJECT,digest:a1.artifactDigest}]);
  assert.deepEqual(readdirSync(join(root,'states')),[]);assert.equal(existsSync(join(root,'releases',hexOf(a1))),false);
  assert.equal((await off.handler()(new Request('https://app.invalid/'))).status,404);
  const yes=ctl(root);await yes.publish(a1);const reader=readerFor(yes);await reader.capture();await yes.publish(await art(F2,'2'));
  await assert.rejects(off.rollback(await planFrom(reader)),code('QDEV_PUBLISH_NOT_AUTHORIZED'));
  assert.equal((await yes.stateSource().read('app-1')).installedVersion,2);
});

test('state is owner, project and app scoped; foreign state is refused; only retained artifacts publish',async()=>{
  const root=mkroot(),a1=await art(F1);await ctl(root).publish(a1);
  await assert.rejects(ctl(root,{ownerId:'owner-q2'}).publish(a1),code('QDEV_PUBLISH_STATE_FOREIGN'));
  await assert.rejects(ctl(root,{appId:'app-2'}).publish(a1),code('QDEV_PUBLISH_STATE_FOREIGN'));
  await assert.rejects(ctl(root,{projectSha256:h('8')}).publish(a1),code('QDEV_PUBLISH_STATE_FOREIGN'));
  await assert.rejects(ctl(root).stateSource().read('other'),code('QDEV_PUBLISH_STATE_FOREIGN'));
  const fake={artifactDigest:'sha256:'+'a'.repeat(64),inventoryDigest:'sha256:'+'b'.repeat(64),source:{},files:[],candidateBytes(){return new Uint8Array();}};
  await assert.rejects(ctl(mkroot()).publish(fake),code('QDEV_PUBLISH_NOT_RETAINED'));
});

test('concurrent publishers on one root commit by exclusive-create CAS: no lost update, every success is in the history',async()=>{
  const root=mkroot(),c1=ctl(root),c2=ctl(root),a1=await art(F1,'1'),a2=await art(F2,'2');
  const [r1,r2]=await Promise.all([c1.publish(a1),c2.publish(a2)]);
  assert.deepEqual([r1.version,r2.version].sort(),[1,2]);
  assert.deepEqual((await c1.stateSource().read('app-1')).restorableVersions,[1,2]);
  const files=readdirSync(join(root,'states')).sort();assert.deepEqual(files,['0000000001.json','0000000002.json']);
  const last=JSON.parse(readFileSync(join(root,'states',files[1]),'utf8'));assert.deepEqual(last.events.map(e=>e.seq),[1,2]);
  assert.equal(statSync(join(root,'states',files[0])).mode&0o777,0o444,'committed states are read-only');
});

test('many real OS processes racing on one root never lose or duplicate a committed publication',async()=>{
  const worker=fileURLToPath(new URL('./qualification-static-publish-worker.mjs',import.meta.url));
  for(let round=0;round<6;round++){
    const root=mkroot();ctl(root);
    const run=seed=>new Promise((resolve,reject)=>{
      const child=spawn(process.execPath,['--import','tsx',worker,root,seed,PROJECT],{stdio:['ignore','pipe','inherit']});let out='';
      child.stdout.on('data',d=>{out+=d;});child.on('error',reject);child.on('close',code=>code===0?resolve(JSON.parse(out)):reject(new Error('worker '+code+' '+out)));
    });
    const results=await Promise.all(['1','2','3'].map(run));
    assert.deepEqual(results.map(r=>r.version).sort(),[1,2,3],'round '+round);assert.ok(results.every(r=>r.changed));
    const files=readdirSync(join(root,'states')).sort();assert.equal(files.length,3);
    const last=JSON.parse(readFileSync(join(root,'states',files.at(-1)),'utf8'));
    assert.deepEqual(last.versions.map(v=>v.digest).sort(),results.map(r=>r.digest.slice(7)).sort(),'history holds exactly the successful publications');
  }
});

test('compensation is a compare-and-swap: a newer release published during a delayed observation is never undone',async()=>{
  const c=await compose(),prior=await art(F1,'6'),newer=await art(F2,'7');
  const d=deliveryFor(c,{tamper:true});
  await d.controller.publish(prior);
  const other=ctl(d.root,{projectSha256:c.binding.projectSha256});
  // The observation is delayed while another permitted publisher commits a newer release.
  const original=d.hd;let raced=false;
  const slowed=new StaticPublishingMyAppsPort({build:new StaticBuildMyAppsPort({now:()=>NOW,source:async()=>({inventory:c.inventory,claim:c.claimFor(),load:c.load,lockSha256:h('a'),binding:c.bind,issuer:c.issuer}),
    delivery:{enabled:true,environment:ENV,servedOrigin:'https://app.invalid',projectSha256:c.binding.projectSha256,sourceSha256:c.binding.sourceSha256,
      priorRevision:async()=>d.reader.priorRevision(),restorePointId:async()=>d.reader.restorePointId(),now:()=>new Date('2026-10-30T01:00:00Z'),
      fetcher:async url=>{if(!raced){raced=true;await other.publish(newer);}const r=await original(new Request(url));return new URL(url).pathname==='/app.js'?new Response('tampered'):r;}}}),
    controller:d.controller,reader:d.reader,installation:INST,gate:async cand=>verdictFrom(c,cand.buildArtifactSha256)});
  await slowed.retainBuild(c.candidate);
  await assert.rejects(slowed.observe(c.candidate),code('QDEV_PUBLISH_COMPENSATION_SUPERSEDED'));
  assert.equal(await text(await get(d.hd,'/')),'<html>v2</html>','the newer release stays served');
  const st=await d.controller.stateSource().read('app-1');assert.equal(st.installedDigest,newer.artifactDigest);assert.equal(st.installedVersion,3);
});

test('the release root must be a private directory owned by this user',async()=>{
  const open=mkroot();chmodSync(open,0o755);assert.throws(()=>ctl(open),code('QDEV_PUBLISH_ROOT'));
  const real=mkroot(),link=join(mkroot(),'link');symlinkSync(real,link);assert.throws(()=>ctl(link),code('QDEV_PUBLISH_ROOT'));
  assert.throws(()=>ctl(mkroot(),{appId:'bad app'}),code('QDEV_PUBLISH_CONFIG'));
});

function deliveryFor(c,{ctlExtra={},tamper=false,gate}={}){
  const root=mkroot(),controller=ctl(root,{projectSha256:c.binding.projectSha256,...ctlExtra}),hd=controller.handler();
  const build=new StaticBuildMyAppsPort({now:()=>NOW,source:async()=>({inventory:c.inventory,claim:c.claimFor(),load:c.load,lockSha256:h('a'),binding:c.bind,issuer:c.issuer}),
    delivery:{enabled:true,environment:ENV,servedOrigin:'https://app.invalid',projectSha256:c.binding.projectSha256,sourceSha256:c.binding.sourceSha256,
      priorRevision:async()=>reader.priorRevision(),restorePointId:async()=>reader.restorePointId(),now:()=>new Date('2026-10-30T01:00:00Z'),
      fetcher:async url=>{const r=await hd(new Request(url));return tamper&&new URL(url).pathname==='/app.js'?new Response('tampered'):r;}}});
  const reader=new MyAppsRevisionReader({source:controller.stateSource(),appId:'app-1',ownerId:'owner-q1',projectSha256:c.binding.projectSha256});
  const port=new StaticPublishingMyAppsPort({build,controller,reader,installation:INST,gate:gate??(async cand=>verdictFrom(c,cand.buildArtifactSha256))});
  return {controller,hd,port,reader,root};
}

test('delivery: a re-verified PASS publishes the retained bytes, the served files are observed, and the plan restores absence',async()=>{
  const c=await compose(),d=deliveryFor(c);
  const {buildArtifactSha256}=await d.port.retainBuild(c.candidate);
  assert.equal((await get(d.hd,'/')).status,404,'retention alone serves nothing');
  const observation=await d.port.observe(c.candidate);
  assert.equal(observation.priorRevision.kind,'ABSENT');assert.match(observation.rollbackRestorePointId,/^myapps-absent:/);
  const verdict=verdictFrom(c,buildArtifactSha256);
  assert.equal(acceptDelivery({observation,verdict,projectSha256:c.binding.projectSha256,sourceSha256:c.binding.sourceSha256}).authority,'NONE');
  assert.equal(await text(await get(d.hd,'/app.js')),'console.log("synthetic dashboard")');
  await d.controller.rollback(planRollback(observation,INST));
  assert.equal((await get(d.hd,'/')).status,404);
});

test('delivery refuses without a signed PASS for exactly the retained artifact, and without activation, and publishes nothing',async()=>{
  const c=await compose();
  const fail=deliveryFor(c,{gate:async cand=>({...verdictFrom(c,cand.buildArtifactSha256),outcome:'FAIL'})});
  await fail.port.retainBuild(c.candidate);
  await assert.rejects(fail.port.observe(c.candidate),code('QDEV_PUBLISH_UNVERIFIED'));
  const other=deliveryFor(c,{gate:async()=>verdictFrom(c,'e'.repeat(64))});
  await other.port.retainBuild(c.candidate);
  await assert.rejects(other.port.observe(c.candidate),code('QDEV_PUBLISH_UNVERIFIED'));
  const off=deliveryFor(c,{ctlExtra:{activation:undefined}});
  await off.port.retainBuild(c.candidate);
  await assert.rejects(off.port.observe(c.candidate),code('QDEV_PUBLISH_NOT_AUTHORIZED'));
  for(const d of [fail,other,off])assert.equal((await get(d.hd,'/')).status,404);
  const early=deliveryFor(c);
  await assert.rejects(early.port.observe(c.candidate),e=>e instanceof StaticBuildRefused&&e.code==='QDEV_BUILD_NOT_RETAINED');
});

test('a failed observation restores the prior revision before the error propagates; a failed restore is reported, not hidden',async()=>{
  const c=await compose(),prior=await art(F1,'6');
  const d=deliveryFor(c,{tamper:true});
  await d.controller.publish(prior);
  await d.port.retainBuild(c.candidate);
  await assert.rejects(d.port.observe(c.candidate),e=>e instanceof DeliveryObservationError&&e.code==='QDEV_DELIVERY_SERVED_BYTES_MISMATCH');
  assert.equal(await text(await get(d.hd,'/')),'<html>v1</html>','the prior revision is served again');
  assert.equal((await d.controller.stateSource().read('app-1')).installedDigest,prior.artifactDigest);
  const stuck=deliveryFor(c,{tamper:true,ctlExtra:{activation:{permit:async r=>r.operation==='PUBLISH'}}});
  await stuck.port.retainBuild(c.candidate);
  await assert.rejects(stuck.port.observe(c.candidate),code('QDEV_PUBLISH_ROLLBACK_FAILED'));
});

test('the loopback transport serves the handler and refuses any non-loopback bind',async()=>{
  const root=mkroot(),c=ctl(root);await c.publish(await art(F1));
  const srv=await listenLoopback(c.handler());
  try{
    const ok=await fetch(srv.origin+'/assets/app.js');assert.equal(ok.status,200);assert.equal(await ok.text(),'console.log(1)');
    assert.equal((await fetch(srv.origin+'/nope')).status,404);
  }finally{await srv.close();}
  await assert.rejects(listenLoopback(c.handler(),{host:'0.0.0.0'}),code('QDEV_PUBLISH_NOT_LOOPBACK'));
});

test('publication compare-and-swaps the captured prior: a release committed while the permit is pending refuses the delivery and is never overwritten',async()=>{
  const c=await compose(),prior=await art(F1,'6'),other=await art(F2,'7');
  let gate=null,entered=null;
  const d=deliveryFor(c,{ctlExtra:{activation:{permit:async r=>{if(r.operation==='PUBLISH'&&gate){entered();await gate;}return true;}}}});
  await d.controller.publish(prior);
  await d.port.retainBuild(c.candidate);
  let release;gate=new Promise(r=>{release=r;});const waiting=new Promise(r=>{entered=r;});
  const delivery=d.port.observe(c.candidate);const settled=delivery.then(()=>null,e=>e);
  await waiting;                                   // the port captured prior v1 and its publish is waiting in the activation permit
  const racer=ctl(d.root,{projectSha256:c.binding.projectSha256});await racer.publish(other);   // another permitted publisher installs v2
  release();
  const err=await settled;
  assert.ok(err instanceof StaticPublishRefused&&err.code==='QDEV_PUBLISH_PRIOR_CHANGED',String(err?.code));
  const st=await d.controller.stateSource().read('app-1');
  assert.equal(st.installedDigest,other.artifactDigest);assert.equal(st.installedVersion,2);assert.deepEqual(st.restorableVersions,[1,2],'nothing was installed or restored');
  assert.equal(await text(await get(d.hd,'/')),'<html>v2</html>');
});

test('a captured absence is also compare-and-swapped',async()=>{
  const c=await compose(),other=await art(F2,'7'),d=deliveryFor(c);
  await d.port.retainBuild(c.candidate);
  await d.reader.capture();                         // prior = authenticated absence
  await ctl(d.root,{projectSha256:c.binding.projectSha256}).publish(other);
  await assert.rejects(d.port.observe(c.candidate),code('QDEV_PUBLISH_PRIOR_CHANGED'));
  assert.equal(await text(await get(d.hd,'/')),'<html>v2</html>');
});
