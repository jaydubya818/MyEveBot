import type { Evidence } from "./contract.ts";
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
  }[];
  run: {
    id: string;
    createdAt: string;
    environment: "local-fixture" | "live-experiment";
    datasetVersion: string;
    datasetHash: string;
    contractHash: string;
    canonicalSource: "not-measured" | "local-fixture";
  } | null;
  metrics: DecisionMetrics | null;
  rows: Evidence[];
  total: number;
  // Only the bounded confidence/correctness pairs needed for the read-only simulator.
  simulation: { confidence: number | null; correct: boolean | null }[];
  detail: { evidence: Evidence; text: string } | null;
}
