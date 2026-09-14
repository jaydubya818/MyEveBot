export const OUTCOME_STATUSES = [
  "successful",
  "partially_successful",
  "blocked",
  "failed",
  "abandoned",
  "ineffective",
  "unknown",
] as const;

export const OWNER_FEEDBACK_VALUES = ["helpful", "neutral", "unhelpful", "unknown"] as const;
export const DELIVERY_CLASSIFICATIONS = ["silent", "activity", "digest", "push", "urgent"] as const;
export const EVIDENCE_TYPES = ["event", "task_artifact"] as const;

export type OutcomeStatus = (typeof OUTCOME_STATUSES)[number];
export type OwnerFeedback = (typeof OWNER_FEEDBACK_VALUES)[number];
export type DeliveryClassification = (typeof DELIVERY_CLASSIFICATIONS)[number];
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

export interface OutcomeEvidenceRef {
  type: EvidenceType;
  id: string;
}

export interface OutcomeView {
  id: string;
  goalId: string | null;
  goalTaskId: string | null;
  runId: string | null;
  status: OutcomeStatus;
  ownerFeedback: OwnerFeedback;
  summary: string;
  rationale: string[];
  evidence: OutcomeEvidenceRef[];
  occurredAt: string;
  createdAt: string;
  updatedAt: string;
}
