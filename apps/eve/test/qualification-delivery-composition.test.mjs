/** Composed delivery identity: signed Result -> canonical MyApps retained build + signed build claim -> independent verdict -> actual served-file observer -> acceptDelivery.
 * Synthetic only: invented git objects, ephemeral keys, fake fetcher. No network, provider or spend. */
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

test('the Result metadata digest and the retained static artifact digest are different identities',async()=>{
  const c=await compose();
  assert.notEqual(c.accepted.manifest.artifactDigest,c.retained.artifactDigest);
});
test('positive composition: signed Result + verified build claim + independent verdict + actual served files are accepted',async()=>{
  const c=await compose(),{port,seen}=portFor(c);
  const {buildArtifactSha256}=await port.retainBuild(c.candidate);
  assert.equal('sha256:'+buildArtifactSha256,c.retained.artifactDigest);
  const verdict=verdictFrom(c,buildArtifactSha256);
  const observation=await port.observe(c.candidate);
  assert.deepEqual(seen.sort(),['/app.js','/index.html']);
  assert.equal(observation.servedBytesSha256,buildArtifactSha256);
  assert.equal(acceptDelivery({observation,verdict,projectSha256:c.binding.projectSha256,sourceSha256:c.binding.sourceSha256}).authority,'NONE');
});
test('tampered, missing or unavailable served files are denied; integrity comparisons are not weakened',async()=>{
  const c=await compose();
  const tampered={...files,'dist/app.js':Buffer.from('console.log("tampered")')};
  const a=portFor(c,{served:tampered});await a.port.retainBuild(c.candidate);
  await assert.rejects(a.port.observe(c.candidate),e=>e instanceof DeliveryObservationError&&e.code==='QDEV_DELIVERY_SERVED_BYTES_MISMATCH');
  const b=portFor(c,{served:{'dist/index.html':files['dist/index.html']}});await b.port.retainBuild(c.candidate);
  await assert.rejects(b.port.observe(c.candidate),e=>e.code==='QDEV_DELIVERY_UNAVAILABLE');
  const d=portFor(c,{enabled:false});await d.port.retainBuild(c.candidate);
  await assert.rejects(d.port.observe(c.candidate),e=>e.code==='QDEV_DELIVERY_OBSERVER_DISABLED');
});
test('a verdict over the Result metadata digest (the old identity) cannot accept a delivery of the real build',async()=>{
  const c=await compose(),{port}=portFor(c);
  await port.retainBuild(c.candidate);
  const observation=await port.observe(c.candidate);
  const verdict=verdictFrom(c,c.accepted.manifest.artifactDigest);
  assert.throws(()=>acceptDelivery({observation,verdict,projectSha256:c.binding.projectSha256,sourceSha256:c.binding.sourceSha256}),e=>e.code==='QDEV_DELIVERY_SERVED_BYTES_MISMATCH');
});
test('the build claim must verify before the build identity is released',async()=>{
  const c=await compose();
  const other=generateKeyPairSync('ed25519');
  await assert.rejects(portFor(c,{claim:c.claimFor(c.bind,other.privateKey)}).port.retainBuild(c.candidate),e=>e.code==='APP_BUILD_CLAIM_INVALID');
  await assert.rejects(portFor(c,{claim:c.claimFor({...c.bind,runId:'foreign-run'})}).port.retainBuild(c.candidate),e=>e.code==='APP_BUILD_CLAIM_INVALID');
  await assert.rejects(portFor(c,{issuer:{...c.issuer,revoked:true}}).port.retainBuild(c.candidate),e=>e.code==='APP_BUILD_CLAIM_INVALID');
  await assert.rejects(portFor(c,{load:async p=>Buffer.from('x'+files[p])}).port.retainBuild(c.candidate),e=>e.code==='APP_ARTIFACT_BYTES_MISMATCH');
  await assert.rejects(portFor(c).port.retainBuild({commit:'1'.repeat(40),tree:c.candidate.tree}),e=>e instanceof StaticBuildRefused&&e.code==='QDEV_BUILD_CANDIDATE_MISMATCH');
  const {port}=portFor(c);
  await assert.rejects(port.observe(c.candidate),e=>e instanceof StaticBuildRefused&&e.code==='QDEV_BUILD_NOT_RETAINED');
});
