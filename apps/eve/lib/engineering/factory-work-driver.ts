import {FactoryValidationLifecycle,saveValidationPreparation} from './factory-validation-lifecycle.ts';
import { FactoryEvidenceStore } from "./factory-evidence-store.ts";
import { FactoryEvidenceClient, EvidenceWaiting } from "./factory-evidence.ts";
import {FactoryCloudProtectedVerifier} from './factory-cloud-verifier.ts';
import {assertFactorySpendCanStart,assertSpendContinuation,workSpendSchema} from './factory-spend.ts';
import {preflightApprovedBase} from './base-preflight.ts';
import {randomUUID} from 'node:crypto';
import {digest} from './contract.ts';
import {decideExecutionRoute} from '../digital-worker/routing.ts';
import {RoutingStore} from './routing-store.ts';
import {RouteAdmissionService} from './route-admission.ts';
import {FactoryRouteAuthority,type FactoryRuntime} from './factory-routing.ts';
import {LiveFactoryAdapter,FactoryValidationGrantPending,repairWorkOrderFor,type FactoryPrepareRequest,type FactoryConnection} from './factory-live-adapter.ts';
import {FactoryWriterStore} from './factory-writer.ts';
import {FactoryReceiptStore} from './factory-receipt-store.ts';
import {prepareAuthenticatedFactoryInput} from './factory-authenticated-result.ts';
import {admitFactoryResult} from './factory-result-consumer.ts';
import {DirectVerificationDriver,DockerVerificationResourceInspector} from './direct-verification-driver.ts';
import {DirectDevelopmentStore,type DirectProtectedVerifier} from './direct-development.ts';
import {NativeResultStore} from './native-results.ts';
import type {RepositorySnapshot} from './github.ts';
import {WorkStore} from './store.ts';
import {WorkError} from './types.ts';

// Read-only credential renewal cannot change frozen execution authority.
export function factoryExecutionConfigurationHash(config: FactoryRuntime) {
 const {evidence,...connection}=config.connection;
 return digest({...config,connection:{...connection,...(evidence?{evidence:{ownerScope:evidence.ownerScope}}:{})}});
}

/** Durable steps re-read existing state; an unattended local worker and operator
 * use the same methods. Only admission acquires a writer. Observations never do. */
export class FactoryWorkDriver {
 readonly writers:FactoryWriterStore;
 readonly receipts:FactoryReceiptStore;
 constructor(readonly store:WorkStore,readonly authority:FactoryRouteAuthority,readonly direct:DirectDevelopmentStore,
  readonly verifier:DirectProtectedVerifier,readonly source:()=>Promise<RepositorySnapshot>,readonly adapterFor:(config:FactoryConnection)=>LiveFactoryAdapter=config=>new LiveFactoryAdapter(config),readonly evidenceFor:(config:FactoryConnection)=>FactoryEvidenceClient=config=>new FactoryEvidenceClient(config)){
  this.writers=new FactoryWriterStore(store);this.receipts=new FactoryReceiptStore(store.principal,store.database);
 }
 private scope(id:string){return [this.store.principal.scopeId,this.store.principal.scopeKind,id];}
 async decision(id:string){await this.store.get(id);const [row]=await this.store.database.query('SELECT * FROM engineering_routing_decisions WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3 ORDER BY work_version DESC LIMIT 1',this.scope(id));return row??null;}
 private async observation(id:string,decisionId:string,value:unknown,store:WorkStore=this.store){
  const spend=workSpendSchema.safeParse((value as {spend?:unknown})?.spend);
  if(spend.success){
   const history=await store.database.query('SELECT factory_observation FROM engineering_routing_decisions WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3',this.scope(id));
   for(const row of history){const previous=workSpendSchema.safeParse(row.factory_observation?.value?.spend);if(previous.success)assertSpendContinuation(previous.data,spend.data);}
  }
  await store.database.query('UPDATE engineering_routing_decisions SET factory_observation=$5::jsonb WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3 AND id=$4',[...this.scope(id),decisionId,JSON.stringify({observedAt:new Date().toISOString(),value})]);}
 async start(id:string,expectedVersion:number,expectedGeneration:number){
  const work=await this.store.get(id),config=await this.authority.readConfig();
  const repairWorkOrderId=repairWorkOrderFor(config.connection,work);
  if(work.version!==expectedVersion||work.generation!==expectedGeneration)throw new WorkError('factory_work_changed','Select the current Work revision.');
  let decision=await this.decision(id);
  if(decision?.work_version===work.version&&decision.factory_preparation)return this.step(id);
  const snapshot=await this.authority.assess(work),request={route:'MYFACTORY',requiredOperations:['factory.submit'],resourceRefs:[`repository:${work.repository}`]};
  if(snapshot.selection.route!=='MYFACTORY'){
   const selected=snapshot.selection.route;
   if(decision?.work_version===work.version&&(decision.selected_route??decision.selectedRoute)!==selected)
    throw new WorkError('factory_route_conflict','Another route proposal owns this Work revision.');
   if(!decision||decision.work_version!==work.version)await new RoutingStore(this.store).recordProposal(id,{
    expectedWorkVersion:work.version,selectedRoute:selected,reason:snapshot.selection.reason,source:'POLICY',
    profile:snapshot.contract.routingProfile,eligibleRoutes:selected==='HUMAN'?['HUMAN']:['DIRECT','HUMAN'],
    rejectedRoutes:[{route:'MYFACTORY',reason:'Current backend intent or qualification does not allow Factory production'}],
    constraints:['Proposal only; normal action admission still required','No Factory preparation or writer authority'],providerId:null,providerVersion:null});
   return {state:'ROUTED',route:selected,reason:snapshot.selection.reason};
  }
  const eligibility=decideExecutionRoute(snapshot.contract,snapshot.context,request,snapshot.facts);
  if(!eligibility.admitted)throw new WorkError('factory_denied',eligibility.reasons.join(' '),403);
  if(!decision||decision.work_version!==work.version)decision=await new RoutingStore(this.store).recordProposal(id,{expectedWorkVersion:work.version,selectedRoute:'MYFACTORY',reason:'Beta policy: substantial bounded software production uses the qualified Factory',source:'POLICY',profile:snapshot.contract.routingProfile,eligibleRoutes:['MYFACTORY','HUMAN'],rejectedRoutes:[],constraints:['One productive writer','PARTIAL until separate release gates'],providerId:config.connection.factoryId,providerVersion:config.connection.factoryVersion});
  if((decision.selected_route??decision.selectedRoute)!=='MYFACTORY')throw new WorkError('factory_route_conflict','Another route proposal owns this Work revision.');
  const source=await this.source();
  preflightApprovedBase(config.engineering.profile,config.engineering.approvedBase,source,1);
  let deadline=snapshot.contract.deadline;
  if(config.engineering.conversationQualification){
   const [budget]=await this.store.database.query('SELECT deadline FROM engineering_work_model_budget WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3',this.scope(id));
   if(!budget || Date.parse(String(budget.deadline))<=Date.now())throw new WorkError('factory_conversation_budget','Current canonical Sofie allowance and deadline are required.');
   deadline=new Date(budget.deadline as string).toISOString();
  }
  const prepare:FactoryPrepareRequest= {...(repairWorkOrderId?{repairWorkOrderId}:{}),...(config.connection.spendPlan?{spendContract:config.connection.spendPlan}:{}),requestId:randomUUID(),workId:id,workGeneration:work.generation,repository:work.repository,deadline,maxSpendUsd:Math.min(snapshot.contract.budgetUsd,(config.engineering.conversationQualification?.factoryCeilingMicrousd??Infinity)/1_000_000),
   input:{title:work.title,description:work.objective,kind:'feature',...('source' in config.connection?{}:{repositoryPath:config.connection.repositoryPath}),baseRef:source.sha,acceptanceCriteria:work.criteria.map(c=>c.statement),reproductionCommand:null,expectedFailureText:null,checkCommands:config.commands,allowedPaths:config.engineering.profile.allowedPaths,workerProfile:'source' in config.connection?'container':'mac'}};
  const validation='releaseValidation' in config.connection;
  const preparation=JSON.stringify({request:prepare,configurationHash:factoryExecutionConfigurationHash(config),...(validation?{validationProtocol:2}:{}),...(snapshot.environment?{environment:snapshot.environment}:{})});
  const save=`UPDATE engineering_routing_decisions SET factory_preparation=$5::jsonb
   WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3 AND id=$4 AND status='PROPOSED' AND factory_preparation IS NULL RETURNING *`;
  const saved=validation?await saveValidationPreparation(this.store,id,decision.id,preparation):(await this.store.database.query(save,[...this.scope(id),decision.id,preparation]))[0];
  if(!saved&&!((await this.decision(id))?.factory_preparation))throw new WorkError('factory_prepare_changed','Preparation changed before it was persisted.');
  return this.step(id);
 }
 async step(id:string){
  const decision=await this.decision(id),preparation=decision?.factory_preparation;
  const config=await this.authority.readConfig();
  const validation='releaseValidation' in config.connection||preparation?.validationProtocol!==undefined||preparation?.validationState!==undefined;
  if(!validation)return this.stepAttempt(id);
  // Historical failed attempts remain untouched; never enroll them in a new lifecycle.
  if(preparation?.validationProtocol!==2||preparation?.validationState!==undefined)return {state:'HALTED'};
  const lifecycle=new FactoryValidationLifecycle(this.store,decision.id),claimed=await lifecycle.claim();
  if(claimed.state!=='CLAIMED'){if(claimed.state==='HALTED'){try{await this.stop(id);}catch{}}return {state:claimed.state};}
  const assertActive=()=>lifecycle.assertActive(claimed.claim);
  const halt=async(reason:string)=>{const fenced=await lifecycle.halt(reason,claimed.claim);if(fenced){try{await this.stop(id);}catch{}}return {state:'HALTED'};};
  try{
   await assertActive();
   const result=await this.stepAttempt(id,assertActive,lifecycle.fencedStore(claimed.claim));
   await assertActive();
   if('result' in result&&result.state==='PARTIAL'){await lifecycle.finish(claimed.claim,'COMPLETED');return result;}
   if(result.state!=='DISPATCHED')return halt('VALIDATION_UNPROVEN_RESULT');
   await lifecycle.finish(claimed.claim,'IDLE');return result;
  }catch(error){
   if(error instanceof FactoryValidationGrantPending&&decision.status==='PROPOSED'&&Date.parse(preparation.request.deadline)>Date.now()){
    try{await lifecycle.finish(claimed.claim,'WAITING_GRANT');return {state:'WAITING_FOR_AUTHORITY'};}catch{await halt('VALIDATION_CLAIM_FENCED');throw error;}
   }
   await halt(error instanceof Error?error.message:'VALIDATION_FAILURE');throw error;
  }
 }
 private async stepAttempt(id:string,assertActive:()=>Promise<void>=async()=>{},store:WorkStore=this.store){
  const writers=store===this.store?this.writers:new FactoryWriterStore(store);
  const receipts=store===this.store?this.receipts:new FactoryReceiptStore(store.principal,store.database);
  const direct=store===this.store?this.direct:new DirectDevelopmentStore(store,this.direct.config);
  const observation=(workId:string,decisionId:string,value:unknown)=>this.observation(workId,decisionId,value,store);
  let decision=await this.decision(id);
  if(!decision?.factory_preparation)return {state:'NOT_PREPARED'};
  const work=await store.get(id),config=await this.authority.readConfig(),adapter=this.adapterFor(config.connection);
  const preparation=decision.factory_preparation as {request:FactoryPrepareRequest;configurationHash:string};
  if(work.version!==decision.work_version||work.generation!==preparation.request.workGeneration)return {state:'HISTORICAL'};
  try{
   if(preparation.configurationHash!==factoryExecutionConfigurationHash(config))throw new WorkError('factory_configuration_changed','Retained Factory configuration changed; reconcile without redispatch.');
   if(decision.status==='PROPOSED'){
    await assertActive();
    const response=await adapter.prepare(preparation.request);await assertActive();await observation(id,decision.id,response);
    if(!response.snapshot){if(decision.factory_preparation.validationProtocol)throw Error('VALIDATION_SNAPSHOT_MISSING');return {state:response.state};}
    assertFactorySpendCanStart(response.spend);
    const s=response.snapshot;
    const binding=prepareAuthenticatedFactoryInput({workId:id,workVersion:work.version,workGeneration:work.generation,criteriaVersion:work.criteriaVersion,agentId:config.engineering.agentId,
     factoryId:s.factoryId,factoryVersion:s.factoryVersion,requestId:s.requestId,requestDigest:s.requestDigest,sourceDigest:s.sourceDigest,configurationDigest:s.configurationDigest,workOrderId:s.workOrderId,runId:s.runId,attemptNumber:s.attemptNumber,inputCommit:s.inputCommit});
    await assertActive();const registered=await receipts.register(binding);
    const admission=new RouteAdmissionService(store,{read:w=>this.authority.read(w,registered.id,preparation.request)});
    await assertActive();await admission.admit(id,{decisionId:decision.id,expectedWorkVersion:work.version,expectedWorkGeneration:work.generation,request:{route:'MYFACTORY',requiredOperations:['factory.submit'],resourceRefs:[`repository:${work.repository}`]}});
    decision=await this.decision(id);
   }
   const [row]=await store.database.query('SELECT id FROM engineering_route_runs WHERE decision_id=$1',[decision.id]);
   if(!row)throw new WorkError('factory_run_missing','Admitted route has no Run.');
   let run=await writers.inspect(id,row.id);
   if(run.dispatch_state==='PREPARED'){
    const current=await this.authority.read(work,run.factory_request_id,preparation.request);
    const prior=decision.admission_authority_snapshot;
    if(digest(current.environment?.binding??null)!==digest(prior.environment?.binding??null))throw new WorkError('cloud_environment_binding_changed','The admitted cloud environment changed; reconcile without redispatch.');
    if(digest(current.binding)!==digest(prior.binding))throw new WorkError('factory_authority_changed','Owner Agent or configuration changed. Stop and reconcile the retained attempt.');
    const eligible=decideExecutionRoute(prior.contract,current.context,decision.admission_request,{...current.facts,writerState:'NONE'});
    if(!eligible.admitted)throw new WorkError('factory_dispatch_denied',eligible.reasons.join(' '),403);
    const budgetReadback=await adapter.prepared(preparation.request);
    await observation(id,decision.id,budgetReadback);assertFactorySpendCanStart(budgetReadback.spend);
    await assertActive();await writers.dispatch(run,{dispatch:async identity=>{await assertActive();await adapter.dispatch(identity);await assertActive();},stop:identity=>adapter.stop(identity),observe:identity=>adapter.observe(identity)});run=await writers.inspect(id,row.id);
   }
   const identity=await writers.identity(run);
   // MyEve may die after its durable UNKNOWN claim and before the HTTP call.
   // Seal that prepared attempt; never resend an uncertain dispatch.
   const prepared=await adapter.prepared(preparation.request);
   if(!prepared.identity&&prepared.state==='PREPARED'&&['UNKNOWN','STOPPING'].includes(run.dispatch_state))await writers.stop(run,adapter,'cancel');
   const remote=await adapter.read(identity);await assertActive();await observation(id,decision.id,remote);
   if(decision.factory_preparation.validationProtocol&&(remote.state==='UNKNOWN'||run.dispatch_state==='UNKNOWN'))throw Error('VALIDATION_EXECUTION_UNKNOWN');
   if(['UNKNOWN','STOPPING'].includes(run.dispatch_state)||Date.parse(identity.deadline)<=Date.now()){
    if(Date.parse(identity.deadline)<=Date.now()&&run.dispatch_state!=='TERMINAL')await writers.stop(run,adapter,'timeout');
   }
   // Quiescence is independent of result acceptance. Cancelled or invalid results
   // cannot prevent a proven terminal writer from being fenced.
   run=await writers.reconcile(run,adapter);
   const historicalTerminal=run.dispatch_state==='TERMINAL'&&(run.status!=='COMPLETED'||!!run.stop_reason);
   // A result and resource observation are separate; neither substitutes for the other.
   const request=await receipts.request(run.factory_request_id);
   let receiptId:string|undefined,receiptStatus:string|undefined;
   // Reconciliation may observe terminal after the earlier remote read was RUNNING.
   // Retain its signed receipt in this same step before the controller stops.
   if(['COMPLETED','FAILED','CANCELLED'].includes(remote.state)||(run.dispatch_state==='TERMINAL'&&['COMPLETED','FAILED','CANCELLED'].includes(run.status))){
    const returned=await adapter.result(request.binding);
    if(returned.result){await assertActive();const admitted=await admitFactoryResult(receipts,request.id,returned.result,{keys:()=>adapter.keys()});receiptStatus=admitted.status;if(admitted.status==='ADMITTED')receiptId=admitted.receiptId;else if(!historicalTerminal)throw new WorkError('factory_result_denied','Factory result was not admitted: '+admitted.status);}
   }
   if(run.dispatch_state!=='TERMINAL')return {state:run.dispatch_state};
   // Failed/cancelled signed envelopes still pass through durable Gate C custody.
   // Historical or rejected receipts never authorize candidate custody or verification.
   if(historicalTerminal)return {state:'TERMINAL',outcome:run.status,receiptStatus};
   receiptId??=(await receipts.admission(request.id))?.receipt_id as string|undefined;
   if(!receiptId)return {state:'AWAITING_RESULT'};
   const cloudCustody='source' in config.connection?await adapter.custody(identity):undefined;
   await assertActive();await writers.takeCustody(run,receiptId,await this.source(),config.engineering.profile,{keys:()=>adapter.keys()},cloudCustody?.files);
   const ws=(await direct.inspect(id)).workspace;
   if(!ws||ws.routeRunId!==run.id)return {state:'HISTORICAL'};
   const protectedVerifier='source' in config.connection?new FactoryCloudProtectedVerifier(receipts,request.id,()=>adapter.keys(),{profileHash:config.connection.qualification.profileHash,factoryVersion:config.connection.factoryVersion}):this.verifier;
   const verification=new DirectVerificationDriver(direct,protectedVerifier);
   const candidate=ws.candidates.at(-1)!;
   const job=await verification.inspectJob(id,candidate.sha);
   if(job?.status==='RECOVERY_REQUIRED'){
    if(decision.factory_preparation.validationProtocol)throw Error('VALIDATION_VERIFICATION_INTERRUPTED');
    // CLOUD only reprojects an already destroyed verifier's signed receipt. No
    // provider execution is repeated and no local Docker fallback is permitted.
    const inspector='source' in config.connection?{resourcesAbsent:async()=>{await protectedVerifier.verify({workId:id,baseSha:ws.baseSha,criteriaVersion:ws.criteriaVersion,profileHash:ws.profileHash,profile:config.engineering.profile},candidate);return true;}}:new DockerVerificationResourceInspector();
    await verification.retryAfterResourceCheck(id,candidate.sha,inspector);
   }
   const [retainedProof] = await store.database.query('SELECT id FROM engineering_native_results WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3 AND candidate_sha=$4',[...this.scope(id),candidate.sha]);
   await assertActive();if(!retainedProof)await new FactoryEvidenceStore(store).ingest(id,request.id,receiptId,this.evidenceFor(config.connection));
   await assertActive();await verification.run(id);await assertActive();
   const result=await new NativeResultStore(direct).retain(id);
   await observation(id,decision.id,{...remote,verification:result.proof.outcome,resultId:result.id,coordinationDebt:0});
   return {state:result.proof.outcome,result};
  }catch(error){
   if(error instanceof EvidenceWaiting&&!decision.factory_preparation.validationProtocol){
    await observation(id,decision.id,{...(await this.decision(id))?.factory_observation?.value,state:'WAITING_FOR_EVIDENCE',reason:error.message});
    return {state:'WAITING_FOR_EVIDENCE'};
   }
   await assertActive();
   const retained=(await this.decision(id))?.factory_observation?.value;
   await observation(id,decision.id,{...retained,
    ...(retained?.accounting?{accounting:{...retained.accounting,accountingCompleteness:'STALE_READBACK',safeAllowanceMicrousd:null,unknownMicrousd:null,spendEnforcementQualified:false,blocker:'Latest accounting is unverified; retained exposure is not released'}}:{}),
    state:'BLOCKED',reason:error instanceof Error?error.message:'Reconciliation required'});throw error;
  }
 }
 async stop(id:string,reason:'cancel'|'takeover'='cancel'){
  const decision=await this.decision(id);if(!decision?.factory_preparation)throw new WorkError('factory_prepare_missing','No Factory preparation exists.');
  if(decision.factory_preparation.validationProtocol===2)await new FactoryValidationLifecycle(this.store,decision.id).halt('VALIDATION_CANCELLED');
  const [row]=await this.store.database.query('SELECT id FROM engineering_route_runs WHERE decision_id=$1',[decision.id]);
  if(!row)throw new WorkError('factory_prepare_pending','Preparation has no productive writer; resume preparation to reconcile its identity.');
  const config=await this.authority.readConfig(),adapter=this.adapterFor(config.connection),run=await this.writers.inspect(id,row.id);
  await this.writers.stop(run,adapter,reason);const current=await this.writers.reconcile(run,adapter);
  if(reason==='takeover'&&current.dispatch_state==='TERMINAL')await this.writers.advance(current,(await this.store.get(id)).version,'HUMAN');
  return current;
 }
}
