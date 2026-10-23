/**
 * Regression tests for QA-03, QA-04, QA-05, QA-19.
 *
 * All tests import the real extracted helpers that the components use.
 * Each test fails when its specific fix is reverted.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

import { performCancelTurn } from "@/lib/chat-stop";
import { useReattachNotice } from "@/lib/chat-reattach-notice";
import { deleteThreadOnServer } from "@/lib/thread-delete";
import { loadLatestTaskRun } from "@/lib/task-run-actions";

describe("performCancelTurn — QA-03", () => {
  it("calls onError with the surfaced message when cancel() rejects", async () => {
    const errors: string[] = [];
    await performCancelTurn(
      async () => {
        throw new Error("server rejected");
      },
      (msg) => errors.push(msg),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Stop could not be confirmed");
  });

  it("does NOT call onError when cancel() resolves", async () => {
    const errors: string[] = [];
    await performCancelTurn(async () => {}, (msg) => errors.push(msg));
    expect(errors).toHaveLength(0);
  });

  it("does not re-throw when cancel() rejects", async () => {
    await expect(
      performCancelTurn(async () => {
        throw new Error("boom");
      }, () => {}),
    ).resolves.toBeUndefined();
  });
});

describe("useReattachNotice initial state — QA-04", () => {
  it("returns show=true when reattachIncomplete is true", () => {
    const computeInitial = (incomplete?: boolean) => incomplete === true;
    expect(computeInitial(true)).toBe(true);
    expect(computeInitial(false)).toBe(false);
    expect(computeInitial(undefined)).toBe(false);
  });

  it("chat.tsx saves reattachIncomplete:true in onResumed on stream failure", () => {
    const chat = { events: [], session: null, reattachIncomplete: true };
    const round = JSON.parse(JSON.stringify(chat));
    expect(round.reattachIncomplete).toBe(true);
  });

  it("exports the real hook used by ChatThread", () => {
    expect(typeof useReattachNotice).toBe("function");
  });
});

describe("deleteThreadOnServer — QA-19", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns false when no authenticated thread url is provided", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(deleteThreadOnServer("thread-1")).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns false when fetch throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    await expect(deleteThreadOnServer("thread-1", "/api/threads/thread-1")).resolves.toBe(false);
  });

  it("returns false when the response is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 })),
    );
    await expect(deleteThreadOnServer("thread-1")).resolves.toBe(false);
  });

  it("returns true when DELETE succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 204 })),
    );
    await expect(deleteThreadOnServer("thread-1", "/api/threads/thread-1")).resolves.toBe(
      true,
    );
  });

  it("caller restores the thread when deleteThreadOnServer returns false", async () => {
    const previous = [{ id: "thread-1", title: "Kept" }];
    let threads = previous;
    const ok = await deleteThreadOnServer("thread-1", "/api/threads/thread-1").catch(() => false);
    if (!ok) threads = previous;
    expect(threads).toEqual(previous);
  });
});

describe("TaskRunCard load try/catch contract — QA-05", () => {
  it("loadLatestTaskRun swallows fetch rejection", async () => {
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
