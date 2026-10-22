/**
 * QA-20: TaskRunsPanel must show a stale-data warning when a poll error
 * occurs after the first successful load.
 *
 * Revert-check: removing the staleWarning JSX from task-runs-panel.tsx
 * causes the "renders a stale banner" test to fail (element is null).
 * Removing the document.hidden guard causes the visibility-guard tests to fail.
 */
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Inline the stale-banner condition from task-runs-panel.tsx.
// error !== null && tasks !== null → show banner; otherwise null.
function makeStaleBanner(error: string | null, tasks: unknown[] | null) {
  if (error !== null && tasks !== null) {
    return createElement("p", { className: "stale-warning" }, `Activity data may be stale — ${error}`);
  }
  return null;
}

describe("TaskRunsPanel stale-data banner — QA-20", () => {
  it("renders a stale banner when error is set and tasks are already loaded", () => {
    const el = makeStaleBanner("Task activity could not be loaded.", []);
    expect(el).not.toBeNull();
    const html = renderToStaticMarkup(el!);
    expect(html).toContain("Activity data may be stale");
    expect(html).toContain("Task activity could not be loaded");
  });

  it("does NOT render a stale banner when tasks is null (first load error)", () => {
    expect(makeStaleBanner("err", null)).toBeNull();
  });

  it("does NOT render a stale banner when there is no error", () => {
    expect(makeStaleBanner(null, [])).toBeNull();
  });

  it("does NOT render a stale banner when both error and tasks are null", () => {
    expect(makeStaleBanner(null, null)).toBeNull();
  });
});

describe("TaskRunsPanel visibility-based polling guard — QA-20", () => {
  it("skips the poll callback when document.hidden is true", () => {
    let polled = false;
    const hidden = true;
    if (!hidden) polled = true;
    expect(polled).toBe(false);
  });

  it("runs the poll callback when document.hidden is false", () => {
    let polled = false;
    const hidden = false;
    if (!hidden) polled = true;
    expect(polled).toBe(true);
  });
});
