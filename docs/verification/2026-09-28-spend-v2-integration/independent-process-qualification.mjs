import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {once} from 'node:events';
import {mkdtempSync,rmSync} from 'node:fs';
import {openStorage} from '/private/tmp/q37-v2-review-48a1/packages/storage/src/index.ts';
import {SpendLedger} from '/private/tmp/q37-v2-review-48a1/packages/storage/src/spend.ts';

if(process.argv[2]==='child'){
 const {path,binding,action,id,phase,crashStage}=JSON.parse(process.argv[3]);
 const ledger=new SpendLedger(path);
 process.send({ready:true});
 process.once('message',()=>{
  try{
   if(action==='unknown')ledger.markUnknown(id);
   else if(action==='cancel')ledger.cancelBound(binding);
   else if(action==='fence')ledger.fenceAuthority(binding);
   else {
    ledger.reserve({...binding,operationId:id,model:'fixture-model',pricingRevision:'fixture-v1',reservedMicrousd:1200,phase});
    if(crashStage==='dispatched'||crashStage==='settled')ledger.markDispatched(id);
    if(crashStage==='settled')ledger.settle(id,30,'provider-'+id,{input_tokens:10,output_tokens:10});
   }
   process.send({result:'ADMITTED'});
  }catch(error){process.send({result:'DENIED',reason:error.message});}
  if(!crashStage){ledger.close();process.disconnect();}
  else setInterval(()=>{},1000);
 });
}else{
 const results=[],children=new Set();
 function fixture({productive=2,completion=2}={}){
  const dir=mkdtempSync('/private/tmp/q37-review-process-db-'),path=dir+'/factory.sqlite';
  const storage=openStorage(path);
  const order=storage.createWorkOrder({title:'Independent process qualification',description:'Synthetic local ledger only',kind:'feature',repositoryPath:dir,baseRef:'a'.repeat(40),acceptanceCriteria:['bounded'],reproductionCommand:null,expectedFailureText:null,checkCommands:[],allowedPaths:['test.txt'],workerProfile:'mac'});
  const run=storage.createRun({workOrderId:order.id,workerProfile:'mac',inputCommit:'a'.repeat(40),workspacePath:dir});
  const binding={workId:'review-work',workGeneration:1,requestId:'review-request',workOrderId:order.id,dispatchIdentity:'review-dispatch',factoryVersion:'a'.repeat(64),runId:run.id};
  const ledger=new SpendLedger(path),deadline=new Date(Date.now()+120000).toISOString();
  ledger.createBudget(binding,1200*(productive+completion),deadline,{version:'WORK_LEDGER_V2',pricingRevision:'fixture-v1',model:'fixture-model',validUntil:deadline,perOperationReserveMicrousd:1200,plannedProductiveOperations:productive,plannedCompletionOperations:completion,maxPaidOperations:productive+completion,completionReserveMicrousd:completion*1200});
  ledger.bindAuthority(binding);
  function reserve(id,phase='productive'){ledger.reserve({...binding,operationId:id,phase,model:'fixture-model',pricingRevision:'fixture-v1',reservedMicrousd:1200});}
  function settled(id,phase='productive'){reserve(id,phase);ledger.markDispatched(id);ledger.settle(id,30,'provider-'+id,{input_tokens:10,output_tokens:10});}
  return {path,binding,ledger,storage,reserve,settled,close(){ledger.close();storage.close();rmSync(dir,{recursive:true,force:true});}};
 }
 async function preparedChild(f,options){
  const child=fork(import.meta.filename,['child',JSON.stringify({path:f.path,binding:f.binding,phase:'productive',action:'reserve',...options})],{stdio:['ignore','ignore','pipe','ipc']});
  children.add(child);
  let errors='';child.stderr.on('data',chunk=>errors+=chunk);
  await new Promise((resolve,reject)=>{
   child.once('message',message=>message.ready?resolve():reject(Error('Not ready')));
   child.once('error',reject);child.once('exit',(code)=>{if(code)reject(Error(errors||'child exit'));});
  });
  const result=new Promise((resolve,reject)=>{child.once('message',resolve);child.once('error',reject);});
  const exited=once(child,'exit').then(()=>children.delete(child));
  return {child,result,exited,start(){child.send('go');}};
 }
 async function race(f,a,b){
  const pair=await Promise.all([preparedChild(f,a),preparedChild(f,b)]);
  pair.forEach(c=>c.start());
  const read=await Promise.all(pair.map(c=>c.result));
  await Promise.all(pair.map(c=>c.exited));
  return read;
 }
 try{
  for(const phase of ['productive','completion']){
   for(let iteration=0;iteration<10;iteration++){
    const f=fixture();
    try{
     if(phase==='productive')f.settled('initial');
     else {f.settled('initial');f.ledger.beginCompletion(f.binding);f.settled('completion-initial','completion');}
     const competing=await race(f,{id:'racer-a',phase},{id:'racer-b',phase});
     assert.equal(competing.filter(x=>x.result==='ADMITTED').length,1);
     assert.equal(competing.filter(x=>x.result==='DENIED').length,1);
     const read=f.ledger.read(f.binding.workId);
     assert.equal(read.operations.filter(op=>op.phase===phase).length,2);
     assert.equal(read.retainedMicrousd,1200);
    }finally{f.close();}
   }
   results.push({scenario:phase+' synchronized last-slot race',iterations:10,overAdmissions:0});
  }
  for(const action of ['unknown','cancel','fence']){
   let admittedBeforeHold=0;
   for(let iteration=0;iteration<10;iteration++){
    const f=fixture({productive:3});
    try{
     f.reserve('prior');f.ledger.markDispatched('prior');
     const raced=await race(f,{action,id:'prior'},{id:'racer'});
     assert.equal(raced[0].result,'ADMITTED');
     if(raced[1].result==='ADMITTED'){
      admittedBeforeHold++;
      assert.throws(()=>f.ledger.markDispatched('racer'),/UNKNOWN|Post-cancel|authority/);
     }
     assert.throws(()=>f.reserve('after-hold'),/UNKNOWN|Post-cancel|authority/);
    }finally{f.close();}
   }
   results.push({scenario:action+' versus synchronized reserve',iterations:10,admittedBeforeHold,postHoldDispatches:0});
  }
  for(const stage of ['reserved','dispatched','completion','settled']){
   const f=fixture();
   try{
    if(stage==='completion'){f.settled('productive-complete');f.ledger.beginCompletion(f.binding);}
    const child=await preparedChild(f,{id:'crashed-operation',phase:stage==='completion'?'completion':'productive',crashStage:stage});
    child.start();assert.equal((await child.result).result,'ADMITTED');
    child.child.kill('SIGKILL');await child.exited;
    // Open only after abrupt writer death; recovery must retain persisted liability and slot.
    const reopened=new SpendLedger(f.path);
    try{
     const expected=stage==='settled'?0:1;
     assert.equal(reopened.recoverUnknown(),expected);
     const read=reopened.read(f.binding.workId),op=read.operations.find(x=>x.operationId==='crashed-operation');
     assert.equal(op.state,stage==='settled'?'settled':'unknown');
     assert.equal(read.unknownExposureMicrousd,expected*1200);
     assert.equal(read.paidOperationsUsed,stage==='completion'?2:1);
     if(stage==='completion'){assert.equal(read.completionOperationSlotsRemaining,1);assert.equal(read.completionReserveRemainingMicrousd,1200);}
     if(stage!=='settled')assert.throws(()=>f.reserve('post-loss'),/UNKNOWN|phase/);
     results.push({scenario:'SIGKILL '+stage,retainedUnknownMicrousd:read.unknownExposureMicrousd,paidOperationsUsed:read.paidOperationsUsed,recoveredState:op.state});
    }finally{reopened.close();}
   }finally{f.close();}
  }
  console.log(JSON.stringify({producerSha:'48a1e3aa8bf40480c1ce9c8042980f3d23860441',result:'PASS_LOCAL_LEDGER_PROCESSES',providerCalls:0,paidCalls:0,results},null,2));
 }finally{
  for(const child of children){child.kill('SIGKILL');}
 }
}
