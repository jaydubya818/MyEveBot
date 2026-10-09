import type { MetricEvidence } from "./metrics.ts";
import type { ExperimentAnalysis } from "./experiment-metrics.ts";
import type { challengeQuality, frozenChallengeRows } from "./experiment.ts";
import type { KnowledgeKind } from "../knowledge-types.ts";
import type { DecisionMetrics } from "./metrics.ts";

export interface DecisionView {
  provider: {
    name: string;
    gateway: string;
    model: string;
    status: "Not configured" | "Available" | "Degraded" | "Unavailable";
  };
  runs: {
    id: string;
    createdAt: string;
    environment: "local-fixture" | "live-experiment";
    count: number;
    experiment?: string;
  }[];
  run: {
    id: string;
    createdAt: string;
    environment: "local-fixture" | "live-experiment";
    datasetVersion: string;
    datasetHash: string;
    contractHash: string;
    canonicalSource: "not-measured" | "local-fixture";
    experiment?: string;
    cohort?: string;
    decisionVersion?: number;
    rubricHash?: string | null;
  } | null;
  metrics: DecisionMetrics | null;
  rows: MetricEvidence[];
  outcomes?: readonly KnowledgeKind[];
  analysis?: ExperimentAnalysis;
  quality?: typeof challengeQuality;
  matchedComparison?: import("./experiment-metrics.ts").MatchedComparison;
  comparisons?: {
    id: string;
    experiment: string;
    environment: string;
    count: number;
    accuracy: number | null;
    macroF1: number | null;
    adversarialAccuracy: number | null;
    stressHighConfidence: number | null;
    insightF1: number | null;
    medianConfidence: number | null;
  }[];
  total: number;
  // Only the bounded confidence/correctness pairs needed for the read-only simulator.
  simulation: { confidence: number | null; correct: boolean | null }[];
  detail: {
    evidence: MetricEvidence;
    text: string;
    context?: string;
    metadata?: (typeof frozenChallengeRows)[number];
  } | null;
}
