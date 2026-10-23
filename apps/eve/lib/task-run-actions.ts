import type { TaskRunView } from "@/lib/task-types";

/** QA-05: load must swallow network failures instead of rejecting unhandled. */
export async function loadLatestTaskRun(
  threadId: string,
): Promise<{ task: TaskRunView | null; error: string | null }> {
  try {
    const response = await fetch(
      `/api/task-runs?threadId=${encodeURIComponent(threadId)}`,
      { cache: "no-store" },
    );
    if (!response.ok) return { task: null, error: "Task status could not be loaded." };
    const body = (await response.json()) as { tasks?: TaskRunView[] };
    return { task: body.tasks?.[0] ?? null, error: null };
  } catch {
    return { task: null, error: "Task status could not be loaded." };
  }
}

/** QA-05: a non-OK cancel must surface, not look successful. */
export async function cancelTaskRun(
  taskId: string,
): Promise<{ task: TaskRunView | null; error: string | null }> {
  try {
    const response = await fetch(`/api/task-runs/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
    if (!response.ok) return { task: null, error: "Cancel could not be confirmed." };
    const body = (await response.json()) as { task: TaskRunView };
    return { task: body.task, error: null };
  } catch {
    return { task: null, error: "Cancel could not be confirmed." };
  }
}
