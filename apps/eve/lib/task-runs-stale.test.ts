import { describe, expect, it } from "vitest";
import { shouldPollTaskRuns, taskRunsAreStale } from "./task-runs-stale";

describe("taskRunsAreStale — QA-20", () => {
  it("is stale when a later poll fails after tasks were loaded", () => {
    expect(taskRunsAreStale("Task activity could not be loaded.", [{ id: "1" }])).toBe(
      true,
    );
  });

  it("is not stale on the first-load hard error", () => {
    expect(taskRunsAreStale("Task activity could not be loaded.", null)).toBe(false);
  });
});

describe("shouldPollTaskRuns — QA-20", () => {
  it("skips polls while the document is hidden", () => {
    expect(shouldPollTaskRuns(true)).toBe(false);
    expect(shouldPollTaskRuns(false)).toBe(true);
  });
});
