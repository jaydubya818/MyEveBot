/** Scoped single-use owner activation approvals + serving-only loopback launch over the real StaticReleaseController. Synthetic; loopback only; no network egress, deployment or public exposure. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,randomBytes} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,symlinkSync,chmodSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {FileActivationPermits,signActivationApproval} from '../lib/qualification/static-activation.ts';
import {StaticReleaseController,StaticPublishRefused} from '../lib/qualification/static-publish.ts';
import {launchStaticServing} from '../lib/qualification/static-serving.ts';
import {qualificationBinding,QDEV_BASELINE} from '../lib/external-alpha/qualification-accounting.ts';
import {StaticArtifactCandidate} from '../../../packages/myapps/src/static-artifact.ts';
import {h} from './qualification-synthetic.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const project={...QDEV_BASELINE,operatingProfileSha256:h('1'),factoryVersionSha256:h('2'),protectedSpecificationSha256:h('3'),sources:{myeve:'a'.repeat(40),factory:'b'.repeat(40),relay:'c'.repeat(40),missioncontrol:'d'.repeat(40)}};
const PROJECT=qualificationBinding(project).projectSha256,OWNER='owner-1',APP='app-1',INSTALL='install-1';
const owner=generateKeyPairSync('ed25519'),other=generateKeyPairSync('ed25519');
const pem=k=>k.export({type:'pkcs8',format:'pem'}),pub=k=>k.export({type:'spki',format:'pem'});
const key=(keyId='owner-approver',pair=owner,over={})=>({keyId,publicKeyPem:pub(pair.publicKey),activeFrom:'2026-01-01T00:00:00.000Z',notAfter:'2100-01-01T00:00:00.000Z',...over});
const NOW=Date.parse('2026-10-30T20:00:00Z');
const approval=(over={})=>({schema:'myeve.qdev-activation-approval/v1',operation:'PUBLISH',appId:APP,ownerId:OWNER,projectSha256:PROJECT,digest:'sha256:'+'a'.repeat(64),keyId:'owner-approver',
  notBefore:'2026-10-30T19:00:00.000Z',notAfter:'2026-10-30T21:00:00.000Z',nonce:randomBytes(12).toString('hex'),...over});
const request=(over={})=>({operation:'PUBLISH',appId:APP,ownerId:OWNER,projectSha256:PROJECT,digest:'sha256:'+'a'.repeat(64),...over});
function dir(){const d=mkdtempSync(join(tmpdir(),'qdev-act-'));chmodSync(d,0o700);mkdirSync(join(d,'approvals'),{mode:0o700});return d;}
const place=(d,name,text,mode=0o600)=>{const p=join(d,'approvals',name);writeFileSync(p,text,{mode});chmodSync(p,mode);return p;};
const permits=(d,over={})=>new FileActivationPermits({dir:d,keys:[key()],ownerId:OWNER,appId:APP,projectSha256:PROJECT,now:()=>NOW,...over});

test('no approval, an empty directory or an unsafe directory never authorizes',async()=>{
  const d=dir();
  assert.equal(await permits(d).permit(request()),false);
  place(d,'a.json',signActivationApproval(approval(),pem(owner.privateKey)));
  chmodSync(join(d,'approvals'),0o770);
  assert.equal(await permits(d).permit(request()),false,'a group-writable approvals directory is refused');
  chmodSync(join(d,'approvals'),0o700);chmodSync(d,0o755);
  assert.equal(await permits(d).permit(request()),false,'a non-private root is refused');
  assert.equal(await permits(mkdtempSync(join(tmpdir(),'qdev-act-missing-'))).permit(request()),false);
});

test('a scoped approval authorizes exactly its operation, app, owner, project, digest and version, once',async()=>{
  const d=dir();
  place(d,'publish.json',signActivationApproval(approval(),pem(owner.privateKey)));
  for(const wrong of [{operation:'ROLLBACK'},{appId:'other'},{ownerId:'other'},{projectSha256:'f'.repeat(64)},{digest:'sha256:'+'b'.repeat(64)},{version:1}])
    assert.equal(await permits(d).permit(request(wrong)),false,JSON.stringify(wrong));
  const p=permits(d);
  assert.deepEqual(await Promise.all([p.permit(request()),p.permit(request())]).then(r=>r.sort()),[false,true],'concurrent callers cannot both consume it');
  assert.equal(await permits(d).permit(request()),false,'consumed in a later process too');
  assert.equal(readdirSync(join(d,'consumed')).length,1);
  const r=dir();
  place(r,'rollback.json',signActivationApproval(approval({operation:'ROLLBACK',version:2}),pem(owner.privateKey)));
  assert.equal(await permits(r).permit(request({operation:'ROLLBACK'})),false,'a rollback needs the exact version');
  assert.equal(await permits(r).permit(request({operation:'ROLLBACK',version:1})),false);
  assert.equal(await permits(r).permit(request({operation:'ROLLBACK',version:2})),true);
});

test('validity window, key and signature checks: expired, not yet valid, over-long, unknown/other/revoked key, tampered or non-canonical approvals are refused',async()=>{
  const cases=[
    ['expired',signActivationApproval(approval({notAfter:'2026-10-30T19:59:59.000Z'}),pem(owner.privateKey))],
    ['not yet valid',signActivationApproval(approval({notBefore:'2026-10-30T20:00:01.000Z',notAfter:'2026-10-30T21:00:00.000Z'}),pem(owner.privateKey))],
    ['over 24h',signActivationApproval(approval({notBefore:'2026-10-29T00:00:00.000Z',notAfter:'2026-10-30T21:00:00.000Z'}),pem(owner.privateKey))],
    ['signed by another key',signActivationApproval(approval(),pem(other.privateKey))],
    ['unknown key id',signActivationApproval(approval({keyId:'unknown'}),pem(owner.privateKey))],
    ['short nonce',signActivationApproval(approval({nonce:'x'}),pem(owner.privateKey))],
    ['tampered payload',signActivationApproval(approval(),pem(owner.privateKey)).replace('"app-1"','"app-2"')],
    ['non-canonical bytes',JSON.stringify(JSON.parse(signActivationApproval(approval(),pem(owner.privateKey))),null,1)],
    ['garbage','{'],
  ];
  for(const [label,text] of cases){const d=dir();place(d,'a.json',text);assert.equal(await permits(d).permit(request()),false,label);}
  const d=dir();place(d,'a.json',signActivationApproval(approval(),pem(owner.privateKey)));
  assert.equal(await permits(d,{keys:[key('owner-approver',owner,{revokedAt:'2026-10-30T19:30:00.000Z'})]}).permit(request()),false,'revoked key');
  assert.equal(await permits(d,{keys:[key('owner-approver',owner,{notAfter:'2026-10-30T19:30:00.000Z'})]}).permit(request()),false,'key window ended');
  assert.equal(await permits(d,{keys:[key('owner-approver',other)]}).permit(request()),false,'a different pinned public key');
  assert.throws(()=>permits(d,{keys:[]}),/QDEV_ACTIVATION_CONFIG/);
  assert.throws(()=>permits(d,{keys:[{...key(),publicKeyPem:pub(generateKeyPairSync('ec',{namedCurve:'P-256'}).publicKey)}]}),/QDEV_ACTIVATION_KEY/);
});

test('unsafe approval files are ignored: symlinks, group/world-writable and oversized',async()=>{
  const text=signActivationApproval(approval(),pem(owner.privateKey));
  const d=dir();const real=join(tmpdir(),'qdev-act-real-'+randomBytes(4).toString('hex')+'.json');writeFileSync(real,text,{mode:0o600});
  symlinkSync(real,join(d,'approvals','link.json'));assert.equal(await permits(d).permit(request()),false,'symlink');
  const w=dir();place(w,'w.json',text,0o666);assert.equal(await permits(w).permit(request()),false,'writable');
  const big=dir();place(big,'b.json',text+' '.repeat(9000));assert.equal(await permits(big).permit(request()),false,'oversized');
});

async function retainedCandidate(){
  const files={'dist/index.html':Buffer.from('<!doctype html><title>qdev</title>'),'dist/app.js':Buffer.from('console.log(1)')};
  const inventory={schema:'myeve.dashboard.build-inventory/v1',scope:'BROWSER_BUILD_ONLY',sourceCommit:'1'.repeat(40),sourceTree:'2'.repeat(40),lockSha256:h('a'),node:'v24.0.0',
    files:Object.entries(files).map(([path,b])=>({path,bytes:b.length,sha256:sha(b)})),independentVerification:'NOT_ESTABLISHED',signedResult:false,releaseQualified:false};
  return StaticArtifactCandidate.retain(inventory,{sourceCommit:'1'.repeat(40),sourceTree:'2'.repeat(40),lockSha256:h('a')},async p=>files[p]);
}

test('the real controller publishes only with a matching owner approval; the serving-only loopback launch serves the verified installed release and can never mutate',async()=>{
  const root=join(mkdtempSync(join(tmpdir(),'qdev-serve-')),'releases'),act=dir();
  const config=a=>({root,environment:'myeve-qdev-20261029',appId:APP,ownerId:OWNER,projectSha256:PROJECT,installationId:INSTALL,...(a?{activation:a}:{})});
  const artifact=await retainedCandidate(),digest='sha256:'+artifact.artifactDigest.replace(/^sha256:/,'');
  // no activation configured -> refuses; activation configured but no approval -> refuses
  await assert.rejects(new StaticReleaseController(config()).publish(artifact),{code:'QDEV_PUBLISH_NOT_AUTHORIZED'});
  const controller=new StaticReleaseController(config({permit:permits(act).permit}));
  await assert.rejects(controller.publish(artifact),{code:'QDEV_PUBLISH_NOT_AUTHORIZED'});
  const bundle={ownerId:OWNER,project,notAfter:'2099-01-01T00:00:00.000Z',assembly:{publishing:{root,installationId:INSTALL},build:{appId:APP}}};
  const serving=await launchStaticServing(bundle);
  try{
    assert.match(serving.origin,/^http:\/\/127\.0\.0\.1:\d+$/);
    assert.equal((await fetch(serving.origin+'/')).status,404,'nothing installed yet');
    // an approval for a different digest does not authorize this release
    place(act,'wrong.json',signActivationApproval(approval({digest:'sha256:'+'c'.repeat(64)}),pem(owner.privateKey)));
    await assert.rejects(controller.publish(artifact),{code:'QDEV_PUBLISH_NOT_AUTHORIZED'});
    place(act,'ok.json',signActivationApproval(approval({digest}),pem(owner.privateKey)));
    const published=await controller.publish(artifact);
    assert.equal(published.version,1);
    const page=await fetch(serving.origin+'/');
    assert.equal(page.status,200);assert.match(await page.text(),/qdev/);
    assert.equal((await fetch(serving.origin+'/app.js')).headers.get('x-content-type-options'),'nosniff');
    assert.equal((await fetch(serving.origin+'/',{method:'POST'})).status,405);
    // the approval is consumed: it cannot authorize anything again
    await assert.rejects(new StaticReleaseController(config({permit:permits(act).permit})).publish(artifact),{code:'QDEV_PUBLISH_NOT_AUTHORIZED'});
    assert.equal(readdirSync(join(act,'consumed')).length,1);
  }finally{await serving.close();}
});

test('serving launch: no assembly profile or an expired bundle starts nothing; only exact IPv4 loopback is accepted',async()=>{
  const root=join(mkdtempSync(join(tmpdir(),'qdev-serve2-')),'releases');
  const bundle={ownerId:OWNER,project,notAfter:'2099-01-01T00:00:00.000Z',assembly:{publishing:{root,installationId:INSTALL},build:{appId:APP}}};
  assert.equal(await launchStaticServing({...bundle,assembly:undefined}),null);
  assert.equal(await launchStaticServing({...bundle,notAfter:'2020-01-01T00:00:00.000Z'}),null);
  await assert.rejects(launchStaticServing(bundle,{host:'0.0.0.0'}),{code:'QDEV_PUBLISH_NOT_LOOPBACK'});
});
