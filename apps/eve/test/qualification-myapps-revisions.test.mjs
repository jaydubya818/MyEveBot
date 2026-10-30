import test from 'node:test';
import assert from 'node:assert/strict';
import {MyAppsRevisionReader,MyAppsRevisionError} from '../lib/qualification/myapps-revisions.ts';
import {deliveryObservationSchema} from '../lib/qualification/delivery.ts';

const D='sha256:'+'c'.repeat(64);
const make=(state)=>{let reads=0;const source={async read(){reads++;return typeof state==='function'?state():state;}};
  return {r:new MyAppsRevisionReader({source,appId:'app-1',ownerId:'owner-q1',projectSha256:'a'.repeat(64)}),reads:()=>reads};};

test('readers refuse before the prior state is captured',async()=>{
  const {r}=make({installedVersion:null,installedDigest:null,restorableVersions:[]});
  await assert.rejects(r.priorRevision(),e=>e instanceof MyAppsRevisionError&&e.code==='QDEV_MYAPPS_PRIOR_NOT_CAPTURED');
  await assert.rejects(r.restorePointId(),MyAppsRevisionError);
});
test('an installed prior revision is reported with its bare digest and a retained restore point',async()=>{
  const {r}=make({installedVersion:3,installedDigest:D,restorableVersions:[2,3]});await r.capture();
  assert.deepEqual(await r.priorRevision(),{kind:'REVISION',id:'app-1@3',sha256:'c'.repeat(64)});
  assert.match(await r.restorePointId(),/^myapps-restore:app-1@3:cccccccccccccccc$/);
});
test('a first installation is an authenticated absence bound to app, owner and project',async()=>{
  const {r}=make({installedVersion:null,installedDigest:null,restorableVersions:[]});await r.capture();
  const p=await r.priorRevision();assert.equal(p.kind,'ABSENT');assert.match(p.authenticationSha256,/^[a-f0-9]{64}$/);
  const other=new MyAppsRevisionReader({source:{read:async()=>({installedVersion:null,installedDigest:null,restorableVersions:[]})},appId:'app-1',ownerId:'owner-q2',projectSha256:'a'.repeat(64)});
  await other.capture();assert.notEqual((await other.priorRevision()).authenticationSha256,p.authenticationSha256);
});
test('the prior state is captured once: a post-delivery state can never be reported as prior',async()=>{
  let state={installedVersion:1,installedDigest:D,restorableVersions:[1]};
  const {r,reads}=make(()=>state);await r.capture();
  state={installedVersion:2,installedDigest:'sha256:'+'d'.repeat(64),restorableVersions:[1,2]};await r.capture();
  assert.equal((await r.priorRevision()).id,'app-1@1');assert.equal(reads(),1);
});
test('inconsistent, malformed or non-restorable state is refused, never invented',async()=>{
  for(const [state,code] of [
    [{installedVersion:2,installedDigest:null,restorableVersions:[2]},'QDEV_MYAPPS_STATE_INCONSISTENT'],
    [{installedVersion:null,installedDigest:D,restorableVersions:[]},'QDEV_MYAPPS_STATE_INCONSISTENT'],
    [{installedVersion:0,installedDigest:D,restorableVersions:[0]},'QDEV_MYAPPS_STATE_INVALID'],
    [{installedVersion:1,installedDigest:'c'.repeat(64),restorableVersions:[1]},'QDEV_MYAPPS_STATE_INVALID'],
    [{installedVersion:2,installedDigest:D,restorableVersions:[1]},'QDEV_MYAPPS_RESTORE_UNAVAILABLE'],
  ]) await assert.rejects(make(state).r.capture(),e=>e.code===code,code);
});
test('the reported values satisfy the delivery observation contract',async()=>{
  const {r}=make({installedVersion:3,installedDigest:D,restorableVersions:[3]});await r.capture();
  const obs={schema:'myeve.qualification-delivery/v1',environment:'myeve-qdev-20261029',projectSha256:'a'.repeat(64),sourceSha256:'b'.repeat(64),candidateCommit:'1'.repeat(40),candidateTree:'2'.repeat(40),servedBytesSha256:'e'.repeat(64),priorRevision:await r.priorRevision(),rollbackRestorePointId:await r.restorePointId(),observedAt:'2026-10-30T00:00:00.000Z'};
  assert.equal(deliveryObservationSchema.safeParse(obs).success,true);
});
