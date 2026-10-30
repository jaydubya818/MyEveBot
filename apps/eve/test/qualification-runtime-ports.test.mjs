/** Concrete RuntimePorts composition + verifier transport. Synthetic only: a disposable loopback verifier endpoint, mocked Factory/agent/MyApps; no provider, spend, credential, enrollment or deployment. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {HttpVerifierPort,VerifierPortRefused} from '../lib/qualification/verifier-port.ts';
import {composeRuntimePorts,runtimePortsProvider,RuntimePortsRefused} from '../lib/qualification/runtime-ports.ts';
import {DeepAgentAdapter} from '../lib/qualification/agent-port.ts';
import {LiveFactoryPort} from '../lib/qualification/factory-live-port.ts';
import {StaticBuildMyAppsPort} from '../lib/qualification/static-build.ts';
import {ProviderNotSent} from '../lib/qualification/gate.ts';
import {buildVerifierHandoff} from '../lib/qualification/verifier-handoff.ts';
import {verifyVerdict} from '../lib/qualification/verdict.ts';
import {qualificationBinding,QDEV_BASELINE} from '../lib/external-alpha/qualification-accounting.ts';
import {syntheticFactory,syntheticVerifier,verdictFor,h} from './qualification-synthetic.mjs';

const fx=syntheticFactory(),ver=syntheticVerifier();
const project={...QDEV_BASELINE,operatingProfileSha256:h('1'),factoryVersionSha256:fx.factoryVersion,protectedSpecificationSha256:h('3'),
  sources:{myeve:'a'.repeat(40),factory:'b'.repeat(40),relay:'c'.repeat(40),missioncontrol:'d'.repeat(40)}};
const binding=qualificationBinding(project);
const candidate={commit:'1'.repeat(40),tree:'2'.repeat(40),buildArtifactSha256:h('4')};
const handoff=buildVerifierHandoff({project,binding,candidate});
const CRED='v'.repeat(32);

/** Disposable loopback verifier. `script` decides the response per request; every request is recorded. */
async function endpoint(t,script){
  const seen=[];
  const server=createServer((req,res)=>{let body='';req.on('data',c=>body+=c);req.on('end',()=>{
    seen.push({url:req.url,method:req.method,authorization:req.headers.authorization,body:body?JSON.parse(body):null});
    const r=script(req.url,seen.at(-1));
    if(r.redirect){res.writeHead(302,{location:r.redirect});return res.end();}
    res.writeHead(r.status??200,{'content-type':'application/json'});res.end(JSON.stringify(r.json));});});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(()=>new Promise(r=>{server.close(r);server.closeAllConnections?.();}));
  return {origin:'http://127.0.0.1:'+server.address().port,seen};
}
const port=(origin,over={})=>new HttpVerifierPort({enabled:true,origin,credential:()=>CRED,...over});

test('verifier origin: only https or exact loopback http; paths, userinfo, hostnames and other schemes are refused at construction',()=>{
  for(const o of ['http://localhost:1234','http://127.0.0.2:1234','http://127.0.0.1','http://10.0.0.5:80','http://verifier.example','ftp://x','https://u@v.example','https://v.example/path','not a url',''])
    assert.throws(()=>port(o),e=>e instanceof VerifierPortRefused&&e.code==='QDEV_VERIFIER_ORIGIN',o);
  assert.ok(port('https://verifier.example'));assert.ok(port('http://127.0.0.1:4321'));
});

test('pre-send refusals are ProviderNotSent and contact nothing: disabled, missing/short/whitespace credential, malformed handoff or candidate',async t=>{
  const ep=await endpoint(t,()=>({json:{}}));
  await assert.rejects(port(ep.origin,{enabled:undefined}).submit(handoff),ProviderNotSent);
  for(const credential of [()=>undefined,()=>'short',()=>'x'.repeat(20)+'\n'+'y'.repeat(20),()=>'a b'.repeat(12)])
    await assert.rejects(port(ep.origin,{credential}).submit(handoff),ProviderNotSent);
  await assert.rejects(port(ep.origin).submit({...handoff,schema:'other'}),ProviderNotSent);
  await assert.rejects(port(ep.origin).submit({...handoff,handoffSha256:'zz'}),ProviderNotSent);
  await assert.rejects(port(ep.origin,{enabled:false}).fetchVerdict(candidate),ProviderNotSent);
  await assert.rejects(port(ep.origin).fetchVerdict({...candidate,commit:'nope'}),e=>e instanceof VerifierPortRefused&&e.code==='QDEV_VERIFIER_CANDIDATE');
  assert.equal(ep.seen.length,0);
});

test('submit sends the digest-only handoff once with the runtime credential and accepts only an exact echo of the handoff digest',async t=>{
  const ep=await endpoint(t,()=>({json:{accepted:true,handoffSha256:handoff.handoffSha256}}));
  assert.deepEqual(await port(ep.origin).submit(handoff),{known:true,value:{accepted:true,handoffSha256:handoff.handoffSha256}});
  assert.equal(ep.seen.length,1);
  assert.equal(ep.seen[0].url,'/qdev/v1/handoff');assert.equal(ep.seen[0].method,'POST');assert.equal(ep.seen[0].authorization,'Bearer '+CRED);
  assert.deepEqual(ep.seen[0].body,handoff);
  assert.ok(!JSON.stringify(ep.seen[0].body).includes(CRED));
  assert.deepEqual(Object.keys(ep.seen[0].body).sort(),['buildArtifactSha256','candidateCommit','candidateTree','handoffSha256','projectSha256','protectedSpecificationSha256','schema','sourceSha256']);
});

test('post-send ambiguity: wrong echo is unknown; non-200, redirect and unreachable are errors (never ProviderNotSent, never resent)',async t=>{
  for(const json of [{accepted:true,handoffSha256:h('9')},{accepted:false,handoffSha256:handoff.handoffSha256},{accepted:true,handoffSha256:handoff.handoffSha256,extra:1},{},'x',null]){
    const ep=await endpoint(t,()=>({json}));
    assert.deepEqual(await port(ep.origin).submit(handoff),{known:false},JSON.stringify(json));assert.equal(ep.seen.length,1);
  }
  for(const script of [()=>({status:500,json:{}}),()=>({status:202,json:{}}),()=>({redirect:'http://127.0.0.1:9/elsewhere'})]){
    const ep=await endpoint(t,script);
    await assert.rejects(port(ep.origin).submit(handoff),e=>!(e instanceof ProviderNotSent)&&/QDEV_VERIFIER_POST_SEND_AMBIGUOUS/.test(e.message));
    assert.equal(ep.seen.length,1,'sent once, not retried, redirect not followed');
  }
  await assert.rejects(port('http://127.0.0.1:1').submit(handoff),e=>!(e instanceof ProviderNotSent));
});

test('fetchVerdict returns only a schema-valid signed envelope, and a transport cannot mint a PASS: forged, foreign and mismatched verdicts fail the journey signature check',async t=>{
  const exp={projectSha256:binding.projectSha256,sourceSha256:binding.sourceSha256,protectedSpecificationSha256:project.protectedSpecificationSha256,
    candidateCommit:candidate.commit,candidateTree:candidate.tree,buildArtifactSha256:candidate.buildArtifactSha256};
  const good=ver.signVerdict(verdictFor(exp));
  const check=signed=>verifyVerdict({signed,verifierKeys:[ver.key],producerKeyIds:[fx.key.keyId],producerPublicKeysPem:[fx.producerPem],expected:exp,now:Date.parse('2026-10-30T12:00:00Z')});
  const ep=await endpoint(t,()=>({json:good}));
  const got=await port(ep.origin).fetchVerdict(candidate);
  assert.equal(ep.seen[0].url,'/qdev/v1/verdict');assert.deepEqual(ep.seen[0].body,{candidate});assert.equal(ep.seen[0].authorization,'Bearer '+CRED);
  assert.equal(check(got).outcome,'PASS');
  for(const json of [{verdict:good.verdict},{...good,extra:1},{verdict:{...good.verdict,outcome:'MAYBE'},signatureBase64:good.signatureBase64},{verdict:good.verdict,signatureBase64:'not base64!'},null]){
    const bad=await endpoint(t,()=>({json}));
    await assert.rejects(port(bad.origin).fetchVerdict(candidate),e=>e instanceof VerifierPortRefused||e.name==='ZodError',JSON.stringify(json)?.slice(0,60));
  }
  assert.throws(()=>check({...good,signatureBase64:Buffer.alloc(64,1).toString('base64')}));
  assert.throws(()=>check(ver.signVerdict(verdictFor({...exp,candidateCommit:'9'.repeat(40)}))));
});

// ---- composition ---------------------------------------------------------------------------------------------------------------------

const qkey=async()=>{const p=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);return {keyId:'original-receiver',jwk:await crypto.subtle.exportKey('jwk',p.privateKey)};};
const local={origin:'http://127.0.0.1:12345',token:'c'.repeat(64),factoryId:fx.factoryId,sourceDigest:fx.sourceDigest,configurationDigest:fx.configurationDigest,factoryVersion:fx.factoryVersion,repositoryPath:'/synthetic',keys:[fx.key],
  qualification:{scopeId:'synthetic-owner',profileHash:'e'.repeat(64),evidenceRef:'pending',qualifiedAt:'2026-01-01T00:00:00Z',expiresAt:'2099-01-01T00:00:00Z',mode:'LOCAL_FIXTURE',spendEnforced:false}};
const fbinding={ownerId:'synthetic-owner',organizationId:'org',installationId:'install',agentId:'agent',clientId:'client',backendId:'backend',incarnation:'epoch',enrollmentVersion:1,missionId:'mission',
  factoryId:local.factoryId,factoryVersion:local.factoryVersion,sourceDigest:local.sourceDigest,configurationDigest:local.configurationDigest};
async function custody(over={}){
  const fetches=[];
  const noNetwork=async u=>{fetches.push(String(u));throw Error('NETWORK_MUST_NOT_RUN');};
  return {fetches,custody:{
    agent:{slot:'Q1',port:{available:()=>true,start:async()=>({handle:'h'}),record:async()=>null}},
    factory:{connection:local,capability:{origin:local.origin,binding:fbinding,key:await qkey(),headers:async()=>({}),sourcePermit:async()=>{throw Error('UNEXPECTED_ISSUANCE')},relayPermit:async()=>{throw Error('UNEXPECTED_ISSUANCE')}},
      retained:async()=>{throw Error('RETAINED_NOT_NEEDED_HERE')},factoryFetch:noNetwork,capabilityFetch:noNetwork},
    verifier:{origin:'http://127.0.0.1:4321',credentialName:'QDEV_VERIFIER_CREDENTIAL',keys:[ver.key],producerKeyIds:[fx.key.keyId],producerPublicKeysPem:[fx.producerPem]},
    myapps:{source:async()=>{throw Error('NOT_USED')},delivery:{}},
    expectedFor:n=>fx.expectedByStage[n],resultKeys:[fx.key],sourceDigest:fx.sourceDigest,newAllowanceId:n=>'allowance-'+n,...over}};
}
const bundle={version:1,ownerId:'owner-q1',notAfter:'2099-01-01T00:00:00.000Z',project};
const ctx=(env={QDEV_VERIFIER_CREDENTIAL:CRED})=>({bundle,relay:{},credential:name=>env[name]});

test('composeRuntimePorts assembles the existing adapters bound to this owner/project/source and performs no I/O',async()=>{
  const {custody:c,fetches}=await custody();
  const ports=composeRuntimePorts(ctx(),c);
  assert.ok(ports.agent instanceof DeepAgentAdapter&&ports.factory instanceof LiveFactoryPort&&ports.myapps instanceof StaticBuildMyAppsPort&&ports.verifier instanceof HttpVerifierPort);
  assert.deepEqual(ports.verifierKeys,[ver.key]);assert.deepEqual(ports.producerKeyIds,[fx.key.keyId]);
  assert.equal(ports.sourceDigest,fx.sourceDigest);assert.equal(ports.newAllowanceId(2),'allowance-2');
  const ok={ownerId:'owner-q1',purpose:'CODING',projectSha256:binding.projectSha256,sourceSha256:binding.sourceSha256};
  assert.doesNotThrow(()=>ports.agent.admit(ok));
  for(const patch of [{ownerId:'owner-q2'},{projectSha256:h('7')},{sourceSha256:h('7')}]) assert.throws(()=>ports.agent.admit({...ok,...patch}));
  assert.deepEqual(fetches,[]);
});

test('composition fails closed: bad credential name, overlapping or duplicate verifier keys, insecure verifier origin',async()=>{
  const cases=[c=>({verifier:{...c.verifier,credentialName:'lowercase'}}),c=>({verifier:{...c.verifier,producerKeyIds:[ver.key.keyId]}}),
    c=>({verifier:{...c.verifier,keys:[ver.key,ver.key]}}),c=>({verifier:{...c.verifier,origin:'http://verifier.example'}})];
  for(const mutate of cases){const {custody:c}=await custody();assert.throws(()=>composeRuntimePorts(ctx(),{...c,...mutate(c)}));}
  const {custody:c}=await custody();
  assert.throws(()=>composeRuntimePorts(ctx(),{...c,verifier:{...c.verifier,credentialName:'lowercase'}}),e=>e instanceof RuntimePortsRefused);
});

test('the ports provider stays disabled (null) without custody, with refused custody or a throwing custody source; the credential is read only through the runtime accessor',async()=>{
  assert.equal(await runtimePortsProvider(()=>null)(ctx()),null);
  const {custody:c}=await custody();
  assert.equal(await runtimePortsProvider(()=>({...c,verifier:{...c.verifier,credentialName:'x'}}))(ctx()),null);
  assert.equal(await runtimePortsProvider(()=>{throw Error('custody exploded');})(ctx()),null);
  const ports=await runtimePortsProvider(()=>c)(ctx({}));
  assert.ok(ports,'composes with the credential absent: the verifier then refuses pre-send');
  await assert.rejects(ports.verifier.submit(handoff),ProviderNotSent);
});
