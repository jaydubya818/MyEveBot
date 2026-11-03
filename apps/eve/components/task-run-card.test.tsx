import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi } from "vitest";
import { TaskRunCard } from "./task-run-card";

describe("TaskRunCard", () => {
  it("renders nothing when task is null (before first load)", () => {
    // Static render: the component returns null when task is null.
    // This verifies the null guard is in place.
    const html = renderToStaticMarkup(<TaskRunCard threadId="t1" />);
    expect(html).toBe("");
  });
});
