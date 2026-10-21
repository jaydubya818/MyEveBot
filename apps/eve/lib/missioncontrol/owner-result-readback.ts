import {digest} from '../engineering/contract.ts';
import {WorkStore,type WorkDatabase} from '../engineering/store.ts';
import {readJourneyAccounting} from '../engineering/journey-accounting.ts';
import {workSpendV2Schema,validateSpendBinding} from '../engineering/factory-spend.ts';
import {admissionEnvelopeSchema,type ExecutionPermit} from './execution-permit.ts';

/** Projection of original owner Factory custody, never an alpha authority or a new Result. */
export async function ownerFactoryResultReadback(database:WorkDatabase,permit:ExecutionPermit,now=Date.now()) {
  const [row]=await database.query(`SELECT r.*,d.factory_observation,q.binding AS request_binding,a.manifest_digest,
    f.id AS receipt_id,f.envelope,n.id AS native_result_id,n.proof,n.content_hash
    FROM engineering_route_runs r JOIN engineering_routing_decisions d ON d.id=r.decision_id
    JOIN engineering_factory_requests q ON q.id=r.factory_request_id
    LEFT JOIN engineering_factory_admissions a ON a.request_id=q.id
    LEFT JOIN engineering_factory_receipts f ON f.id=a.receipt_id AND f.request_id=q.id
    LEFT JOIN engineering_native_results n ON n.scope_id=r.scope_id AND n.scope_kind=r.scope_kind AND n.work_id=r.work_id
      AND n.work_version=r.work_version AND n.work_generation=r.work_generation
      AND n.candidate_sha=r.factory_candidate#>>'{candidates,0,sha}'
    WHERE r.scope_id=$1 AND r.scope_kind='personal' AND r.work_id=$2 AND r.work_version=$3 AND r.work_generation=$4
      AND r.missioncontrol_binding->>'permitId'=$5`,[permit.ownerId,permit.work.id,permit.work.version,permit.work.generation,permit.permitId]);
  if(!row)return {status:'PENDING' as const,admission:null,result:null};
  const binding=row.missioncontrol_binding,q=row.request_binding,observation=row.factory_observation;
  if(binding.factoryRequestId!==row.factory_request_id||digest(binding.factoryBinding)!==digest(q)
    ||binding.origin.tupleSha256!==permit.work.tupleSha256||digest(binding.origin.tupleMaterial)!==permit.work.tupleSha256)
    throw Error('MISSIONCONTROL_RESULT_INTEGRITY');
  const [receiptRow]=await database.query('SELECT envelope,receipt_sha256 FROM missioncontrol_admission_receipts WHERE owner_id=$1 AND command_id=$2 AND permit_id=$3',[permit.ownerId,binding.commandId,permit.permitId]);
  const admissionReceipt=admissionEnvelopeSchema.parse(receiptRow?.envelope);
  if(digest(admissionReceipt)!==binding.receiptSha256||receiptRow.receipt_sha256!==binding.receiptSha256)throw Error('MISSIONCONTROL_RESULT_INTEGRITY');
  const admission={admissionReceipt,schema:'mc-owner-factory-admission/v1' as const,binding,originalFactoryReadback:observation??null,
    dispatchState:row.dispatch_state,quiescence:row.quiescence,fencedAt:row.fenced_at?new Date(row.fenced_at).toISOString():null};
  if(!row.envelope||!row.proof)return {status:'PENDING' as const,admission,result:null};
  const signedResult=JSON.parse(row.envelope),manifest=JSON.parse(Buffer.from(signedResult.encoded,'base64url').toString('utf8'));
  if(digest(manifest)!==row.manifest_digest||digest(row.proof)!==row.content_hash
    ||manifest.execution.requestDigest!==q.requestDigest||manifest.execution.runId!==q.runId
    ||manifest.execution.workOrderId!==q.workOrderId||manifest.execution.attemptNumber!==q.attemptNumber
    ||manifest.candidate?.commit!==row.proof.resultRevision)throw Error('MISSIONCONTROL_RESULT_INTEGRITY');
  const store=new WorkStore({scopeId:permit.ownerId,scopeKind:'personal',actorId:permit.ownerId},database);
  const accounting=await readJourneyAccounting(store,permit.work.id),remote=observation?.value,identity=remote?.identity;
  const fresh=observation&&Date.parse(observation.backendObservedAt)<=now&&Date.parse(observation.backendObservedAt)>now-30000;
  const exact=identity?.requestId===q.requestId&&identity?.remoteRunId===q.runId&&identity?.workOrderId===q.workOrderId
    &&identity?.runId===row.id&&identity?.writerGeneration===Number(row.writer_generation)&&identity?.dispatchIdentity===row.dispatch_identity;
  const spend=workSpendV2Schema.safeParse(remote?.spend);
  if(spend.success&&exact)validateSpendBinding(spend.data,identity);
  const cleanupConfirmed=Boolean(manifest.verification?.cleanupConfirmed===true&&fresh&&exact&&row.dispatch_state==='TERMINAL'&&row.quiescence&&row.fenced_at&&remote?.quiescent===true&&['COMPLETED','FAILED','CANCELLED','NOT_DISPATCHED'].includes(remote.state));
  const exposureUnknown=accounting.unknownExposureMicrousd>0||!spend.success||spend.data.status==='UNKNOWN'||spend.data.unknownExposureMicrousd>0;
  const settled=cleanupConfirmed&&!exposureUnknown&&accounting.coverage==='COMPLETE'&&accounting.reservedMicrousd===0
    &&spend.success&&spend.data.accountingComplete&&spend.data.retainedMicrousd===0;
  const result={signedResult,resultId:row.receipt_id,manifestDigest:row.manifest_digest,nativeResultId:row.native_result_id,
    proof:row.proof,proofHash:row.content_hash,cleanupConfirmed,settlementState:settled?'SETTLED':'PENDING',exposureUnknown,accounting,acceptance:null};
  return {status:settled?'SETTLED' as const:'PENDING' as const,admission,result};
}
