/** /qdev/v1 verifier service handler against the REAL HttpVerifierPort client and the REAL verdict verifier. Synthetic only: injected fetch, no network, no protected criteria or keys. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync} from 'node:crypto';
import {createVerifierHandler,memoryVerifierStore,ed25519Signer} from '../lib/qualification/verifier-service.ts';
import {HttpVerifierPort} from '../lib/qualification/verifier-port.ts';
import {verifyVerdict,VerdictRejected} from '../lib/qualification/verdict.ts';
import {buildVerifierHandoff} from '../lib/qualification/verifier-handoff.ts';
import {qualificationBinding,QDEV_BASELINE} from '../lib/external-alpha/qualification-accounting.ts';
import {syntheticFactory,h} from './qualification-synthetic.mjs';

const fx=syntheticFactory();
const project={...QDEV_BASELINE,operatingProfileSha256:h('1'),factoryVersionSha256:fx.factoryVersion,protectedSpecificationSha256:h('3'),
  sources:{myeve:'a'.repeat(40),factory:'b'.repeat(40),relay:'c'.repeat(40),missioncontrol:'d'.repeat(40)}};
const binding=qualificationBinding(project);
const candidate={commit:'1'.repeat(40),tree:'2'.repeat(40),buildArtifactSha256:h('4')};
const handoff=buildVerifierHandoff({project,binding,candidate});
const CRED='verifier-credential-'+'x'.repeat(24);
const expected={projectSha256:binding.projectSha256,sourceSha256:binding.sourceSha256,protectedSpecificationSha256:project.protectedSpecificationSha256};
const exp2={...expected,candidateCommit:candidate.commit,candidateTree:candidate.tree,buildArtifactSha256:candidate.buildArtifactSha256};
const pair=generateKeyPairSync('ed25519'),pem=pair.privateKey.export({type:'pkcs8',format:'pem'}).toString();
const verifierKey={keyId:'verifier-key-1',publicKeyPem:pair.publicKey.export({type:'spki',format:'pem'}).toString(),activeFrom:'2020-01-01T00:00:00Z',notAfter:'2099-01-01T00:00:00Z'};
const check=signed=>verifyVerdict({signed,verifierKeys:[verifierKey],producerKeyIds:[fx.key.keyId],producerPublicKeysPem:[fx.producerPem],expected:exp2});

function service(over={}){
  const calls=[];
  const config={credentialSha256:[createHash('sha256').update(CRED).digest('hex')],expected,evaluationDeadlineMs:500,store:memoryVerifierStore(),
    signer:ed25519Signer('verifier-key-1',pem),evaluate:async input=>{calls.push(input);return 'PASS';},...over};
  const handler=createVerifierHandler(config);
  const seen=[];
  const fetch=async(url,init)=>{const request=new Request(url,init);const response=await handler(request);seen.push({path:new URL(url).pathname,status:response.status});return response;};
  const port=new HttpVerifierPort({enabled:true,origin:'https://verifier.example',credential:()=>CRED,fetch});
  return {calls,config,handler,port,seen,fetch};
}
const post=(handler,path,body,headers={})=>handler(new Request('https://verifier.example'+path,{method:'POST',headers:{authorization:'Bearer '+CRED,'content-type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)}));

test('round trip with the real client: accepted handoff, one evaluation, signed PASS the journey verifier accepts, identical bytes on retry',async()=>{
  const s=service();
  assert.deepEqual(await s.port.submit(handoff),{known:true,value:{accepted:true,handoffSha256:handoff.handoffSha256}});
  const first=await s.port.fetchVerdict(candidate);
  assert.equal(check(first).outcome,'PASS');
  assert.deepEqual(await s.port.fetchVerdict(candidate),first);
  assert.deepEqual(await s.port.submit(handoff),{known:true,value:{accepted:true,handoffSha256:handoff.handoffSha256}});
  assert.equal(s.calls.length,1,'evaluated once');
  // the evaluator sees digests and candidate identity only
  assert.deepEqual(s.calls[0].candidate,candidate);assert.deepEqual(Object.keys(s.calls[0].handoff).sort(),Object.keys(handoff).sort());
  assert.ok(!JSON.stringify(first).includes('PRIVATE KEY')&&!JSON.stringify(first).includes(CRED));
});

test('concurrent verdict requests for one candidate share exactly one evaluation',async()=>{
  let release;const gate=new Promise(r=>release=r);
  const s=service({evaluate:async input=>{s.calls.push(input);await gate;return 'PASS';}});
  await s.port.submit(handoff);
  const pending=Array.from({length:5},()=>s.port.fetchVerdict(candidate));
  await new Promise(r=>setTimeout(r,20));release();
  const all=await Promise.all(pending);
  assert.equal(s.calls.length,1);assert.ok(all.every(v=>JSON.stringify(v)===JSON.stringify(all[0])));
});

test('authentication: missing, malformed or wrong credentials are refused before anything is read or evaluated',async()=>{
  const s=service();
  for(const authorization of [undefined,'','Bearer','Bearer short','Basic '+CRED,'Bearer '+CRED+'x','bearer '+CRED]){
    const headers={'content-type':'application/json'};if(authorization!==undefined)headers.authorization=authorization;
    const r=await s.handler(new Request('https://verifier.example/qdev/v1/handoff',{method:'POST',headers,body:JSON.stringify(handoff)}));
    assert.equal(r.status,401,String(authorization));
  }
  assert.equal(s.calls.length,0);
  await assert.rejects(new HttpVerifierPort({enabled:true,origin:'https://verifier.example',credential:()=>'wrong-credential-'.padEnd(32,'z'),fetch:s.fetch}).submit(handoff),/POST_SEND_AMBIGUOUS/);
});

test('handoff validation: foreign installation, tampered digest, extra fields, conflicting repeat, bad media type and oversize are refused',async()=>{
  const s=service();
  const foreign=buildVerifierHandoff({project:{...project,protectedSpecificationSha256:h('9')},binding,candidate});
  assert.equal((await post(s.handler,'/qdev/v1/handoff',foreign)).status,403);
  assert.equal((await post(s.handler,'/qdev/v1/handoff',{...handoff,buildArtifactSha256:h('5')})).status,400);
  assert.equal((await post(s.handler,'/qdev/v1/handoff',{...handoff,extra:1})).status,400);
  assert.equal((await post(s.handler,'/qdev/v1/handoff','{')).status,400);
  assert.equal((await post(s.handler,'/qdev/v1/handoff',handoff,{'content-type':'text/plain'})).status,400);
  assert.equal((await post(s.handler,'/qdev/v1/handoff',{...handoff,pad:'x'.repeat(9000)})).status,400);
  const key=candidate.commit+':'+candidate.tree+':'+candidate.buildArtifactSha256;
  await s.config.store.putHandoff(key,h('8'));
  assert.equal((await post(s.handler,'/qdev/v1/handoff',handoff)).status,409);
  assert.equal(s.calls.length,0);
});

test('verdict needs an accepted handoff for exactly that candidate; routes and methods are exact',async()=>{
  const s=service();
  assert.equal((await post(s.handler,'/qdev/v1/verdict',{candidate})).status,409);
  await s.port.submit(handoff);
  assert.equal((await post(s.handler,'/qdev/v1/verdict',{candidate:{...candidate,tree:'3'.repeat(40)}})).status,409);
  assert.equal((await post(s.handler,'/qdev/v1/verdict',{candidate,extra:1})).status,400);
  assert.equal((await post(s.handler,'/qdev/v1/other',{})).status,404);
  assert.equal((await s.handler(new Request('https://verifier.example/qdev/v1/verdict',{method:'GET',headers:{authorization:'Bearer '+CRED}}))).status,405);
  assert.equal(s.calls.length,0);
});

test('outcomes are signed and bound: FAIL, evaluator error and deadline overrun never pass, and each is final',async()=>{
  for(const [name,evaluate,outcome] of [['fail',async()=>'FAIL','FAIL'],['throws',async()=>{throw new Error('boom');},'NOT_RUN'],['hangs',()=>new Promise(()=>{}),'NOT_RUN'],['junk',async()=>'MAYBE','NOT_RUN']]){
    const s=service({evaluate:async i=>{s.calls.push(i);return evaluate(i);},evaluationDeadlineMs:30});
    await s.port.submit(handoff);
    const signed=await s.port.fetchVerdict(candidate);
    assert.equal(signed.verdict.outcome,outcome,name);
    assert.throws(()=>check(signed),e=>e instanceof VerdictRejected&&e.code==='QDEV_VERDICT_'+outcome,name);
    assert.deepEqual(await s.port.fetchVerdict(candidate),signed);assert.equal(s.calls.length,1,name);
  }
});

test('a restart that lost the verdict after the evaluation began yields a signed NOT_RUN and never evaluates again',async()=>{
  const s=service();
  await s.port.submit(handoff);
  await s.config.store.beginEvaluation(candidate.commit+':'+candidate.tree+':'+candidate.buildArtifactSha256);
  const signed=await s.port.fetchVerdict(candidate);
  assert.equal(signed.verdict.outcome,'NOT_RUN');assert.equal(s.calls.length,0);
  assert.throws(()=>check(signed),e=>e.code==='QDEV_VERDICT_NOT_RUN');
});

test('configuration is validated: credential digests, deadline, signer key type',()=>{
  const base=service().config;
  for(const patch of [{credentialSha256:[]},{credentialSha256:['nope']},{evaluationDeadlineMs:0},{evaluationDeadlineMs:700000}])
    assert.throws(()=>createVerifierHandler({...base,...patch}),/QDEV_VERIFIER_/);
  const rsa=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'}).toString();
  assert.throws(()=>ed25519Signer('k',rsa),/QDEV_VERIFIER_SIGNER_KEY/);
});
