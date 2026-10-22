// @vitest-environment happy-dom
/**
 * QA-05: TaskRunCard.load() must catch fetch rejections without producing
 * an unhandled promise rejection, so background polling never surfaces
 * a crash to the user when the network is offline.
 *
 * Tests mount the REAL TaskRunCard component via React 19 createRoot.
 * fetch is mocked at the global level so the component's actual load()
 * implementation is exercised (not a re-implementation).
 *
 * Revert-check: removing the try/catch from load() in task-run-card.tsx
 * makes the "no unhandled rejection" test fail because the rejected fetch
 * propagates as an unhandled promise rejection.
 */
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";
import type { TaskRunView } from "@/lib/task-types";

// task-run-card.tsx imports named icons; list them explicitly (vi.mock factory
// is hoisted so helpers can't be used — inline the stubs).
vi.mock("@cloudflare/kumo", () => ({
  Badge: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("span", { "data-badge": true }, children),
  Button: ({ children, onClick, disabled }: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) =>
    React.createElement("button", { onClick, disabled }, children),
}));
vi.mock("@phosphor-icons/react", () => ({
  ArrowClockwiseIcon: () => null,
  ArrowSquareOutIcon: () => null,
  CheckCircleIcon: () => null,
  ClockIcon: () => null,
  StopIcon: () => null,
}));

import { TaskRunCard } from "./task-run-card";

function minimalTask(overrides: Partial<TaskRunView> = {}): TaskRunView {
  return {
    id: "task-123",
    agentId: null,
    kind: "delegated_work",
    title: "Test task",
    threadId: "thread-1",
    goalId: null,
    goalTaskId: null,
    status: "running",
    statusReason: null,
    objective: null,
    expectedOutput: null,
    parentTaskId: null,
    sourceTaskId: null,
    roleId: null,
    resultSummary: null,
    reviewStatus: "draft",
    target: { localUrl: "http://localhost:3000", previewUrl: "https://preview.example.com" },
    guardrails: { maxDurationSeconds: 900, maxSpecialists: 3, maxModelSteps: 40, maxRetriesPerSpecialist: 1, maxEstimatedCostUsd: 5 },
    usage: { modelSteps: 0, estimatedCostUsd: 0 },
    createdAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    deadlineAt: null,
    completedAt: null,
    updatedAt: new Date().toISOString(),
    specialists: [],
    checks: [],
    artifacts: [],
    milestones: [],
    ...overrides,
  };
}

function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: ReturnType<typeof createRoot>;
  act(() => {
    root = createRoot(container);
    root.render(React.createElement(TaskRunCard, { threadId: "thread-1" }));
  });
  return {
    get html() { return container.innerHTML; },
    unmount() {
      act(() => root!.unmount());
      document.body.removeChild(container);
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TaskRunCard load() — QA-05", () => {
  it("does NOT produce an unhandled rejection when fetch rejects (offline / network down)", async () => {
    // Capture any unhandled promise rejections.
    const unhandled: Error[] = [];
    const originalListeners = process.listeners("unhandledRejection");
    process.removeAllListeners("unhandledRejection");
    process.on("unhandledRejection", (e: Error) => unhandled.push(e));

    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));

    const card = mount();

    // Give useEffect + microtask queue time to settle.
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });

    // Component renders null (task stays null after failed load) — no crash.
    expect(card.html).toBe("");

    // The try/catch in load() must have swallowed the rejection.
    // Without the fix, the rejected fetch bubbles up as an unhandled rejection.
    expect(unhandled).toHaveLength(0);

    process.removeAllListeners("unhandledRejection");
    for (const l of originalListeners) process.on("unhandledRejection", l as NodeJS.UnhandledRejectionListener);

    card.unmount();
  });

  it("renders the task card when the initial load succeeds", async () => {
    const task = minimalTask({ title: "My delegated task", status: "running" });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      // Use a plain response-like object so .json() is synchronously resolvable.
      { ok: true, status: 200, json: async () => ({ tasks: [task] }) } as unknown as Response,
    );

    const card = mount();
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });

    // After a successful load the card renders (task !== null).
    expect(card.html).toContain("My delegated task");

    card.unmount();
  });
});
