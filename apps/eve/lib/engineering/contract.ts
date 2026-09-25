import { createHash } from "node:crypto";
import { z } from "zod";
import { criteriaSchema, WorkError, type Work, type WorkPrincipal } from "./types.ts";

export const shaSchema = z.string().regex(/^[a-f0-9]{40}$/);
export const pathSchema = z.string().min(1).max(240).refine(path =>
  /^[a-zA-Z0-9_./-]+$/.test(path) && !path.startsWith("/") &&
  !path.split("/").some(part => !part || part === "." || part === "..") &&
  !path.split("/").some(part => part.startsWith(".")) &&
  !/(^|\/)(node_modules|vendor|credentials|secrets)(\/|$)/i.test(path), "A bounded source path is required.");
export const profileSchema = z.object({
  id: z.string().min(1).max(100), version: z.number().int().positive(),
  repository: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
  privateQualification: z.literal(true),
  baseBranch: z.string().regex(/^[\w/-]+$/),
  allowedPaths: z.array(pathSchema).min(1).max(30),
  // The trusted supervisor compares black-box output; candidate code cannot terminate its assertions.
  checks: z.array(z.object({ id: z.string().regex(/^[\w-]+$/), program: pathSchema,
    input: z.string().max(16000), expectedOutput: z.string().max(16000), expectedExitCode: z.number().int().min(0).max(255),
    criterionIds: z.array(z.string().uuid()).min(1) }).strict()).min(1).max(20),
  requiredCI: z.array(z.string().min(1).max(100)).min(1).max(10),
  reviewerLogins: z.array(z.string().regex(/^[\w-]+$/)).min(1).max(10),
  policyVersion: z.number().int().positive(),
  executor: z.literal("claude-code"),
  image: z.string().regex(/^[\w./:-]+@sha256:[a-f0-9]{64}$/),
  maxRuns: z.number().int().min(1).max(8),
  maxModelRequests: z.number().int().min(1).max(30),
  maxOutputTokens: z.number().int().min(256).max(8192),
}).strict();
export type RepositoryProfile = z.infer<typeof profileSchema>;
export interface WorkContract {
  workId: string; scope: WorkPrincipal; humanOwner: string; coordinatingAgent: string;
  repository: string; issue: number; issueUrl: string; issueBody: string; objective: string;
  criteriaVersion: number; criteria: Work["criteria"]; baseSha: string;
  allowedOperations: string[]; forbiddenOperations: string[];
  executor: "claude-code"; limits: { maxRuns: number; maxDurationSeconds: number; maxModelRequests: number };
  budgetUsd: number; deadline: string; profile: RepositoryProfile; profileHash: string;
  policyVersion: number; definitionOfDone: string[]; requiredVerification: string[];
  publicationPolicy: "exact-candidate-approval-then-bounded-updates";
}
/** PostgreSQL jsonb reorders keys; authority and artifact hashes must survive that round trip. */
export function digest(value: unknown) {
  function canonical(item:unknown):unknown {
    if(Array.isArray(item))return item.map(canonical);
    if(item&&typeof item==="object")return Object.fromEntries(Object.entries(item).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,entry])=>[key,canonical(entry)]));
    return item;
  }
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
export function makeContract(work: Work, principal: WorkPrincipal, profileValue: unknown,
  issue: { number: number; url: string; body: string }, baseSha: string, agentId: string, now = Date.now()): WorkContract {
  const profile = profileSchema.parse(profileValue);
  shaSchema.parse(baseSha); criteriaSchema.parse(work.criteria);
  if (principal.scopeKind !== "personal" || principal.scopeId !== work.scopeId || profile.repository !== work.repository ||
    !agentId || !Number.isSafeInteger(issue.number) || issue.number < 1 || work.lifecycle !== "active")
    throw new WorkError("admission_denied", "The Work, owner, Agent, issue and qualification repository must match.");
  if (work.criteria.some(c => c.method !== "test" || !profile.checks.some(check => check.criterionIds.includes(c.id))))
    throw new WorkError("verification_missing", "Every criterion needs a protected verification check before admission.");
  return { workId: work.id, scope: principal, humanOwner: principal.actorId, coordinatingAgent: agentId,
    repository: work.repository, issue: issue.number, issueUrl: issue.url, issueBody: issue.body.slice(0,16000),
    objective: work.objective, criteriaVersion: work.criteriaVersion, criteria: work.criteria, baseSha,
    allowedOperations: ["repository.read", "sandbox.write", "candidate.create", "verification.request"],
    forbiddenOperations: ["merge", "deploy", "production", "repository.admin", "secrets.mutate", "workflows.mutate", "mcp.mutate"],
    executor: "claude-code", limits: { maxRuns: profile.maxRuns, maxDurationSeconds: work.maxDurationSeconds, maxModelRequests: profile.maxModelRequests },
    budgetUsd: work.maxCostUsd, deadline: new Date(now + work.maxDurationSeconds * 1000).toISOString(),
    profile, profileHash: digest(profile), policyVersion: profile.policyVersion,
    definitionOfDone: ["Current protected verification and CI pass", "Review requirements addressed", "No unresolved effects or human decisions", "Current approved candidate is the draft PR head"],
    requiredVerification: profile.checks.map(c => c.id), publicationPolicy: "exact-candidate-approval-then-bounded-updates" };
}
