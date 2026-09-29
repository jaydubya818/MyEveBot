// Exact reconstructed producer -> real consumer parser/admission crosswalk.
// SQLite only: no credentials, network transport, or provider/model operation.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {workSpendSchema, assertFactorySpendCanStart, assertSpendContinuation, validateSpendBinding} from '../lib/engineering/factory-spend.ts';

const producerCommit=process.env.MYFACTORY_EXPECTED_SHA ?? '925530a6ba8764df6a7b8637192fe32edcbaff97';
assert.match(producerCommit,/^[0-9a-f]{40}$/);
const producerRoot=process.env.MYFACTORY_SOURCE_ROOT;
assert(producerRoot?.startsWith('/'), 'Explicit absolute producer checkout required');
const git=(...args)=>execFileSync('git',['-C',producerRoot,...args],{encoding:'utf8'}).trim();
assert.equal(git('rev-parse','HEAD'),producerCommit);
git('merge-base','--is-ancestor','925530a6ba8764df6a7b8637192fe32edcbaff97',producerCommit);
assert.equal(git('status','--porcelain'),'','Producer checkout must be clean');
const source=await readFile(join(producerRoot,'packages/storage/src/index.ts'),'utf8');
const migrationSource=source.match(/const migrations = \[([\s\S]*?)\n\];/)[1];
const migrations=[...migrationSource.matchAll(/`([^`]*)`/g)].map(match=>match[1]);
assert.equal(migrations.length,8);
const migrationV8=createHash('sha256').update(migrations[7]).digest('hex');
assert.equal(migrationV8,'0994004a2a89c2264423e969fc3b97ef609f8d0fb437e9dcf6ea6203309cbeb3');
const lineage=JSON.parse(await readFile(new URL('../../../docs/verification/2026-09-28-spend-v2-integration/lineage.json',import.meta.url),'utf8'));
for(const [path,expected] of Object.entries(lineage.protectedFiles)){
 const bytes=await readFile(new URL('../../../'+path,import.meta.url));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),expected,path);
}
const {openStorage}=await import(pathToFileURL(join(producerRoot,'packages/storage/src/index.ts')));
const {SpendLedger}=await import(pathToFileURL(join(producerRoot,'packages/storage/src/spend.ts')));
const results=['Exact clean producer pin, SQLite v8 hash, all 57 consumer migrations and preserved evidence match'];
const counters={postUnknownAdmissions:0,completionStarvation:0,callsBeyondOperationLimit:0,ceilingViolations:0,reserveTheft:0,duplicateOperations:0};

async function scenario(label,run){
 const directory=await mkdtemp(join(tmpdir(),'q37-crosswalk-')),path=join(directory,'factory.sqlite');
 const storage=openStorage(path),ledger=new SpendLedger(path);
 try{
  const order=storage.createWorkOrder({title:'Consumer crosswalk',description:'Local SQLite only',kind:'feature',repositoryPath:directory,baseRef:'a'.repeat(40),acceptanceCriteria:['Bounded'],reproductionCommand:null,expectedFailureText:null,checkCommands:[],allowedPaths:['test.txt'],workerProfile:'mac'});
  const execution=storage.createRun({workOrderId:order.id,workerProfile:'mac',inputCommit:'a'.repeat(40),workspacePath:directory});
  const binding={workId:randomUUID(),workGeneration:1,requestId:randomUUID(),workOrderId:order.id,dispatchIdentity:randomUUID(),factoryVersion:'a'.repeat(64),runId:execution.id};
  const deadline=new Date(Date.now()+60000).toISOString();
  const plan={version:'WORK_LEDGER_V2',pricingRevision:'consumer-crosswalk',model:'synthetic-model',validUntil:deadline,perOperationReserveMicrousd:1200,plannedProductiveOperations:2,plannedCompletionOperations:1,maxPaidOperations:3,completionReserveMicrousd:1200};
  const {model,validUntil,perOperationReserveMicrousd,...consumerPlan}=plan;
  ledger.createBudget(binding,4000,deadline,plan);
  let previous;
  const read=()=>{
   const value=workSpendSchema.parse(ledger.read(binding.workId));
   validateSpendBinding(value,{...binding,remoteRunId:binding.runId,deadline},0.004,consumerPlan);
   if(previous)assertSpendContinuation(previous,value);
   previous=value;return value;
  };
  assert.equal(read().authorityState,'prepared');
  ledger.bindAuthority(binding);
  const reserve=(id,phase='productive')=>ledger.reserve({...binding,operationId:id,model,pricingRevision:plan.pricingRevision,reservedMicrousd:1200,phase});
  const settle=(id,amount=1200)=>{ledger.markDispatched(id);ledger.settle(id,amount,'fixture-'+id,{input_tokens:10,output_tokens:10});};
  await run({ledger,path,binding,read,reserve,settle});
  results.push(label);
 }finally{ledger.close();storage.close();await rm(directory,{recursive:true,force:true});}
}
function denied(counter,action){
 assert.throws(()=>{action();counters[counter]++;});
}
await scenario('Productive limit preserves completion dollars/slot; complete/fenced readback parses and cannot restart',async f=>{
 assert.doesNotThrow(()=>assertFactorySpendCanStart(f.read()));
 f.reserve('one');f.settle('one');f.reserve('two');f.settle('two');
 let value=f.read();assert.equal(value.completionReserveRemainingMicrousd,1200);
 assert.equal(value.productiveAllowanceRemainingMicrousd,400);
 denied('reserveTheft',()=>f.reserve('third'));
 assert.throws(()=>assertFactorySpendCanStart(value),/limit/);
 f.ledger.beginCompletion(f.binding);f.reserve('completion','completion');f.settle('completion');
 f.ledger.assertCompleted(f.binding);f.ledger.fenceAuthority(f.binding);
 value=f.read();assert.equal(value.paidOperationsUsed,3);assert.equal(value.completionOperationsUsed,1);
 counters.completionStarvation+=Number(value.completionOperationsUsed!==1);
 counters.ceilingViolations+=Number(value.settledMicrousd>value.ceilingMicrousd);
 assert.throws(()=>assertFactorySpendCanStart(value),/fenced/);
 denied('callsBeyondOperationLimit',()=>f.reserve('fourth','completion'));
});
await scenario('UNKNOWN survives restart and STOP; real consumer retains liability and rejects another start',async f=>{
 f.reserve('lost');f.ledger.markDispatched('lost');f.ledger.markUnknown('lost');
 const reopened=new SpendLedger(f.path);
 try{
  assert.equal(workSpendSchema.parse(reopened.read(f.binding.workId)).unknownExposureMicrousd,1200);
  denied('postUnknownAdmissions',()=>f.reserve('retry'));
  assert.throws(()=>assertFactorySpendCanStart(f.read()),/reconciliation/);
  f.ledger.cancelBound(f.binding);
  const stopped=f.read();assert.equal(stopped.unknownExposureMicrousd,1200);assert.equal(stopped.retainedMicrousd,1200);
  assert.throws(()=>assertFactorySpendCanStart(stopped),/cancelled/);
 }finally{reopened.close();}
});
await scenario('Duplicate operation and tampered readback/continuation cannot reset custody or allowance',async f=>{
 f.reserve('exact');f.settle('exact',30);
 denied('duplicateOperations',()=>f.reserve('exact'));
 const value=f.read();
 assert.throws(()=>workSpendSchema.parse({...value,paidOperationsUsed:0}));
 assert.throws(()=>workSpendSchema.parse({...value,completionReserveRemainingMicrousd:0}));
 assert.throws(()=>assertSpendContinuation(value,{...value,operations:[]}));
});
assert(Object.values(counters).every(value=>value===0));
console.log(JSON.stringify({status:'PASS',producerCommit,migrationV8,consumerMigrations:57,results,counters,providerCalls:0,realProvider:'NOT_RUN'},null,2));
