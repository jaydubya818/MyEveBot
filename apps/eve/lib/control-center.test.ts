import { describe, expect, it } from "vitest";

import {
  ACTIONABLE_APPROVAL_PREDICATE,
  actionsForStatus,
  controlViewForRun,
  controlViewForStatus,
  isActionableApprovalProjection,
} from "./control-center.ts";

describe("Control Center state projection", () => {
  it.each([
    ["running", "working"],
    ["queued", "waiting"],
    ["paused", "waiting"],
    ["waiting_for_owner", "needs_owner"],
    ["awaiting_approval", "approval"],
    ["failed", "failed"],
    ["completed", "completed"],
    ["cancelled", "completed"],
  ] as const)("maps %s to %s", (status, view) => {
    expect(controlViewForStatus(status)).toBe(view);
  });

  it("offers only legal owner controls for each state", () => {
    expect(actionsForStatus("running")).toEqual(["view", "pause", "cancel"]);
    expect(actionsForStatus("awaiting_approval")).toEqual(["view", "pause", "cancel"]);
    expect(actionsForStatus("paused")).toEqual(["view", "resume", "cancel"]);
    expect(actionsForStatus("waiting_for_owner")).toEqual(["view", "cancel"]);
    expect(actionsForStatus("failed")).toEqual(["view", "retry"]);
    expect(actionsForStatus("completed")).toEqual(["view"]);
  });

  it("moves an awaiting Run without actionable authority out of Needs Approval", () => {
    expect(controlViewForRun("awaiting_approval", 1)).toBe("approval");
    expect(controlViewForRun("awaiting_approval", 0)).toBe("waiting");
  });

  it("binds pending approvals to the canonical owner, Run, Task, and Agent scope", () => {
    expect(ACTIONABLE_APPROVAL_PREDICATE).toMatch(/ad\.owner_id = r\.owner_id/);
    expect(ACTIONABLE_APPROVAL_PREDICATE).toMatch(/ad\.task_id = r\.id/);
    expect(ACTIONABLE_APPROVAL_PREDICATE).toMatch(/ad\.status = 'pending'/);
    expect(ACTIONABLE_APPROVAL_PREDICATE).toMatch(/ad\.expires_at > now\(\)/);
    expect(ACTIONABLE_APPROVAL_PREDICATE).toContain("ad.binding_hash ~ '^[0-9a-f]{64}$'");
    expect(ACTIONABLE_APPROVAL_PREDICATE).toMatch(/ad\.goal_task_id IS NOT DISTINCT FROM r\.goal_task_id/);
  });

  it.each([
    ["pending", {}, true],
    ["approved", { status: "approved" }, false],
    ["rejected", { status: "denied" }, false],
    ["expired", { status: "expired" }, false],
    ["invalidated", { status: "invalidated" }, false],
    ["cancelled", { status: "cancelled" }, false],
    ["superseded", { status: "superseded" }, false],
    ["stale binding", { bindingHash: "legacy:approval-old" }, false],
    ["wrong goal task scope", { goalTaskId: "task-old" }, false],
    ["wrong owner", { ownerId: "owner-b" }, false],
    ["wrong task", { taskId: "run-b" }, false],
  ] as const)("projects %s correctly", (_label, override, expected) => {
    const run = { ownerId: "owner-a", id: "run-a", goalId: "goal-a", goalTaskId: "task-a", agentId: "agent-a", roleId: null };
    const approval = {
      ownerId: "owner-a",
      taskId: "run-a",
      status: "pending",
      expiresAt: "2026-09-20T00:00:00.000Z",
      bindingHash: "a".repeat(64),
      goalId: "goal-a",
      goalTaskId: "task-a",
      agentId: "agent-a",
      roleId: null,
      ...override,
    };
    expect(isActionableApprovalProjection(approval, run, Date.parse("2026-09-19T00:00:00.000Z"))).toBe(expected);
  });
});
