export const SKILL_AGENT_IDS = [
  "sofie",
  "functional-state",
  "ux-accessibility",
  "trust-resilience",
] as const;

export const SKILL_EVAL_MESSAGE_PREFIX = "[MyEve routing eval]";

export type SkillAgentId = (typeof SKILL_AGENT_IDS)[number];

export interface SkillAgentDefinition {
  id: SkillAgentId;
  label: string;
  description: string;
  kind: "primary" | "specialist";
  assignmentMode: "fixed" | "managed";
  taskLabel: string;
}

export const SKILL_AGENTS: readonly SkillAgentDefinition[] = [
  {
    id: "sofie",
    label: "Sofie",
    description: "Primary personal agent",
    kind: "primary",
    assignmentMode: "fixed",
    taskLabel: "Conversations, goals, and automations",
  },
  {
    id: "functional-state",
    label: "Functional & State",
    description: "Critical flows and state transitions",
    kind: "specialist",
    assignmentMode: "managed",
    taskLabel: "Product QA · functional checks",
  },
  {
    id: "ux-accessibility",
    label: "UX & Accessibility",
    description: "Responsive, keyboard, identity, and accessibility checks",
    kind: "specialist",
    assignmentMode: "managed",
    taskLabel: "Product QA · experience checks",
  },
  {
    id: "trust-resilience",
    label: "Trust & Resilience",
    description: "Authentication, data boundaries, failure, and recovery",
    kind: "specialist",
    assignmentMode: "managed",
    taskLabel: "Product QA · trust checks",
  },
] as const;

export const DEFAULT_SPECIALIST_SKILLS: Readonly<Record<Exclude<SkillAgentId, "sofie">, readonly string[]>> = {
  "functional-state": [
    "api-and-interface-design",
    "constraint-driven-development",
    "create-verification-skill",
    "evidence-driven-testing",
    "planning-and-task-breakdown",
    "principle-prove-it-works",
    "principle-test-behavior-not-implementation",
    "source-driven-development",
    "spec-driven-development",
    "tdd",
  ],
  "ux-accessibility": [
    "before-and-after",
    "evidence-driven-testing",
    "frontend-ui-engineering",
    "performance-optimization",
    "principle-experience-first",
    "principle-minimize-reader-load",
  ],
  "trust-resilience": [
    "blast-radius",
    "deprecation-and-migration",
    "observability-and-instrumentation",
    "principle-boundary-discipline",
    "principle-fix-root-causes",
    "principle-make-operations-idempotent",
    "principle-prove-it-works",
    "security-and-hardening",
    "shipping-and-launch",
  ],
};

export function isSkillAgentId(value: unknown): value is SkillAgentId {
  return typeof value === "string" && SKILL_AGENT_IDS.includes(value as SkillAgentId);
}

export interface SkillUsageSummary {
  total: number;
  succeeded: number;
  failed: number;
  cancelled: number;
  inProgress: number;
  completionRate: number | null;
  averageDurationMs: number | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  taskRunCount: number;
  byAgent: Partial<Record<SkillAgentId, number>>;
  lastUsedAt: string | null;
  activity: readonly number[];
}

export interface SkillEvalSummary {
  verdict: "passed" | "failed" | "scored" | "skipped" | "not_run";
  runCount: number;
  lastRunAt: string | null;
  passedAssertions: number;
  assertionCount: number;
  contentHash: string | null;
  durationMs: number | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  error: string | null;
}

export type SkillEvalRunMode = "manual" | "changed" | "ci";
export type SkillEvalRunStatus = "queued" | "running" | "completed" | "failed";

export interface SkillEvalRunSummary {
  id: string;
  mode: SkillEvalRunMode;
  status: SkillEvalRunStatus;
  requestedCount: number;
  completedCount: number;
  requestedSkills: readonly string[];
  passed: number;
  failed: number;
  scored: number;
  skipped: number;
  errored: number;
  costUsd: number;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
}
