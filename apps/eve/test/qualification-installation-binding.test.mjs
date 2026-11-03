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
const mk=()=>{const d=mkdtempSync(join(tmpdir(),'qdev-instbind-'));chmodSync(d,0o700);dirs.push(d);return d;};
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
