import {randomUUID} from 'node:crypto';
import {digest,profileSchema} from '../engineering/contract.ts';
import {buildSignedResult,fixtureConfiguration,fixtureConfigurationDigest,fixtureFactoryId,fixtureFactoryVersion,
  fixtureSourceDigest,type FixtureResultKeys} from '../external-alpha/result-test-fixture.ts';
import {admitFactoryResult} from '../engineering/factory-result-consumer.ts';
import {FactoryReceiptStore,type FactoryBinding} from '../engineering/factory-receipt-store.ts';
import {cloudProtectedEvidence} from '../engineering/factory-cloud-verifier.ts';
import {evidenceReference,evidenceSha,verifyEvidence,verifySignedEvidence} from '../engineering/factory-evidence.ts';
import {NativeResultStore} from '../engineering/native-results.ts';
import {DirectDevelopmentStore} from '../engineering/direct-development.ts';
import {workSpendV2Schema} from '../engineering/factory-spend.ts';
import type {Work} from '../engineering/types.ts';
import type {WorkStore} from '../engineering/store.ts';
import type {FactoryRuntime} from '../engineering/factory-routing.ts';
import type {Candidate} from '../engineering/execution.ts';
import type {ResultManifest} from '../engineering/factory-producer-protocol.ts';

/** Disposable test configuration only. No installation, cloud resource or authority is created. */
export function ownerResultFixtureConfig(work:Work,keys:FixtureResultKeys):FactoryRuntime {
  const producer=fixtureConfiguration(),profile=profileSchema.parse({id:'owner-tasks-fixture',version:1,repository:work.repository,
    privateQualification:true,baseBranch:'main',allowedPaths:producer.allowedPaths,
    checks:work.criteria.map((c,i)=>({id:`alpha-tasks-criterion-${i+1}`,program:'test/tasks.test.ts',input:'',expectedOutput:'ok',expectedExitCode:0,criterionIds:[c.id]})),
    requiredCI:['fixture'],reviewerLogins:['fixture-reviewer'],policyVersion:1,executor:'factory-cloud',image:producer.verificationImage,
    maxRuns:1,maxModelRequests:1,maxOutputTokens:256});
  return {engineering:{ownerId:work.scopeId,agentId:'fixture-agent',profile,objective:work.objective,criteria:work.criteria,issueNumber:1,
      approvedBase:{sha:'1'.repeat(40),treeSha:'2'.repeat(40)}},routing:{intent:'PRODUCE'},commands:['npm test'],connection:{
      factoryId:fixtureFactoryId,sourceDigest:fixtureSourceDigest,configurationDigest:fixtureConfigurationDigest,factoryVersion:fixtureFactoryVersion,
      keys:[keys.key],qualification:{scopeId:work.scopeId,profileHash:digest(profile),qualifiedAt:new Date(Date.now()-1000).toISOString(),
        expiresAt:new Date(Date.now()+3600000).toISOString(),mode:'LOCAL_FIXTURE',evidenceRef:'owner-signed-custody-fixture',spendEnforced:false}}} as unknown as FactoryRuntime;
}

/** Real Gate C and NativeResultStore, with seeded retained terminal custody.
 * This tests readback/import recovery; it does not claim producer execution or cloud cleanup qualification.
 * The caller supplies an already admitted exact owner writer in a disposable PostgreSQL database.
 */
export async function retainOwnerResultFixture(input:{store:WorkStore;config:FactoryRuntime;keys:FixtureResultKeys;
  work:Work;binding:FactoryBinding;requestId:string;runId:string;decisionId:string;rawTree?:Uint8Array}) {
  const {store,config,keys,work,binding:q,requestId,runId,decisionId}=input,db=store.database;
  const [run]=await db.query('SELECT * FROM engineering_route_runs WHERE id=$1 AND scope_id=$2',[runId,work.scopeId]);
  if(!run?.missioncontrol_binding)throw Error('Fixture requires an admitted owner writer');
  // Only the generic signed Result builder's source inputs are supplied. No Alpha authority row is created or consumed.
  const source={id:randomUUID(),requestId:q.requestId,workGeneration:work.generation,envelope:{document:{source:{
    allowedFiles:config.engineering.profile.allowedPaths,baseSha:q.inputCommit,treeSha:'2'.repeat(40)}}}};
  const {signed}=buildSignedResult({authority:source as any,work,workOrderId:q.workOrderId,keys,
    opts:{runId:q.runId,requestDigest:q.requestDigest,rawTree:input.rawTree}});
  // The real verifier reads the canonical signed bytes, not the builder's
  // insertion-ordered object. Preserve that representation in artifact hashes.
  const manifest=JSON.parse(Buffer.from(signed.encoded,'base64url').toString('utf8')) as ResultManifest;
  const receipts=new FactoryReceiptStore(store.principal,db);
  const admission=await admitFactoryResult(receipts,requestId,signed,{keys:async()=>[keys.key]});
  if(admission.status!=='ADMITTED')throw Error('Fixture Gate C rejected: '+admission.reason);
  const receiptId=admission.receiptId,c=manifest.candidate!,profile=config.engineering.profile;
  const artifact=(id:string)=>Buffer.from(signed.artifacts.find(a=>a.id===id)!.base64,'base64');
  const candidate:Candidate={id:randomUUID(),workId:work.id,runId,attemptId:q.runId,producer:'MYFACTORY',repository:work.repository,
    baseSha:q.inputCommit,parentSha:q.inputCommit,sha:c.commit,tree:c.tree,files:{},changedPaths:profile.allowedPaths.slice(0,2),
    patch:artifact(c.patchArtifactId).toString(),rawCommit:artifact(c.commitArtifactId).toString(),artifactHash:c.patchDigest,createdAt:manifest.completedAt,
    commit:{message:'fixture',name:'fixture',email:'fixture@example.invalid',date:manifest.completedAt},factoryProvenance:{
      receiptId,requestId,factoryId:q.factoryId,factoryVersion:q.factoryVersion,workOrderId:q.workOrderId,remoteRunId:q.runId,
      attemptNumber:q.attemptNumber,writerGeneration:Number(run.writer_generation)}};
  const evidence=cloudProtectedEvidence(manifest,{workId:work.id,baseSha:q.inputCommit,criteriaVersion:work.criteriaVersion,profileHash:digest(profile),profile},
    candidate,{workGeneration:work.generation,profileHash:digest(profile),factoryVersion:q.factoryVersion});
  const [decision]=await db.query('SELECT admission_authority_snapshot FROM engineering_routing_decisions WHERE id=$1',[decisionId]);
  const deadline=decision.admission_authority_snapshot.contract.deadline;
  const identity={factoryId:q.factoryId,repository:work.repository,baseSha:q.inputCommit,allowedPaths:profile.allowedPaths,deadline,runId,workId:work.id,workVersion:work.version,workGeneration:work.generation,writerGeneration:Number(run.writer_generation),
    dispatchIdentity:run.dispatch_identity,requestId:q.requestId,remoteRunId:q.runId,workOrderId:q.workOrderId,factoryVersion:q.factoryVersion};
  const quiescence={...identity,state:'COMPLETED',quiescent:true,evidenceRef:'synthetic-terminal-custody:'+q.runId};
  const spend=workSpendV2Schema.parse({contractVersion:'WORK_LEDGER_V2',status:'KNOWN',currency:'USD',unit:'microUSD',workId:work.id,
    workGeneration:work.generation,requestId:q.requestId,workOrderId:q.workOrderId,deadline,
    ceilingMicrousd:1300000,settledMicrousd:0,retainedMicrousd:0,availableMicrousd:1300000,cancelled:false,operations:[],pricingRevision:'synthetic-only',
    plannedProductiveOperations:1,plannedCompletionOperations:1,perOperationReserveMicrousd:1000,completionReserveMicrousd:1000,
    completionReserveRemainingMicrousd:1000,productiveAllowanceRemainingMicrousd:1299000,unknownExposureMicrousd:0,
    paidOperationsUsed:0,maxPaidOperations:2,completionOperationsUsed:0,completionOperationSlotsRemaining:1,accountingComplete:true,
    pricingQualified:true,authorityState:'fenced',phase:'completion'});
  const now=new Date().toISOString(),observation={observedAt:now,backendObservedAt:now,value:{identity,state:'COMPLETED',quiescent:true,spend}};
  await db.query(`UPDATE engineering_routing_decisions SET factory_observation=$2 WHERE id=$1`,[decisionId,observation]);
  await db.query(`UPDATE engineering_route_runs SET dispatch_state='TERMINAL',status='COMPLETED',fenced_at=clock_timestamp(),quiescence=$2,
    factory_candidate=$3 WHERE id=$1`,[runId,quiescence,{receiptId,candidates:[candidate],sourceFiles:{},files:{},profileHash:digest(profile)}]);
  await db.query(`INSERT INTO engineering_direct_workspaces(scope_id,scope_kind,work_id,decision_id,route_run_id,work_version,work_generation,
    criteria_version,repository,base_sha,profile_hash,deadline,source_files,draft_files,candidates,evidence,producer,factory_receipt_id,phase)
    VALUES($1,'personal',$2,$3,$4,$5,$6,$7,$8,$9,$10,clock_timestamp()+interval '60 seconds','{}','{}',$11,$12,'MYFACTORY',$13,'VERIFICATION_PASSED')`,
    [work.scopeId,work.id,decisionId,runId,work.version,work.generation,work.criteriaVersion,work.repository,q.inputCommit,digest(profile),JSON.stringify([candidate]),JSON.stringify(evidence),receiptId]);
  await db.query(`INSERT INTO engineering_direct_verification_jobs(scope_id,scope_kind,work_id,candidate_id,candidate_sha,workspace_revision,status,evidence_count,route_run_id)
    VALUES($1,'personal',$2,$3,$4,1,'COMPLETED',$5,$6)`,[work.scopeId,work.id,candidate.id,candidate.sha,evidence.length,runId]);
  const evidenceBinding={ownerScope:work.scopeId,repository:work.repository,workId:work.id,workGeneration:work.generation,
    requestId:q.requestId,workOrderId:q.workOrderId,runId:q.runId,candidateCommit:c.commit,factoryVersion:q.factoryVersion};
  for(const kind of ['TestEvidence','DiffEvidence'] as const){
    const bytes=kind==='DiffEvidence'?artifact(c.patchArtifactId):Buffer.from(JSON.stringify(manifest.evidence.map(e=>({
      command:e.command,status:e.status,exitCode:e.exitCode,candidateCommit:e.candidateCommit}))));
    const ref={id:randomUUID(),kind,mediaType:'application/octet-stream',workOrderId:q.workOrderId,runId:q.runId,candidateCommit:c.commit,
      factoryVersion:q.factoryVersion,sha256:evidenceSha(bytes),size:bytes.length,collectedAt:now,source:'owner-fixture'};
    const proofReference=evidenceReference(ref),scope={ownerScope:work.scopeId,repository:work.repository,workId:work.id,workGeneration:work.generation,requestId:q.requestId};
    const verified=verifyEvidence({scope,ref,proofReference,base64:bytes.toString('base64')},{...evidenceBinding,evidenceReference:proofReference,expectedDigest:ref.sha256,evidenceKind:kind});
    verifySignedEvidence(verified,manifest);
    await db.query(`INSERT INTO engineering_factory_evidence(scope_id,scope_kind,work_id,receipt_id,candidate_sha,reference,binding,metadata,bytes)
      VALUES($1,'personal',$2,$3,$4,$5,$6,$7,$8)`,[work.scopeId,work.id,receiptId,c.commit,proofReference,evidenceBinding,ref,bytes]);
  }
  const native=await new NativeResultStore(new DirectDevelopmentStore(store,{...config.engineering,issueNumber:1})).retain(work.id);
  return {signed,manifest,receiptId,candidate,evidence,native,observation,quiescence};
}
