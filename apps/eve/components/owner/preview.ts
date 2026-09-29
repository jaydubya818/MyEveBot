import type { GoalDetailView } from "@/lib/goal-types";
import type { TaskRunView } from "@/lib/task-types";
import { emptySnapshot, type OwnerSnapshot } from "./projection";

export interface PreviewSnapshot extends OwnerSnapshot {
  details: Record<string, GoalDetailView>;
}
const key = "myeve-owner-preview-v1";
export function exampleGoal(
  id = "preview-work",
  title = "Prepare the design partner welcome pack",
): GoalDetailView {
  const at = new Date().toISOString();
  return {
    id,
    title,
    description:
      "Give each design partner a clear, useful first week with Sofie.",
    motivation: "Make the first experience calm and easy to trust.",
    status: "active",
    priority: "normal",
    planningMode: "simple",
    successCriteria: [
      "Explain what Sofie can do and when approval is required",
      "Include one useful first assignment and a feedback path",
    ],
    targetDate: null,
    source: "web",
    sourceReference: null,
    startedAt: at,
    completedAt: null,
    archivedAt: null,
    createdAt: at,
    updatedAt: at,
    progress: 50,
    taskCount: 2,
    completedTaskCount: 1,
    plans: [
      {
        id: "preview-plan",
        version: 1,
        status: "active",
        summary:
          "Draft the welcome pack, check it against the beta guide, then ask for your review.",
        strategy: "Keep the first week focused on one useful outcome.",
        createdAt: at,
        supersededAt: null,
      },
    ],
    milestones: [],
    tasks: [],
    threadIds: [],
    events: [
      {
        id: "preview-event",
        type: "goal_created",
        severity: "info",
        summary: "Work created with two acceptance criteria.",
        rationale: [],
        occurredAt: at,
      },
    ],
    linkedRunIds: ["preview-task"],
    nextAction: null,
  };
}
export function exampleSnapshot(): PreviewSnapshot {
  const goal = exampleGoal();
  const completed = {
    ...exampleGoal("preview-completed", "Summarize design partner feedback"),
    status: "completed" as const,
    completedAt: goal.updatedAt,
    progress: 100,
    completedTaskCount: 2,
    linkedRunIds: [],
  };
  const blocked = {
    ...exampleGoal("preview-blocked", "Review connected app access"),
    status: "blocked" as const,
    progress: 0,
    completedTaskCount: 0,
    linkedRunIds: [],
    plans: [],
  };
  const task: TaskRunView = {
    id: "preview-task",
    agentId: null,
    kind: "delegated_work",
    title: "Draft welcome pack",
    threadId: null,
    goalId: goal.id,
    goalTaskId: null,
    status: "awaiting_approval",
    statusReason:
      "The draft is ready. Review the exact sharing request before sending.",
    objective: goal.description,
    expectedOutput: "A concise welcome pack",
    parentTaskId: null,
    sourceTaskId: null,
    roleId: null,
    resultSummary: "Welcome pack candidate prepared",
    reviewStatus: "ready_for_review",
    target: { localUrl: "", previewUrl: "" },
    guardrails: {
      maxDurationSeconds: 900,
      maxSpecialists: 1,
      maxModelSteps: 40,
      maxRetriesPerSpecialist: 1,
      maxEstimatedCostUsd: 5,
    },
    usage: { modelSteps: 12, estimatedCostUsd: 0.42 },
    createdAt: goal.createdAt,
    startedAt: goal.startedAt,
    deadlineAt: null,
    completedAt: null,
    updatedAt: goal.updatedAt,
    specialists: [],
    checks: [
      {
        id: "preview-check",
        slug: "content-review",
        label: "Required sections are present",
        specialistRole: "functional-state",
        environment: "local",
        required: true,
        status: "passed",
        resultSummary:
          "Objective, permission boundary, first assignment and feedback instructions are included.",
        checkedAt: goal.updatedAt,
        artifactCount: 0,
      },
    ],
    artifacts: [],
    milestones: [
      {
        id: 1,
        kind: "investigated",
        summary: "Sofie reviewed the beta guide.",
        createdAt: goal.createdAt,
      },
      {
        id: 2,
        kind: "delegated",
        summary:
          "Sofie delegated the welcome pack draft to MyFactory (example).",
        createdAt: goal.updatedAt,
      },
    ],
  };
  return {
    goals: [goal, completed, blocked],
    tasks: [task],
    approvals: [
      {
        id: "preview-approval",
        taskId: task.id,
        goalId: goal.id,
        goalTaskId: null,
        agentId: null,
        roleId: null,
        capabilityId: "email",
        provider: "Connected email app",
        resource: "design-partner@example.invalid",
        action: "Share the welcome pack",
        actionClass: "send",
        parameters: {
          recipient: "design-partner@example.invalid",
          document: "Design partner welcome pack",
        },
        bindingHash: "preview-only-no-authority",
        risk: "high",
        effects: ["One email will be sent to the named design partner."],
        estimatedCostUsd: null,
        prompt:
          "Review the recipient and draft before allowing this external message.",
        requestedBy: "Sofie",
        requestedAt: goal.createdAt,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        status: "pending",
        decision: null,
        decisionReason: null,
        decidedBy: null,
        decidedAt: null,
      },
    ],
    outcomes: [
      {
        id: "preview-result",
        goalId: completed.id,
        goalTaskId: null,
        runId: null,
        status: "successful",
        ownerFeedback: "unknown",
        summary:
          "Three design partner priorities, with a recommended first-week focus.",
        rationale: [
          "Partners want a clear first task, transparent progress, and evidence they can inspect.",
          "Next: test the welcome pack with one design partner before expanding the beta.",
        ],
        evidence: [{ type: "event", id: "preview-event" }],
        occurredAt: goal.updatedAt,
        createdAt: goal.createdAt,
        updatedAt: goal.updatedAt,
        runTitle: null,
        threadId: null,
        agentName: "Sofie",
      },
    ],
    brief: {
      kind: "daily",
      generatedAt: goal.updatedAt,
      periodStart: new Date(Date.now() - 86400000).toISOString(),
      periodEnd: goal.updatedAt,
      topPriorities: [],
      overdue: [],
      approaching: [],
      blocked: [
        {
          goalId: blocked.id,
          goalTitle: blocked.title,
          taskId: null,
          taskTitle: null,
          priority: "normal",
          at: goal.updatedAt,
        },
      ],
      pendingOwnerActions: [],
      completed: [
        {
          goalId: completed.id,
          goalTitle: completed.title,
          taskId: null,
          taskTitle: null,
          priority: "normal",
          at: goal.updatedAt,
        },
      ],
      atRisk: [],
      recommendations: [
        {
          title: "Review the welcome pack before the next invitation",
          goalId: goal.id,
          taskId: null,
          whyNow: [
            "A bounded first assignment helps the next partner get value sooner.",
          ],
        },
      ],
    },
    details: {
      [goal.id]: goal,
      [completed.id]: completed,
      [blocked.id]: blocked,
    },
  };
}
export function readPreview(): PreviewSnapshot {
  try {
    const stored = sessionStorage.getItem(key);
    if (stored) return JSON.parse(stored) as PreviewSnapshot;
  } catch {
    /* Storage may be disabled. Preview still works in memory. */
  }
  return exampleSnapshot();
}
export function savePreview(value: PreviewSnapshot) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* No live data is ever stored here. */
  }
}
export function emptyPreview(): PreviewSnapshot {
  return { ...emptySnapshot, details: {} };
}
