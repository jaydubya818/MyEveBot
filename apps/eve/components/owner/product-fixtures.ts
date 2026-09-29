import type { ApprovalRequestView } from "@/lib/approvals";
import type {
  CanonicalAttentionDisplay,
  CanonicalWorkDisplay,
} from "./canonical-boundaries";
export function productApprovalFixtures(): ApprovalRequestView[] {
  return [
    {
      id: "message",
      action: "Send the launch update",
      actionClass: "send" as const,
      capabilityId: "email.send",
      resource: "partner@example.invalid",
      effects: ["One message becomes visible to the named recipient."],
    },
    {
      id: "publication",
      action: "Open a pull request",
      actionClass: "publish" as const,
      capabilityId: "github.create_pull_request",
      resource: "example/private-alpha",
      effects: ["Repository collaborators can see the proposed changes."],
    },
    {
      id: "share",
      action: "Share the reviewed report",
      actionClass: "publish" as const,
      capabilityId: "artifact.share",
      resource: "Report revision 3",
      effects: [
        "The selected revision becomes accessible to link recipients until expiry.",
      ],
    },
  ].map((value) => ({
    ...value,
    id: `fixture-${value.id}`,
    taskId: "fixture-work",
    goalId: null,
    goalTaskId: null,
    agentId: null,
    roleId: null,
    provider: "fixture",
    parameters: { fixture: true },
    bindingHash: "0".repeat(64),
    risk: "high",
    estimatedCostUsd: null,
    prompt: "Sample proposal only. No external operation is connected.",
    requestedBy: "Sofie (fixture)",
    requestedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    status: "pending",
    decision: null,
    decisionReason: null,
    decidedBy: null,
    decidedAt: null,
  }));
}
export const channelFixtures: CanonicalAttentionDisplay[] = [
  "email",
  "slack",
  "relay",
  "work",
].map((source, index) => ({
  id: `fixture-${source}`,
  ownerId: "fixture-owner-a",
  correlationId: "fixture-launch",
  episode: 1,
  workId: "fixture-work",
  workGeneration: 1,
  workVersion: 1,
  kind: index === 1 ? "APPROVAL" : "MESSAGE",
  title:
    index === 1
      ? "Review the proposed announcement"
      : `Launch context from ${source}`,
  summary: "Sample channel record; correlation and source are preserved.",
  status: index === 1 ? "NEEDS_ACTION" : "NEW",
  needsYou: index === 1,
  source: {
    system: source,
    threadId: `fixture-thread-${source}`,
    reference: `fixture:${source}`,
  },
  action:
    index === 1
      ? {
          involvement: "NECESSARY_JUDGMENT",
          prompt: "Review the proposed external announcement.",
        }
      : null,
}));
export const engineeringFixture: CanonicalWorkDisplay = {
  workId: "fixture-work",
  workVersion: 1,
  workGeneration: 1,
  title: "Prepare the software change",
  activity: "A candidate is awaiting independent verification.",
  nextStep: "Wait for canonical verification.",
  status: "VERIFYING",
  completionStatus: "PARTIAL",
  readiness: { ready: false, reasons: ["Independent verification pending"] },
  verification: {
    candidateSha: "a".repeat(40),
    status: "PENDING",
    jobStatus: null,
    evidenceCount: 0,
    evidenceHashes: [],
  },
  latestResult: null,
};
