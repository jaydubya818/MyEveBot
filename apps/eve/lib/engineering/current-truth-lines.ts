import type { EngineeringWorkerProjection } from "./worker-projection.ts";

/** Persisted optimistic-concurrency tokens are observations, never execution grants. */
export function currentWorkMetadata(projection: EngineeringWorkerProjection) {
  const { workId, workVersion, workGeneration } = projection;
  if (!workId || !Number.isSafeInteger(workVersion) || workVersion <= 0 ||
      !Number.isSafeInteger(workGeneration) || workGeneration <= 0)
    throw new Error("Current Work identity, version and generation are required.");
  return { workId, expectedWorkVersion: workVersion, expectedWorkGeneration: workGeneration };
}

const money=(value:number|null)=>value===null?"unavailable":`$${(value/1_000_000).toFixed(6)}`;

/** The same read-only facts are rendered in Work and selected-Work model context. */
export function currentTruthLines(projection: EngineeringWorkerProjection, options: {factoryProposal?:boolean} = {}): string[] {
  const truth=projection.runTruth;
  const metadata = currentWorkMetadata(projection);
  return [
    ...(options.factoryProposal ? [!projection.routing && !projection.factoryWriter
      ? "Factory proposal state: UNROUTED. Owner-selected productive Work may propose admission through engineering_factory start. No admitted route, executable Run or writer is required to request evaluation; proposal grants no execution authority."
      : "Factory proposal/readback: a proposed route or queued start is not execution authority. Report only persisted route, preparation, writer and dispatch facts; do not infer START from a proposal or preparation."] : []),
    `Work identity: ${JSON.stringify(metadata)}. Copy these observed values exactly when proposing admission; never infer them. The service rejects stale values. This metadata grants no authority.`,
    ...(!options.factoryProposal && !projection.factoryWriter && projection.nativeExecution ? [`Native execution: ${projection.nativeExecution.admissionStatus}; phase ${projection.nativeExecution.phase}; next operation ${projection.nativeExecution.nextOperation??"none"}. Observed state only. Already admitted means no new admission.`] : []),
    ...(projection.executionController ? [`Engineering phase: ${projection.executionController.phase}; next ${projection.executionController.nextOperation??"none"}; progress ${projection.executionController.progress.recovery}.`] : []),
    truth.activeRun?`Active Run: ${truth.activeRun.id}; ${truth.activeRun.purpose}; ${truth.activeRun.effectiveStatus}. Fresh checks are required at every action boundary.`:"Active Run: none currently confirmed executable. This does not mean Work has no Run history.",
    truth.latestRun?`Latest Run: ${truth.latestRun.id}; ${truth.latestRun.purpose}; ${truth.latestRun.effectiveStatus}; recorded ${truth.latestRun.storedStatus}; deadline ${truth.latestRun.deadline??"unavailable"}.`
      :truth.runHistory.length?"Latest Run: ordering unavailable; inspect retained Run history.":"Latest Run: none recorded.",
    `Run history: ${truth.runHistory.length?truth.runHistory.map(run=>`${run.id} (${run.purpose}; ${run.effectiveStatus}; recorded ${run.storedStatus}; ${run.timestampSource} ${run.associatedAt??"unknown"})`).join("; "):"none recorded"}.`,
    ...(projection.factoryAccounting ? [`Factory Work budget: approved ceiling ${money(projection.factoryAccounting.ceilingMicrousd)}; settled ${money(projection.factoryAccounting.settledMicrousd)}; reserved ${money(projection.factoryAccounting.reservedMicrousd)} (uncertain ${money(projection.factoryAccounting.unknownMicrousd)}); remaining safe allowance ${money(projection.factoryAccounting.safeAllowanceMicrousd)}. Productive allowance ${money(projection.factoryAccounting.productiveAllowanceRemainingMicrousd??null)}; protected completion ${money(projection.factoryAccounting.completionReserveRemainingMicrousd??null)} remaining of ${money(projection.factoryAccounting.completionReserveMicrousd??null)}; paid operations ${projection.factoryAccounting.paidOperationsUsed??"unavailable"}/${projection.factoryAccounting.maxPaidOperations??"unavailable"}; protected completion slots ${projection.factoryAccounting.completionOperationSlotsRemaining??"unavailable"}. Accounting ${projection.factoryAccounting.accountingCompleteness}; pricing ${projection.factoryAccounting.pricingQualification}; completion qualification ${projection.factoryAccounting.completionQualification}. ${projection.factoryAccounting.blocker??"No accounting blocker observed"}. This is not payment or execution authority.`] : []),
    `Writer session: ${truth.writerSession.recordedId??"none recorded"}; ${truth.writerSession.productive?"current custody observed; recheck before effects":"not confirmed productive; historical identity grants no authority"}.`,
    ...(projection.factoryPreparation ? [`Factory preparation: ${projection.factoryPreparation.requestId}; ${projection.factoryPreparation.state}; blocker ${projection.factoryPreparation.blocker??"none"}. Intent alone grants no writer authority.`] : []),
    ...(projection.factoryWriter ? [`Factory writer: ${projection.factoryWriter.runId}; request ${projection.factoryWriter.requestId??"unavailable"}; dispatch ${projection.factoryWriter.dispatchIdentity??"unavailable"}; execution ${projection.factoryWriter.remoteRunId??"unavailable"}; generation ${projection.factoryWriter.writerGeneration}; ${projection.factoryWriter.state}; producer ${projection.factoryWriter.candidateProducer??"no candidate custody"}. Factory ${projection.factoryWriter.factoryId??"unavailable"}; version ${projection.factoryWriter.factoryVersion??"unavailable"}; WorkOrder ${projection.factoryWriter.workOrderId??"unavailable"}; attempt ${projection.factoryWriter.attempt??"unavailable"}; receipt ${projection.factoryWriter.receiptId??"pending"}. Gate C grants no writer authority.`, ...(projection.factoryWriter.observation ? [`Factory observation: ${projection.factoryWriter.observation.state??"unavailable"}; blocker ${projection.factoryWriter.observation.reason??projection.factoryWriter.observation.blocker??"none"}; spend ${projection.factoryWriter.observation.spend?.status??"UNKNOWN"}; ${projection.factoryWriter.observation.spend?.reason??"No spend proof available"}.`] : [])] : []),
    `Candidate: ${projection.verification.candidateSha??projection.latestResult?.candidate??"none retained"}.`,
    projection.draft?`Draft: revision ${projection.draft.revision}; hash ${projection.draft.contentHash}; ${projection.draft.differsFromCandidate?"unverified changes beyond the frozen candidate":"matches retained candidate"}.`:"Draft: no native draft retained.",
    `Candidate history: ${projection.candidateHistory.map(candidate=>`${candidate.sha}: ${candidate.checks}, ${candidate.evidenceCount} evidence records${candidate.failures.length?", failed checks "+candidate.failures.join(","):""}`).join("; ")||"none retained"}.`,
    `Completion state: ${projection.completionStatus}.`,
    `Protected verification: ${projection.verification.status}; candidate ${projection.verification.candidateSha??"none"}; job ${projection.verification.jobStatus??"none"}; ${projection.verification.evidenceCount} bound evidence records.`,
    projection.latestResult?`Result: ${projection.latestResult.id}; candidate ${projection.latestResult.candidate}; ${projection.latestResult.summary}`:"Result: none retained.",
    projection.conversationRuntime?`Budget: $${projection.conversationRuntime.spentUsd.toFixed(6)} spent; $${projection.conversationRuntime.reservedUsd.toFixed(6)} reserved; ${projection.conversationRuntime.status}; unknown usage ${projection.conversationRuntime.usageUnknown}.`:"Budget: no common ledger grant observed.",
    `Completion budget: $${projection.completionBudget.ceilingUsd.toFixed(6)} ceiling; ${projection.completionBudget.heldUsd===null?"held capacity unavailable":`$${projection.completionBudget.heldUsd.toFixed(6)} held`}; ${projection.completionBudget.remainingUsd===null?"available allowance not established":`$${projection.completionBudget.remainingUsd.toFixed(6)} uncommitted`}. This observation is not spend authority.`,
    `Readiness: ${projection.readiness.ready?"Ready for Review":projection.readiness.reasons.join("; ")}`,
    `Blocker / next permitted action: ${projection.nextStep}`,
  ];
}

/** Deterministic transition receipt, not an authority token. */
export function nativeAdmissionTransition(projection: EngineeringWorkerProjection, alreadyAdmitted = false) {
  return {
    admission: alreadyAdmitted ? "ALREADY_ADMITTED" : "SUCCESS",
    message: "NO NEW ADMISSION REQUIRED",
    ...currentWorkMetadata(projection),
    ...projection.nativeExecution,
    nextPhase: projection.nativeExecution.phase === "ADMITTED_READY_FOR_PRODUCTIVE_WORK" ? "PRODUCTIVE_EXECUTION" : projection.nativeExecution.phase,
    completionStatus: projection.completionStatus,
    budget: { ...projection.completionBudget, ...projection.conversationRuntime },
    currentTruth: currentTruthLines(projection),
    authorityToken: false,
  };
}
