import { readExternalAlphaWork, type ExternalAlphaWorkReadback } from "../external-alpha/work-readback.ts";
import { currentPublicationReadback, type PublicationReadback } from './publication-contract.ts';
import { readJourneyAccounting, type JourneyAccounting } from "./journey-accounting.ts";
import type {FactorySpend,FactorySpendSummary} from './factory-spend.ts';
import { nativeExecutionCapsule, type NativeExecutionCapsule } from "./native-execution-controller.ts";
import { proofOfWorkSchema, type ProofOfWork } from "../digital-worker/contracts.ts";
import { digest } from "./contract.ts";
import { ExecutionStore } from "./execution-store.ts";
import { manifest, type Execution } from "./execution.ts";
import { RoutingStore, routingForWorkVersion, type RoutingSnapshot } from "./routing-store.ts";
import { WorkStore } from "./store.ts";
import { NativeRouteAuthority } from "./native-routing.ts";
import { projectRuns, type ObservedRunInput } from "./run-truth.ts";
import { WorkError, type Work } from "./types.ts";

type CurrentManifest = ReturnType<typeof manifest>;

export interface EngineeringWorkerProjection {
  externalAlpha?: ExternalAlphaWorkReadback | null;
  publicationReadback?:PublicationReadback|null;
  factoryAccounting?:FactorySpendSummary;
  journeyAccounting?:JourneyAccounting;
  factoryPreparation?: {requestId:string;state:string;blocker:string|null};
  factoryWriter?: {requestId?:string;dispatchIdentity?:string;remoteRunId?:string;runId:string;writerGeneration:number;state:string;stopReason:string|null;candidateProducer:string|null;factoryId?:string;factoryVersion?:string;workOrderId?:string;attempt?:number;receiptId?:string;observation?:{state?:string;reason?:string;blocker?:string;spend?:FactorySpend;accounting?:FactorySpendSummary}};
  workId: string;
  title: string;
  objective: string;
  workVersion: number;
  workGeneration: number;
  criteriaVersion: number;
  lifecycle: Work["lifecycle"];
  control: Work["control"];
  workContract: {
    coordinatingAgentId: string;
    baseSha: string;
    deadline: string;
    profileId: string;
    profileVersion: number;
    policyVersion: number;
    budgetUsd: number;
  } | null;
  authoritySummary: {
    admitted: boolean;
    generationCurrent: boolean;
    deadlineCurrent: boolean;
    boundaryRecheckRequired: true;
  };
  qualificationMode: Execution["qualificationMode"] | null;
  status: string;
  activity: string;
  nextStep: string;
  readiness: { ready: boolean; reasons: string[] };
  runTruth: ReturnType<typeof projectRuns>;
  verification: { candidateSha: string | null; status: string; jobStatus: string | null; evidenceCount: number; evidenceHashes: string[] };
  candidateHistory: {sha:string;checks:string;failures:string[];evidenceCount:number}[];
  completionStatus: string;
  executionController: NativeExecutionCapsule | null;
  nativeExecution: {
    admissionStatus: "NEEDS_ADMISSION" | "ALREADY_ADMITTED";
    phase: "NEEDS_ADMISSION" | "ADMITTED_READY_FOR_PRODUCTIVE_WORK" | "IMPLEMENTING" | "VERIFYING" | "REPAIRING" | "COMPLETED" | "BLOCKED";
    nextOperation: "admit" | "open" | "read" | "plan" | "write" | "inspect" | "submit" | null;
    admissionRequired: boolean;
    runId: string | null;
    writerSessionId: string | null;
    route: "NATIVE" | null;
    control: Work["control"];
    completionContractId: string | null;
  };
  completionBudget: { ceilingUsd: number; heldUsd: number | null; remainingUsd: number | null; observed: boolean };
  draft: { revision: number; contentHash: string; differsFromCandidate: boolean } | null;
  /** Compatibility alias for the observed active Run; historical identity lives in runTruth. */
  currentRun: { id: string; status: string; startedAt: string | null; generationCurrent: boolean } | null;
  attention: CurrentManifest["attention"];
  pendingDecisions: string[];
  latestResult: { id: string; version: number; summary: string; candidate: string; createdAt: string } | null;
  conversationRuntime?: {spentUsd:number;reservedUsd:number;usageUnknown:boolean;inflight:boolean;status:string}|null;
  nativeRuntime?: {spentUsd:number;reservedUsd:number;usageUnknown:boolean;inflight:boolean}|null;
  nativeResult?: {id:string;proof:ProofOfWork;contentHash:string;current:boolean}|null;
  nativeDevelopment: {
    phase: "DRAFT" | "VERIFICATION_REQUESTED" | "VERIFICATION_FAILED" | "VERIFICATION_PASSED";
    label: string;
    revision: number;
    candidateSha: string | null;
    evidenceCount: number;
    current: boolean;
    updatedAt: string;
  } | null;
  routing: {
    decisionId: string; status: "PROPOSED" | "ADMITTED" | "STALE";
    selectedRoute: string; reason: string; providerId: string | null;
  } | null;
  repositoryObservation: CurrentManifest["repositoryObservation"] | null;
  lastMeaningfulActivity: string;
  lastChange: { kind: string; at: string; actorId: string | null; version: number | null } | null;
  source: {
    kind: "durable-engineering-work";
    readAt: string;
    workRef: string;
    executionRef: string | null;
    resultRef: string | null;
    routingRef: string | null;
  };
}

export interface EngineeringProjectionSnapshot {
  work: Work;
  execution: Execution | null;
  manifest: CurrentManifest | null;
  routing: RoutingSnapshot;
  projection: EngineeringWorkerProjection;
}

function noExecutionStatus(work: Work) {
  if (work.lifecycle !== "active") return `${work.lifecycle[0].toUpperCase()}${work.lifecycle.slice(1)}`;
  if (work.control === "human") return "In your hands";
  if (work.control === "paused") return "Paused";
  if (work.control === "stopping") return "Stopping";
  return "Waiting for admission";
}

function noExecutionNextStep(work: Work, hasRetainedResult = false) {
  if (hasRetainedResult) return "Review the retained Result and Proof. No new execution authority is implied.";
  if (work.lifecycle !== "active") return "Review the retained Work history.";
  if (work.control === "human") return "Finish your changes, then hand Work back for a fresh admission decision.";
  if (work.control === "stopping") return "Wait for control to stop before changing Work.";
  if (work.control === "paused") return "Review the Work contract, then resume when ready. No execution has started.";
  return "No route is admitted yet. Productive continuation may propose admission with the observed Work version and generation; the admission service must check current policy, qualification, budget and writer state. This observation grants no authority.";
}

function latestTime(a: string, b: string | undefined) {
  return b && Date.parse(b) > Date.parse(a) ? b : a;
}

/** One owner-scoped read model for Work, Chat and the engineering_work tool.
 * It derives readiness from the existing manifest and never grants execution authority. */
export class EngineeringWorkerProjectionStore {
  constructor(readonly workStore: WorkStore, readonly coordinatingAgentId?: string,
    readonly observeNativeAuthority = (id: string) => new NativeRouteAuthority(workStore).assertEffect(id)) {}

  async get(id: string): Promise<EngineeringProjectionSnapshot> {
    const work = await this.workStore.get(id);
    return this.snapshot(work);
  }

  private async snapshot(work: Work): Promise<EngineeringProjectionSnapshot> {
    const id = work.id;
    const journeyAccounting = await readJourneyAccounting(this.workStore,id);
    const externalAlpha = await readExternalAlphaWork(this.workStore, work);
    const executionStore = new ExecutionStore(this.workStore);
    const scope = [this.workStore.principal.scopeId, this.workStore.principal.scopeKind, id];
    const [completionFunction]=await this.workStore.database.query(
      "SELECT to_regprocedure('engineering_completion_remaining(text,uuid)') AS present");
    const holdExpression=completionFunction?.present ? "engineering_completion_remaining(b.scope_id,b.work_id)" : "NULL::bigint";
    const [execution, route, eventRows, historyRows, nativeRows, nativeRuntimeRows, conversationRows, runRows, verificationRows, preparationRows] = await Promise.all([
      executionStore.get(id),
      new RoutingStore(this.workStore).snapshot(id),
      this.workStore.database.query(
        `SELECT kind,actor_id,version,created_at FROM engineering_work_events
         WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3
         ORDER BY version DESC LIMIT 1`, scope,
      ),
      this.workStore.database.query(
        `SELECT revision,kind,actor_id,created_at FROM engineering_execution_history
         WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3
         ORDER BY revision DESC LIMIT 1`,
        scope,
      ),
      this.workStore.database.query(
        `SELECT n.decision_id,n.route_run_id,n.work_version,n.work_generation,n.criteria_version,
                n.producer,n.phase,n.revision,n.deadline,n.candidates,n.evidence,n.updated_at,n.draft_files,n.profile_hash,n.base_sha,
                d.admission_authority_snapshot->'contract'->>'coordinatingAgentId' AS agent_id,
                result.id AS native_result_id,result.proof AS native_proof,result.content_hash AS native_proof_hash,
                result.work_generation AS native_result_generation,publication.remote AS publication_remote,publication.state AS publication_state
         FROM engineering_direct_workspaces n
         JOIN engineering_routing_decisions d ON d.id=n.decision_id AND d.scope_id=n.scope_id
           AND d.scope_kind=n.scope_kind AND d.work_id=n.work_id
         LEFT JOIN LATERAL (SELECT * FROM engineering_native_results p
           WHERE p.scope_id=n.scope_id AND p.scope_kind=n.scope_kind AND p.work_id=n.work_id
           ORDER BY p.created_at DESC,p.id DESC LIMIT 1) result ON true
         LEFT JOIN engineering_candidate_publications publication ON publication.owner_id=n.scope_id AND publication.result_id=result.id
         WHERE n.scope_id=$1 AND n.scope_kind=$2 AND n.work_id=$3`, scope,
      ),
      this.workStore.database.query(
        `SELECT route_run_id,session_id,spent_microusd,reserved_microusd,usage_unknown,inflight FROM engineering_native_runtime
         WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3`,scope),
      this.workStore.database.query(
        `SELECT b.ceiling_microusd,b.spent_microusd,b.reserved_microusd,b.status,${holdExpression} AS held_microusd,
           EXISTS(SELECT 1 FROM engineering_work_model_calls c WHERE c.work_id=b.work_id AND c.scope_id=b.scope_id AND c.scope_kind=b.scope_kind AND c.status='USAGE_UNKNOWN') AS usage_unknown,
           EXISTS(SELECT 1 FROM engineering_work_model_calls c WHERE c.work_id=b.work_id AND c.scope_id=b.scope_id AND c.scope_kind=b.scope_kind AND c.status IN ('RESERVED','DISPATCHED','RESULT_RETAINED')) AS inflight
         FROM engineering_work_model_budget b
         WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3
         UNION ALL
         SELECT h.ceiling_microusd,h.spent_microusd,h.reserved_microusd,'HISTORICAL_RECONCILIATION' AS status,NULL::bigint AS held_microusd,h.usage_unknown,h.inflight
         FROM engineering_conversation_budget h
         WHERE h.scope_id=$1 AND h.scope_kind=$2 AND h.work_id=$3
           AND NOT EXISTS(SELECT 1 FROM engineering_work_model_budget b WHERE b.scope_id=h.scope_id AND b.scope_kind=h.scope_kind AND b.work_id=h.work_id)`,scope),
      this.workStore.database.query(
        `SELECT r.id,r.dispatch_identity,r.factory_request_id,r.writer_generation,r.dispatch_state,r.stop_reason,r.fenced_at,r.custody_snapshot,r.factory_candidate,r.route,r.status,r.work_version,r.work_generation,d.admitted_at,d.factory_observation,
                (SELECT q.binding FROM engineering_factory_requests q WHERE q.id=r.factory_request_id) AS factory_binding,
                (SELECT a.receipt_id FROM engineering_factory_admissions a WHERE a.request_id=r.factory_request_id) AS factory_receipt_id,
                d.admission_authority_snapshot->'contract'->>'deadline' AS deadline,
                d.admission_authority_snapshot->'completion' AS completion,
                (SELECT coalesce(jsonb_object_agg(stage,n),'{}'::jsonb) FROM (
                  SELECT c.bounds#>>'{completion,stage}' stage,count(*) n FROM engineering_work_model_calls c
                  WHERE c.scope_id=r.scope_id AND c.scope_kind=r.scope_kind AND c.work_id=r.work_id
                    AND c.bounds#>>'{completion,id}'=r.id::text GROUP BY 1) counts) AS completion_used,
                EXISTS(SELECT 1 FROM engineering_work_model_calls c WHERE c.scope_id=r.scope_id AND c.scope_kind=r.scope_kind
                  AND c.work_id=r.work_id AND c.bounds#>>'{completion,id}'=r.id::text
                  AND c.bounds#>>'{completion,stage}'='EXPLAIN' AND c.status='RECONCILED'
                  AND jsonb_typeof(c.result->'content')='array' AND jsonb_array_length(c.result->'content')>0
                  AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c.result->'content') item
                    WHERE item->>'type' IS DISTINCT FROM 'text' OR length(trim(coalesce(item->>'text','')))=0)) AS explanation_settled
         FROM engineering_route_runs r LEFT JOIN engineering_routing_decisions d
           ON d.id=r.decision_id AND d.scope_id=r.scope_id AND d.scope_kind=r.scope_kind AND d.work_id=r.work_id
         WHERE r.scope_id=$1 AND r.scope_kind=$2 AND r.work_id=$3`,scope),
      this.workStore.database.query(
        `SELECT candidate_sha,status,evidence_count FROM engineering_direct_verification_jobs
         WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3`,scope),
      this.workStore.database.query(
        `SELECT factory_preparation,factory_observation FROM engineering_routing_decisions
         WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3 AND work_version=$4
           AND factory_preparation IS NOT NULL ORDER BY created_at DESC LIMIT 1`,[...scope,work.version]),
    ]);
    const accounting=conversationRows[0];
    const ceilingUsd=Math.min(work.maxCostUsd,Number(accounting?.ceiling_microusd??work.maxCostUsd*1_000_000)/1_000_000);
    const heldUsd=accounting?.held_microusd!=null ? Number(accounting.held_microusd)/1_000_000 : completionFunction?.present && !accounting ? 0 : null;
    if(heldUsd!==null && (!Number.isFinite(heldUsd) || heldUsd<0))
      throw new WorkError("completion_projection","Completion capacity could not be observed safely.");
    const completionBudget={ceilingUsd,heldUsd,observed:heldUsd!==null,
      remainingUsd:heldUsd!==null && accounting?.status==="ACTIVE" && !accounting.usage_unknown
        ? Math.max(0,ceilingUsd-Number(accounting.spent_microusd)/1_000_000-Number(accounting.reserved_microusd)/1_000_000-heldUsd) : null};
    const current = await this.workStore.get(id);
    if (current.version !== work.version || current.generation !== work.generation ||
        current.criteriaVersion !== work.criteriaVersion) {
      throw new WorkError("projection_changed", "Work changed while its status was read. Reload before relying on this snapshot.");
    }
    if (execution && (execution.contract.workId !== work.id ||
        execution.contract.scope.scopeId !== this.workStore.principal.scopeId ||
        execution.contract.scope.scopeKind !== this.workStore.principal.scopeKind ||
        (this.coordinatingAgentId && execution.contract.coordinatingAgent !== this.coordinatingAgentId))) {
      throw new WorkError("projection_binding", "Execution is bound to a different owner or Agent.", 403);
    }

    const routing = routingForWorkVersion(route, work.version);
    const admittedRoute = routing.decision?.status === "ADMITTED" ? routing.decision : null;
    const currentRouteRun = admittedRoute ? routing.runs.find(run =>
      run.decisionId === admittedRoute.id && run.workVersion === work.version &&
      run.workGeneration === work.generation) ?? null : null;
    const nativeRow = nativeRows[0] ?? null;
    const factoryRun=runRows.filter(row=>row.factory_request_id).sort((a,b)=>Number(b.writer_generation)-Number(a.writer_generation))[0];
    const factoryWriter=factoryRun?{requestId:factoryRun.factory_binding?.requestId,dispatchIdentity:factoryRun.dispatch_identity,remoteRunId:factoryRun.factory_binding?.runId,runId:String(factoryRun.id),writerGeneration:Number(factoryRun.writer_generation),state:String(factoryRun.dispatch_state),stopReason:factoryRun.stop_reason??null,candidateProducer:factoryRun.factory_candidate?"MYFACTORY":null,factoryId:factoryRun.factory_binding?.factoryId,factoryVersion:factoryRun.factory_binding?.factoryVersion,workOrderId:factoryRun.factory_binding?.workOrderId,attempt:factoryRun.factory_binding?.attemptNumber,receiptId:factoryRun.factory_receipt_id??undefined,observation:factoryRun.factory_observation?.value}:undefined;
    const preparation=preparationRows[0],observation=preparation?.factory_observation?.value;
    const factoryPreparation=preparation?{requestId:String(preparation.factory_preparation.request.requestId),state:String(observation?.state??'PREPARING'),blocker:observation?.reason??observation?.blocker??null}:undefined;
    const factoryAccounting=observation?.accounting as FactorySpendSummary|undefined;
    const factoryCurrent=!!factoryRun && factoryRun.id===currentRouteRun?.id;
    const factoryActivity=factoryPreparation?.state==="WAITING_FOR_EVIDENCE" ? {status:"Waiting",activity:"Candidate retained; waiting for Factory evidence.",nextStep:"Reconcile this retained attempt. No new execution is needed."} : factoryCurrent ? factoryRun.dispatch_state!=="TERMINAL"
      ? {status:factoryRun.dispatch_state==="DISPATCHED"?"Working":"Needs reconciliation",activity:`MyFactory writer: ${factoryRun.dispatch_state}.`,nextStep:factoryRun.dispatch_state==="PREPARED"?"Dispatch the exact admitted request once.":"Inspect the exact Factory attempt. Stop or timeout is not quiescence; native and human productive access remain blocked."}
      : {status:nativeRow?.producer==="MYFACTORY"?(nativeRow.phase==="VERIFICATION_PASSED"?"Partial result":"Needs verification"):"Needs attention",activity:"Factory writer is terminal and fenced. Retained provenance grants no writer authority.",nextStep:nativeRow?.producer!=="MYFACTORY"?"Inspect the terminal outcome and authenticated receipt; establish eligible candidate custody separately.":nativeRow.phase==="VERIFICATION_FAILED"?"Factory is off. Review protected failure and request a new normal native admission for repair.":nativeRow.phase==="VERIFICATION_PASSED"?"Review the PARTIAL local result. Publication and acceptance remain unqualified.":"Run MyEve protected verification against the exact Factory candidate in custody."}
      :null;

    if (nativeRow && this.coordinatingAgentId && nativeRow.agent_id !== this.coordinatingAgentId)
      throw new WorkError("projection_binding", "Native development is bound to a different Agent.", 403);
    const nativeProof=nativeRow?.native_proof ? proofOfWorkSchema.parse(nativeRow.native_proof) : null;
    if (nativeProof && digest(nativeProof)!==nativeRow.native_proof_hash)
      throw new WorkError("native_result_integrity","The retained native result failed its integrity check.",503);
    const nativeResult=nativeProof ? {id:String(nativeRow.native_result_id),proof:nativeProof,
      contentHash:String(nativeRow.native_proof_hash),current:nativeProof.workVersion===work.version &&
        nativeProof.criteriaVersion===work.criteriaVersion && Number(nativeRow.native_result_generation)===work.generation} : externalAlpha?.result ? { id: externalAlpha.result.resultId, proof: externalAlpha.result.proof,
      contentHash: externalAlpha.result.contentHash, current: externalAlpha.result.current } : null;
    const nativePhase = nativeRow?.phase as NonNullable<EngineeringWorkerProjection["nativeDevelopment"]>["phase"];
    const completionRun=runRows.find(row=>row.id===(nativeRow?.route_run_id??currentRouteRun?.id));
    const completion=completionRun?.completion;
    const completionStage=nativePhase==="VERIFICATION_PASSED" || (nativePhase==="VERIFICATION_FAILED" && nativeRow?.candidates?.length>=2)?"EXPLAIN"
      :nativeRow?.candidates?.length?"REPAIR":"IMPLEMENT";
    const configuredSlots=completion?.stages?.find((stage:Record<string,unknown>)=>stage.id===completionStage)?.calls;
    const usedSlots=Number(completionRun?.completion_used?.[completionStage]??0);
    const completionStatus=!completion?"NO_CONTRACT":Date.parse(completion.expiresAt)<=Date.now()?"EXPIRED"
      :nativePhase==="VERIFICATION_REQUESTED"?"WAITING_VERIFICATION"
      :completionStage==="EXPLAIN"?(completionRun?.explanation_settled?"COMPLETE":usedSlots?"RECONCILIATION_REQUIRED":"EXPLANATION_REQUIRED")
      :usedSlots>=Number(configuredSlots)?"STAGE_EXHAUSTED":"READY";
    let observedRunId: string | null = null;
    let authorityReason = "Current execution authority not established";
    if (currentRouteRun?.providerId === "myeve-native-sofie" && completion && conversationRows[0]?.status==="ACTIVE" && !conversationRows[0]?.usage_unknown && !nativeRuntimeRows[0]?.usage_unknown) {
      try { observedRunId=(await this.observeNativeAuthority(id)).runId; }
      catch { authorityReason="Current provider, policy, Agent or admission authority unavailable"; }
    } else if (completion) authorityReason="Common Work budget requires reconciliation or current authority";
    // Recheck Work after the asynchronous authority observation; reads never acquire custody.
    const afterAuthority=await this.workStore.get(id);
    if(afterAuthority.version!==work.version || afterAuthority.generation!==work.generation)
      throw new WorkError("projection_changed","Work changed while authority was observed. Reload this snapshot.");
    const runtime=nativeRuntimeRows[0];
    const observedInputs: ObservedRunInput[] = runRows.map(row=>({id:String(row.id),purpose:String(row.route),status:String(row.status),
      generation:row.work_generation==null?null:Number(row.work_generation),version:row.work_version==null?null:Number(row.work_version),
      associatedAt:row.admitted_at?(row.admitted_at instanceof Date ? row.admitted_at.toISOString() : String(row.admitted_at)):null,
      timestampSource:row.admitted_at?"admission":"unavailable",deadline:row.deadline?String(row.deadline):null}));
    // Old executors retain their own immutable startedAt; updated_at is never used as creation time.
    for(const run of execution?.runs??[]) if(!observedInputs.some(item=>item.id===run.id)) observedInputs.push({
      id:run.id,purpose:run.reason,status:run.status,generation:run.generation,version:null,
      associatedAt:run.startedAt,timestampSource:"execution-start",deadline:execution!.contract.deadline});
    if(["EXPIRED","COMPLETE","EXPLANATION_REQUIRED","RECONCILIATION_REQUIRED","STAGE_EXHAUSTED"].includes(completionStatus)) {
      observedRunId=null;authorityReason=`Completion workflow is ${completionStatus}; history is read-only`;
    }
    const runTruth=projectRuns(work,observedInputs,{runId:observedRunId,
      writerRunId:runtime?.route_run_id?String(runtime.route_run_id):null,
      writerSessionId:runtime?.session_id?String(runtime.session_id):null,reason:authorityReason});
    const nativeAdmitted = currentRouteRun?.providerId === "myeve-native-sofie" && !!completion;
    const productive = nativeAdmitted && runTruth.activeRun?.id === currentRouteRun?.id;
    const nativeExecution: EngineeringWorkerProjection["nativeExecution"] = {
      admissionStatus: nativeAdmitted ? "ALREADY_ADMITTED" : "NEEDS_ADMISSION",
      phase: completionStatus === "COMPLETE" ? "COMPLETED"
        : nativeAdmitted && !productive ? "BLOCKED"
        : nativePhase === "VERIFICATION_REQUESTED" ? "VERIFYING"
        : productive && !nativeRow ? "ADMITTED_READY_FOR_PRODUCTIVE_WORK"
        : productive && completionStage === "REPAIR" ? "REPAIRING"
        : productive ? "IMPLEMENTING" : "NEEDS_ADMISSION",
      nextOperation: !nativeAdmitted ? "admit" : !productive || nativePhase === "VERIFICATION_REQUESTED" ? null
        : !nativeRow ? "open" : completionStage === "REPAIR" ? "inspect" : nativeRow.revision === 1 ? "read" : "write",
      admissionRequired: !nativeAdmitted,
      runId: nativeAdmitted ? currentRouteRun!.id : null,
      writerSessionId: runTruth.writerSession.recordedId,
      route: nativeAdmitted ? "NATIVE" : null,
      control: work.control,
      completionContractId: completion?.id ?? null,
    };
    const executionController=completion ? await nativeExecutionCapsule(this.workStore,id) : null;
    if(executionController) {
      if(!productive && !["VERIFY","COMPLETE"].includes(executionController.phase)) {
        executionController.phase="BLOCKED";executionController.nextOperation=null;executionController.allowedOperations=[];
      }
      nativeExecution.nextOperation=executionController.nextOperation;
    }
    const nativeCurrent = runTruth.activeRun?.id === currentRouteRun?.id && !!runTruth.activeRun && !!nativeRow && !!admittedRoute && !!currentRouteRun &&
      !execution && currentRouteRun.route === "DEEP_AGENT" && currentRouteRun.status === "RUNNING" &&
      nativeRow.decision_id === admittedRoute.id && nativeRow.route_run_id === currentRouteRun.id &&
      Number(nativeRow.work_version) === work.version &&
      Number(nativeRow.work_generation) === work.generation &&
      Number(nativeRow.criteria_version) === work.criteriaVersion &&
      Date.now() < Date.parse(String(nativeRow.deadline)) &&
      work.lifecycle === "active" && work.control === "agent";
    const nativeCandidate = Array.isArray(nativeRow?.candidates) ? nativeRow.candidates.at(-1) : null;
    const draft = nativeRow?.draft_files ? {revision:Number(nativeRow.revision),
      contentHash:digest(nativeRow.draft_files),differsFromCandidate:!nativeCandidate || digest(nativeRow.draft_files)!==digest(nativeCandidate.files)} : null;
    const candidateChecks = (Array.isArray(nativeRow?.evidence) ? nativeRow.evidence : []).filter((item: Record<string, unknown>) =>
      item.candidate===nativeCandidate?.sha && item.attemptId===nativeCandidate?.attemptId &&
      item.workId===work.id && item.criteriaVersion===work.criteriaVersion &&
      item.base===nativeRow?.base_sha && item.profileHash===nativeRow?.profile_hash &&
      item.producer==="protected-supervisor" && typeof item.artifact==="string" && digest(item.artifact)===item.artifactHash);
    const job=verificationRows.find(row=>row.candidate_sha===nativeCandidate?.sha);
    const proofMatches=!!nativeResult?.current && nativeResult.proof.resultRevision===nativeCandidate?.sha;
    const verification = {candidateSha:typeof nativeCandidate?.sha==="string"?nativeCandidate.sha:null,
      status:candidateChecks.some((item:Record<string,unknown>)=>item.result==="FAIL")?"FAIL"
        :job?.status==="COMPLETED" && candidateChecks.length>0 && candidateChecks.length===Number(job.evidence_count) &&
          new Set(candidateChecks.map((item:Record<string,unknown>)=>item.check)).size===candidateChecks.length &&
          candidateChecks.every((item:Record<string,unknown>)=>item.result==="PASS") && proofMatches &&
          nativeResult!.proof.outcome==="PARTIAL" && nativeResult!.proof.evidence.every(item=>item.state==="PASS" && item.resultRevision===nativeCandidate.sha)?"PASS"
        :job?.status==="QUEUED" || job?.status==="RUNNING"?"PENDING":nativeCandidate?"UNKNOWN":"NOT_RUN",
      jobStatus:job?String(job.status):null,evidenceCount:candidateChecks.length,
      evidenceHashes:candidateChecks.map((item:Record<string,unknown>)=>String(item.artifactHash))};
    const historicalWorkspaces=runRows.map(row=>row.custody_snapshot?.workspace).filter(row=>row && row.route_run_id!==nativeRow?.route_run_id);
    const candidateHistory=[...historicalWorkspaces,...(nativeRow?[nativeRow]:[])].flatMap(custody=>
     (Array.isArray(custody.candidates)?custody.candidates:[]).map((candidate:Record<string,unknown>)=>{
      const checks=(Array.isArray(custody.evidence)?custody.evidence:[]).filter((item:Record<string,unknown>)=>
        item.candidate===candidate.sha && item.attemptId===candidate.attemptId && item.workId===work.id &&
        item.criteriaVersion===Number(custody.criteria_version) && item.base===custody.base_sha && item.profileHash===custody.profile_hash &&
        item.producer==="protected-supervisor" && typeof item.artifact==="string" && digest(item.artifact)===item.artifactHash);
      return {sha:String(candidate.sha),checks:checks.some((e:Record<string,unknown>)=>e.result==="FAIL")?"FAIL":candidate.sha===verification.candidateSha && verification.status==="PASS"?"PASS":"UNKNOWN",
        failures:checks.filter((e:Record<string,unknown>)=>e.result==="FAIL").map((e:Record<string,unknown>)=>String(e.check)),evidenceCount:checks.length};
    }));
    const nativeCheckUnknown = nativePhase === "VERIFICATION_FAILED" &&
      Array.isArray(nativeRow?.evidence) && nativeRow.evidence.some((item: Record<string, unknown>) =>
        item.candidate === nativeCandidate?.sha &&
        !["PASS", "FAIL"].includes(String(item.result)));
    const nativeDevelopment: EngineeringWorkerProjection["nativeDevelopment"] = nativeRow ? {
      phase: nativePhase,
      label: nativePhase === "VERIFICATION_REQUESTED" ? "Candidate awaiting protected checks"
        : nativePhase === "VERIFICATION_FAILED" ? nativeCheckUnknown
          ? "Checks inconclusive; reconcile the outcome" : "Checks failed; revision needed"
        : nativePhase === "VERIFICATION_PASSED" ? "Candidate checks passed; Work not Ready"
        : "Draft in progress",
      revision: Number(nativeRow.revision),
      candidateSha: typeof nativeCandidate?.sha === "string" ? nativeCandidate.sha : null,
      evidenceCount: Array.isArray(nativeRow.evidence) ? nativeRow.evidence.length : 0,
      current: nativeCurrent,
      updatedAt: nativeRow.updated_at instanceof Date
        ? nativeRow.updated_at.toISOString() : String(nativeRow.updated_at),
    } : null;
    const nativeActivity = nativeExecution.phase === "ADMITTED_READY_FOR_PRODUCTIVE_WORK"
      ? {status:"Working",activity:"Admission and writer custody are current; the repository is not opened yet.",
        nextStep:"Open the pinned repository with engineering_direct open. No new admission is required; each effect still rechecks authority."}
      : nativeCurrent ? nativePhase === "VERIFICATION_REQUESTED"
      ? { status: "Needs verification", activity: "Sofie retained a frozen candidate awaiting independent checks.",
          nextStep: "Run protected checks on the exact candidate. Work is not ready." }
      : nativePhase === "VERIFICATION_FAILED"
        ? nativeCheckUnknown
          ? { status: "Needs reconciliation", activity: "A protected check had no confirmed candidate outcome.",
              nextStep: "Inspect the check evidence and reconcile verifier resources before another attempt." }
          : { status: "Needs revision", activity: "Protected checks failed for the retained candidate.",
              nextStep: "Sofie can inspect the check evidence, revise the draft, and submit a new candidate." }
        : nativePhase === "VERIFICATION_PASSED"
          ? { status: "Verified candidate", activity: "Protected checks passed for the retained candidate.",
              nextStep: "Review publication and current evidence before any Ready decision." }
          : { status: "Working", activity: "Sofie has an owner-scoped native draft for this Work.",
              nextStep: "Sofie can inspect approved files, edit the draft, and submit a frozen candidate." }
      : null;
    const staleNativeActivity = nativeRow && currentRouteRun?.id === nativeRow.route_run_id && !nativeCurrent
      ? { status: "Needs reconciliation", activity: "The retained native draft is no longer current for this Work or deadline.",
          nextStep: "Recheck Work, route and deadline before another candidate or verification attempt." }
      : null;
    const runtimeRow=nativeRuntimeRows[0];
    const nativeRuntime=runtimeRow ? {spentUsd:Number(runtimeRow.spent_microusd)/1_000_000,
      reservedUsd:Number(runtimeRow.reserved_microusd)/1_000_000,usageUnknown:!!runtimeRow.usage_unknown,inflight:!!runtimeRow.inflight} : null;
    const completionBlocker=completion && completionStatus!=="READY" && completionStatus!=="WAITING_VERIFICATION"
      ? {status:completionStatus==="COMPLETE"?"Local workflow complete":"Needs attention",
         activity:`Completion workflow: ${completionStatus}. Candidate, draft and evidence remain retained.`,
         nextStep:completionStatus==="EXPLANATION_REQUIRED"?"Use the reserved read-only final Work explanation; productive execution is finished."
           :completionStatus==="COMPLETE"?"Review the immutable PARTIAL/FAILED local Result. Publication, CI and review require separate qualification."
           :completionStatus==="STAGE_EXHAUSTED"?"No additional model call fits this stage. Only already-admitted guarded actions may finish; otherwise owner review is required. Do not expand the budget automatically."
           :"Reconcile the completion contract and retained exposure before any new call. Do not revive an expired Run or release UNKNOWN reservations."} : null;
    const commonBudgetBlocker=conversationRows[0] && conversationRows[0].status!=="ACTIVE"
      ? {status:"Needs reconciliation",activity:`Common Work accounting is ${conversationRows[0].status}; history is retained.`,
          nextStep:"Reconcile historical Work liabilities and obtain current authority before productive continuation. Do not reset spent or reserved amounts."} : null;
    const modelActivity=nativeRuntime?.usageUnknown
      ? {status:"Needs reconciliation",activity:"A native model call has an uncertain outcome or usage.",nextStep:"Reconcile the charged model call before another model call or source edit. Retained reservations are not refunded."}
      : nativeRuntime?.inflight
        ? {status:"Working",activity:"A native model call holds a durable budget reservation.",nextStep:"Wait for the model outcome. An interrupted call must be reconciled before retry."} : null;
    const routeActivity = !execution && work.lifecycle === "active" && work.control === "agent"
      ? admittedRoute
        ? currentRouteRun
          ? modelActivity ?? nativeActivity ?? staleNativeActivity ?? {
              status: currentRouteRun.status === "QUEUED" ? "Queued"
                : currentRouteRun.status === "RUNNING" ? "Working"
                : currentRouteRun.status === "COMPLETED" ? "Needs verification"
                : "Needs reconciliation",
              activity: `Admitted ${currentRouteRun.route} route · ${currentRouteRun.status}.`,
              nextStep: currentRouteRun.status === "QUEUED"
                ? "A qualified provider must start this queued route; no execution result exists yet."
                : currentRouteRun.status === "RUNNING"
                  ? "Inspect the current provider run and retain a candidate before independent verification."
                  : currentRouteRun.status === "COMPLETED"
                    ? "Review the candidate and independent evidence before claiming readiness."
                    : "Reconcile the provider outcome before retrying or handing Work to another route.",
            }
          : { status: "Needs reconciliation", activity: "The admitted route has no current Run.",
              nextStep: "Reconcile the route Run before any new execution." }
        : routing.decision?.status === "STALE"
          ? { status: "Needs rerouting", activity: "The previous route is stale for this Work revision.",
              nextStep: "Reconcile any old writer, then assess the current Work again." }
          : routing.decision?.status === "PROPOSED"
            ? { status: "Waiting for admission", activity: "A route has been recommended; no execution is admitted.",
                nextStep: "Review the route recommendation in Work. A current authority check is required before execution." }
          : null
      : null;
    const truth = execution ? manifest(work, execution) : null;
    const result = execution?.results.at(-1) ?? null;
    const lastEvent = eventRows[0] ?? null;
    const lastExecutionEvent = historyRows[0] ?? null;
    const changes = [
      lastEvent && { kind: String(lastEvent.kind),
        at: lastEvent.created_at instanceof Date ? lastEvent.created_at.toISOString() : String(lastEvent.created_at),
        actorId: lastEvent.actor_id === null ? null : String(lastEvent.actor_id),
        version: Number(lastEvent.version) },
      lastExecutionEvent && { kind: String(lastExecutionEvent.kind),
        at: lastExecutionEvent.created_at instanceof Date ? lastExecutionEvent.created_at.toISOString() : String(lastExecutionEvent.created_at),
        actorId: lastExecutionEvent.actor_id === null ? null : String(lastExecutionEvent.actor_id),
        version: Number(lastExecutionEvent.revision) },
      result && { kind: "result", at: result.createdAt, actorId: null, version: result.version },
      nativeDevelopment && { kind: `native:${nativeDevelopment.phase.toLowerCase()}`,
        at: nativeDevelopment.updatedAt, actorId: null, version: nativeDevelopment.revision },
      routing.transitions[0] && { kind: `route:${routing.transitions[0].trigger}`, at: routing.transitions[0].createdAt,
        actorId: null, version: null },
    ].filter((change): change is NonNullable<typeof change> => !!change);
    const lastChange = changes.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0] ?? null;
    const lastMeaningfulActivity = latestTime(
      latestTime(latestTime(work.updatedAt, execution?.lastActivity), nativeDevelopment?.updatedAt), lastChange?.at);
    const publicationReadback=nativeResult&&nativeRow?.publication_state==='PR_OPEN'?currentPublicationReadback(nativeRow?.publication_remote,{owner:this.workStore.principal.scopeId,workId:id,resultId:nativeResult.id,resultHash:nativeResult.contentHash,version:work.version,generation:work.generation,candidate:nativeResult.proof.resultRevision??''}):null;
    const externalActivity = externalAlpha ? {
      status: externalAlpha.state === "UNKNOWN" ? "Needs reconciliation" : externalAlpha.result ? "Result retained"
        : externalAlpha.factoryOutcome ? "Stopped" : ["ISSUED", "DISPATCHING", "CONSUMED"].includes(externalAlpha.state) ? "Awaiting Factory readback" : "Stopped",
      activity: externalAlpha.result ? `${externalAlpha.result.current ? "Factory candidate" : "Historical Factory candidate"} retained; Factory outcome ${externalAlpha.result.producerOutcome}; producer checks ${externalAlpha.result.producerChecks}; independent verifier: ${externalAlpha.result.verdict}. Result remains ${externalAlpha.result.proof.outcome}.`
        : externalAlpha.factoryOutcome ? `Factory outcome: ${externalAlpha.factoryOutcome}. No candidate Result or Proof was produced; authenticated cleanup and accounting settled.`
        : `External-alpha authority: ${externalAlpha.state}. Retained state does not establish fresh Factory liveness.`,
      nextStep: externalAlpha.state === "UNKNOWN" ? "Reconcile the existing request and retained exposure. No paid retry or new writer is allowed."
        : externalAlpha.result ? "Review the retained Result and Proof. Publication and owner acceptance are not established."
        : externalAlpha.factoryOutcome ? "Review the retained terminal outcome. No new authority is implied."
        : "Reconcile the exact retained Factory request. Do not create or send a second dispatch.",
    } : null;
    const projection: EngineeringWorkerProjection = {
      externalAlpha,
      publicationReadback,
      journeyAccounting,factoryAccounting,factoryPreparation, factoryWriter, runTruth,
      verification: externalAlpha?.result ? { candidateSha: externalAlpha.result.candidateSha, status: externalAlpha.result.verdict === "PARTIAL" ? "UNKNOWN" : externalAlpha.result.verdict,
        jobStatus: "RETAINED", evidenceCount: externalAlpha.result.proof.evidence.length, evidenceHashes: externalAlpha.result.proof.artifactRefs.filter(r => r.startsWith("factory-evidence:")) } : verification,
      draft, completionBudget, candidateHistory: externalAlpha?.result ? [{ sha: externalAlpha.result.candidateSha, checks: externalAlpha.result.verdict === "PARTIAL" ? "UNKNOWN" : externalAlpha.result.verdict,
        failures: externalAlpha.result.proof.evidence.filter(e => e.state === "FAIL").map(e => e.criterionId), evidenceCount: externalAlpha.result.proof.evidence.length }] : candidateHistory,
      completionStatus, nativeExecution, executionController,
      workId: work.id,
      title: work.title,
      objective: work.objective,
      workVersion: work.version,
      workGeneration: work.generation,
      criteriaVersion: work.criteriaVersion,
      lifecycle: work.lifecycle,
      control: work.control,
      workContract: execution ? {
        coordinatingAgentId: execution.contract.coordinatingAgent,
        baseSha: execution.contract.baseSha,
        deadline: execution.contract.deadline,
        profileId: execution.contract.profile.id,
        profileVersion: execution.contract.profile.version,
        policyVersion: execution.contract.policyVersion,
        budgetUsd: execution.contract.budgetUsd,
      } : null,
      authoritySummary: {
        admitted: !!execution || !!admittedRoute,
        generationCurrent: execution ? execution.generation === work.generation
          : !!currentRouteRun && work.control === "agent",
        deadlineCurrent: execution
          ? Date.now() < Date.parse(execution.contract.deadline)
          : !!nativeRow && !!admittedRoute && Date.now() < Date.parse(String(nativeRow.deadline)),
        boundaryRecheckRequired: true,
      },
      qualificationMode: execution?.qualificationMode ?? null,
      status: externalActivity?.status ?? factoryActivity?.status ?? (factoryPreparation?.blocker?"Needs reconciliation":null) ?? truth?.status ?? commonBudgetBlocker?.status ?? completionBlocker?.status ?? routeActivity?.status ?? noExecutionStatus(work),
      activity: externalActivity?.activity ?? factoryActivity?.activity ?? factoryPreparation?.blocker ?? truth?.activity ?? commonBudgetBlocker?.activity ?? completionBlocker?.activity ?? routeActivity?.activity ?? ((nativeResult || result) ? "A Result from prior execution is retained. No execution is currently admitted." : "Work intent is saved; no execution has been admitted."),
      nextStep: externalActivity?.nextStep ?? (publicationReadback ? (publicationReadback.review.status==='FAIL'?'Inspect the independent review finding. Any correction requires a separately authorized candidate lifecycle; do not modify the published candidate.':'Review the observed publication and CI evidence; owner acceptance is a separate decision.') : factoryAccounting?.blocker && factoryWriter?.state==='TERMINAL' ? `Factory execution is fenced. ${factoryAccounting.blocker}. Accounting reconciliation grants no new execution authority.` : factoryActivity?.nextStep ?? (factoryPreparation?.blocker?"Reconcile the retained Factory request; no new dispatch identity is permitted.":null) ?? truth?.nextStep ?? commonBudgetBlocker?.nextStep ?? completionBlocker?.nextStep ?? (executionController ? executionController.nextOperation
        ? `Native ${executionController.phase}: ${executionController.nextOperation}. No repeated orientation; current authority must be rechecked.`
        : executionController.phase==="VERIFY" ? "Wait for independent protected verification and Result retention. Do not restart orientation."
        : executionController.phase==="COMPLETE" ? "Local implementation is complete; retain PARTIAL and use the reserved fresh read-only explanation."
        : `Native execution is blocked. ${executionController.known.plan?.blockers.join("; ") || (executionController.progress.recovery==="STOP" ? "Bounded no-progress recovery is exhausted." : "Recheck current authority and completion capacity.")} No productive operation is recommended.`
        : routeActivity?.nextStep) ?? noExecutionNextStep(work, !!(nativeResult || result))),
      readiness: externalAlpha ? { ready: false, reasons: [externalAlpha.result ? `Independent verifier: ${externalAlpha.result.verdict}; Result: ${externalAlpha.result.proof.outcome}. Publication and owner acceptance are not established.` : "No independently verified candidate Result is retained."] } : truth?.readiness ?? { ready: false, reasons: publicationReadback ? [`Publication: PASS. GitHub CI: ${publicationReadback.ci.status}. Independent review: ${publicationReadback.review.status}. ${publicationReadback.review.summary} Owner acceptance: NOT_RUN. Current Result remains PARTIAL.`] : nativeResult
        ? [`${nativeRow?.producer==="MYFACTORY"?"Factory candidate / MyEve":"Native"} protected verification: ${verification.status}. Retained Result: ${nativeResult.proof.outcome}. Publication, CI, independent review and owner acceptance remain unverified.`]
        : ["No independently verified, current Result exists."] },
      currentRun: runTruth.activeRun ? {id:runTruth.activeRun.id,status:runTruth.activeRun.storedStatus,
        startedAt:null,generationCurrent:runTruth.activeRun.generationCurrent} : null,
      attention: truth?.attention ?? null,
      pendingDecisions: truth?.pendingDecisions ?? [],
      latestResult: result
        ? { id: result.id, version: result.version, summary: result.summary, candidate: result.candidate, createdAt: result.createdAt }
        : nativeResult ? {id:nativeResult.id,version:nativeResult.proof.workVersion,
          summary:externalAlpha?.result ? externalActivity!.activity : publicationReadback?`Published candidate. CI: ${publicationReadback.ci.status}. Independent review: ${publicationReadback.review.status}. Owner acceptance: NOT_RUN. Result: PARTIAL.`:`${nativeRow?.producer==="MYFACTORY"?"Factory candidate":"Native development"}: ${nativeResult.proof.outcome}. Publication and acceptance are not established.`,
          candidate:nativeResult.proof.resultRevision??"",createdAt:nativeResult.proof.createdAt} : null,
      nativeDevelopment,
      nativeResult,
      nativeRuntime,
      conversationRuntime: conversationRows[0] ? {status:String(conversationRows[0].status),spentUsd:Number(conversationRows[0].spent_microusd)/1_000_000,
        reservedUsd:Number(conversationRows[0].reserved_microusd)/1_000_000,usageUnknown:Boolean(conversationRows[0].usage_unknown),inflight:Boolean(conversationRows[0].inflight)} : null,
      routing: routing.decision
        ? { decisionId: routing.decision.id, status: routing.decision.status, selectedRoute: routing.decision.selectedRoute,
          reason: routing.decision.reason, providerId: routing.decision.providerId }
        : null,
      repositoryObservation: truth?.repositoryObservation ?? null,
      lastMeaningfulActivity,
      lastChange,
      source: {
        kind: "durable-engineering-work",
        readAt: new Date().toISOString(),
        workRef: `engineering-work:${work.id}:v${work.version}`,
        executionRef: execution ? `engineering-execution:${work.id}:r${execution.revision}` : null,
        resultRef: result ? `engineering-result:${work.id}:v${result.version}` : nativeResult ? `native-result:${nativeResult.id}` : null,
        routingRef: routing.decision ? `engineering-route-decision:${routing.decision.id}` : null,
      },
    };
    return { work, execution, manifest: truth, routing, projection };
  }

  async list(): Promise<EngineeringProjectionSnapshot[]> {
    const items = await this.workStore.list();
    const snapshots: EngineeringProjectionSnapshot[] = [];
    for (let offset = 0; offset < items.length; offset += 8) {
      snapshots.push(...await Promise.all(items.slice(offset, offset + 8).map(item => this.snapshot(item))));
    }
    return snapshots;
  }
}
