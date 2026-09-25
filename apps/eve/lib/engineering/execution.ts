import { randomUUID } from "node:crypto";
import { digest, type WorkContract } from "./contract.ts";
import { WorkError, type Work } from "./types.ts";

export type EvidenceState = "PASS" | "FAIL" | "UNKNOWN" | "STALE" | "NOT_RUN";
export interface Candidate {
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
}
export interface ExternalEffect {
  id: string; candidate: string; expectedHead: string | null;
  status: "PREPARED" | "UNKNOWN" | "CONFIRMED" | "DENIED";
  createdAt: string; pr?: number; url?: string; reason?: string;
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
  reviewChecks: { reviewId: string; check: WorkContract["profile"]["checks"][number] }[];
  results: ResultVersion[]; interventions: Intervention[]; blockers: string[];
  reservedUsd: number; modelRequests: number; lastActivity: string;
}
export const nowIso = () => new Date().toISOString();
export function initialExecution(contract: WorkContract, generation: number): Execution {
  return { qualificationMode:"live", contract, revision: 1, generation, phase: "queued", runs: [], candidates: [], evidence: [], effects: [], approval: null,
    truth: null, addressedReviews: [], handledEvents: [], reviewChecks: [], results: [], interventions: [], blockers: [], reservedUsd: 0, modelRequests: 0, lastActivity: nowIso() };
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
  return { workId: work.id, objective: work.objective, lifecycle: work.lifecycle, control: work.control,
    criteriaVersion: work.criteriaVersion, repository: work.repository, baseSha: state.contract.baseSha,
    candidateSha: latestCandidate(state)?.sha ?? null, prHeadSha: state.truth?.head ?? null, currentRun: state.runs.at(-1) ?? null,
    evidence: state.evidence.filter(e => e.candidate === latestCandidate(state)?.sha), readiness: decision,
    status: work.lifecycle === "failed" ? "Failed" : decision.ready ? "Ready for Review" :
      state.phase === "needs_you" || state.phase === "approval" || work.control !== "agent" ? "Needs You" :
      ["executing","verifying","queued"].includes(state.phase) ? "Working" : "Waiting",
    pendingDecisions: state.phase === "approval" ? ["Approve exact candidate publication and bounded in-scope updates"] : state.phase === "needs_you" ? state.blockers : [],
    unknownEffects: state.effects.filter(e => ["UNKNOWN","PREPARED"].includes(e.status)),
    budget: { limitUsd: state.contract.budgetUsd, reservedUsd: state.reservedUsd, coverage: "Conservative model reservations; infrastructure cost excluded" },
    lastMeaningfulActivity: state.lastActivity };
}
