/** DJR-02 regression: durable release state, owner approvals, authenticated absence and rollback targets are bound to the installation identity
 * (environment + installationId). Adapted from the independent reviewer's probe (review-installation-rebinding.test.mjs, assertions kept) with the
 * same-installation controls. Synthetic keys, private temp directories, no network, no deployment, no tester installation. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,chmodSync,readdirSync,existsSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {StaticArtifactCandidate} from '../../../packages/myapps/src/static-artifact.ts';
import {StaticReleaseController,StaticPublishRefused} from '../lib/qualification/static-publish.ts';
import {MyAppsRevisionReader} from '../lib/qualification/myapps-revisions.ts';
import {planRollback} from '../lib/qualification/rollback.ts';
import {fileActivation,FileActivationPermits,signActivationApproval} from '../lib/qualification/static-activation.ts';
import {h} from './qualification-synthetic.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const PROJECT=h('9'),ENV='myeve-qdev-20261029',A={environment:ENV,installationId:'inst-1'},B={environment:ENV,installationId:'foreign-installation'};
const dirs=[];
// Temp directories honor MYEVE_TEST_TMPDIR (then TMPDIR) so the suite runs in sandboxes where the default temp location is read-only.
const TMP=process.env.MYEVE_TEST_TMPDIR||tmpdir();mkdirSync(TMP,{recursive:true});
const mk=()=>{const d=mkdtempSync(join(TMP,'qdev-instbind-'));chmodSync(d,0o700);dirs.push(d);return d;};
test.after(()=>{for(const d of dirs){try{execFileSync('chmod',['-R','u+w',d]);rmSync(d,{recursive:true,force:true});}catch{}}});
const art=async(map,seed='1')=>{const commit=seed.repeat(40),tree=seed.repeat(40);
  const inv={schema:'myeve.dashboard.build-inventory/v1',scope:'BROWSER_BUILD_ONLY',sourceCommit:commit,sourceTree:tree,lockSha256:h('a'),node:'v24.0.0',
    files:Object.entries(map).map(([path,b])=>({path,bytes:b.length,sha256:sha(b)})),independentVerification:'NOT_ESTABLISHED',signedResult:false,releaseQualified:false};
  return StaticArtifactCandidate.retain(inv,{sourceCommit:commit,sourceTree:tree,lockSha256:h('a')},async p=>{if(!map[p])throw new Error('x');return map[p];});};
const F1={'dist/index.html':Buffer.from('<html>v1</html>'),'dist/assets/app.js':Buffer.from('console.log(1)')};
const ctl=(root,installation=A,extra={})=>new StaticReleaseController({root,environment:installation.environment,appId:'app-1',ownerId:'owner-q1',projectSha256:PROJECT,installationId:installation.installationId,activation:{permit:async()=>true},...extra});
const reader=(source,installation)=>new MyAppsRevisionReader({source,appId:'app-1',ownerId:'owner-q1',projectSha256:PROJECT,installation});
const absent={read:async()=>({installedVersion:null,installedDigest:null,restorableVersions:[]})};
const absencePlan=async installation=>{const r=reader(absent,installation);await r.capture();
  return planRollback({environment:ENV,priorRevision:await r.priorRevision(),rollbackRestorePointId:await r.restorePointId()},installation);};
const signer=generateKeyPairSync('ed25519');
const keys=[{keyId:'synthetic-owner-approval',publicKeyPem:signer.publicKey.export({type:'spki',format:'pem'}).toString(),activeFrom:'2020-01-01T00:00:00.000Z',notAfter:'2099-01-01T00:00:00.000Z'}];
const pem=signer.privateKey.export({type:'pkcs8',format:'pem'}).toString();
const approvalsDir=()=>{const d=mk();mkdirSync(join(d,'approvals'),{mode:0o700});return d;};
const approvalFor=(plan,installation,over={})=>({schema:'myeve.qdev-activation-approval/v1',operation:'ROLLBACK',appId:'app-1',ownerId:'owner-q1',projectSha256:PROJECT,
  environment:installation.environment,installationId:installation.installationId,digest:'sha256:'+plan.absenceAuthenticationSha256,keyId:keys[0].keyId,
  notBefore:new Date(Date.now()-1000).toISOString(),notAfter:new Date(Date.now()+60000).toISOString(),nonce:'synthetic-installation-boundary-nonce',...over});
const place=(dir,approval,name='owner.json')=>writeFileSync(join(dir,'approvals',name),signActivationApproval(approval,pem),{mode:0o600});
const consumed=dir=>existsSync(join(dir,'consumed'))?readdirSync(join(dir,'consumed')).length:0;
const permits=(dir,installation)=>fileActivation({dir,keys,ownerId:'owner-q1',appId:'app-1',projectSha256:PROJECT,environment:installation.environment,installationId:installation.installationId});

test('DJR-02 counterexample: a controller for another installation cannot remove the existing installation, even with a fully valid approval naming it',async()=>{
  const root=mk(),a=ctl(root);
  const published=await a.publish(await art(F1,'1'));assert.equal(published.version,1);
  const dir=approvalsDir(),b=ctl(root,B,{activation:permits(dir,B)});
  // the original (A) rollback plan is still refused by the direct installation check (historical control)
  const planB=await absencePlan(B);
  await assert.rejects(b.rollback({...planB,installation:A}),e=>e instanceof StaticPublishRefused&&e.code==='QDEV_PUBLISH_INSTALLATION_IDENTITY');
  // the reviewer's counterexample, strengthened: B's own absence plan AND an owner approval naming B (valid signature, window and nonce)
  place(dir,approvalFor(planB,B));
  let accepted=false,error;
  try{await b.rollback(planB);accepted=true;}catch(e){error=e.code;}
  assert.equal(accepted,false,'a controller for another installation must not mutate the existing installation state');
  assert.equal(error,'QDEV_PUBLISH_INSTALLATION_IDENTITY');
  assert.equal(consumed(dir),0,'the approval is not consumed: the refusal precedes the permit');
  assert.deepEqual(await a.stateSource().read('app-1'),{installedVersion:1,installedDigest:published.digest,restorableVersions:[1]},'A is untouched');
  // every other entry point of the foreign controller refuses on the persisted identity too
  await assert.rejects(b.publish(await art({'dist/index.html':Buffer.from('<html>b</html>')},'2')),e=>e.code==='QDEV_PUBLISH_INSTALLATION_IDENTITY');
  await assert.rejects(b.stateSource().read('app-1'),e=>e.code==='QDEV_PUBLISH_INSTALLATION_IDENTITY');
  assert.equal((await b.handler()(new Request('https://app.invalid/'))).status,500,'serving fails closed');
  assert.equal(consumed(dir),0);
  assert.equal((await a.stateSource().read('app-1')).installedVersion,1);
});

test('DJR-02 control: the same installation reconstructed over the same root rolls back with its own approval, consuming exactly one',async()=>{
  const root=mk(),a=ctl(root);await a.publish(await art(F1,'1'));
  const dir=approvalsDir(),again=ctl(root,A,{activation:permits(dir,A)});
  const plan=await absencePlan(A);place(dir,approvalFor(plan,A));
  const out=await again.rollback(plan);
  assert.deepEqual({installed:out.installed,changed:out.changed},{installed:null,changed:true});
  assert.equal(consumed(dir),1);
  assert.equal((await again.stateSource().read('app-1')).installedVersion,null);
});

test('DJR-02 control: same-installation restore-revision rollback still works and an installed state survives reconstruction',async()=>{
  const root=mk(),a=ctl(root);const v1=await a.publish(await art(F1,'1'));
  const r=reader(a.stateSource(),A);await r.capture();
  await a.publish(await art({'dist/index.html':Buffer.from('<html>v2</html>')},'2'));
  const plan=planRollback({environment:ENV,priorRevision:await r.priorRevision(),rollbackRestorePointId:await r.restorePointId()},A);
  const out=await ctl(root,A).rollback(plan);
  assert.equal(out.installed,v1.version);
});

test('DJR-02: the authenticated absence names the installation, so one installation\'s absence is not another\'s',async()=>{
  const pa=await absencePlan(A),pb=await absencePlan(B);
  assert.notEqual(pa.absenceAuthenticationSha256,pb.absenceAuthenticationSha256);
  assert.notEqual(pa.restorePointId,pb.restorePointId);
  // a plan for B carrying A's absence digest is refused by a B controller over a fresh root
  const b=ctl(mk(),B);
  await assert.rejects(b.rollback({...pb,absenceAuthenticationSha256:pa.absenceAuthenticationSha256,restorePointId:pa.restorePointId}),e=>e.code==='QDEV_PUBLISH_ROLLBACK_TARGET');
  assert.throws(()=>reader(absent,{environment:ENV,installationId:''}),e=>e.code==='QDEV_MYAPPS_INSTALLATION_IDENTITY');
});

test('DJR-02: an owner approval must name the installation it authorizes',async()=>{
  const plan=await absencePlan(A);
  const request={operation:'ROLLBACK',appId:'app-1',ownerId:'owner-q1',projectSha256:PROJECT,environment:ENV,installationId:'inst-1',digest:'sha256:'+plan.absenceAuthenticationSha256};
  const stale=approvalFor(plan,A);delete stale.installationId;delete stale.environment;               // a pre-binding approval carries no installation
  for(const [name,approval,perm] of [
    ['approval naming another installation',approvalFor(plan,B),permits],
    ['approval without an installation',stale,permits],
    ['approval naming another environment',approvalFor(plan,A,{environment:'other-environment'}),permits]]){
    const dir=approvalsDir();place(dir,approval);
    assert.equal(await perm(dir,A).permit(request),false,name);
    assert.equal(consumed(dir),0,name);
  }
  const ok=approvalsDir();place(ok,approvalFor(plan,A));
  assert.equal(await permits(ok,A).permit({...request,installationId:'foreign-installation'}),false,'a request for another installation is refused');
  assert.equal(await permits(ok,A).permit(request),true);assert.equal(await permits(ok,A).permit(request),false,'single use');
  assert.throws(()=>new FileActivationPermits({dir:ok,keys,ownerId:'owner-q1',appId:'app-1',projectSha256:PROJECT}),/QDEV_ACTIVATION_CONFIG/);
});

const publishApproval=(artifact,installation,nonce)=>({schema:'myeve.qdev-activation-approval/v1',operation:'PUBLISH',appId:'app-1',ownerId:'owner-q1',projectSha256:PROJECT,
  environment:installation.environment,installationId:installation.installationId,digest:'sha256:'+artifact.artifactDigest.replace(/^sha256:/,''),keyId:keys[0].keyId,
  notBefore:new Date(Date.now()-1000).toISOString(),notAfter:new Date(Date.now()+60000).toISOString(),nonce});

test('DJR-02 round 2: concurrent publishers for two installations over one empty root - the loser consumes no approval and writes no release',async()=>{
  const root=mk(),artA=await art(F1,'1'),artB=await art({'dist/index.html':Buffer.from('<html>b</html>')},'2');
  const dirA=approvalsDir(),dirB=approvalsDir();
  place(dirA,publishApproval(artA,A,'synthetic-installation-claim-A-nonce'));place(dirB,publishApproval(artB,B,'synthetic-installation-claim-B-nonce'));
  const a=ctl(root,A,{activation:permits(dirA,A)}),b=ctl(root,B,{activation:permits(dirB,B)});
  const [ra,rb]=await Promise.allSettled([a.publish(artA),b.publish(artB)]);   // both pass the state read before either awaits its permit
  assert.equal(ra.status,'fulfilled');
  assert.equal(rb.status,'rejected');assert.equal(rb.reason.code,'QDEV_PUBLISH_INSTALLATION_IDENTITY');
  assert.equal(consumed(dirA),1);assert.equal(consumed(dirB),0,'the losing installation consumed no approval');
  assert.deepEqual(readdirSync(join(root,'releases')),[artA.artifactDigest.replace(/^sha256:/,'')],'the loser wrote no release');
  assert.deepEqual(await a.stateSource().read('app-1'),{installedVersion:1,installedDigest:'sha256:'+artA.artifactDigest.replace(/^sha256:/,''),restorableVersions:[1]});
  // the claim is durable: the other installation stays refused (read, serve, publish) and the unconsumed approval is still not usable
  await assert.rejects(b.stateSource().read('app-1'),e=>e.code==='QDEV_PUBLISH_INSTALLATION_IDENTITY');
  await assert.rejects(b.publish(artB),e=>e.code==='QDEV_PUBLISH_INSTALLATION_IDENTITY');assert.equal(consumed(dirB),0);
  // same-installation controllers share the claim (restart / second process)
  const again=ctl(root,A,{activation:{permit:async()=>true}});assert.equal((await again.publish(artA)).changed,false);
});

test('DJR-02 round 2: a root claimed by an AUTHORIZED publish that left no state still refuses another installation, and a concurrent same-installation claim is not an error',async()=>{
  const root=mk(),art1=await art(F1,'1');
  await assert.rejects(ctl(root,A).publish(art1,{expectedPrior:{version:7,digest:'f'.repeat(64)}}),e=>e.code==='QDEV_PUBLISH_PRIOR_CHANGED');   // permitted, claimed, no state committed
  assert.equal(existsSync(join(root,'identity.json')),true);assert.deepEqual(readdirSync(join(root,'states')),[]);
  await assert.rejects(ctl(root,B).publish(art1),e=>e.code==='QDEV_PUBLISH_INSTALLATION_IDENTITY');
  const two=await Promise.all([ctl(root,A).publish(art1),ctl(root,A).publish(art1)]);
  assert.equal(two.filter(x=>x.changed).length,1);
});

const claimFiles=root=>({identity:existsSync(join(root,'identity.json')),pending:existsSync(join(root,'identity.pending'))});
const noClaim={identity:false,pending:false};
const restorePlan=(installation,over={})=>({kind:'RESTORE_REVISION',installation,revisionId:'app-1@3',revisionSha256:'a'.repeat(64),restorePointId:'myapps-restore:app-1@3:'+'a'.repeat(16),...over});

test('DJR-02 round 3 #3: an UNAUTHORIZED first publish by installation B leaves no claim, and the approved publish by installation A then succeeds',async()=>{
  const root=mk(),artA=await art(F1,'1'),artB=await art({'dist/index.html':Buffer.from('<html>b</html>')},'2');
  const dirA=approvalsDir(),dirB=approvalsDir();                                  // B has NO approval; A has one
  place(dirA,publishApproval(artA,A,'synthetic-unauthorized-claim-A-nonce'));
  const b=ctl(root,B,{activation:permits(dirB,B)}),a=ctl(root,A,{activation:permits(dirA,A)});
  await assert.rejects(b.publish(artB),e=>e.code==='QDEV_PUBLISH_NOT_AUTHORIZED');
  assert.deepEqual(claimFiles(root),noClaim,'the refused request committed no installation identity');
  assert.deepEqual(readdirSync(join(root,'states')),[]);assert.equal(consumed(dirB),0);
  // a permit seam that throws (host failure) is refused the same way
  await assert.rejects(ctl(root,B,{activation:{permit:async()=>{throw new Error('host down');}}}).publish(artB),/host down/);
  assert.deepEqual(claimFiles(root),noClaim);
  const published=await a.publish(artA);assert.equal(published.version,1);assert.equal(consumed(dirA),1);
  assert.deepEqual(claimFiles(root),{identity:true,pending:false},'A owns the root permanently; no provisional claim is left');
  await assert.rejects(b.publish(artB),e=>e.code==='QDEV_PUBLISH_INSTALLATION_IDENTITY');   // B stays refused afterwards, with its approval (none) untouched
});

test('DJR-02 round 3 #3: an invalid or unauthorized ROLLBACK by installation B over an empty root leaves no claim and does not block the approved publish by A',async()=>{
  const root=mk(),artA=await art(F1,'1');
  const dirA=approvalsDir(),dirB=approvalsDir();
  place(dirA,publishApproval(artA,A,'synthetic-rollback-claim-A-nonce'));
  const a=ctl(root,A,{activation:permits(dirA,A)});
  const planB=await absencePlan(B);place(dirB,approvalFor(planB,B));                 // a fully valid approval for B's absence rollback
  const b=ctl(root,B,{activation:permits(dirB,B)});
  // invalid restore targets (nothing was ever published), a wrong absence digest, and a valid absence rollback of an empty installation
  await assert.rejects(b.rollback(restorePlan(B)),e=>e.code==='QDEV_PUBLISH_ROLLBACK_TARGET');
  await assert.rejects(b.rollback({...planB,absenceAuthenticationSha256:'b'.repeat(64)}),e=>e.code==='QDEV_PUBLISH_ROLLBACK_TARGET');
  assert.deepEqual(claimFiles(root),noClaim);assert.equal(consumed(dirB),0,'a rejected target consumes no approval');
  const noop=await b.rollback(planB);assert.deepEqual({installed:noop.installed,changed:noop.changed},{installed:null,changed:false});
  assert.deepEqual(claimFiles(root),noClaim,'rolling back an installation that has no state claims nothing');
  assert.equal((await a.publish(artA)).version,1);assert.equal(consumed(dirA),1);
  assert.deepEqual(claimFiles(root),{identity:true,pending:false});
});

test('DJR-02 round 3 #3: an invalid restore target is refused BEFORE the approval, for the owning installation too',async()=>{
  const root=mk(),a=ctl(root);await a.publish(await art(F1,'1'));
  let calls=0;const spy=ctl(root,A,{activation:{permit:async()=>{calls++;return true;}}});
  await assert.rejects(spy.rollback(restorePlan(A)),e=>e.code==='QDEV_PUBLISH_ROLLBACK_TARGET');       // version 3 does not exist
  await assert.rejects(spy.rollback(restorePlan(A,{revisionId:'app-1@1',restorePointId:'myapps-restore:app-1@1:'+'0'.repeat(16)})),e=>e.code==='QDEV_PUBLISH_ROLLBACK_TARGET');
  assert.equal(calls,0,'the permit is never asked for an invalid target');
});

test('DJR-02 round 3 #3: the provisional claim excludes a concurrent other installation (it consumes no approval) and is released when the first request is refused',async()=>{
  const root=mk(),artA=await art(F1,'1'),artB=await art({'dist/index.html':Buffer.from('<html>b</html>')},'2');
  const dirB=approvalsDir();place(dirB,publishApproval(artB,B,'synthetic-provisional-claim-B-nonce'));
  let release;const gate=new Promise(r=>{release=r;});let entered;const inside=new Promise(r=>{entered=r;});
  const a=ctl(root,A,{activation:{permit:async()=>{entered();await gate;return false;}}}),b=ctl(root,B,{activation:permits(dirB,B)});
  const pendingA=a.publish(artA);                                                    // A holds the provisional claim while its permit is pending
  await inside;
  assert.deepEqual(claimFiles(root),{identity:false,pending:true});
  await assert.rejects(b.publish(artB),e=>e.code==='QDEV_PUBLISH_INSTALLATION_IDENTITY');assert.equal(consumed(dirB),0,'B lost the claim before consuming its approval');
  assert.deepEqual(readdirSync(join(root,'releases')),[]);
  release();await assert.rejects(pendingA,e=>e.code==='QDEV_PUBLISH_NOT_AUTHORIZED');
  assert.deepEqual(claimFiles(root),noClaim,'A was refused: its provisional claim is gone');
  assert.equal((await b.publish(artB)).version,1);assert.equal(consumed(dirB),1);    // B, authorized, now owns the root
  assert.deepEqual(claimFiles(root),{identity:true,pending:false});
});

test('DJR-02 round 2: a schema-v1 (pre-installation) release root is rejected before any approval is consumed or any release is written, for every installation',async()=>{
  const root=mk();ctl(root);                                                  // creates releases/ and states/
  const v1={schema:'myeve.qdev-static-release-state/v1',appId:'app-1',ownerId:'owner-q1',projectSha256:PROJECT,seq:1,installed:null,versions:[],events:[]};
  writeFileSync(join(root,'states','0000000001.json'),JSON.stringify(v1),{mode:0o444});
  const artifact=await art(F1,'1');
  for(const installation of [A,B]){
    const dir=approvalsDir();place(dir,publishApproval(artifact,installation,'synthetic-v1-root-nonce-'+installation.installationId));
    let calls=0;
    const spy=ctl(root,installation,{activation:{permit:async()=>{calls++;return true;}}}),real=ctl(root,installation,{activation:permits(dir,installation)});
    await assert.rejects(spy.publish(artifact),e=>e.code==='QDEV_PUBLISH_STATE_INVALID');assert.equal(calls,0,'the permit is never asked');
    await assert.rejects(real.publish(artifact),e=>e.code==='QDEV_PUBLISH_STATE_INVALID');assert.equal(consumed(dir),0);
    await assert.rejects(real.rollback(await absencePlan(installation)),e=>e.code==='QDEV_PUBLISH_STATE_INVALID');assert.equal(consumed(dir),0);
    await assert.rejects(real.stateSource().read('app-1'),e=>e.code==='QDEV_PUBLISH_STATE_INVALID');
  }
  assert.deepEqual(readdirSync(join(root,'releases')),[],'no release was written');
  assert.equal(existsSync(join(root,'identity.json')),false,'the root was not claimed');
});
