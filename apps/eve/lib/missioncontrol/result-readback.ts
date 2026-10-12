import { createHash } from 'node:crypto';
import type { WorkDatabase } from '../engineering/store.ts';
import { WorkStore } from '../engineering/store.ts';
import { readExternalAlphaWork } from '../external-alpha/work-readback.ts';
import { canonicalPermitJson, executionPermitEnvelopeSchema, ownerEnrollmentSchema, permitDigest } from './execution-permit.ts';
import type { ResultRequest } from './result-protocol.ts';

/** Original signed evidence and canonical correlation; never a new Result verdict. */
export async function missionControlResultReadback(database:WorkDatabase,request:ResultRequest) {
  if(!database.atomic)throw Error('MISSIONCONTROL_TRANSACTION_REQUIRED');
  return database.atomic(async database=>{
    await database.query("SELECT set_config('myeve.missioncontrol_owner',$1,true)",[request.ownerId]);
    const [enrollmentRow]=await database.query('SELECT missioncontrol_enrollment_document($1) AS document',[request.ownerId]);
    const enrollment=ownerEnrollmentSchema.parse(enrollmentRow?.document),now=Date.now();
    if(enrollment.revokedAt!==null||enrollment.activeFrom>now||enrollment.expiresAt<=now
      ||request.connectionId!==enrollment.connectionId||request.installationId!==enrollment.installationId
      ||request.ownerId!==enrollment.ownerId||request.projectId!==enrollment.projectId)throw Error('MISSIONCONTROL_RESULT_ACCESS_DENIED');
    const [permitRow]=await database.query('SELECT envelope,permit_sha256 FROM missioncontrol_execution_permits WHERE owner_id=$1 AND permit_id=$2',[request.ownerId,request.permitId]);
    const permit=executionPermitEnvelopeSchema.parse(permitRow?.envelope).document;
    if(permit.connectionId!==request.connectionId||permitDigest(permit)!==permitRow.permit_sha256
      ||permit.ownerId!==request.ownerId||permit.installationId!==request.installationId||permit.projectId!==request.projectId)
      throw Error('MISSIONCONTROL_RESULT_ACCESS_DENIED');
    const store=new WorkStore({scopeId:request.ownerId,scopeKind:'personal',actorId:request.ownerId},database);
    const work=await store.get(permit.work.id),readback=await readExternalAlphaWork(store,work);
    const [row]=await database.query(`SELECT a.id,a.request_id,a.document_sha256,a.document,a.receipt,a.state,d.request_digest,d.admitted_deadline,
      r.envelope,r.result_id,r.exposure_unknown,r.settlement_state,r.cleanup_confirmed,r.manifest_digest,
      o.readback,o.readback_sha256
      FROM external_alpha_work_authority a JOIN external_alpha_work_dispatch d ON d.authority_id=a.id AND d.owner_id=a.owner_id
      LEFT JOIN external_alpha_work_result r ON r.authority_id=a.id AND r.owner_id=a.owner_id
      LEFT JOIN LATERAL(SELECT readback,readback_sha256 FROM missioncontrol_factory_readbacks
        WHERE owner_id=a.owner_id AND authority_id=a.id ORDER BY observed_at DESC,readback_sha256 LIMIT 1) o ON true
      WHERE a.owner_id=$1 AND a.work_id=$2 AND a.work_version=$3 AND a.work_generation=$4`,
      [request.ownerId,permit.work.id,permit.work.version,permit.work.generation]);
    let admission=null,result=null,status:'PENDING'|'SETTLED'|'NO_RESULT'='PENDING';
    if(row?.readback){
      if(createHash('sha256').update(canonicalPermitJson(row.readback)).digest('hex')!==row.readback_sha256
        ||row.readback.readbackAttestation?.authorityId!==row.id||row.readback.readbackAttestation?.requestId!==row.request_id
        ||row.readback.readbackAttestation?.requestDigest!==row.request_digest)throw Error('MISSIONCONTROL_RESULT_INTEGRITY');
      admission={authorityId:row.id,authoritySha256:row.document_sha256,authorityDocument:row.document,
        requestId:row.request_id,requestDigest:row.request_digest,admittedDeadline:new Date(row.admitted_deadline).toISOString(),
        factoryWorkOrderId:row.readback.readbackAttestation.workOrderId,runId:row.readback.readbackAttestation.runId,
        attemptNumber:row.readback.readbackAttestation.attemptNumber,originalSignedReadback:row.readback};
      if(row.envelope&&readback?.result){
        const signedResult=JSON.parse(row.envelope),manifest=JSON.parse(Buffer.from(signedResult.encoded,'base64url').toString('utf8'));
        if(manifest.execution.runId!==admission.runId||manifest.execution.requestDigest!==admission.requestDigest
          ||manifest.execution.workOrderId!==admission.factoryWorkOrderId||readback.result.resultId!==row.result_id)
          throw Error('MISSIONCONTROL_RESULT_INTEGRITY');
        result={signedResult,resultId:row.result_id,manifestDigest:row.manifest_digest,proof:readback.result.proof,
          proofHash:readback.result.contentHash,verdict:readback.result.verdict,cleanupConfirmed:row.cleanup_confirmed===true,
          settlementState:row.settlement_state,exposureUnknown:row.exposure_unknown,accounting:readback.accounting,
          acceptance:readback.acceptance??null};
        const attestation=row.readback.readbackAttestation;
        const fresh=Date.parse(attestation.issuedAt)<=now&&Date.parse(attestation.expiresAt)>now
          &&Date.parse(attestation.expiresAt)-Date.parse(attestation.issuedAt)<=120000;
        if(fresh&&result.settlementState==='SETTLED'&&result.exposureUnknown===false&&result.cleanupConfirmed
          &&result.accounting.unknownMicrousd===0)status='SETTLED';
      }else if(readback?.factoryOutcome)status='NO_RESULT';
    }
    const observedAt=Date.now(),expiresAt=Math.min(observedAt+30000,request.expiresAt,enrollment.expiresAt);
    if(expiresAt<=observedAt)throw Error('MISSIONCONTROL_RESULT_REQUEST_EXPIRED');
    return {schema:'mc-result-readback/v1' as const,commandId:request.commandId,challenge:request.challenge,
      connectionId:request.connectionId,installationId:request.installationId,ownerId:request.ownerId,permitId:permit.permitId,
      permitSha256:permitDigest(permit),missionId:permit.missionId,planId:permit.planId,workOrderId:permit.workOrderId,
      workOrderRevisionId:permit.workOrderRevisionId,work:permit.work,observedAt,expiresAt,status,admission,result};
  });
}
