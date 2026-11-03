/**
 * Regression tests for QA-17 and QA-18.
 * Both tests drive real exported functions from integrated.tsx and activity-card.tsx.
 *
 * QA-17: deduplicateApiErrors (extracted from integrated.tsx error section)
 *   must collapse repeated endpoint-labelled messages into one.
 *   Revert-check: reverting the Set+replace dedup in error-dedup.ts causes
 *   the "collapses 4 identical" test to fail (result has 4 entries, not 1).
 *
 * QA-18: ActivityCard (extracted from integrated.tsx) must render an error
 *   message when `changes` is null (backend unavailable), not the empty-state
 *   copy. Revert-check: changing `changes === null` to `!changes.length` in
 *   activity-card.tsx causes the null-renders-error test to fail.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, it, expect, vi } from "vitest";

// ActivityCard uses next/link which requires a router context outside Next.js.
// Mock it with a plain anchor so renderToStaticMarkup can render it.
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) =>
    createElement("a", { href }, children),
}));

// primitives/Card also needs to be available; it is a local component, not Next.
// No mock needed — it renders without router context.

import { deduplicateApiErrors } from "@/lib/error-dedup";
import { ActivityCard } from "./activity-card";

// ──────────────────────────────────────────────────────────────────────────────
// QA-17: deduplicateApiErrors
// ──────────────────────────────────────────────────────────────────────────────

describe("deduplicateApiErrors — QA-17", () => {
  it("collapses 4 identical messages from different endpoints into 1", () => {
    const errors = [
      "Goals: could not confirm this request",
      "Inbox: could not confirm this request",
      "Results: could not confirm this request",
      "Work: could not confirm this request",
    ];
    const result = deduplicateApiErrors(errors);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("could not confirm this request");
  });

  it("keeps distinct message bodies separate", () => {
    const errors = [
      "Goals: could not confirm this request",
      "Memory: connection refused",
    ];
    expect(deduplicateApiErrors(errors)).toEqual([
      "could not confirm this request",
      "connection refused",
    ]);
  });

  it("returns empty for empty input", () => {
    expect(deduplicateApiErrors([])).toEqual([]);
  });

  it("handles messages with no label prefix", () => {
    const errors = ["raw error", "raw error"];
    expect(deduplicateApiErrors(errors)).toHaveLength(1);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// QA-18: ActivityCard null vs empty vs populated
// ──────────────────────────────────────────────────────────────────────────────

describe("ActivityCard — QA-18", () => {
  it("renders 'unavailable right now' when changes is null (backend down)", () => {
    const html = renderToStaticMarkup(
      createElement(ActivityCard, { changes: null }),
    );
    expect(html).toContain("unavailable right now");
    expect(html).not.toContain("No memory or learning changes recorded");
  });

  it("renders 'No memory or learning changes recorded' only for confirmed empty array", () => {
    const html = renderToStaticMarkup(
      createElement(ActivityCard, { changes: [] }),
    );
    expect(html).toContain("No memory or learning changes recorded");
    expect(html).not.toContain("unavailable right now");
  });

  it("renders list entries when changes has items", () => {
    const html = renderToStaticMarkup(
      createElement(ActivityCard, {
        changes: [{ id: "1", kind: "memory_added", summary: "New pref", at: new Date().toISOString(), work_id: null }],
      }),
    );
    expect(html).toContain("New pref");
    expect(html).not.toContain("unavailable right now");
    expect(html).not.toContain("No memory or learning changes recorded");
  });
});
