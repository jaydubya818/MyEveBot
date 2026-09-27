import { randomUUID } from "node:crypto";
import { digest, type WorkContract } from "./contract.ts";
import { WorkError, type Work } from "./types.ts";

export type EvidenceState = "PASS" | "FAIL" | "UNKNOWN" | "STALE" | "NOT_RUN";
export interface Candidate {
  producer?: "MYFACTORY";
  factoryProvenance?: {receiptId:string;requestId:string;factoryId:string;factoryVersion:string;workOrderId:string;remoteRunId:string;attemptNumber:number;writerGeneration:number};
  rawCommit?: string;
  id: string; workId: string; runId: string; attemptId: string; repository: string;
  baseSha: string; parentSha: string; sha: string; tree: string; files: Record<string,string>;
  changedPaths: string[]; patch: string; artifactHash: string; createdAt: string;
  commit: { message: string; name: string; email: string; date: string };
}
export interface Evidence {
  id: string; workId: string; candidate: string; base: string; criteriaVersion: number;
  profileHash: string; environment: string; check: string; producer: "protected-supervisor";
  attemptId: string; observedAt: string; result: EvidenceState; artifact: string; artifactHash: string;
}
export interface EngineeringRun {
  id: string; attemptId: string; reason: string; generation: number; parentSha: string;
  publicationParentSha: string;
  status: "queued" | "running" | "candidate" | "stopped" | "failed";
  resource: string; startedAt: string; endedAt?: string; candidate?: string;
  inputSnapshot?: {sha:string;files:Record<string,string>};
  resourceReleasedAt?: string;
  custodyUnresolved?: boolean;
}
export interface CustodyInspection {
  id: string; runId: string; at: string;
  container: "running" | "stopped" | "absent" | "unknown";
  volume: "present" | "absent" | "unknown";
  outcome: "RETAINED" | "UNRESOLVED";
  candidateSha?: string; reason?: string;
}
export interface ExternalEffect {
  id: string; candidate: string; expectedHead: string | null;
  status: "PREPARED" | "UNKNOWN" | "CONFIRMED" | "DENIED";
  createdAt: string; pr?: number; url?: string; reason?: string;
}
/** Exact GitHub branch custody accepted after an observed owner takeover and Give Back. */
export interface HandoffBaseline {
  generation: number; head: string | null; prNumber: number | null; recordedAt: string;
}
export interface GitHubTruth {
  observedAt: string; authority: boolean; repository: string; baseSha: string;
  head: string | null; pr: { number: number; url: string; draft: boolean; open: boolean } | null;
  checks: { id: string; name: string; sha: string; attempt: number; result: EvidenceState; details: string }[];
  reviews: { id: string; author: string; sha: string; state: string; body: string; submittedAt: string }[];
}
export interface ResultVersion {
  id: string; version: number; createdAt: string; candidate: string; summary: string;
  objective: string; criteria: Work["criteria"]; changes: string[]; why: string;
  verification: Evidence[]; github: GitHubTruth; runs: EngineeringRun[];
  limitations: string[]; risks: string[]; interventions: Intervention[]; reservedUsd: number;
  costCoverage: string; elapsedSeconds: number;
}
export interface Intervention { id: string; kind: "judgment" | "coordination_debt"; reason: string; at: string; }
export interface Execution {
  qualificationMode: "live" | "simulation";
  contract: WorkContract; revision: number; generation: number;
  phase: "queued" | "executing" | "verifying" | "approval" | "publishing" | "observing" | "ready" | "needs_you" | "stopped";
  runs: EngineeringRun[]; candidates: Candidate[]; evidence: Evidence[]; effects: ExternalEffect[];
  approval: { id: string; candidate: string; actor: string; generation: number; at: string; boundedUpdates: boolean } | null;
  truth: GitHubTruth | null; addressedReviews: string[]; handledEvents: string[];
  humanHandoffGeneration?: number | null; handoffBaseline?: HandoffBaseline | null;
  reviewChecks: { reviewId: string; check: WorkContract["profile"]["checks"][number] }[];
  results: ResultVersion[]; interventions: Intervention[]; blockers: string[];
  custodyInspections?: CustodyInspection[];
  reservedUsd: number; modelRequests: number; lastActivity: string;
}
export const nowIso = () => new Date().toISOString();
export function initialExecution(contract: WorkContract, generation: number): Execution {
  return { qualificationMode:"live", contract, revision: 1, generation, phase: "queued", runs: [], candidates: [], evidence: [], effects: [], approval: null,
    truth: null, humanHandoffGeneration: null, handoffBaseline: null, addressedReviews: [], handledEvents: [], reviewChecks: [], results: [], interventions: [], blockers: [], custodyInspections: [], reservedUsd: 0, modelRequests: 0, lastActivity: nowIso() };
}
export function latestCandidate(state: Execution) { return state.candidates.at(-1) ?? null; }
export function invalidateEvidence(state: Execution) {
  for (const evidence of state.evidence) if (evidence.result !== "STALE") evidence.result = "STALE";
  state.truth = null;
}
export function queueRun(state: Execution, work: Work, reason: string, parentSha: string): EngineeringRun {
  if (work.control !== "agent" || work.lifecycle !== "active" || work.generation !== state.generation)
    throw new WorkError("writer_fenced", "Current Work control does not permit this executor.");
  if (state.runs.length >= state.contract.limits.maxRuns || state.reservedUsd >= state.contract.budgetUsd || Date.now() >= Date.parse(state.contract.deadline))
    throw new WorkError("limit_reached", "Work reached its run, budget or deadline boundary. Human review is required.");
  const id = randomUUID();
  const run: EngineeringRun = { id, attemptId: randomUUID(), reason, generation: work.generation, parentSha,
    publicationParentSha: state.truth?.head ?? state.effects.filter(e=>e.status==="CONFIRMED").at(-1)?.candidate ?? state.contract.baseSha,
    status: "queued", resource: `myeve-golden-${id}`, startedAt: nowIso() };
  state.runs.push(run); state.phase = "executing"; state.lastActivity = nowIso(); return run;
}

/** Readiness is derived from current authoritative observations, never set by a model. */
export function readiness(work: Work, state: Execution, now = Date.now()) {
  const reasons: string[] = [...state.blockers];
  const candidate = latestCandidate(state), truth = state.truth;
  if (work.lifecycle !== "active" || work.control !== "agent") reasons.push("Work is stopped, paused or under human control.");
  if (work.generation !== state.generation) reasons.push("Control changed; fresh reconciliation is required.");
  if (work.criteriaVersion !== state.contract.criteriaVersion) reasons.push("Acceptance criteria changed; a new contract is required.");
  if (now >= Date.parse(state.contract.deadline)) reasons.push("Work authority expired at its deadline.");
  if (state.reservedUsd > state.contract.budgetUsd) reasons.push("The Work budget was exceeded.");
  if (!truth || !Number.isFinite(Date.parse(truth.observedAt)) || Date.parse(truth.observedAt)>now+5000 || now - Date.parse(truth.observedAt) > 60000 || !truth.authority) reasons.push("Fresh repository authority and GitHub state are required.");
  if (!truth || truth.repository !== state.contract.repository || truth.baseSha !== state.contract.baseSha) reasons.push("Repository or base revision requires reconciliation.");
  if (!candidate || !truth?.head || candidate.sha !== truth.head) reasons.push("The candidate does not match the current GitHub head.");
  if (!truth?.pr?.open || !truth.pr.draft) reasons.push("An open draft PR is required.");
  if (state.runs.some(r => r.status === "queued" || r.status === "running")) reasons.push("An executor attempt is still active.");
  if (state.runs.some(r => r.custodyUnresolved)) reasons.push("An interrupted executor candidate remains unaccounted for.");
  if (state.runs.some(r => r.candidate && !r.resourceReleasedAt)) reasons.push("A retained candidate's executor resource still needs release.");
  if (state.effects.some(e => e.status === "UNKNOWN" || e.status === "PREPARED")) reasons.push("EXTERNAL STATE UNKNOWN: publication requires reconciliation.");
  if (!state.approval || !state.effects.some(e => e.candidate === candidate?.sha && e.status === "CONFIRMED")) reasons.push("The current candidate has no confirmed authorized publication.");
  for (const check of [...state.contract.profile.checks,...state.reviewChecks.map(r=>r.check)]) {
    const observations = state.evidence.filter(e => e.candidate === candidate?.sha && e.check === check.id &&
      e.criteriaVersion === work.criteriaVersion && e.profileHash === state.contract.profileHash && e.base === state.contract.baseSha &&
      e.workId === work.id && e.producer === "protected-supervisor" && e.artifactHash === digest(e.artifact));
    if (observations.at(-1)?.result !== "PASS") reasons.push(`Protected verification ${check.id} is ${observations.at(-1)?.result ?? "NOT_RUN"}.`);
  }
  for (const name of state.contract.profile.requiredCI) {
    const check = truth?.checks.filter(c => c.name === name && c.sha === candidate?.sha).sort((a,b) => b.attempt-a.attempt || Number(b.id)-Number(a.id))[0];
    if (check?.result !== "PASS") reasons.push(`CI ${name} is ${check?.result ?? "NOT_RUN"}${check ? ` (attempt ${check.attempt}, ${check.sha.slice(0,7)})` : ""}.`);
  }
  for (const review of truth?.reviews ?? []) {
    if (review.state === "CHANGES_REQUESTED" && !state.addressedReviews.includes(review.id)) reasons.push(`Review ${review.id} has unaddressed changes requested by ${review.author}.`);
  }
  if (["approval","needs_you"].includes(state.phase)) reasons.push("A required human decision is pending.");
  return { ready: reasons.length === 0, reasons: [...new Set(reasons)] };
}
export function manifest(work: Work, state: Execution) {
  const decision = readiness(work, state);
  const candidate = latestCandidate(state);
  const repositoryObservedAt = state.truth?.observedAt ?? null;
  const repositoryAgeMs = repositoryObservedAt ? Date.now() - Date.parse(repositoryObservedAt) : Number.POSITIVE_INFINITY;
  const repositoryObservation = !Number.isFinite(repositoryAgeMs) || repositoryAgeMs < -5000
    ? "unknown" as const
    : repositoryAgeMs > 60000 || !state.truth?.authority ? "stale" as const : "fresh" as const;
  const unknownEffects = state.effects.filter(e => e.status === "UNKNOWN" || e.status === "PREPARED");
  const publicationNeedsReconciliation = state.phase === "publishing" && unknownEffects.length > 0 && state.blockers.length > 0;
  const canRequestDecision = work.lifecycle === "active" && work.control === "agent" && work.generation === state.generation;
  const pendingDecisions = !canRequestDecision ? [] : state.phase === "approval"
    ? ["Approve exact candidate publication and bounded in-scope updates"]
    : state.phase === "needs_you" ? state.blockers.length ? state.blockers : ["Execution needs human review."]
    : publicationNeedsReconciliation ? [`Publication outcome is unconfirmed. ${state.blockers[0]}`] : [];
  const verification = [...state.contract.profile.checks, ...state.reviewChecks.map(item => item.check)].map(check => {
    const observations = state.evidence.filter(e => e.check === check.id && e.workId === work.id);
    const current = observations.filter(e => e.candidate === candidate?.sha && e.criteriaVersion === work.criteriaVersion &&
      e.profileHash === state.contract.profileHash && e.base === state.contract.baseSha &&
      e.producer === "protected-supervisor" && e.artifactHash === digest(e.artifact)).at(-1);
    return { check: check.id, criterionIds: check.criterionIds, result: current?.result ?? (observations.length ? "STALE" as const : "NOT_RUN" as const),
      observedAt: current?.observedAt ?? null, producer: current?.producer ?? null };
  });
  const status = work.lifecycle !== "active" ? work.lifecycle[0].toUpperCase() + work.lifecycle.slice(1)
    : work.control === "human" ? "In your hands"
    : work.control === "paused" ? "Paused"
    : work.control === "stopping" ? "Stopping"
    : state.phase === "stopped" ? "Stopped"
    : decision.ready ? "Ready for Review"
    : pendingDecisions.length ? "Needs You"
    : ["executing","verifying","queued"].includes(state.phase) ? "Working" : "Waiting";
  const nextStep = work.lifecycle !== "active" ? "Review the retained Result and Work history."
    : work.control === "human" ? "Finish your changes, then give Work back to Sofie for fresh verification."
    : work.control === "paused" ? "Resume Work when you want Sofie to continue."
    : work.control === "stopping" ? "Wait for the active attempt and resources to stop."
    : work.generation !== state.generation ? "Control changed; reconcile the current Work and execution before requesting a decision."
    : state.phase === "approval" ? "Review the candidate and current evidence, then decide on exact draft PR publication."
    : state.phase === "needs_you" ? "Inspect the blocker and reconcile it before any fresh attempt."
    : state.phase === "stopped" ? "Publication is stopped. Take over or explicitly continue with a fresh attempt."
    : state.phase === "queued" ? "Observe repository authority and start the bounded run."
    : state.phase === "executing" ? "Collect a candidate from the current run."
    : state.phase === "verifying" ? "Run independent protected verification for the current candidate."
    : publicationNeedsReconciliation ? "Inspect the recorded publication effect and current GitHub state. Do not approve or retry publication until the external state is reconciled."
    : state.phase === "publishing" ? "Reconcile or complete the approved draft PR publication."
    : state.phase === "observing" ? "Observe current CI and reviewer state."
    : decision.ready ? "Review the evidence-backed draft PR and Result."
    : "Refresh current repository state and inspect the remaining readiness reasons.";
  const currentRun = state.runs.at(-1) ?? null;
  const activity = state.blockers.at(-1) ?? (state.phase === "ready" ? "Protected verification and current CI were reconciled."
    : state.phase === "approval" ? "Candidate verified; exact publication decision requested."
    : state.phase === "verifying" ? "Candidate retained; protected verification is in progress."
    : currentRun?.status === "running" ? "Bounded execution is running."
    : currentRun?.status === "queued" ? "A bounded execution attempt is queued."
    : state.phase === "observing" ? "Observing current CI and reviewer state."
    : "Work state updated.");
  const attention = pendingDecisions.length ? {
    id: `${state.phase}:${state.revision}:${candidate?.sha ?? "none"}`,
    kind: state.phase === "approval" ? "publication" as const : "exception" as const,
    reason: pendingDecisions[0],
    workVersion: work.version,
    executionRevision: state.revision,
    criteriaVersion: work.criteriaVersion,
    candidateSha: candidate?.sha ?? null,
    expiresAt: state.contract.deadline,
    reconciliation: publicationNeedsReconciliation ? {
      effects: unknownEffects.map(e => ({ id: e.id, status: e.status, candidate: e.candidate,
        expectedHead: e.expectedHead, pr: e.pr ?? null, reason: e.reason ?? null, createdAt: e.createdAt })),
      blockers: [...state.blockers],
      observation: { status: repositoryObservation, observedAt: repositoryObservedAt,
        repository: state.truth?.repository ?? null, baseSha: state.truth?.baseSha ?? null,
        head: state.truth?.head ?? null, pr: state.truth?.pr ?? null, authority: state.truth?.authority ?? false },
    } : null,
    options: state.phase === "approval"
      ? ["Review and approve this exact candidate", "Decline publication", "Take over", "Stop"]
      : publicationNeedsReconciliation ? ["Inspect effect and repository state", "Escalate for manual reconciliation"]
      : ["Inspect and reconcile", "Take over", "Stop"],
  } : null;
  return { workId: work.id, objective: work.objective, lifecycle: work.lifecycle, control: work.control,
    criteriaVersion: work.criteriaVersion, repository: work.repository, baseSha: state.contract.baseSha,
    candidateSha: candidate?.sha ?? null, prHeadSha: state.truth?.head ?? null, currentRun,
    evidence: state.evidence.filter(e => e.candidate === candidate?.sha), verification, readiness: decision,
    status, activity, nextStep, pendingDecisions, attention,
    source: "durable-engineering-execution" as const,
    repositoryObservation: { status: repositoryObservation, observedAt: repositoryObservedAt, maxAgeSeconds: 60 },
    unknownEffects,
    budget: { limitUsd: state.contract.budgetUsd, reservedUsd: state.reservedUsd, coverage: "Conservative model reservations; infrastructure cost excluded" },
    lastMeaningfulActivity: state.lastActivity };
}
