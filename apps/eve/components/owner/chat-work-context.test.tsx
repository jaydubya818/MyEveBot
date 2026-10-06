import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChatWorkContext } from "./chat-work-context";
const selection = { workId: "a845335e-37c1-4b2b-a737-8123e86c9010", title: "Normalize line endings", intent: "observe" as const };

describe("owner-facing Work context", () => {
  it("shows the task title instead of infrastructure identifiers", () => {
    const html = renderToStaticMarkup(<ChatWorkContext selection={selection} locked busy={false} onChange={vi.fn()} />);
    expect(html).toContain("Normalize line endings");
    expect(html).not.toContain(selection.workId);
    expect(html).toContain("Review progress and results");
    expect(html).toContain("Selecting Work does not start it");
    expect(html).not.toContain("Discuss existing Work");
  });
  it("disables intent changes while a turn is active", () => {
    const html = renderToStaticMarkup(<ChatWorkContext selection={selection} locked busy onChange={vi.fn()} />);
    expect(html).toMatch(/<select[^>]*disabled/);
  });
  it("does not offer unverified choices while the owner list is loading", () => {
    const html = renderToStaticMarkup(<ChatWorkContext locked={false} busy={false} onChange={vi.fn()} />);
    expect(html).toContain("Loading your Work");
    expect(html).toMatch(/<select[^>]*disabled/);
    expect(html).not.toContain('value="continue"');
  });
});
