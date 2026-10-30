/** Pure boundary tests for the qdev runtime contracts. Synthetic keys/objects only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {validateJourneyPlan} from '../lib/qualification/plan.ts';
import {authorizeRelayAction,assertRelayGrant} from '../lib/qualification/relay-grant.ts';
import {consumeStageResult} from '../lib/qualification/result.ts';
import {verifyVerdict} from '../lib/qualification/verdict.ts';
import {acceptDelivery} from '../lib/qualification/delivery.ts';
import {qualificationBinding,QDEV_BASELINE} from '../lib/external-alpha/qualification-accounting.ts';
import {syntheticFactory,syntheticVerifier,verdictFor,h,digest} from './qualification-synthetic.mjs';

const stage=(n,purposes,ceiling=1300000)=>({stage:n,workCeilingMicrousd:ceiling,operations:purposes.map((p,i)=>({key:`s${n}-${i}`,purpose:p,reserveMicrousd:Math.floor(ceiling/purposes.length)}))});
const goodPlan=()=>({slot:'Q1',stages:[stage(1,['SOFIE','CODING']),stage(2,['CODING']),stage(3,['FACTORY']),stage(4,['VERIFIER'])]});

test('a plan that fits the approved bounds is accepted',()=>{assert.equal(validateJourneyPlan(goodPlan()).stages.length,4);});
test('plans that cannot fit are refused before any dispatch',()=>{
 const bad=(mutate,code)=>{const p=goodPlan();mutate(p);assert.throws(()=>validateJourneyPlan(p),e=>code.test(e.code??e.message),String(code));};
 bad(p=>p.slot='Q2',/QDEV_PLAN_INVALID/);
 bad(p=>p.stages[0].workCeilingMicrousd=1300001,/QDEV_PLAN_INVALID/);
 bad(p=>p.stages.push(stage(5,['VERIFIER'])),/QDEV_PLAN_INVALID/);
 bad(p=>p.stages[0].operations[0].reserveMicrousd=1300000,/QDEV_PLAN_WORK_CEILING_EXCEEDED/);
 bad(p=>p.stages[2].operations[0].purpose='CODING',/QDEV_PLAN_PURPOSE_FOR_STAGE/);
 bad(p=>p.stages[1].operations[0].key='s1-0',/QDEV_PLAN_DUPLICATE_OPERATION/);
 bad(p=>p.stages.pop(),/QDEV_PLAN_VERIFIER_STAGE_REQUIRED/);
 bad(p=>[p.stages[0],p.stages[1]]=[p.stages[1],p.stages[0]],/QDEV_PLAN_STAGE_ORDER/);
 bad(p=>p.extra=true,/QDEV_PLAN_INVALID/);
});

const grant=()=>({connectionId:'conn-synthetic',repository:QDEV_BASELINE.repository,baseCommit:QDEV_BASELINE.inputCommit,outputBranch:QDEV_BASELINE.outputBranch,
 permissions:{metadata:'read',contents:'write',actions:'read',deployments:'read'},repositoryAdmin:false,workflowEdit:false,productionDeployment:false});
test('Relay developer grant allows reads and output-branch writes only',()=>{
 const g=grant(),repo=g.repository;
 for(const kind of ['read_metadata','read_contents','read_actions','read_deployments'])assert.equal(authorizeRelayAction(g,{kind,repository:repo}),true);
 assert.equal(authorizeRelayAction(g,{kind:'write_contents',repository:repo,branch:g.outputBranch,baseCommit:g.baseCommit,path:'src/App.tsx'}),true);
 const denied=(action,code,gr=g)=>assert.throws(()=>authorizeRelayAction(gr,action),e=>e.code===code,code);
 denied({kind:'read_contents',repository:'jaydubya818/MyEveBot'},'QDEV_RELAY_FOREIGN_REPOSITORY');
 denied({kind:'write_contents',repository:repo,branch:'main',baseCommit:g.baseCommit,path:'a'},'QDEV_RELAY_BRANCH_DENIED');
 denied({kind:'write_contents',repository:repo,branch:'codex/other',baseCommit:g.baseCommit,path:'a'},'QDEV_RELAY_BRANCH_DENIED');
 denied({kind:'write_contents',repository:repo,branch:g.outputBranch,baseCommit:g.baseCommit,path:'a',force:true},'QDEV_RELAY_FORCE_DENIED');
 denied({kind:'write_contents',repository:repo,branch:g.outputBranch,baseCommit:g.baseCommit,path:'.github/workflows/ci.yml'},'QDEV_RELAY_PATH_DENIED');
 denied({kind:'write_contents',repository:repo,branch:g.outputBranch,baseCommit:g.baseCommit,path:'../x'},'QDEV_RELAY_PATH_DENIED');
 for(const kind of ['write_deployment','edit_workflow','administer_repository'])denied({kind,repository:repo},'QDEV_RELAY_ACTION_DENIED');
 denied({kind:'write_contents',repository:repo,branch:g.outputBranch,baseCommit:g.baseCommit,path:'a'},'QDEV_RELAY_WRITE_NOT_GRANTED',{...g,permissions:{...g.permissions,contents:'read'}});
});
test('over-broad, foreign or credential-bearing grants are refused outright',()=>{
 const bad=(m,code)=>{const g=grant();m(g);assert.throws(()=>assertRelayGrant(g),e=>e.code===code,code);};
 bad(g=>g.repository='jaydubya818/other','QDEV_RELAY_GRANT_SCOPE');
 bad(g=>g.baseCommit='a'.repeat(40),'QDEV_RELAY_GRANT_SCOPE');
 bad(g=>g.outputBranch='main','QDEV_RELAY_GRANT_SCOPE');
 bad(g=>g.repositoryAdmin=true,'QDEV_RELAY_GRANT_TOO_BROAD');
 bad(g=>g.workflowEdit=true,'QDEV_RELAY_GRANT_TOO_BROAD');
 bad(g=>g.productionDeployment=true,'QDEV_RELAY_GRANT_TOO_BROAD');
 bad(g=>g.permissions.deployments='write','QDEV_RELAY_GRANT_TOO_BROAD');
 bad(g=>g.connectionId='ghp_token_value','QDEV_RELAY_GRANT_CREDENTIAL');
});

function chain(){
 const f=syntheticFactory();
 const s1=f.stage(1,f.baseline),s2=f.stage(2,s1.candidate),s3=f.stage(3,s2.candidate);
 const project={...QDEV_BASELINE,operatingProfileSha256:h('1'),factoryVersionSha256:f.factoryVersion,protectedSpecificationSha256:h('3'),
  sources:{myeve:'a'.repeat(40),factory:'b'.repeat(40),relay:'c'.repeat(40),missioncontrol:'d'.repeat(40)}};
 const take=(n,signed,preceding,over={})=>consumeStageResult({signed,keys:[f.key],project,stage:n,precedingCandidate:preceding,expected:f.expectedByStage[n],sourceDigest:f.sourceDigest,baseline:f.baseline,...over});
 return {f,s1,s2,s3,project,take};
}
test('a signed stage chain is accepted only in order and from the preceding accepted candidate',()=>{
 const {s1,s2,s3,take}=chain();
 const a=take(1,s1.signed,null),b=take(2,s2.signed,{commit:a.candidateCommit,tree:a.candidateTree}),c=take(3,s3.signed,{commit:b.candidateCommit,tree:b.candidateTree});
 assert.equal(a.candidateCommit,s1.candidate.commit);assert.equal(c.candidateCommit,s3.candidate.commit);
 assert.throws(()=>take(2,s2.signed,null),e=>e.code==='QDEV_RESULT_PRECEDING_CANDIDATE_REQUIRED');
 // splicing: stage 3 Result presented where stage 2 is expected, or replayed against the wrong predecessor
 assert.throws(()=>take(2,s3.signed,{commit:a.candidateCommit,tree:a.candidateTree}),e=>/QDEV_RESULT_VERIFICATION_FAILED/.test(e.code));
 assert.throws(()=>take(3,s3.signed,{commit:a.candidateCommit,tree:a.candidateTree}),e=>/QDEV_RESULT_VERIFICATION_FAILED/.test(e.code));
 assert.throws(()=>take(1,s2.signed,null),e=>/QDEV_RESULT_VERIFICATION_FAILED/.test(e.code));
});
test('Result consumption rejects wrong Factory identity, revoked/historical keys, tampering and unpassed evidence',()=>{
 const {f,s1,project,take}=chain();
 assert.throws(()=>take(1,s1.signed,null,{project:{...project,factoryVersionSha256:h('9')}}),e=>/QDEV_RESULT_VERIFICATION_FAILED/.test(e.code));
 assert.throws(()=>take(1,s1.signed,null,{sourceDigest:h('8')}),e=>/QDEV_RESULT_VERIFICATION_FAILED/.test(e.code));
 assert.throws(()=>take(1,s1.signed,null,{keys:[{...f.key,revokedAt:'2026-10-26T10:00:00.500Z'}]}),e=>/QDEV_RESULT_VERIFICATION_FAILED/.test(e.code));
 assert.throws(()=>take(1,s1.signed,null,{keys:[{...f.key,notAfter:'2026-10-26T11:00:00Z'}]}),e=>/QDEV_RESULT_VERIFICATION_FAILED/.test(e.code));
 assert.throws(()=>take(1,{...s1.signed,signature:s1.signed.signature.replace(/^./,c=>c==='A'?'B':'A')},null),e=>/QDEV_RESULT_VERIFICATION_FAILED/.test(e.code));
 assert.throws(()=>take(1,{...s1.signed,artifacts:[]},null),e=>/QDEV_RESULT_VERIFICATION_FAILED/.test(e.code));
 assert.throws(()=>take(1,s1.signed,null,{expected:{...f.expectedByStage[1],requestId:'another-request'}}),e=>/QDEV_RESULT_VERIFICATION_FAILED/.test(e.code));
 const failed=f.stage(1,f.baseline,{mutate:m=>{m.status='FAILED';m.candidate=null;m.evidence=[];m.artifacts=[];m.evidenceDigest=digest([]);m.artifactDigest=digest([]);},dropArtifacts:true});
 assert.throws(()=>take(1,failed.signed,null),e=>e.code==='QDEV_RESULT_NOT_COMPLETED');
});

function verification(){
 const c=chain(),v=syntheticVerifier(),pre=r=>({commit:r.candidateCommit,tree:r.candidateTree}),a=c.take(1,c.s1.signed,null),b=c.take(2,c.s2.signed,pre(a)),d=c.take(3,c.s3.signed,pre(b)),bind=qualificationBinding(c.project);
 const expected={projectSha256:bind.projectSha256,sourceSha256:bind.sourceSha256,protectedSpecificationSha256:c.project.protectedSpecificationSha256,candidateCommit:d.candidateCommit,candidateTree:d.candidateTree,buildArtifactSha256:d.manifest.artifactDigest};
 const verdict=over=>verdictFor({...expected,...over});
 const run=(signed,over={})=>verifyVerdict({signed,verifierKeys:[v.key],producerKeyIds:[c.f.key.keyId],producerPublicKeysPem:[c.f.producerPem],expected,...over});
 return {c,v,expected,verdict,run,bind,accepted:d};
}
test('an independent signed PASS verdict bound to the exact candidate is accepted',()=>{
 const {v,verdict,run}=verification();
 assert.equal(run(v.signVerdict(verdict())).outcome,'PASS');
});
test('verdicts that are self-authored, mis-bound, non-PASS, forged or out of window are rejected',()=>{
 const {c,v,verdict,run,expected}=verification();
 const code=(fn,re)=>assert.throws(fn,e=>re.test(e.code),String(re));
 code(()=>run(v.signVerdict(verdict({outcome:'FAIL'}))),/QDEV_VERDICT_FAIL/);
 code(()=>run(v.signVerdict(verdict({outcome:'NOT_RUN'}))),/QDEV_VERDICT_NOT_RUN/);
 for(const field of Object.keys(expected))code(()=>run(v.signVerdict(verdict({[field]:field.endsWith('Commit')||field.endsWith('Tree')?'e'.repeat(40):h('e')}))),new RegExp('BINDING_MISMATCH:'+field));
 code(()=>run({verdict:verdict(),signatureBase64:Buffer.alloc(64).toString('base64')}),/QDEV_VERDICT_SIGNATURE/);
 const signed=v.signVerdict(verdict());
 code(()=>run({...signed,verdict:{...signed.verdict,outcome:'PASS',issuedAt:'2026-10-27T00:00:01.000Z'}}),/QDEV_VERDICT_SIGNATURE/);
 code(()=>run(v.signVerdict(verdict({verifierKeyId:'unknown'}))),/UNKNOWN_VERIFIER_KEY/);
 code(()=>run(signed,{verifierKeys:[{...v.key,revokedAt:'2026-10-26T00:00:00Z'}]}),/KEY_WINDOW/);
 code(()=>run(signed,{now:Date.parse('2026-10-26T00:00:00Z')}),/KEY_WINDOW/);
 // self-authored: producer key id reused as the verifier id, or the producer public key registered as a verifier
 code(()=>run(signed,{producerKeyIds:[v.key.keyId]}),/SELF_AUTHORED/);
 code(()=>run(signed,{producerPublicKeysPem:[v.key.publicKeyPem]}),/SELF_AUTHORED/);
 code(()=>run({verdict:{...verdict(),extra:1},signatureBase64:signed.signatureBase64}),/QDEV_VERDICT_INVALID/);
 void c;
});
test('delivery is accepted only for the verified candidate and exact served bytes with a rollback target',()=>{
 const {v,verdict,run,bind,expected}=verification();
 const pass=run(v.signVerdict(verdict()));
 const obs=over=>({schema:'myeve.qualification-delivery/v1',environment:'myeve-qdev-20261029',projectSha256:bind.projectSha256,sourceSha256:bind.sourceSha256,
  candidateCommit:expected.candidateCommit,candidateTree:expected.candidateTree,servedBytesSha256:expected.buildArtifactSha256,
  priorRevision:{kind:'ABSENT',authenticationSha256:h('7')},rollbackRestorePointId:'restore-synthetic',observedAt:'2026-10-27T00:10:00.000Z',...over});
 const ok=acceptDelivery({observation:obs(),verdict:pass,projectSha256:bind.projectSha256,sourceSha256:bind.sourceSha256});
 assert.equal(ok.authority,'NONE');
 const base={verdict:pass,projectSha256:bind.projectSha256,sourceSha256:bind.sourceSha256};
 const rej=(over,code)=>assert.throws(()=>acceptDelivery({...base,observation:obs(over)}),e=>e.code===code,code);
 rej({servedBytesSha256:h('e')},'QDEV_DELIVERY_SERVED_BYTES_MISMATCH');
 rej({candidateCommit:'e'.repeat(40)},'QDEV_DELIVERY_CANDIDATE_MISMATCH');
 rej({projectSha256:h('e')},'QDEV_DELIVERY_BINDING_MISMATCH');
 rej({rollbackRestorePointId:undefined},'QDEV_DELIVERY_INVALID');
 rej({priorRevision:undefined},'QDEV_DELIVERY_INVALID');
 rej({environment:'production'},'QDEV_DELIVERY_INVALID');
 assert.throws(()=>acceptDelivery({...base,verdict:{...pass,outcome:'FAIL'},observation:obs()}),e=>e.code==='QDEV_DELIVERY_UNVERIFIED');
});

test('the SQL financial admission surface is pinned in the governance inventory with an ENFORCED classification',async()=>{
  const {readFile}=await import('node:fs/promises');const {createHash}=await import('node:crypto');
  const inv=JSON.parse(await readFile(new URL('../scripts/executor-inventory.json',import.meta.url),'utf8')).executors;
  const sql=createHash('sha256').update(await readFile(new URL('../lib/external-alpha/qualification-accounting.sql',import.meta.url))).digest('hex');
  for(const f of ['lib/external-alpha/qualification-accounting.ts','lib/qualification/gate.ts'])assert.equal(inv[f].classification,'ENFORCED',f);
  assert(inv['lib/external-alpha/qualification-accounting.ts'].reason.includes('sqlSha256='+sql),'SQL changed without governance re-pin');
});
