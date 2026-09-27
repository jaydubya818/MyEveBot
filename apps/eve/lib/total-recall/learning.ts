import { createHash } from "node:crypto";
import { z } from "zod";

// Learning selects reviewed, bounded presentation behavior. Untrusted prose is
// retained as evidence, never compiled into instructions, Skills or authority.
export const behaviors = {
  cite_sources: "Include the original source references with factual Work summaries. Distinguish owner statements from inferences.",
  state_uncertainty: "Label uncertain and conflicting observations in Work summaries. Do not present them as Current Truth.",
} as const;
export const behaviorSchema = z.enum(["cite_sources", "state_uncertainty"]);
const ref = z.string().trim().min(1).max(200);
export const feedbackInput = z.object({
  eventId: z.string().uuid(), workId: z.string().uuid(), workVersion: z.number().int().positive(),
  workType: z.enum(["research", "implementation", "review"]),
  type: z.enum(["useful", "incorrect", "not_relevant", "worked", "did_not_work", "prefer_this", "do_not_do_this"]),
  target: z.enum(["work", "result", "response", "candidate", "skill", "memory"]),
  targetRef: ref,
  note: z.string().trim().min(1).max(2000),
  behavior: behaviorSchema,
  // OWNER/PROJECT/ROLE require qualified tenancy/context bindings not yet present.
  scope: z.enum(["WORK", "REPOSITORY"]),
  correctionOf: z.number().int().positive().optional(),
  replacesVersion: z.number().int().positive().optional(),
}).strict();
export type FeedbackInput = z.infer<typeof feedbackInput>;
export interface LearningScope { ownerId: string; repository: string; workType: FeedbackInput["workType"]; workId: string | null }
export interface Evidence {
  eventId: string; workId: string; workVersion: number; target: FeedbackInput["target"]; targetRef: string;
  type: FeedbackInput["type"]; note: string; actorId: string; recordedAt: string;
  provenance: "authenticated_owner_feedback"; objective: string; criteria: unknown;
}
export type LearningStatus = "CANDIDATE" | "EVALUATING" | "PROMOTED" | "REJECTED" | "SUPERSEDED" | "ROLLED_BACK";
export interface Evaluation {
  fixture: "work-summary-v1"; candidateHash: string; evaluatedAt: string;
  baselineScore: number; learnedScore: number; result: "PASS" | "FAIL";
  criteria: string[]; cases: Array<{ input: SummaryFact[]; baseline: string; learned: string; expected: string[] }>;
}
export interface LearningVersion {
  version: number; behavior: keyof typeof behaviors; status: LearningStatus; hash: string;
  evidence: Evidence[]; evaluation: Evaluation | null; reason: string | null;
  correctionOf: number | null; replacesVersion?: number | null; createdAt: string;
}
export interface LearningFamily {
  id: string; revision: number; scope: LearningScope; versions: LearningVersion[];
  events: Array<{ id: string; kind: string; version: number; actorId: string; at: string; reason: string; restoreVersion?: number }>;
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
export const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
export function familyId(scope: LearningScope): string { return digest(scope); }

// Defense in depth for evidence storage, not the security boundary. The closed
// behavior registry is what prevents free text from becoming persistent code.
export function assertNoSecrets(text: string): void {
  const normalized = text.normalize("NFKC").replace(/[\u200B-\u200D\uFEFF]/g, "");
  if (/(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk|ghp|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{12,}|\bAKIA[A-Z0-9]{16}\b|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|\b(?:password|passwd|api[ _-]?key|access[ _-]?token|session[ _-]?cookie|otp|one[ -]time code)\s*[:=]\s*\S+|\bBearer\s+\S+)/i.test(normalized))
    throw new Error("Secret-shaped content cannot be stored as learning evidence.");
}
export function assertSafeEvidence(text: string): void {
  assertNoSecrets(text);
  const normalized = text.normalize("NFKC").replace(/[\u200B-\u200D\uFEFF]/g, "");
  if (/ignore\s+(?:all\s+)?(?:(?:previous|prior)\s+)?(?:instructions|rules)|<\/?system>|(?:system|developer)\s+(?:prompt|message)\s*:|(?:forward|send|reveal)\s+private|execute\s+arbitrary|run\s+(?:a\s+)?shell/i.test(normalized))
    throw new Error("Instruction-like feedback cannot become a learning candidate.");
  if (/\b(?:credentials?|secrets?|passwords?|tokens?|grants?|permissions?|authorit(?:y|ies)|approvals?|budget|policy|policies|gateway|retention|privacy|repository access|self[ -]?modif\w*|ignore (?:previous|prior)|bypass|exfiltrat\w*)\b/i.test(normalized))
    throw new Error("Authority, policy and credential topics are ineligible for learning.");
}
export function candidateHash(scope: LearningScope, version: number, behavior: keyof typeof behaviors, links?: { correctionOf?: number | null; replacesVersion?: number | null }): string {
  return digest({ scope, version, behavior, guidance: behaviors[behavior], fixture: "work-summary-v1",
    ...(links?.correctionOf || links?.replacesVersion ? { correctionOf: links.correctionOf ?? null, replacesVersion: links.replacesVersion ?? null } : {}) });
}
export interface SummaryFact { statement: string; source: string; origin: "owner" | "inference"; truth: "current" | "uncertain" | "conflicting" }
export function renderWorkSummary(facts: SummaryFact[], behavior?: keyof typeof behaviors): string {
  return facts.map(fact => `${fact.statement}${behavior === "state_uncertainty" ? ` [${fact.truth}; ${fact.origin}]` : ""}${behavior === "cite_sources" ? ` [${fact.source}; ${fact.origin}]` : ""}`).join("\n");
}
/** Trusted evaluator inputs are code-owned; an API caller cannot submit PASS. */
export function evaluateCandidate(family: LearningFamily, version: LearningVersion, now: string): Evaluation {
  if (version.hash !== candidateHash(family.scope, version.version, version.behavior, version)) throw new Error("Candidate changed.");
  const fixtures: SummaryFact[][] = [
    [{ statement: "Deadline is Friday", source: "file:brief-v2", origin: "owner", truth: "current" }],
    [{ statement: "Estimate may increase", source: "result:estimate", origin: "inference", truth: "uncertain" },
      { statement: "Two estimates disagree", source: "file:estimate-b", origin: "inference", truth: "conflicting" }],
  ];
  const cases = fixtures.map(input => ({ input, baseline: renderWorkSummary(input), learned: renderWorkSummary(input, version.behavior),
    expected: input.map(f => version.behavior === "cite_sources" ? `[${f.source}; ${f.origin}]` : `[${f.truth}; ${f.origin}]`) }));
  const total = cases.flatMap(c => c.expected).length;
  const baselineScore = cases.reduce((n, c) => n + c.expected.filter(e => c.baseline.includes(e)).length, 0) / total;
  const learnedScore = cases.reduce((n, c) => n + c.expected.filter(e => c.learned.includes(e)).length, 0) / total;
  const positive = version.evidence.every(e => !["not_relevant", "did_not_work", "do_not_do_this"].includes(e.type));
  return { fixture: "work-summary-v1", candidateHash: version.hash, evaluatedAt: now, baselineScore, learnedScore,
    result: positive && learnedScore > baselineScore ? "PASS" : "FAIL",
    criteria: [version.behavior === "cite_sources" ? "Every factual statement includes its original source and origin" : "Every observation labels uncertainty and origin", "No negative applicability feedback"], cases };
}

export const learningCommandSchema = z.object({ eventId: z.string().uuid(), version: z.number().int().positive(),
  action: z.enum(["evaluate", "promote", "reject", "rollback"]), reason: z.string().trim().min(1).max(1000), hash: z.string().regex(/^[a-f0-9]{64}$/),
  restoreVersion: z.number().int().positive().optional(),
}).strict();
export type LearningCommand = z.infer<typeof learningCommandSchema>;
/** One aggregate is committed with revision CAS, so status races cannot partly activate guidance. */
export function transitionLearning(input: LearningFamily, command: LearningCommand, ownerId: string, now: string): LearningFamily {
  command = learningCommandSchema.parse(command);
  if (command.restoreVersion && command.action !== "rollback") throw new Error("Restore version is only valid for rollback.");
  const family = structuredClone(input);
  if (family.scope.ownerId !== ownerId) throw new Error("Learning owner mismatch.");
  const version = family.versions.find(v => v.version === command.version);
  if (!version || version.hash !== command.hash || version.hash !== candidateHash(family.scope, version.version, version.behavior, version)) throw new Error("Candidate changed.");
  const existing = family.events.find(e => e.id === command.eventId);
  if (existing) {
    if (existing.kind !== command.action || existing.version !== command.version || existing.reason !== command.reason || existing.restoreVersion !== command.restoreVersion) throw new Error("Event identity changed.");
    return family;
  }
  assertSafeEvidence(command.reason);
  if (command.action === "evaluate") {
    if (version.status !== "CANDIDATE" || version.evaluation) throw new Error("Only unevaluated candidates can be evaluated.");
    version.evaluation = evaluateCandidate(family, version, now);
    if (version.evaluation.result === "FAIL") { version.status = "REJECTED"; version.reason = "Representative evaluation failed."; }
  } else if (command.action === "promote") {
    if (version.status !== "CANDIDATE" || version.evaluation?.result !== "PASS" || version.evaluation.candidateHash !== version.hash) throw new Error("An exact passing evaluation is required.");
    // Only an explicit correction or qualified replacement may replace an active rule.
    const active = family.versions.find(v => v.status === "PROMOTED");
    if (active && version.correctionOf !== active.version && version.replacesVersion !== active.version) throw new Error("Conflicting learning requires an explicit owner correction.");
    if (active) active.status = "SUPERSEDED";
    version.status = "PROMOTED";
    version.reason = command.reason;
  } else if (command.action === "reject") {
    if (version.status !== "CANDIDATE") throw new Error("Only candidates can be rejected.");
    version.status = "REJECTED"; version.reason = command.reason;
  } else {
    if (version.status !== "PROMOTED") throw new Error("Only promoted learning can be rolled back.");
    version.status = "ROLLED_BACK"; version.reason = command.reason;
    if (command.restoreVersion !== undefined) {
      const prior = family.versions.find(v => v.version === command.restoreVersion);
      if (!prior || version.replacesVersion !== prior.version || prior.status !== "SUPERSEDED" ||
          prior.evaluation?.result !== "PASS" || prior.evaluation.candidateHash !== prior.hash ||
          prior.hash !== candidateHash(family.scope, prior.version, prior.behavior, prior) ||
          family.versions.some(v => v.correctionOf === prior.version))
        throw new Error("Rollback may restore only the prior qualified replacement version, never owner-corrected guidance.");
      prior.status = "PROMOTED";
      prior.reason = `Restored by rollback of version ${version.version}: ${command.reason}`;
    }
  }
  family.events.push({ id: command.eventId, kind: command.action, version: version.version, actorId: ownerId, at: now, reason: command.reason, ...(command.restoreVersion ? { restoreVersion: command.restoreVersion } : {}) });
  family.revision++;
  return family;
}

/** Validate persisted advisory data before it can enter a runtime context. */
export function assertLearningFamily(family: LearningFamily, ownerId: string): void {
  if (family.scope.ownerId !== ownerId || family.id !== familyId(family.scope) || family.versions.length > 40 ||
      family.versions.filter(v => v.status === "PROMOTED").length > 1 || new Set(family.versions.map(v => v.version)).size !== family.versions.length)
    throw new Error("Persisted learning scope or active versions are invalid.");
  for (const v of family.versions) {
    behaviorSchema.parse(v.behavior);
    if (v.hash !== candidateHash(family.scope,v.version,v.behavior,v) || !v.evidence.length ||
        v.evidence.some(e => e.actorId !== ownerId || e.provenance !== "authenticated_owner_feedback"))
      throw new Error("Persisted learning provenance is invalid.");
    v.evidence.forEach(e => assertSafeEvidence(e.note));
    if(v.status === "PROMOTED" && (v.evaluation?.result !== "PASS" || v.evaluation.candidateHash !== v.hash))
      throw new Error("Active learning has no exact passing evaluation.");
  }
}
