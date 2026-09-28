import {mkdtempSync,rmSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {openStorage} from '/private/tmp/q37-v2-producer-ad23/packages/storage/src/index.ts';
import {SpendLedger} from '/private/tmp/q37-v2-producer-ad23/packages/storage/src/spend.ts';
import {FactoryDispatchControl} from '/private/tmp/q37-v2-producer-ad23/apps/supervisor/src/dispatch-control.ts';
const dir=mkdtempSync('/private/tmp/q37-v2-review-'),path=dir+'/db.sqlite',storage=openStorage(path),ledger=new SpendLedger(path);
const deadline=new Date(Date.now()+60000).toISOString();
const plan={version:'WORK_LEDGER_V2',pricingRevision:'fixture',model:'fixture',validUntil:deadline,perOperationReserveMicrousd:1200,plannedProductiveOperations:2,plannedCompletionOperations:2,maxPaidOperations:4,completionReserveMicrousd:2400};
function fixture(workId,generation,requestId) {
 const order=storage.createWorkOrder({title:'Review fixture',description:'No paid provider',kind:'feature',repositoryPath:dir,baseRef:'a'.repeat(40),acceptanceCriteria:['test'],reproductionCommand:null,expectedFailureText:null,checkCommands:[],allowedPaths:['test.txt'],workerProfile:'mac'});
 const run=storage.createRun({workOrderId:order.id,workerProfile:'mac',inputCommit:'a'.repeat(40),workspacePath:dir});
 const binding={workId,workGeneration:generation,requestId,workOrderId:order.id,dispatchIdentity:'dispatch-'+generation,factoryVersion:'a'.repeat(64),runId:run.id};
 storage.recordIntake('gateb:review',requestId,'digest',order.id);
 const event=(type,payload={})=>storage.appendEvent({workOrderId:order.id,runId:run.id,type,payload});
 event('factory.prepare_requested',{...binding,deadline});event('run.prepared');event('factory.writer_bound',binding);
 ledger.createBudget(binding,4800,deadline,plan);ledger.bindAuthority(binding);
 return {order,run,binding,event};
}
const client={id:'review',repositoryPaths:[dir],actions:['factory.observe']};
const control=new FactoryDispatchControl(storage,{activeRun:()=>false},{snapshot:()=>({})},ledger);
const old=fixture('historical-work',1,'old');old.event('factory.terminal',{state:'SUCCEEDED'});
ledger.fenceAuthority(old.binding.workId);
const next=fixture('historical-work',2,'new');
const before=ledger.read('historical-work').authorityState;
const oldRead=await control.read(client,'old');
console.log(JSON.stringify({scenario:'historical GET fences current generation',before,after:ledger.read('historical-work').authorityState,oldReadSpendGeneration:oldRead.spend.workGeneration}));
const phase=fixture('phase-work',1,'phase-old');
for(const [id,p] of [['prod','productive'],['complete','completion']]){
 if(p==='completion')ledger.beginCompletion(phase.binding);
 ledger.reserve({...phase.binding,operationId:id,model:plan.model,pricingRevision:plan.pricingRevision,reservedMicrousd:1200,phase:p});ledger.markDispatched(id);ledger.settle(id,30,'provider-'+id,{input_tokens:10,output_tokens:10});
}
ledger.fenceAuthority('phase-work');
const phaseNext=fixture('phase-work',2,'phase-new');
ledger.beginCompletion(phaseNext.binding);ledger.assertCompleted(phaseNext.binding);
console.log(JSON.stringify({scenario:'historical ops satisfy new attempt mandatory phases',newAttemptOperations:ledger.read('phase-work').operations.filter(op=>op.workGeneration===2).length,accepted:true}));
const live=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'});
try{
 const f=fixture('recovery-work',1,'recovery');
 storage.saveRun({...f.run,state:'interrupted'});
 f.event('factory.dispatch_claimed',{supervisorPid:process.pid});
 f.event('agent.process_started',{pid:99999999});
 f.event('agent.completion_process_started',{pid:live.pid});
 f.event('run.interrupted',{previousState:'implementing',pid:99999999});
 const read=await control.read(client,'recovery');
 process.kill(-live.pid,0);
 console.log(JSON.stringify({scenario:'live completion child omitted from quiescence',liveCompletionPid:live.pid,quiescent:read.quiescent,state:read.state}));
}finally{process.kill(-live.pid,'SIGKILL');}
ledger.close();storage.close();rmSync(dir,{recursive:true,force:true});
