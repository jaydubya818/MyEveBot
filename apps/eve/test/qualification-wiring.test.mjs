/** Pure boundary tests for the qdev wiring ports. Synthetic only; no network, provider or database. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {RelayDeveloperTools} from '../lib/qualification/relay-tools.ts';
import {RelayDenied} from '../lib/qualification/relay-grant.ts';
import {bindFactoryDispatch,FactoryDispatchRefused} from '../lib/qualification/factory-dispatch.ts';
import {buildVerifierHandoff} from '../lib/qualification/verifier-handoff.ts';
import {planRollback,RollbackRefused} from '../lib/qualification/rollback.ts';
import {presentJourney} from '../lib/qualification/presentation.ts';
import {JourneyHalted} from '../lib/qualification/journey.ts';
import {qualificationBinding,QDEV_BASELINE} from '../lib/external-alpha/qualification-accounting.ts';
import {syntheticFactory,h} from './qualification-synthetic.mjs';

const grant=(over={})=>({connectionId:'synthetic-connection',repository:QDEV_BASELINE.repository,baseCommit:QDEV_BASELINE.inputCommit,outputBranch:QDEV_BASELINE.outputBranch,
 permissions:{metadata:'read',contents:'write',actions:'read',deployments:'read'},repositoryAdmin:false,workflowEdit:false,productionDeployment:false,...over});
const catalog=[{name:'read_file',kind:'read_contents'},{name:'write_file',kind:'write_contents'},{name:'deploy',kind:'write_deployment'},{name:'edit_ci',kind:'edit_workflow'},{name:'admin',kind:'administer_repository'}];
const transport=()=>{const calls=[];return {calls,discover:async()=>catalog,execute:async(n,a)=>{calls.push([n,a]);return {ok:true};}};};

test('Relay discovery shows only grant-permitted tools; read-only grants hide writes',async()=>{
  const t=transport();
  assert.deepEqual((await new RelayDeveloperTools(grant(),t).discover()).map(x=>x.name),['read_file','write_file']);
  assert.deepEqual((await new RelayDeveloperTools(grant({permissions:{metadata:'read',contents:'read',actions:'read',deployments:'read'}}),t).discover()).map(x=>x.name),['read_file']);
});
test('Relay execution re-authorizes the exact action before the transport is touched',async()=>{
  const t=transport(),r=new RelayDeveloperTools(grant(),t),[read,write]=await r.discover();
  await r.execute(read,{ref:'main'});
  await r.execute(write,{branch:QDEV_BASELINE.outputBranch,path:'src/app.ts'});
  for(const [args,code] of [[{branch:'main',path:'a'},'QDEV_RELAY_BRANCH_DENIED'],[{branch:QDEV_BASELINE.outputBranch,path:'.github/workflows/x.yml'},'QDEV_RELAY_PATH_DENIED'],
    [{branch:QDEV_BASELINE.outputBranch,path:'a',force:true},'QDEV_RELAY_FORCE_DENIED'],[{repository:'other/repo',branch:QDEV_BASELINE.outputBranch,path:'a'},'QDEV_RELAY_FOREIGN_REPOSITORY']])
    await assert.rejects(r.execute(write,args),e=>e instanceof RelayDenied&&e.code===code,code);
  await assert.rejects(r.execute({name:'deploy',kind:'write_deployment'}),RelayDenied);
  await assert.rejects(r.execute({name:'unlisted',kind:'read_contents'}),e=>e.code==='QDEV_RELAY_TOOL_NOT_DISCOVERED');
  assert.equal(t.calls.length,2);
  assert.equal(t.calls[1][1].baseCommit,QDEV_BASELINE.inputCommit);
});
test('Relay rejects a foreign write base and canonical path aliases before transport',async()=>{
  const t=transport(),r=new RelayDeveloperTools(grant(),t),write={name:'write_file',kind:'write_contents'};
  await assert.rejects(r.execute(write,{branch:QDEV_BASELINE.outputBranch,baseCommit:'e'.repeat(40),path:'src/app.ts'}),e=>e.code==='QDEV_RELAY_BASE_DENIED');
  for(const path of ['./.github/workflows/ci.yml','.github/./workflows/ci.yml','.github//workflows/ci.yml','/.github/workflows/ci.yml','src/../.github/workflows/ci.yml','.github\\workflows\\ci.yml','.GitHub/Workflows/ci.yml','.github/ACTIONS/x/action.yml'])
    await assert.rejects(r.execute(write,{branch:QDEV_BASELINE.outputBranch,path}),e=>e.code==='QDEV_RELAY_PATH_DENIED',path);
  assert.equal(t.calls.length,0);
});
test('an over-broad or credential-bearing grant is refused at construction',()=>{
  assert.throws(()=>new RelayDeveloperTools(grant({repositoryAdmin:true}),transport()),RelayDenied);
  assert.throws(()=>new RelayDeveloperTools(grant({connectionId:'bearer abc'}),transport()),RelayDenied);
});

const fx=syntheticFactory();
const project={...QDEV_BASELINE,operatingProfileSha256:h('1'),factoryVersionSha256:fx.factoryVersion,protectedSpecificationSha256:h('3'),sources:{myeve:'a'.repeat(40),factory:'b'.repeat(40),relay:'c'.repeat(40),missioncontrol:'d'.repeat(40)}};
const admitted=(start,over={})=>({workId:randomUUID(),workVersion:1,workGeneration:1,criteriaVersion:1,agentId:'synthetic-agent',factoryId:fx.factoryId,factoryVersion:fx.factoryVersion,
 requestId:'synthetic-request',requestDigest:h('5'),sourceDigest:fx.sourceDigest,configurationDigest:fx.configurationDigest,workOrderId:randomUUID(),runId:randomUUID(),attemptNumber:1,
 inputCommit:start.commit,inputTree:start.tree,localSnapshotVersion:4,configuration:fx.configuration,...over});
test('Factory dispatch binds the approved FactoryVersion and the exact start commit/tree',()=>{
  const b=fx.baseline,pre={commit:'1'.repeat(40),tree:'2'.repeat(40)};
  assert.equal(bindFactoryDispatch({admitted:admitted(b),project,stage:1,start:null,baseline:b}).inputCommit,b.commit);
  assert.equal(bindFactoryDispatch({admitted:admitted(pre),project,stage:2,start:pre}).inputTree,pre.tree);
  const refuse=(input,code)=>assert.throws(()=>bindFactoryDispatch(input),e=>e instanceof FactoryDispatchRefused&&e.code===code,code);
  refuse({admitted:admitted(pre),project,stage:2,start:{commit:'3'.repeat(40),tree:pre.tree}},'QDEV_DISPATCH_START_MISMATCH');
  refuse({admitted:admitted(pre),project,stage:2,start:null},'QDEV_DISPATCH_START_REQUIRED');
  refuse({admitted:admitted(pre),project:{...project,factoryVersionSha256:h('9')},stage:2,start:pre},'QDEV_DISPATCH_FACTORY_VERSION');
  refuse({admitted:admitted(pre,{sourceDigest:h('7')}),project,stage:2,start:pre},'QDEV_DISPATCH_BINDING_INVALID');
  refuse({admitted:admitted(b),project,stage:1,start:null},'QDEV_DISPATCH_START_MISMATCH');
});
test('the verifier handoff carries digests only, bound to the exact candidate',()=>{
  const binding=qualificationBinding(project),c={commit:'4'.repeat(40),tree:'5'.repeat(40),buildArtifactSha256:h('6')};
  const x=buildVerifierHandoff({project,binding,candidate:c});
  assert.equal(x.protectedSpecificationSha256,h('3'));assert.equal(x.candidateCommit,c.commit);
  assert.deepEqual(Object.keys(x).sort(),['buildArtifactSha256','candidateCommit','candidateTree','handoffSha256','projectSha256','protectedSpecificationSha256','schema','sourceSha256']);
  assert.notEqual(buildVerifierHandoff({project,binding,candidate:{...c,tree:'6'.repeat(40)}}).handoffSha256,x.handoffSha256);
});
test('rollback names the exact restore target and refuses an unidentified installation',()=>{
  const obs=prior=>({schema:'myeve.qualification-delivery/v1',environment:'myeve-qdev-20261029',projectSha256:h('1'),sourceSha256:h('2'),candidateCommit:'a'.repeat(40),candidateTree:'b'.repeat(40),servedBytesSha256:h('3'),priorRevision:prior,rollbackRestorePointId:'rp-1',observedAt:'2026-10-29T00:00:00Z'});
  const inst={environment:'myeve-qdev-20261029',installationId:'synthetic-install'};
  assert.equal(planRollback(obs({kind:'REVISION',id:'r1',sha256:h('4')}),inst).kind,'RESTORE_REVISION');
  assert.equal(planRollback(obs({kind:'ABSENT',authenticationSha256:h('5')}),inst).kind,'REMOVE_INSTALLATION');
  assert.throws(()=>planRollback(obs({kind:'ABSENT',authenticationSha256:h('5')}),{environment:'myeve-qdev-20261029',installationId:''}),RollbackRefused);
  assert.throws(()=>planRollback(obs({kind:'ABSENT',authenticationSha256:h('5')}),{environment:'prod',installationId:'x'}),RollbackRefused);
});
test('Sofie presentation never states readiness or leaks raw error text',()=>{
  const p=presentJourney(new JourneyHalted(3,'password=hunter2 failure',[{stage:1,workId:'w',candidate:{commit:'a'.repeat(40),tree:'b'.repeat(40)}}]));
  assert.equal(p.readiness,'NOT_CLAIMED');assert.equal(p.authority,'NONE');assert.equal(p.code,'QDEV_HALTED');assert.equal(p.stages[0].candidate,'a'.repeat(12));
  assert(!JSON.stringify(p).includes('hunter2'));
});
