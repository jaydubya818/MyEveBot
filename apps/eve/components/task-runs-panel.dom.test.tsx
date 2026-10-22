// @vitest-environment happy-dom
/**
 * QA-20: TaskRunsPanel must show a stale-data warning when a poll error
 * occurs after the first successful load (not just when tasks === null).
 *
 * Revert-check: removing the `staleWarning` variable and its JSX from
 * task-runs-panel.tsx causes the "stale banner visible after first load"
 * case to fail.
 */
import { render, screen, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TaskRunsPanel } from "./task-runs-panel";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

// Minimal TaskRunView fixture.
const taskFixture = {
  id: "t1", agentId: null, kind: "delegated_work", title: "Draft doc",
  threadId: null, goalId: null, goalTaskId: null, sourceTaskId: null, roleId: null,
  parentTaskId: null, status: "running", statusReason: null,
  objective: "test", expectedOutput: null, reviewStatus: "pending",
  target: { localUrl: "", previewUrl: "" },
  guardrails: { maxDurationSeconds: 900, maxSpecialists: 1, maxModelSteps: 40, maxRetriesPerSpecialist: 1, maxEstimatedCostUsd: 5 },
  usage: { modelSteps: 1, estimatedCostUsd: 0.01 },
  createdAt: "2026-10-22T00:00:00Z", startedAt: "2026-10-22T00:00:00Z",
  deadlineAt: null, completedAt: null, updatedAt: "2026-10-22T00:00:00Z",
  specialists: [], checks: [], artifacts: [], milestones: [],
};

beforeEach(() => { vi.clearAllMocks(); });

describe("TaskRunsPanel — QA-20", () => {
  it("shows stale-data banner when poll fails after first successful load", async () => {
    // First load succeeds.
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tasks: [taskFixture] }),
    });
    render(<TaskRunsPanel onOpenThread={() => undefined} />);
    // Wait for first load.
    await waitFor(() => screen.getByText("Draft doc"));
    expect(screen.queryByText(/Activity data may be stale/)).toBeNull();

    // Next poll fails.
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503, json: async () => null });
    // Advance fake timers to trigger the interval callback.
    // Use real timers here — the component uses setInterval.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 4500));
    });

    await waitFor(() => {
      expect(screen.getByText(/Activity data may be stale/i)).toBeTruthy();
    });
    // Previous task data remains visible.
    expect(screen.getByText("Draft doc")).toBeTruthy();
  });

  it("does not show stale banner before the first load", async () => {
    // Initial load still in-flight.
    fetchMock.mockReturnValue(new Promise(() => {})); // never resolves
    render(<TaskRunsPanel onOpenThread={() => undefined} />);
    // Should show a spinner, not a stale banner.
    expect(screen.queryByText(/Activity data may be stale/i)).toBeNull();
  });
});
