import {readValidationGate} from './factory-validation-lifecycle.ts';
import {webPrincipal,requireSameOrigin} from '../web-auth.ts';
import {productionValidationEnabled,productionValidationConfiguration} from './production-runtime-guard.ts';
import {WorkStore} from './store.ts';
import {factoryConfig} from './factory-routing.ts';
import {productionInstallation} from './production-installation.ts';
import {engineeringConfig} from './runtime.ts';
import {productionFactoryConnectionSchema} from './factory-live-adapter.ts';
import {digest} from './contract.ts';
import {enqueueFactoryCommand} from './factory-commands.ts';
import {wakeCloudController} from './cloud-controller-queue.ts';
import {FactoryEvidenceStore} from './factory-evidence-store.ts';
import {FactoryReceiptStore} from './factory-receipt-store.ts';
import {verifyResult,type ResultManifest} from './factory-producer-protocol.ts';
import {attestFactoryManifest} from './factory-authenticated-result.ts';
import type {FactoryConnection} from './factory-live-adapter.ts';
import type {Work} from './types.ts';
import {productionEvidenceIsolation} from './production-evidence-isolation.ts';

export function assertProductionValidationProof(manifest:ResultManifest,work:Work,connection:FactoryConnection,candidate:string){
 const e=manifest.execution,v=manifest.verification;
 if(!('source' in connection)||connection.qualification.mode!=='CLOUD_PRODUCTION_VALIDATION'||manifest.status!=='COMPLETED'||manifest.candidate?.commit!==candidate||e.factoryId!=='myfactory-cloud-production'||
  e.factoryVersion!==connection.factoryVersion||e.sourceDigest!==connection.sourceDigest||e.configurationDigest!==connection.configurationDigest||e.inputCommit!==connection.source.commit||e.inputTree!==connection.source.tree||
  e.configuration.model!=='none'||e.configuration.executor!=='operator-authored-candidate-validation'||e.configuration.cloud?.evidenceClass!=='DETERMINISTIC'||!v||v.workId!==work.id||v.workGeneration!==work.generation||v.outcome!=='PASS'||!v.cleanupConfirmed)throw Error('VALIDATION_PROVENANCE_MISMATCH');
}

/** Saved Proof keeps its original execution identity across source upgrades.
 * This projection is read-only; execution still uses factoryConfig(). */
export async function retainedValidationProofConnection(pin:ReturnType<typeof productionValidationConfiguration>,work:Work){
 const engineering=await engineeringConfig(),installed=productionInstallation();
 const connection=productionFactoryConnectionSchema.parse({...(pin.factory.connection as Record<string,unknown>),...installed.connection,releaseValidation:true,
  evidence:{ownerScope:engineering.ownerId,token:process.env.FACTORY_PROOF_TOKEN,expiresAt:process.env.FACTORY_PROOF_EXPIRES_AT}});
 if(work.id!==pin.work.id||work.generation!==pin.work.generation||work.scopeId!==engineering.ownerId||
  work.repository!==engineering.profile.repository||connection.source.repository!==work.repository||
  connection.source.commit!==engineering.approvedBase.sha||connection.source.commit!==pin.source.sha||
  connection.factoryId!=='myfactory-cloud-production'||connection.qualification.scopeId!==work.scopeId||
  connection.qualification.profileHash!==digest(engineering.profile)||
  connection.factoryVersion!==digest({sourceDigest:connection.sourceDigest,configurationDigest:connection.configurationDigest}))throw Error('VALIDATION_RETAINED_PROOF_BINDING');
 return connection;
}

/** Owner-only release operation. The caller cannot supply a Work, source,
 * candidate, model, provider, destination or authority grant. */
export async function handleProductionValidation(request:Request){
 const headers={'cache-control':'private, no-store'};
 const principal=webPrincipal(request,{...process.env,NODE_ENV:'production'});
 if(!principal)return Response.json({error:'Sign in first.'},{status:401,headers});
 if(principal.id!==process.env.MYEVE_OWNER_ID)return Response.json({error:'Owner required.'},{status:403,headers});
 if(request.method==='POST'){const denied=requireSameOrigin(request);if(denied)return denied;}
 if(!productionValidationEnabled())return new Response(null,{status:404,headers});
 try{
  const pin=productionValidationConfiguration();
  const store=new WorkStore({scopeId:principal.id,actorId:principal.id,scopeKind:'personal'}),work=await store.get(pin.work.id);
  if(work.generation!==pin.work.generation)throw Error('VALIDATION_WORK_CHANGED');
  if(request.method==='POST'){
   const config=await factoryConfig();
   const queued=await enqueueFactoryCommand(store,work.id,{operation:'start',expectedWorkVersion:work.version,expectedWorkGeneration:work.generation},{ownerId:principal.id,repository:config.engineering.profile.repository,maxCostUsd:1,maxDurationSeconds:180});
   await wakeCloudController(store,queued.command.id);
   return Response.json({state:'QUEUED',workId:work.id,modelExecution:'DISABLED',publication:'DISABLED'},{headers});
  }
  const gate=await readValidationGate(store,work);
  if(gate.state!=='COMPLETED')return Response.json({state:gate.state,workId:work.id,modelExecution:'DISABLED',publication:'DISABLED'},{headers});
  const connection=await retainedValidationProofConnection(pin,work);
  const [row]=await store.database.query(`SELECT r.id,r.proof,a.request_id,a.receipt_id FROM engineering_native_results r
   JOIN engineering_factory_requests q ON q.scope_id=r.scope_id AND q.scope_kind=r.scope_kind AND q.work_id=r.work_id AND q.current AND NOT q.cancelled
   JOIN engineering_factory_admissions a ON a.request_id=q.id
   JOIN engineering_factory_receipts x ON x.id=a.receipt_id AND x.state='ADMITTED' AND x.provenance#>>'{manifest,candidate,commit}'=r.candidate_sha
   WHERE r.scope_id=$1 AND r.scope_kind='personal' AND r.work_id=$2 AND r.work_version=$3 AND r.work_generation=$4
    AND (q.binding->>'workVersion')::integer=$3 AND (q.binding->>'workGeneration')::integer=$4
   ORDER BY r.created_at DESC LIMIT 1`,[principal.id,work.id,work.version,work.generation]);
  if(!row)return Response.json({state:'AWAITING_EVIDENCE',workId:work.id,modelExecution:'DISABLED'},{headers});
  const proof=row.proof as {outcome:string;evidence:{state:string}[];artifactRefs:string[]};
  if(proof.outcome!=='PARTIAL'||!proof.evidence.length||proof.evidence.some(e=>e.state!=='PASS'))throw Error('VALIDATION_VERIFICATION_INCOMPLETE');
  const receipts=new FactoryReceiptStore(store.principal,store.database),bound=await receipts.request(String(row.request_id)),receipt=await receipts.get(String(row.request_id),String(row.receipt_id));
  if(bound.binding.requestId!==gate.requestId||connection.factoryVersion!==gate.factoryVersion)throw Error('VALIDATION_COMPLETION_BINDING');
  if(!bound.eligible||bound.binding.workVersion!==work.version||bound.binding.workGeneration!==work.generation)throw Error('VALIDATION_CURRENT_RECEIPT_REQUIRED');
  const verified=verifyResult(JSON.parse(receipt.envelope),{...bound.binding,keys:connection.keys});
  attestFactoryManifest(verified.manifest,bound.binding);
  assertProductionValidationProof(verified.manifest,work,connection,(row.proof as {resultRevision:string}).resultRevision);
  const refs=(row.proof as {artifactRefs:string[]}).artifactRefs.filter(ref=>ref.startsWith('factory-evidence:sha256:'));
  const evidence=await Promise.all(refs.map(ref=>new FactoryEvidenceStore(store).readProof(work.id,String(row.id),ref)));
  if(evidence.length!==2||evidence.map(e=>e.ref.kind).sort().join(',')!=='DiffEvidence,TestEvidence')throw Error('VALIDATION_PROOF_INCOMPLETE');
  if(evidence.some(e=>e.scope.workGeneration!==work.generation||e.scope.workId!==work.id||e.ref.factoryVersion!==connection.factoryVersion||e.ref.candidateCommit!==verified.manifest.candidate!.commit))throw Error('VALIDATION_EVIDENCE_BINDING');
  const isolation=await productionEvidenceIsolation(store,connection,String(row.id),evidence);
  return Response.json({state:'PASS',workId:work.id,resultId:row.id,proofReferences:refs,evidence:evidence.map(e=>({kind:e.ref.kind,sha256:e.ref.sha256,size:e.ref.size})),isolation,modelExecution:'DISABLED',publication:'DISABLED'},{headers});
 }catch{return Response.json({state:'BLOCKED',error:'Production evidence validation requires reconciliation of the same Work.',modelExecution:'DISABLED'},{status:503,headers});}
}
