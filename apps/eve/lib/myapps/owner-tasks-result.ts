import {createHash} from 'node:crypto';
import {WorkStore,type WorkDatabase} from '../engineering/store.ts';
import {digest} from '../engineering/contract.ts';
import {factoryConfig,type FactoryRuntime} from '../engineering/factory-routing.ts';
import {observeAuthenticatedFactoryResult} from '../engineering/factory-authenticated-result.ts';
import {cloudProtectedEvidence} from '../engineering/factory-cloud-verifier.ts';
import {readJourneyAccounting} from '../engineering/journey-accounting.ts';
import {workSpendV2Schema,validateSpendBinding} from '../engineering/factory-spend.ts';
import {proofOfWorkSchema} from '../digital-worker/contracts.ts';
import {ownerEnrollmentSchema,executionPermitEnvelopeSchema,verifyExecutionPermit,verifyAdmissionReceipt} from '../missioncontrol/execution-permit.ts';
import {assertOwnerFactoryConfiguration,ownerFactoryWorkMaterial} from '../missioncontrol/owner-factory-binding.ts';
import {requireValue} from '../../../../packages/myapps/src/contracts.ts';
import {validateOrigin,type OwnerFactoryOrigin} from '../../../../packages/myapps/src/alpha-tasks/contracts.ts';

export interface OwnerFactoryTasksCustody {
  kind:'OWNER_FACTORY';
  /** Trusted operator configuration, never a package or request-body field. */
  readConfig?:()=>Promise<FactoryRuntime>;
}

/** Read-only canonical owner custody. No External Alpha policy, authority or third tester slot. */
export async function retainedOwnerTasksOrigin(database:WorkDatabase,ownerId:string,resultId:string,custody:OwnerFactoryTasksCustody) {
  requireValue(database.atomic&&custody.kind==='OWNER_FACTORY','APP_RESULT_UNAVAILABLE');
  const config=await (custody.readConfig??factoryConfig)();
  requireValue(config.engineering.ownerId===ownerId,'APP_OWNER_MISMATCH');
  return database.atomic!(async db=>{
    await db.query("SELECT set_config('myeve.missioncontrol_owner',$1,true)",[ownerId]);
    const [enrolled]=await db.query('SELECT missioncontrol_enrollment_document($1) AS document',[ownerId]);
    const enrollment=ownerEnrollmentSchema.parse(enrolled?.document);
    requireValue(enrollment.ownerId===ownerId&&enrollment.ownerFactoryAdapter,'APP_MISSION_BINDING');
    const [lookup]=await db.query(`SELECT q.work_id FROM engineering_factory_receipts f
      JOIN engineering_factory_requests q ON q.id=f.request_id
      WHERE f.id=$2 AND q.scope_id=$1 AND q.scope_kind='personal'`,[ownerId,resultId]);
    requireValue(lookup,'APP_EVIDENCE_PENDING');
    await db.query("SELECT id FROM engineering_work WHERE scope_id=$1 AND scope_kind='personal' AND id=$2 FOR SHARE",[ownerId,lookup.work_id]);
    const rows=await db.query(`SELECT n.id AS native_result_id,n.proof,n.content_hash,n.candidate_sha,
      r.id AS route_run_id,r.decision_id,r.writer_generation,r.dispatch_identity,r.missioncontrol_binding,
      r.work_id,r.work_version,r.work_generation,r.dispatch_state,r.quiescence,r.fenced_at,r.factory_candidate,
      q.id AS factory_request_id,q.binding AS factory_binding,q.verified_manifest_digest,
      f.id AS result_id,f.envelope,f.state AS receipt_state,a.manifest_digest,
      ws.profile_hash,ws.phase,ws.producer,ws.factory_receipt_id,ws.candidates,ws.evidence,ws.criteria_version,
      j.status AS job_status,j.evidence_count,d.factory_observation
      FROM engineering_factory_receipts f JOIN engineering_factory_admissions a ON a.receipt_id=f.id AND a.request_id=f.request_id
      JOIN engineering_factory_requests q ON q.id=a.request_id
      JOIN engineering_route_runs r ON r.factory_request_id=q.id AND r.scope_id=q.scope_id AND r.scope_kind=q.scope_kind AND r.work_id=q.work_id
      JOIN engineering_routing_decisions d ON d.id=r.decision_id AND d.scope_id=r.scope_id AND d.scope_kind=r.scope_kind AND d.work_id=r.work_id
      JOIN engineering_direct_workspaces ws ON ws.route_run_id=r.id AND ws.scope_id=r.scope_id AND ws.scope_kind=r.scope_kind AND ws.work_id=r.work_id
      JOIN engineering_native_results n ON n.scope_id=r.scope_id AND n.scope_kind=r.scope_kind AND n.work_id=r.work_id
        AND n.work_version=r.work_version AND n.work_generation=r.work_generation AND n.candidate_sha=ws.candidates->-1->>'sha'
      JOIN engineering_direct_verification_jobs j ON j.scope_id=ws.scope_id AND j.scope_kind=ws.scope_kind AND j.work_id=ws.work_id
        AND j.candidate_sha=n.candidate_sha AND j.route_run_id=r.id
      WHERE f.id=$2 AND r.scope_id=$1 AND r.scope_kind='personal'`,[ownerId,resultId]);
    requireValue(rows.length===1,'APP_EVIDENCE_PENDING');
    const row=rows[0],binding=row.missioncontrol_binding,q=row.factory_binding;
    requireValue(binding?.schema==='mc-owner-factory-admission/v1'&&row.receipt_state==='ADMITTED'
      &&row.dispatch_state==='TERMINAL'&&row.quiescence&&row.fenced_at
      &&row.quiescence.state==='COMPLETED'&&row.quiescence.quiescent===true
      &&row.quiescence.runId===row.route_run_id&&row.quiescence.writerGeneration===Number(row.writer_generation)
      &&row.quiescence.dispatchIdentity===row.dispatch_identity&&row.quiescence.requestId===q.requestId
      &&row.quiescence.remoteRunId===q.runId&&row.quiescence.workOrderId===q.workOrderId
      &&binding.factoryRequestId===row.factory_request_id&&digest(binding.factoryBinding)===digest(q)
      &&binding.routeRunId===row.route_run_id&&binding.routeDecisionId===row.decision_id
      &&binding.writerGeneration===Number(row.writer_generation)&&binding.dispatchIdentity===row.dispatch_identity,
      'APP_RESULT_BINDING');
    const store=new WorkStore({scopeId:ownerId,scopeKind:'personal',actorId:ownerId},db),work=await store.get(row.work_id);
    requireValue((work.lifecycle==='active'&&work.control==='agent'&&work.version===row.work_version&&work.generation===row.work_generation)
      ||work.lifecycle==='accepted','APP_WORK_STALE');
    assertOwnerFactoryConfiguration(work,enrollment,config);
    const material=ownerFactoryWorkMaterial({...work,version:row.work_version,generation:row.work_generation},enrollment);
    requireValue(digest(material)===binding.origin.tupleSha256&&digest(binding.origin.tupleMaterial)===binding.origin.tupleSha256
      &&q.workId===work.id&&q.workVersion===row.work_version&&q.workGeneration===row.work_generation
      &&q.criteriaVersion===work.criteriaVersion&&q.factoryVersion===config.connection.factoryVersion
      &&q.factoryId===config.connection.factoryId&&q.sourceDigest===config.connection.sourceDigest
      &&q.configurationDigest===config.connection.configurationDigest&&q.agentId===config.engineering.agentId,
      'APP_MISSION_BINDING');
    const [retained]=await db.query(`SELECT p.envelope,r.envelope AS receipt,r.receipt_sha256 FROM missioncontrol_execution_permits p
      JOIN missioncontrol_admission_receipts r ON r.owner_id=p.owner_id AND r.permit_id=p.permit_id
      WHERE p.owner_id=$1 AND p.permit_id=$2 AND r.command_id=$3
        AND NOT EXISTS(SELECT 1 FROM missioncontrol_permit_controls c WHERE c.owner_id=p.owner_id AND c.permit_id=p.permit_id AND c.operation='revoke')`,
      [ownerId,binding.permitId,binding.commandId]);
    requireValue(retained,'APP_MISSION_BINDING');
    const packet=executionPermitEnvelopeSchema.parse(retained.envelope),permit=verifyExecutionPermit(packet,enrollment,
      {ownerId,workId:work.id,workVersion:row.work_version,workGeneration:row.work_generation,
        tupleSha256:binding.origin.tupleSha256,maxCostMicrousd:Math.round(work.maxCostUsd*1e6),maxDurationSeconds:work.maxDurationSeconds},packet.document.issuedAt);
    const receipt=retained.receipt;
    verifyAdmissionReceipt(receipt,permit,{commandId:binding.commandId,challenge:receipt?.document?.challenge,
      policyPairSha256:receipt?.document?.policyPairSha256},receipt?.document?.issuedAt);
    requireValue(permit.permitSha256===binding.permitSha256&&digest(receipt)===retained.receipt_sha256
      &&retained.receipt_sha256===binding.receiptSha256,'APP_MISSION_BINDING');
    const signed=JSON.parse(row.envelope),verified=observeAuthenticatedFactoryResult(signed,q,config.connection.keys);
    const manifest=verified.manifest,candidate=row.candidates.at(-1),proof=proofOfWorkSchema.parse(row.proof),profile=config.engineering.profile;
    requireValue(verified.keyValidForCurrentUse&&manifest.status==='COMPLETED'&&manifest.candidate
      &&manifest.execution.version===2&&manifest.execution.inputTree
      &&digest(manifest)===row.manifest_digest&&row.verified_manifest_digest===row.manifest_digest
      &&digest(proof)===row.content_hash&&proof.workId===work.id&&proof.workVersion===row.work_version
      &&proof.criteriaVersion===work.criteriaVersion&&proof.resultRevision===row.candidate_sha
      &&['PARTIAL','COMPLETED'].includes(proof.outcome)&&row.criteria_version===work.criteriaVersion
      &&row.producer==='MYFACTORY'&&row.factory_receipt_id===row.result_id
      &&row.phase==='VERIFICATION_PASSED'&&row.job_status==='COMPLETED'&&row.profile_hash===digest(profile)
      &&candidate?.sha===manifest.candidate.commit&&candidate.tree===manifest.candidate.tree
      &&candidate.factoryProvenance?.receiptId===row.result_id&&candidate.factoryProvenance?.factoryVersion===q.factoryVersion
      &&candidate.attemptId===q.runId&&row.evidence_count===profile.checks.length
      &&row.evidence.length===profile.checks.length&&new Set(row.evidence.map((e:any)=>e.check)).size===profile.checks.length,
      'APP_RESULT_BINDING');
    const checks=row.evidence;
    if(profile.executor==='factory-cloud') {
      const signedChecks=cloudProtectedEvidence(manifest,{workId:work.id,baseSha:q.inputCommit,
        criteriaVersion:work.criteriaVersion,profileHash:digest(profile),profile},candidate,
        {workGeneration:row.work_generation,profileHash:digest(profile),factoryVersion:q.factoryVersion});
      requireValue(signedChecks.every(expected=>expected.result==='PASS'&&checks.some((e:any)=>e.check===expected.check
        &&e.artifact===expected.artifact&&e.artifactHash===expected.artifactHash)),'APP_EVIDENCE_PENDING');
    }
    requireValue(checks.every((e:any)=>e.result==='PASS'&&e.producer==='protected-supervisor'&&e.workId===work.id
      &&e.candidate===candidate.sha&&e.attemptId===candidate.attemptId&&e.base===q.inputCommit
      &&e.criteriaVersion===work.criteriaVersion&&e.profileHash===digest(profile)&&e.environment===profile.image
      &&e.artifactHash===digest(e.artifact)&&profile.checks.some(c=>c.id===e.check))
      &&proof.evidence.length===work.criteria.length&&work.criteria.every(c=>{
        const expected=profile.checks.filter(check=>check.criterionIds.includes(c.id));
        const linked=checks.filter((e:any)=>expected.some(check=>check.id===e.check));
        return c.method==='test'&&expected.length>0&&linked.length===expected.length
          &&proof.evidence.some(e=>e.criterionId===c.id&&e.state==='PASS'&&e.resultRevision===candidate.sha
            &&e.producer==='trusted-verifier'&&e.contentHash==='sha256:'+digest(linked));
      }),'APP_EVIDENCE_PENDING');
    // A settled aggregate cannot replace the original exact-attempt ledger. Terminal
    // custody is immutable; app use does not require a new remote execution or lease.
    const remote=row.factory_observation?.value,identity=remote?.identity,terminal=row.quiescence;
    requireValue(remote?.state==='COMPLETED'&&remote?.quiescent===true&&identity
      &&['runId','writerGeneration','dispatchIdentity','workId','workGeneration','factoryId','factoryVersion',
        'requestId','workOrderId','remoteRunId','repository','baseSha','deadline'].every(key=>identity[key]===terminal[key])
      &&terminal.workId===work.id&&terminal.workGeneration===row.work_generation
      &&terminal.factoryId===q.factoryId&&terminal.factoryVersion===q.factoryVersion
      &&terminal.repository===work.repository&&terminal.baseSha===q.inputCommit,'APP_EVIDENCE_PENDING');
    const spend=workSpendV2Schema.parse(remote.spend);
    validateSpendBinding(spend,terminal,work.maxCostUsd);
    requireValue(spend.status==='KNOWN'&&spend.accountingComplete&&spend.retainedMicrousd===0
      &&spend.unknownExposureMicrousd===0,'APP_EVIDENCE_PENDING');
    const accounting=await readJourneyAccounting(store,work.id);
    requireValue(accounting.coverage==='COMPLETE'&&accounting.unknownExposureMicrousd===0&&accounting.reservedMicrousd===0,'APP_EVIDENCE_PENDING');
    const pending=await db.query(`SELECT 1 FROM engineering_route_runs WHERE scope_id=$1 AND scope_kind='personal' AND work_id=$2
      AND status NOT IN('COMPLETED','FAILED','CANCELLED') LIMIT 1`,[ownerId,work.id]);
    requireValue(pending.length===0,'APP_EVIDENCE_PENDING');
    const p=permit.document,e=manifest.execution,c=manifest.candidate!;
    const origin=validateOrigin({schema:'myapps.owner-factory-origin/v1',ownerId,installationId:p.installationId,connectionId:p.connectionId,
      tenantId:p.tenantId,projectId:p.projectId,missionId:p.missionId,planId:p.planId,planDigest:p.planDigest,
      workOrderId:p.workOrderId,workOrderRevisionId:p.workOrderRevisionId,workId:work.id,workVersion:row.work_version,
      workGeneration:row.work_generation,tupleSha256:p.work.tupleSha256,permitId:p.permitId,permitDigest:permit.permitSha256,
      admissionCommandId:binding.commandId,admissionReceiptDigest:binding.receiptSha256,resultId:row.result_id,nativeResultId:row.native_result_id,
      resultDigest:row.manifest_digest,proofHash:row.content_hash,routeRunId:row.route_run_id,routeDecisionId:row.decision_id,
      writerGeneration:Number(row.writer_generation),dispatchIdentity:row.dispatch_identity,factoryWorkOrderId:e.workOrderId,
      attemptNumber:e.attemptNumber,requestId:e.requestId,requestDigest:e.requestDigest,runId:e.runId,factoryVersion:e.factoryVersion,
      sourceDigest:e.sourceDigest,configurationDigest:e.configurationDigest,inputCommit:e.inputCommit,inputTree:e.inputTree,
      candidateCommit:c.commit,candidateTree:c.tree,patchDigest:c.patchDigest}) as OwnerFactoryOrigin;
    return {origin,currentWork:{version:work.version,generation:work.generation},originalProof:proof,
      signedEnvelopeDigest:createHash('sha256').update(row.envelope).digest('hex'),acceptance:null};
  });
}
