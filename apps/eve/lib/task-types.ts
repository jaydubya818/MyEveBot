import { AGENT_NAME, OWNER_NAME } from "./identity.ts";

export const TASK_STATUSES = [
  "queued",
  "running",
  "awaiting_approval",
  "waiting_for_owner",
  "paused",
  "completed",
  "failed",
  "cancelled",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export const QA_SPECIALISTS = [
  { role: "functional-state", label: "Functional & State" },
  { role: "ux-accessibility", label: "UX & Accessibility" },
  { role: "trust-resilience", label: "Trust & Resilience" },
] as const;

export type QaSpecialistRole = (typeof QA_SPECIALISTS)[number]["role"];

export const BALANCED_GUARDRAILS = {
  maxDurationSeconds: 15 * 60,
  maxSpecialists: 3,
  maxModelSteps: 40,
  maxRetriesPerSpecialist: 1,
  maxEstimatedCostUsd: 5,
} as const;

export const PRODUCT_QA_CHECKS = [
  {
    slug: "local-critical-flow",
    label: "Local critical flow completes without blocking errors",
    role: "functional-state",
    environment: "local",
  },
  {
    slug: "preview-critical-flow",
    label: "Preview critical flow completes without blocking errors",
    role: "functional-state",
    environment: "preview",
  },
  {
    slug: "identity-and-navigation",
    label: `${AGENT_NAME} and ${OWNER_NAME} identity plus primary navigation are consistent`,
    role: "ux-accessibility",
    environment: "both",
  },
  {
    slug: "responsive-and-keyboard",
    label: "Critical screens remain usable responsively and by keyboard",
    role: "ux-accessibility",
    environment: "both",
  },
  {
    slug: "auth-and-data-boundaries",
    label: "Preview authentication and owner data boundaries fail closed",
    role: "trust-resilience",
    environment: "preview",
  },
  {
    slug: "failure-and-recovery",
    label: "Loading, empty, error, cancellation, and retry states are explicit",
    role: "trust-resilience",
    environment: "both",
  },
] as const satisfies readonly {
  slug: string;
  label: string;
  role: QaSpecialistRole;
  environment: "local" | "preview" | "both";
}[];

export interface TaskSpecialistView {
  role: QaSpecialistRole;
  label: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  attempts: number;
  summary: string | null;
  error: string | null;
}

export interface TaskCheckView {
  id: string;
  slug: string;
  label: string;
  specialistRole: QaSpecialistRole;
  environment: "local" | "preview" | "both";
  required: boolean;
  status: "pending" | "passed" | "failed" | "blocked";
  resultSummary: string | null;
  checkedAt: string | null;
  artifactCount: number;
}

export interface TaskArtifactView {
  id: string;
  checkId: string | null;
  specialistRole: QaSpecialistRole | null;
  kind: "screenshot" | "report" | "log" | "json";
  filename: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
}

export interface TaskMilestoneView {
  id: number;
  kind: string;
  summary: string;
  createdAt: string;
}

export interface TaskRunView {
  id: string;
  agentId: string | null;
  kind: "product_qa" | "delegated_work";
  title: string;
  threadId: string | null;
  goalId: string | null;
  goalTaskId: string | null;
  status: TaskStatus;
  statusReason: string | null;
  objective: string | null;
  expectedOutput: string | null;
  parentTaskId: string | null;
  sourceTaskId: string | null;
  roleId: string | null;
  resultSummary: string | null;
  reviewStatus: "draft" | "ready_for_review" | "accepted" | "revision_requested" | "superseded";
  target: { localUrl: string; previewUrl: string };
  guardrails: {
    maxDurationSeconds: number;
    maxSpecialists: number;
    maxModelSteps: number;
    maxRetriesPerSpecialist: number;
    maxEstimatedCostUsd: number;
  };
  usage: { modelSteps: number; estimatedCostUsd: number };
  createdAt: string;
  startedAt: string | null;
  deadlineAt: string | null;
  completedAt: string | null;
  updatedAt: string;
  specialists: TaskSpecialistView[];
  checks: TaskCheckView[];
  artifacts: TaskArtifactView[];
  milestones: TaskMilestoneView[];
}

const LEGAL_TRANSITIONS: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  queued: ["running", "cancelled"],
  running: ["awaiting_approval", "waiting_for_owner", "paused", "completed", "failed", "cancelled"],
  awaiting_approval: ["running", "paused", "failed", "cancelled"],
  waiting_for_owner: ["running", "paused", "failed", "cancelled"],
  paused: ["queued", "cancelled"],
  completed: [],
  failed: ["queued"],
  cancelled: [],
};

export function canTransitionTask(from: TaskStatus, to: TaskStatus): boolean {
  return LEGAL_TRANSITIONS[from].includes(to);
}

const SECRET_PATTERNS: readonly RegExp[] = [
  /\b(?:sk|pk|vercel_blob_rw)_[a-z0-9_=-]{12,}\b/gi,
  /\b(?:postgres(?:ql)?):\/\/[^\s"']+/gi,
  /\b(?:authorization|cookie|set-cookie)\s*:\s*[^\r\n]+/gi,
  /\b(?:token|secret|password|api[_-]?key)\s*[=:]\s*[^\s,;]+/gi,
];

export function redactEvidenceText(value: string): string {
  return SECRET_PATTERNS.reduce(
    (redacted, pattern) => redacted.replace(pattern, "[REDACTED]"),
    value,
  );
}
