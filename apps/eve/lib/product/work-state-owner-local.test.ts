import { expect, it } from "vitest";
import { workState } from "./work-state.ts";
import { ownerWorkPresentation } from "./owner-work.ts";

// The owner-local stage Works after completeDeliveredStageWorks: accepted, paused, no pending decision, no external-alpha binding.
const stageWork = (over: Record<string, unknown> = {}) => ({ workId: "w1", workVersion: 3, workGeneration: 3, lifecycle: "accepted", control: "paused", status: "Waiting",
  attention: null, pendingDecisions: [], runTruth: { activeRun: null }, verification: { status: "NOT_RUN", candidateSha: null }, nextStep: "Review the retained Result and Work history.", ...over }) as never;

it("a completed owner-local stage Work is shown as Completed, not Needs You", () => {
  expect(workState(stageWork())).toEqual({ lane: "Completed", detail: "Accepted" });
  expect(ownerWorkPresentation(stageWork())).toMatchObject({ status: "Completed", summary: "Completed after verified delivery." });
  // Before completion the same Work (active, agent, no run) never claimed completion.
  expect(workState(stageWork({ lifecycle: "active", control: "agent" })).lane).not.toBe("Completed");
});

it("a hosted private-beta installation labels the completed Work with the hosted verifier label", () => {
  expect(ownerWorkPresentation(stageWork(), { hostedVerifier: true }).summary)
    .toBe("Completed after verified delivery. Private-beta verifier (automated checks on the owner's machine, not independent custody).");
  expect(ownerWorkPresentation(stageWork()).summary).toBe("Completed after verified delivery.");
});
