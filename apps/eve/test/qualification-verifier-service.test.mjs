/** /qdev/v1 verifier service against the REAL HttpVerifierPort client, the REAL verdict verifier and real owned child processes. Synthetic only: injected fetch, no network, no protected criteria or keys. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync} from 'node:crypto';
import {createVerifierHandler,memoryVerifierStore,ed25519Signer,EvaluatorNotQuiescent} from '../lib/qualification/verifier-service.ts';
import {processEvaluator} from '../lib/qualification/verifier-runner.ts';
import {HttpVerifierPort} from '../lib/qualification/verifier-port.ts';
import {ProviderNotSent} from '../lib/qualification/gate.ts';
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
const CRED='verifier-credential-'+'x'.repeat(24),RESERVE=650_000;
const KEY=candidate.commit+':'+candidate.tree+':'+candidate.buildArtifactSha256;
const expected={projectSha256:binding.projectSha256,sourceSha256:binding.sourceSha256,protectedSpecificationSha256:project.protectedSpecificationSha256};
const exp2={...expected,candidateCommit:candidate.commit,candidateTree:candidate.tree,buildArtifactSha256:candidate.buildArtifactSha256};
const pair=generateKeyPairSync('ed25519'),pem=pair.privateKey.export({type:'pkcs8',format:'pem'}).toString();
const verifierKey={keyId:'verifier-key-1',publicKeyPem:pair.publicKey.export({type:'spki',format:'pem'}).toString(),activeFrom:'2020-01-01T00:00:00Z',notAfter:'2099-01-01T00:00:00Z'};
const check=signed=>verifyVerdict({signed,verifierKeys:[verifierKey],producerKeyIds:[fx.key.keyId],producerPublicKeysPem:[fx.producerPem],expected:exp2});
const pass={outcome:'PASS',usedMicrousd:0};

function service(over={}){
  const calls=[];
  const evaluator=over.evaluator??{run:async(input,ctx)=>{calls.push({input,ctx});return pass;}};
  const config={credentialSha256:[createHash('sha256').update(CRED).digest('hex')],expected,evaluationDeadlineMs:500,quiescenceGraceMs:50,paid:false,store:memoryVerifierStore(),
    signer:ed25519Signer('verifier-key-1',pem),...over,evaluator};
  const handler=createVerifierHandler(config);
  const fetch=async(url,init)=>handler(new Request(url,init));
  const port=new HttpVerifierPort({enabled:true,origin:'https://verifier.example',credential:()=>CRED,fetch});
  return {calls,config,handler,port,fetch};
}
const post=(handler,path,body,headers={})=>handler(new Request('https://verifier.example'+path,{method:'POST',headers:{authorization:'Bearer '+CRED,'content-type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)}));
const settled=v=>({known:true,value:{accepted:true,handoffSha256:handoff.handoffSha256,settledMicrousd:v}});

test('the evaluation runs INSIDE the charged submit, under the charged cap; the verdict read is pure and identical on retry',async()=>{
  const s=service();
  assert.deepEqual(await s.port.submit(handoff,RESERVE),settled(0));
  assert.equal(s.calls.length,1,'evaluator finished before submit returned');
  assert.equal(s.calls[0].ctx.budgetMicrousd,RESERVE);assert.ok(s.calls[0].ctx.signal instanceof AbortSignal);
  const first=await s.port.fetchVerdict(candidate);
  assert.equal(check(first).outcome,'PASS');
  assert.deepEqual(await s.port.fetchVerdict(candidate),first);
  assert.deepEqual(await s.port.submit(handoff,RESERVE),settled(0));
  assert.equal(s.calls.length,1,'evaluated once, never again');
  assert.deepEqual(s.calls[0].input.candidate,candidate);assert.deepEqual(Object.keys(s.calls[0].input.handoff).sort(),Object.keys(handoff).sort());
  assert.ok(!JSON.stringify(first).includes('PRIVATE KEY')&&!JSON.stringify(first).includes(CRED));
});

test('a verdict read before the charged evaluation is final never starts one',async()=>{
  const s=service();
  assert.equal((await post(s.handler,'/qdev/v1/verdict',{candidate})).status,409);   // no handoff
  await post(s.handler,'/qdev/v1/handoff',handoff);
  const r=await post(s.handler,'/qdev/v1/verdict',{candidate});
  assert.equal(r.status,409);assert.equal((await r.json()).error,'QDEV_VERIFIER_NOT_FINAL');
  await assert.rejects(s.port.fetchVerdict(candidate));
  assert.equal(s.calls.length,0);
});

test('concurrent charged requests for one candidate share exactly one evaluation',async()=>{
  let release;const gate=new Promise(r=>release=r);
  const calls=[];
  const s=service({evaluator:{run:async i=>{calls.push(i);await gate;return pass;}}});
  const pending=Array.from({length:5},()=>s.port.submit(handoff,RESERVE));
  await new Promise(r=>setTimeout(r,30));release();
  const all=await Promise.all(pending);
  assert.equal(calls.length,1);assert.ok(all.every(v=>JSON.stringify(v)===JSON.stringify(settled(0))));
});

test('usage is validated against the charged cap and the declared paid/unpaid mode; anything unusable is unsettled exposure and a signed NOT_RUN',async()=>{
  const cases=[
    ['paid, exactly the cap',{paid:true},{outcome:'PASS',usedMicrousd:RESERVE},true,'PASS',RESERVE],
    ['paid, within the cap',{paid:true},{outcome:'FAIL',usedMicrousd:1234},true,'FAIL',1234],
    ['paid, over the cap',{paid:true},{outcome:'PASS',usedMicrousd:RESERVE+1},false,'NOT_RUN',null],
    ['paid, fractional',{paid:true},{outcome:'PASS',usedMicrousd:1.5},false,'NOT_RUN',null],
    ['paid, negative',{paid:true},{outcome:'PASS',usedMicrousd:-1},false,'NOT_RUN',null],
    ['unpaid, nonzero',{paid:false},{outcome:'PASS',usedMicrousd:1},false,'NOT_RUN',null],
    ['junk outcome',{paid:true},{outcome:'MAYBE',usedMicrousd:0},false,'NOT_RUN',null],
    ['junk result',{paid:true},'PASS',false,'NOT_RUN',null],
  ];
  for(const [name,mode,result,known,outcome,usage] of cases){
    const s=service({...mode,evaluator:{run:async()=>result}});
    const out=await s.port.submit(handoff,RESERVE);
    assert.equal(out.known,known,name);if(known)assert.equal(out.value.settledMicrousd,usage,name);
    const signed=await s.port.fetchVerdict(candidate);
    assert.equal(signed.verdict.outcome,outcome,name);
  }
  // A thrown evaluator: paid spend is unknown (unsettled); an unpaid evaluator cannot have spent anything.
  assert.equal((await service({paid:true,evaluator:{run:async()=>{throw new Error('boom');}}}).port.submit(handoff,RESERVE)).known,false);
  const unpaid=service({paid:false,evaluator:{run:async()=>{throw new Error('boom');}}});
  assert.deepEqual(await unpaid.port.submit(handoff,RESERVE),settled(0));
  assert.equal((await unpaid.port.fetchVerdict(candidate)).verdict.outcome,'NOT_RUN');
});

test('an evaluator that ignores the abort signal is NOT quiescent: the response deadline alone never settles it',async()=>{
  const calls=[];
  const s=service({evaluationDeadlineMs:30,quiescenceGraceMs:30,evaluator:{run:()=>{calls.push(1);return new Promise(()=>{});}}});
  const out=await s.port.submit(handoff,RESERVE);
  assert.equal(out.known,false);
  const signed=await s.port.fetchVerdict(candidate);
  assert.equal(signed.verdict.outcome,'NOT_RUN');assert.throws(()=>check(signed),e=>e instanceof VerdictRejected&&e.code==='QDEV_VERDICT_NOT_RUN');
  assert.equal((await s.port.submit(handoff,RESERVE)).known,false);assert.equal(calls.length,1,'never re-evaluated');
  // an evaluator that reports non-cessation explicitly
  const notQuiescent=service({evaluator:{run:async()=>{throw new EvaluatorNotQuiescent();}}});
  assert.equal((await notQuiescent.port.submit(handoff,RESERVE)).known,false);
});

test('a slow-but-compliant evaluator that ceases within the grace period settles as a signed NOT_RUN with its reported usage',async()=>{
  const s=service({paid:true,evaluationDeadlineMs:30,quiescenceGraceMs:500,evaluator:{run:(i,ctx)=>new Promise(resolve=>ctx.signal.addEventListener('abort',()=>setTimeout(()=>resolve({outcome:'PASS',usedMicrousd:77}),50),{once:true}))}});
  assert.equal((await s.port.submit(handoff,RESERVE)).value.settledMicrousd,77);
  assert.equal((await s.port.fetchVerdict(candidate)).verdict.outcome,'NOT_RUN','a deadline overrun never passes');
});

const alive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};
const inert=`process.on('SIGTERM',()=>{});process.stdin.resume();setInterval(()=>{},1000);`;

test('processEvaluator: a real child that ignores SIGTERM is killed and REAPED before the charged call settles',async()=>{
  let pid;
  const s=service({evaluationDeadlineMs:60,quiescenceGraceMs:2000,evaluator:processEvaluator({command:process.execPath,args:['-e',inert],onSpawn:p=>{pid=p;}})});
  const out=await s.port.submit(handoff,RESERVE);
  assert.ok(pid&&!alive(pid),'child is gone when submit returns');
  assert.deepEqual(out,settled(0));                                  // unpaid evaluator: cessation proven, zero usage
  assert.equal((await s.port.fetchVerdict(candidate)).verdict.outcome,'NOT_RUN');
});

test('processEvaluator: stdin carries only handoff, candidate and budget; stdout is strictly parsed; cleanup failure is non-quiescence',async()=>{
  const echo=`let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const i=JSON.parse(d);const ok=Object.keys(i).sort().join()==='budgetMicrousd,candidate,handoff'&&i.budgetMicrousd===${RESERVE}&&!process.env.SECRET;process.stdout.write(JSON.stringify({outcome:ok?'PASS':'FAIL',usedMicrousd:0}));});`;
  process.env.SECRET='must-not-leak';
  try{
    assert.equal((await service({evaluator:processEvaluator({command:process.execPath,args:['-e',echo]})}).port.submit(handoff,RESERVE)).known,true);
    const s=service({evaluator:processEvaluator({command:process.execPath,args:['-e',echo]})});await s.port.submit(handoff,RESERVE);
    assert.equal(check(await s.port.fetchVerdict(candidate)).outcome,'PASS');
  }finally{delete process.env.SECRET;}
  for(const code of [`process.stdout.write('not json')`,`process.stdout.write(JSON.stringify({outcome:'PASS',usedMicrousd:0,extra:1}))`,`process.exit(3)`]){
    const s=service({paid:true,evaluator:processEvaluator({command:process.execPath,args:['-e',code]})});
    assert.equal((await s.port.submit(handoff,RESERVE)).known,false,code);
  }
  const failedCleanup=service({evaluator:processEvaluator({command:process.execPath,args:['-e',`process.stdout.write(JSON.stringify({outcome:'PASS',usedMicrousd:0}))`],cleanup:async()=>{throw new Error('docker rm failed');}})});
  assert.equal((await failedCleanup.port.submit(handoff,RESERVE)).known,false);
  const flood=service({paid:true,evaluator:processEvaluator({command:process.execPath,args:['-e',`setInterval(()=>process.stdout.write('x'.repeat(4096)),1)`],maxOutputBytes:8192})});
  assert.equal((await flood.port.submit(handoff,RESERVE)).known,false);
});

test('the client refuses to send before it can prove the request is well formed, and settles only on an exact quiescent FINAL',async()=>{
  const s=service();
  for(const reserve of [0,-1,1.5,1_300_001,'650000',undefined])await assert.rejects(s.port.submit(handoff,reserve),e=>e instanceof ProviderNotSent);
  await assert.rejects(s.port.submit({...handoff,candidateTree:'xyz'},RESERVE),e=>e instanceof ProviderNotSent);
  assert.equal(s.calls.length,0);
  const fake=body=>new HttpVerifierPort({enabled:true,origin:'https://verifier.example',credential:()=>CRED,
    fetch:async url=>Response.json(new URL(url).pathname==='/qdev/v1/handoff'?{accepted:true,handoffSha256:handoff.handoffSha256}:body)});
  const good={state:'FINAL',handoffSha256:handoff.handoffSha256,usage:{settledMicrousd:10,quiescent:true}};
  assert.equal((await fake(good).submit(handoff,RESERVE)).known,true);
  for(const bad of [{...good,state:'RUNNING'},{...good,handoffSha256:h('9')},{...good,extra:1},{...good,usage:{settledMicrousd:10,quiescent:false}},{...good,usage:{settledMicrousd:RESERVE+1,quiescent:true}},
    {...good,usage:{settledMicrousd:null,quiescent:true}},{...good,usage:{settledMicrousd:10,quiescent:true,x:1}},{}])
    assert.equal((await fake(bad).submit(handoff,RESERVE)).known,false,JSON.stringify(bad));
  await assert.rejects(new HttpVerifierPort({enabled:true,origin:'https://verifier.example',credential:()=>CRED,fetch:async()=>{throw new Error('reset');}}).submit(handoff,RESERVE),/POST_SEND_AMBIGUOUS/);
});

test('authentication: missing, malformed or wrong credentials are refused before anything is read or evaluated',async()=>{
  const s=service();
  for(const path of ['/qdev/v1/handoff','/qdev/v1/evaluate','/qdev/v1/verdict'])
    for(const authorization of [undefined,'','Bearer','Bearer short','Basic '+CRED,'Bearer '+CRED+'x','bearer '+CRED]){
      const headers={'content-type':'application/json'};if(authorization!==undefined)headers.authorization=authorization;
      const r=await s.handler(new Request('https://verifier.example'+path,{method:'POST',headers,body:JSON.stringify(handoff)}));
      assert.equal(r.status,401,path+String(authorization));
    }
  assert.equal(s.calls.length,0);
  await assert.rejects(new HttpVerifierPort({enabled:true,origin:'https://verifier.example',credential:()=>'wrong-credential-'.padEnd(32,'z'),fetch:s.fetch}).submit(handoff,RESERVE),/POST_SEND_AMBIGUOUS/);
});

test('handoff and evaluate validation: foreign installation, tampered digest, extra fields, conflicts, bad media type, oversize, bad reserve',async()=>{
  const s=service();
  const foreign=buildVerifierHandoff({project:{...project,protectedSpecificationSha256:h('9')},binding,candidate});
  assert.equal((await post(s.handler,'/qdev/v1/handoff',foreign)).status,403);
  assert.equal((await post(s.handler,'/qdev/v1/handoff',{...handoff,buildArtifactSha256:h('5')})).status,400);
  assert.equal((await post(s.handler,'/qdev/v1/handoff',{...handoff,extra:1})).status,400);
  assert.equal((await post(s.handler,'/qdev/v1/handoff','{')).status,400);
  assert.equal((await post(s.handler,'/qdev/v1/handoff',handoff,{'content-type':'text/plain'})).status,400);
  assert.equal((await post(s.handler,'/qdev/v1/handoff',{...handoff,pad:'x'.repeat(9000)})).status,400);
  assert.equal((await post(s.handler,'/qdev/v1/evaluate',{candidate,reserveMicrousd:RESERVE})).status,409);   // no handoff yet
  await s.config.store.putHandoff(KEY,h('8'));
  assert.equal((await post(s.handler,'/qdev/v1/handoff',handoff)).status,409);
  const t=service();await t.port.submit(handoff,RESERVE);
  for(const body of [{candidate},{candidate,reserveMicrousd:0},{candidate,reserveMicrousd:1_300_001},{candidate,reserveMicrousd:1.5},{candidate,reserveMicrousd:RESERVE,extra:1},{candidate:{...candidate,tree:'3'.repeat(40)},reserveMicrousd:RESERVE,x:1}])
    assert.equal((await post(t.handler,'/qdev/v1/evaluate',body)).status,400,JSON.stringify(body));
  assert.equal((await post(t.handler,'/qdev/v1/evaluate',{candidate,reserveMicrousd:RESERVE+1})).status,409,'a different reserve is a conflict, never a second evaluation');
  assert.equal((await post(t.handler,'/qdev/v1/evaluate',{candidate:{...candidate,tree:'3'.repeat(40)},reserveMicrousd:RESERVE})).status,409);
  assert.equal((await post(t.handler,'/qdev/v1/other',{})).status,404);
  assert.equal((await t.handler(new Request('https://verifier.example/qdev/v1/evaluate',{method:'GET',headers:{authorization:'Bearer '+CRED}}))).status,405);
  assert.equal(s.calls.length,0);assert.equal(t.calls.length,1);
});

test('a restart after the evaluation began never evaluates again: in-progress inside the window, signed non-quiescent NOT_RUN after it',async()=>{
  let clock=1_000_000;
  const s=service({now:()=>clock});
  await post(s.handler,'/qdev/v1/handoff',handoff);
  assert.equal(await s.config.store.begin(KEY,RESERVE,clock),true);
  const within=await post(s.handler,'/qdev/v1/evaluate',{candidate,reserveMicrousd:RESERVE});
  assert.equal(within.status,409);assert.equal((await within.json()).error,'QDEV_VERIFIER_IN_PROGRESS');
  clock+=s.config.evaluationDeadlineMs+s.config.quiescenceGraceMs+10_000;
  const after=await post(s.handler,'/qdev/v1/evaluate',{candidate,reserveMicrousd:RESERVE});
  assert.equal(after.status,200);assert.deepEqual((await after.json()).usage,{settledMicrousd:null,quiescent:false});
  assert.equal((await s.port.fetchVerdict(candidate)).verdict.outcome,'NOT_RUN');
  assert.equal((await s.port.submit(handoff,RESERVE)).known,false);
  assert.equal(s.calls.length,0);
});

test('configuration is validated: credential digests, deadline, grace, evaluator, paid declaration, signer key type',()=>{
  const base=service().config;
  for(const patch of [{credentialSha256:[]},{credentialSha256:['nope']},{evaluationDeadlineMs:0},{evaluationDeadlineMs:700000},{quiescenceGraceMs:0},{paid:undefined},{evaluator:{}}])
    assert.throws(()=>createVerifierHandler({...base,...patch}),/QDEV_VERIFIER_/);
  const rsa=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'}).toString();
  assert.throws(()=>ed25519Signer('k',rsa),/QDEV_VERIFIER_SIGNER_KEY/);
});

// ---- Leader close is not group cessation (independent review of 954c01ad) ----
import {readFileSync,rmSync} from 'node:fs';
const pidAlive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};
const directRun=evaluator=>evaluator.run({handoff,candidate},{signal:new AbortController().signal,budgetMicrousd:RESERVE});

test('processEvaluator: a same-group descendant that outlives a normally exiting leader is killed and observed gone before the result settles',async()=>{
  for(const [label,stdio] of [['stdio ignored',"'ignore'"],['inherits stdout',"['ignore','inherit','ignore']"]]){
    const pidfile=`/tmp/qdev-desc-${process.pid}-${Math.random().toString(16).slice(2)}`;
    let leader;
    const code=`const {spawn}=require('node:child_process'),fs=require('node:fs');
      const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:false,stdio:${stdio}});c.unref();
      fs.writeFileSync(process.env.PIDFILE,String(c.pid));
      fs.writeSync(1,JSON.stringify({outcome:'PASS',usedMicrousd:0}));`;
    const result=await directRun(processEvaluator({command:process.execPath,args:['-e',code],env:{PIDFILE:pidfile},onSpawn:p=>{leader=p;}}));
    assert.deepEqual(result,{outcome:'PASS',usedMicrousd:0},label);
    const childPid=Number(readFileSync(pidfile,'utf8'));rmSync(pidfile,{force:true});
    assert.ok(childPid>0&&childPid!==leader,label);
    assert.equal(pidAlive(childPid),false,'the descendant is gone by the time the run settles: '+label);
  }
});

test('processEvaluator: a cleanup that never finishes is non-quiescence within its bound',async()=>{
  const started=Date.now();
  await assert.rejects(directRun(processEvaluator({command:process.execPath,args:['-e',`process.stdout.write(JSON.stringify({outcome:'PASS',usedMicrousd:0}))`],cleanupTimeoutMs:60,cleanup:()=>new Promise(()=>{})})),EvaluatorNotQuiescent);
  assert.ok(Date.now()-started<2000);
});
