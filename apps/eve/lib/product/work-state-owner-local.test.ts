import { expect, it } from "vitest";
import { workState } from "./work-state.ts";

// The owner-local stage Works after completeDeliveredStageWorks: accepted, paused, no pending decision, no external-alpha binding.
const stageWork = (over: Record<string, unknown> = {}) => ({ workId: "w1", workVersion: 3, workGeneration: 3, lifecycle: "accepted", control: "paused", status: "Waiting",
  attention: null, pendingDecisions: [], runTruth: { activeRun: null }, verification: { status: "NOT_RUN", candidateSha: null }, nextStep: "Review the retained Result and Work history.", ...over }) as never;

it("a completed owner-local stage Work is shown as Completed, not Needs You", () => {
  expect(workState(stageWork())).toEqual({ lane: "Completed", detail: "Accepted" });
  // Before completion the same Work (active, agent, no run) never claimed completion.
  expect(workState(stageWork({ lifecycle: "active", control: "agent" })).lane).not.toBe("Completed");
});
