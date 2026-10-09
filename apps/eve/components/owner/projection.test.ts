import { describe, expect, it } from "vitest";
import { exampleSnapshot } from "./preview";
import {
  goalState,
  taskState,
  projectWork,
  pendingApprovals,
  verificationSummary,
  workPrompt,
} from "./projection";

describe("owner presentation boundaries", () => {
  it("does not infer execution or verification from an unfamiliar state", () => {
    expect(goalState("future_state")).toBe("Unknown");
    expect(taskState("future_state")).toBe("Unknown");
    expect(verificationSummary()).toBe(
      "Independent verification is not recorded.",
    );
  });
  it("maps input, recovery and verification independently", () => {
    expect(taskState("waiting_for_owner")).toBe("Needs you");
    expect(taskState("failed")).toBe("Recovery");
    expect(taskState("verification")).toBe("Verifying");
    expect(goalState("waiting")).toBe("Waiting");
  });
  it("keeps historical task failure from changing a completed objective", () => {
    const snapshot = exampleSnapshot();
    snapshot.goals[0]!.status = "completed";
    snapshot.tasks[0]!.status = "failed";
    expect(
      projectWork(snapshot).find((item) => item.id === snapshot.goals[0]!.id)
        ?.state,
    ).toBe("Complete");
    expect(projectWork(snapshot)).toHaveLength(3);
  });
  it("includes orphan task records so unlinked work does not disappear", () => {
    const snapshot = exampleSnapshot();
    snapshot.tasks[0]!.goalId = "not-in-page";
    expect(projectWork(snapshot)).toHaveLength(4);
  });
  it("expires decisions client-side and never reuses a decided request", () => {
    const snapshot = exampleSnapshot(),
      approval = snapshot.approvals[0]!;
    expect(
      pendingApprovals([approval], Date.parse(approval.expiresAt)),
    ).toEqual([]);
    expect(pendingApprovals([{ ...approval, status: "approved" }], 0)).toEqual(
      [],
    );
  });
  it("reports failed checks even when a run says completed", () => {
    const task = exampleSnapshot().tasks[0]!;
    task.status = "completed";
    task.checks[0]!.status = "failed";
    expect(verificationSummary(task)).toContain("failure");
    task.checks[0]!.status = "passed";
    expect(verificationSummary(task)).toContain(
      "Independent verifier provenance is not supplied",
    );
    task.checks[0]!.status = "pending";
    expect(verificationSummary(task)).toContain("incomplete");
  });
  it("carries work identity and criteria into a non-authorizing conversation draft", () => {
    const goal = exampleSnapshot().goals[0]!;
    expect(workPrompt(goal)).toContain(goal.id);
    expect(workPrompt(goal)).toContain(goal.successCriteria[0]);
    expect(workPrompt(goal)).toContain(
      "Do not treat this message as execution approval",
    );
  });
});
