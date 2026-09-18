import { describe, expect, it } from "vitest";

import { actionsForStatus, controlViewForStatus } from "./control-center.ts";

describe("Control Center state projection", () => {
  it.each([
    ["running", "working"],
    ["queued", "waiting"],
    ["paused", "waiting"],
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
    expect(actionsForStatus("failed")).toEqual(["view", "retry"]);
    expect(actionsForStatus("completed")).toEqual(["view"]);
  });
});
