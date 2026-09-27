import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { exampleSnapshot } from "@/components/owner/preview";
import { DecisionCard } from "./decisions";
import { Proof, ResultCard } from "./proof";

describe("owner decision and proof components", () => {
  it("shows scope, consequences and both choices without preselecting approval", () => {
    const html = renderToStaticMarkup(
      <DecisionCard
        item={exampleSnapshot().approvals[0]!}
        preview={false}
        onDecision={vi.fn()}
      />,
    );
    expect(html).toContain("design-partner@example.invalid");
    expect(html).toContain("Decline");
    expect(html).toContain("Allow this action");
    expect(html).toContain("Neither choice confirms execution");
    expect(html).not.toContain('class="primary"');
  });
  it("removes decision controls when an approval expired", () => {
    const item = {
      ...exampleSnapshot().approvals[0]!,
      expiresAt: "2020-01-01T00:00:00Z",
    };
    const html = renderToStaticMarkup(
      <DecisionCard item={item} preview={false} onDecision={vi.fn()} />,
    );
    expect(html).toContain("Expired");
    expect(html).not.toContain(">Allow this action<");
  });
  it("does not imply verification for a successful result without checks", () => {
    const html = renderToStaticMarkup(
      <Proof result={exampleSnapshot().outcomes[0]} />,
    );
    expect(html).toContain("Independent verification is not recorded");
    expect(html).toContain("Event reference");
    expect(html).toContain("does not provide an event-content reader");
  });
  it("labels previews and attaches useful feedback controls to the result", () => {
    expect(renderToStaticMarkup(<Proof preview />)).toContain(
      "No real work was executed",
    );
    const html = renderToStaticMarkup(
      <ResultCard
        result={exampleSnapshot().outcomes[0]!}
        preview
        onSaved={vi.fn()}
        onCorrect={vi.fn()}
        href="/beta-preview?view=results"
      />,
    );
    expect(html).toContain("Useful");
    expect(html).toContain("Needs improvement");
    expect(html).toContain("Correct this");
    expect(html).toContain('aria-pressed="false"');
  });
  it("does not show another run’s checks as evidence for a result", () => {
    const snapshot = exampleSnapshot();
    const html = renderToStaticMarkup(
      <Proof
        task={snapshot.tasks[0]}
        result={{ ...snapshot.outcomes[0]!, runId: "a-different-run" }}
      />,
    );
    expect(html).not.toContain("All required recorded checks passed");
    expect(html).not.toContain("Required sections are present");
    expect(html).toContain("Loading evidence");
  });
});
