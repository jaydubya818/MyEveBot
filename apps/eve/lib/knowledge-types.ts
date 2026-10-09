export const KNOWLEDGE_KINDS = ["fact", "observation", "hypothesis", "decision", "commitment", "preference", "insight"] as const;
export type KnowledgeKind = (typeof KNOWLEDGE_KINDS)[number];

export const KNOWLEDGE_STATUSES = {
  fact: ["active", "stale", "superseded", "contradicted"],
  observation: ["active", "dismissed", "promoted", "stale", "contradicted"],
  hypothesis: ["open", "supported", "rejected", "inconclusive", "promoted"],
  decision: ["active", "superseded", "reopened", "reversed"],
  commitment: ["open", "fulfilled", "missed", "cancelled", "superseded"],
  preference: ["active", "inactive", "superseded", "expired"],
  insight: ["active", "stale", "superseded", "contradicted"],
} as const satisfies Record<KnowledgeKind, readonly string[]>;

export type KnowledgeStatus = (typeof KNOWLEDGE_STATUSES)[KnowledgeKind][number];
export const SOURCE_TYPES = ["chat", "email", "slack", "telegram", "calendar", "file", "web", "run", "manual"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];
export const PROVENANCE_RELATIONS = ["supports", "contradicts", "derived_from", "mentioned_in", "confirmed_by"] as const;
export type ProvenanceRelation = (typeof PROVENANCE_RELATIONS)[number];
export const ORIGIN_TYPES = ["owner", "agent", "system", "import"] as const;
export type OriginType = (typeof ORIGIN_TYPES)[number];
export const PREFERENCE_SOURCE_TYPES = ["explicit_user", "approved_observation", "system_default"] as const;
export type PreferenceSourceType = (typeof PREFERENCE_SOURCE_TYPES)[number];
export const RELATIONSHIP_ENTITY_TYPES = ["source", ...KNOWLEDGE_KINDS, "goal", "agent", "project", "person", "organization"] as const;
export type RelationshipEntityType = (typeof RELATIONSHIP_ENTITY_TYPES)[number];

export interface KnowledgeSourceView {
  id: string;
  sourceType: SourceType;
  provider: string | null;
  externalId: string | null;
  referenceUri: string | null;
  author: string | null;
  capturedAt: string;
  contentHash: string | null;
  snapshotRef: string | null;
  createdAt: string;
}

export interface ProvenanceView {
  id: string;
  relation: ProvenanceRelation;
  confidence: number;
  createdAt: string;
  source: KnowledgeSourceView;
}

export interface KnowledgeRecordView {
  id: string;
  kind: KnowledgeKind;
  title: string | null;
  statement: string;
  confidence: number;
  status: string;
  occurrenceCount: number | null;
  firstSeenAt: string | null;
  lastConfirmedAt: string | null;
  firstObservedAt: string | null;
  lastObservedAt: string | null;
  testDescription: string | null;
  decisionTrigger: string | null;
  rationale: string | null;
  alternatives: string[];
  decidedAt: string | null;
  reopenCondition: string | null;
  subject: string | null;
  dueAt: string | null;
  fulfilledAt: string | null;
  preferenceKey: string | null;
  preferenceValue: unknown;
  preferenceScope: string | null;
  preferenceSourceType: PreferenceSourceType | null;
  preferenceSourceId: string | null;
  active: boolean | null;
  reviewAt: string | null;
  expiresAt: string | null;
  generatedAt: string | null;
  createdByType: OriginType;
  createdById: string | null;
  goalId: string | null;
  goalTitle: string | null;
  projectRef: string | null;
  supersedesId: string | null;
  supersededById: string | null;
  createdAt: string;
  updatedAt: string;
  provenance: ProvenanceView[];
}

export interface KnowledgeRelationshipView {
  id: string;
  subjectType: RelationshipEntityType;
  subjectId: string;
  predicate: string;
  objectType: RelationshipEntityType;
  objectId: string;
  confidence: number;
  status: "active" | "stale" | "superseded" | "contradicted";
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_KNOWLEDGE_STATUS: Record<KnowledgeKind, string> = {
  fact: "active",
  observation: "active",
  hypothesis: "open",
  decision: "active",
  commitment: "open",
  preference: "active",
  insight: "active",
};

export function validConfidence(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

export function canTransitionKnowledge(kind: KnowledgeKind, from: string, to: string): boolean {
  if (from === to) return true;
  const transitions: Record<KnowledgeKind, Record<string, readonly string[]>> = {
    fact: { active: ["stale", "superseded", "contradicted"], stale: ["active", "superseded", "contradicted"], contradicted: ["active", "superseded"], superseded: [] },
    observation: { active: ["dismissed", "promoted", "stale", "contradicted"], dismissed: ["active"], stale: ["active", "dismissed"], contradicted: ["active", "dismissed"], promoted: [] },
    hypothesis: { open: ["supported", "rejected", "inconclusive", "promoted"], supported: ["open", "rejected", "inconclusive", "promoted"], inconclusive: ["open", "supported", "rejected"], rejected: ["open"], promoted: [] },
    decision: { active: ["superseded", "reopened", "reversed"], reopened: ["active", "superseded", "reversed"], reversed: ["reopened", "superseded"], superseded: [] },
    commitment: { open: ["fulfilled", "missed", "cancelled", "superseded"], missed: ["open", "cancelled", "superseded"], fulfilled: [], cancelled: [], superseded: [] },
    preference: { active: ["inactive", "superseded", "expired"], inactive: ["active", "superseded"], expired: ["active", "superseded"], superseded: [] },
    insight: { active: ["stale", "superseded", "contradicted"], stale: ["active", "superseded", "contradicted"], contradicted: ["active", "superseded"], superseded: [] },
  };
  return transitions[kind][from]?.includes(to) ?? false;
}

export function validateRelationshipPredicate(value: string): boolean {
  return /^[a-z][a-z0-9_]{0,63}$/.test(value);
}
