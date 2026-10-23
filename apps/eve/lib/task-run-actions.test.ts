import { beforeEach, describe, expect, it, vi } from "vitest";
import { cancelTaskRun, loadLatestTaskRun } from "./task-run-actions";

describe("loadLatestTaskRun — QA-05", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("does not throw when fetch rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    await expect(loadLatestTaskRun("thread-1")).resolves.toEqual({
      task: null,
      error: "Task status could not be loaded.",
    });
  });
});

describe("cancelTaskRun — QA-05", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("surfaces an error when cancel is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 503 })),
    );
    await expect(cancelTaskRun("task-1")).resolves.toEqual({
      task: null,
      error: "Cancel could not be confirmed.",
    });
  });
});
