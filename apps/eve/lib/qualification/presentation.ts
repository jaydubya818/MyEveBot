import type { JourneyEvidence } from "./journey.ts";
import { JourneyHalted } from "./journey.ts";

/** Verifier -> Sofie presentation: an owner-safe projection. It never states readiness or grants authority. */
export type JourneyPresentation = {
  status: "COMPLETED_UNCLAIMED" | "HALTED"; readiness: "NOT_CLAIMED"; authority: "NONE";
  stages: Array<{ stage: number; candidate?: string }>; verdictSha256?: string; deliverySha256?: string; haltedAt?: number; code?: string;
};
const short = (v?: string) => v ? v.slice(0, 12) : undefined;
export function presentJourney(outcome: JourneyEvidence | JourneyHalted): JourneyPresentation {
  if (outcome instanceof JourneyHalted)
    return { status: "HALTED", readiness: "NOT_CLAIMED", authority: "NONE", haltedAt: outcome.stage,
      code: /^QDEV_[A-Z_]+$/.test(outcome.code) ? outcome.code : "QDEV_HALTED",
      stages: outcome.completed.map(s => ({ stage: s.stage, candidate: short(s.candidate?.commit) })) };
  return { status: "COMPLETED_UNCLAIMED", readiness: "NOT_CLAIMED", authority: "NONE", verdictSha256: outcome.verdictSha256,
    deliverySha256: outcome.deliverySha256, stages: outcome.stages.map(s => ({ stage: s.stage, candidate: short(s.candidate?.commit) })) };
}
