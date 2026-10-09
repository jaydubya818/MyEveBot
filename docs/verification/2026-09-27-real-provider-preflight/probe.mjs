// Non-paid release-gate counterexamples against the exact producer pin. Exit 0 means
// the observations reproduced, NOT that the real-provider release gates passed.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtempSync, rmSync, readFileSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const source = resolve(process.env.MYFACTORY_SOURCE_ROOT ?? '/private/tmp/q37-producer-spend-inspection');
const pin = '8f5e3774129b5f9f4b1c9655ffbbb531cd20fa0f';
assert.equal(execFileSync('git',['-C',source,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),pin);
assert.equal(execFileSync('git',['-C',source,'status','--porcelain'],{encoding:'utf8'}).trim(),'');
const load = path => import(pathToFileURL(join(source,path)).href);
const {openStorage} = await load('packages/storage/src/index.ts');
const {SpendLedger} = await load('packages/storage/src/spend.ts');
const {SpendGateway} = await load('apps/supervisor/src/spend-gateway.ts');
const v7 = readFileSync(join(source,'packages/storage/src/index.ts'),'utf8').match(/`(CREATE TABLE work_spend_budgets [\s\S]*?)`/)[1];
const checksum = createHash('sha256').update(v7).digest('hex');
assert.equal(checksum,'208fd0facca9f2535c30e558bf261243efd3ababd3113697e34dbefdf8f1598e');
const cleanup = [];
async function scenario(name, ceiling, usage, exercise) {
  const dir = mkdtempSync(join(tmpdir(),'q37-provider-probe-'));
  const path = join(dir,'factory.sqlite');
  const storage = openStorage(path);
  const order = storage.createWorkOrder({title:name,description:'Non-paid counterexample',kind:'feature',repositoryPath:dir,
    baseRef:'a'.repeat(40),acceptanceCriteria:['No external effects'],reproductionCommand:null,expectedFailureText:null,
    checkCommands:[],allowedPaths:['quantity.mjs'],workerProfile:'mac'});
  const run = storage.createRun({workOrderId:order.id,workerProfile:'mac',inputCommit:'a'.repeat(40),workspacePath:dir});
  let ledger = new SpendLedger(path);
  const binding = {workId:name,workGeneration:1,dispatchIdentity:'probe-dispatch',requestId:'probe-request',workOrderId:order.id,
    factoryVersion:'probe-only-not-a-qualified-FactoryVersion',runId:run.id};
  ledger.createBudget(binding,ceiling,new Date(Date.now()+60_000).toISOString());
  let calls=0;
  const upstream=createServer((req,res)=>{calls++;req.resume();res.writeHead(200,{'content-type':'application/json','x-request-id':`${name}-${calls}`});
    res.end(JSON.stringify({id:`response-${calls}`,status:'completed',...(usage?{usage}: {})}));});
  await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
  const gateway = new SpendGateway({ledger,binding,price:{revision:'synthetic-v1',model:'fixture-model',validUntil:new Date(Date.now()+60_000).toISOString(),
    contextLimitTokens:1000,outputLimitTokens:100,inputMicrousdPerMillion:1_000_000,outputMicrousdPerMillion:2_000_000},
    upstreamOrigin:`http://127.0.0.1:${upstream.address().port}`,upstreamApiKey:'synthetic-not-a-credential',childToken:'synthetic-child-only'});
  const base=await gateway.listen();
  const call=async()=>{const response=await fetch(base+'/responses',{method:'POST',headers:{authorization:'Bearer synthetic-child-only','content-type':'application/json'},body:JSON.stringify({model:'fixture-model',input:'probe'})});await response.text();return response.status;};
  try {
    const result=await exercise({ledger,binding,call,calls:()=>calls});
    const before=ledger.read(name), beforeCalls=calls;
    ledger.cancel(name);assert.equal(await call(),503);assert.equal(calls,beforeCalls);
    const retained=before.retainedMicrousd;
    await gateway.close();await new Promise(r=>upstream.close(r));
    ledger.close();ledger=new SpendLedger(path);ledger.recoverUnknown();
    assert.equal(ledger.read(name).retainedMicrousd,retained);
    assert.equal(ledger.read(name).cancelled,true);
    cleanup.push({scenario:name,postCancelCalls:0,retainedExposurePreserved:true,loopbackServersClosed:true});
    return result;
  } finally {
    if(upstream.listening){await gateway.close();await new Promise(r=>upstream.close(r));}
    ledger.close();storage.close();rmSync(dir,{recursive:true,force:true});assert.equal(existsSync(dir),false);
  }
}
const unknown = await scenario('unknown-with-headroom',4000,null,async f=>{
  assert.equal(await f.call(),503);assert.equal(f.ledger.read(f.binding.workId).status,'UNKNOWN');
  assert.equal(await f.call(),503);assert.equal(f.calls(),2);
  return {status:'BLOCKED',syntheticCallsAfterUnknown:1,retainedMicrousd:f.ledger.read(f.binding.workId).retainedMicrousd};
});
const completion = await scenario('completion-starvation',3600,{input_tokens:1000,output_tokens:100},async f=>{
  for(let i=0;i<3;i++)assert.equal(await f.call(),200);
  assert.equal(await f.call(),503);assert.equal(f.calls(),3);
  return {status:'BLOCKED',earlierCallsAdmitted:3,mandatoryCompletionDenied:true,availableMicrousd:f.ledger.read(f.binding.workId).availableMicrousd};
});
const maxOperations = await scenario('operation-limit',3600,{input_tokens:10,output_tokens:10},async f=>{
  for(let i=0;i<4;i++)assert.equal(await f.call(),200);
  return {status:'BLOCKED',proposedMaxOperations:3,observedSyntheticOperations:f.calls(),operationsBeyondProposedLimit:1};
});
const heldCompletion = await scenario('preheld-completion',2400,{input_tokens:1000,output_tokens:100},async f=>{
  f.ledger.reserve({...f.binding,operationId:'mandatory-completion',model:'fixture-model',pricingRevision:'synthetic-v1',reservedMicrousd:1200});
  assert.equal(await f.call(),200);assert.equal(await f.call(),503);assert.equal(f.calls(),1);
  return {status:'BLOCKED',completionReservationPreserved:true,gatewayCannotConsumePreheldOperation:true};
});
console.log(JSON.stringify({producer:pin,sqliteV7:checksum,qualification:'BLOCKED',paidProviderCalls:0,unknown,completion,maxOperations,heldCompletion,cleanup,
  cleanupStatus:'PASS_LOCAL_PROBE',scope:'Gateway/ledger counterexamples only; not a complete live-envelope dry run'},null,2));
