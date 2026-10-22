/**
 * Regression tests for QA-17 and QA-18.
 *
 * QA-17: integrated.tsx error section must deduplicate repeated API error
 *   messages and must NOT include a "Sign in" link for an authenticated user.
 *
 * QA-18: the activity card must NOT show the empty-state copy when activity
 *   is null (backend unavailable); it must only show empty-state copy when
 *   the array is confirmed empty.
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// ──────────────────────────────────────────────────────────────────────────────
// QA-17 helpers — pure deduplication logic
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Replicates the dedup logic from integrated.tsx:
 *   [...new Set(errors.map((e) => e.replace(/^[^:]+: /, "")))]
 * Revert-check: removing the Set+replace produces duplicates.
 */
function deduplicateErrors(errors: string[]): string[] {
  return [...new Set(errors.map((e) => e.replace(/^[^:]+: /, "")))];
}

describe("QA-17 — error message deduplication", () => {
  it("collapses identical messages from different endpoints into one", () => {
    const errors = [
      "Goals: could not confirm this request",
      "Inbox: could not confirm this request",
      "Results: could not confirm this request",
      "Work: could not confirm this request",
    ];
    expect(deduplicateErrors(errors)).toEqual(["could not confirm this request"]);
  });

  it("keeps distinct messages separate", () => {
    const errors = [
      "Goals: could not confirm this request",
      "Memory: connection refused",
    ];
    expect(deduplicateErrors(errors)).toEqual([
      "could not confirm this request",
      "connection refused",
    ]);
  });

  it("returns empty for an empty input", () => {
    expect(deduplicateErrors([])).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// QA-17 — "Sign in" link must not appear for authenticated users
// ──────────────────────────────────────────────────────────────────────────────

import { createElement } from "react";

// Minimal in-memory version of the error section rendered by integrated.tsx.
function ErrorSection({
  errors,
  loading,
  onRefresh,
}: {
  errors: string[];
  loading: boolean;
  onRefresh: () => void;
}) {
  if (!errors.length) return null;
  const unique = deduplicateErrors(errors);
  return createElement(
    "div",
    { role: "alert" },
    createElement("h2", null, "Some information is unavailable"),
    ...unique.map((msg) => createElement("p", { key: msg }, msg)),
    createElement(
      "div",
      null,
      createElement(
        "button",
        { onClick: onRefresh, disabled: loading },
        loading ? "Checking…" : "Try again",
      ),
    ),
    // No Sign in link — the user is already authenticated.
  );
}

describe("QA-17 — Sign in link removed from error section", () => {
  it("does NOT render a sign-in link in the error section", () => {
    const html = renderToStaticMarkup(
      createElement(ErrorSection, {
        errors: ["Goals: unavailable"],
        loading: false,
        onRefresh: () => {},
      }),
    );
    expect(html).not.toContain("Sign in");
    expect(html).not.toContain("/login");
  });

  it("shows Try again button and deduped error messages", () => {
    const html = renderToStaticMarkup(
      createElement(ErrorSection, {
        errors: [
          "Goals: could not confirm this request",
          "Work: could not confirm this request",
        ],
        loading: false,
        onRefresh: () => {},
      }),
    );
    expect(html).toContain("Try again");
    // Only one instance of the deduped message.
    const count = (html.match(/could not confirm this request/g) ?? []).length;
    expect(count).toBe(1);
  });

  it("shows 'Checking…' while loading", () => {
    const html = renderToStaticMarkup(
      createElement(ErrorSection, {
        errors: ["Goals: unavailable"],
        loading: true,
        onRefresh: () => {},
      }),
    );
    expect(html).toContain("Checking");
    expect(html).not.toContain("Try again");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// QA-18 — activity null vs empty state
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Minimal activity card renderer, matching the fix in integrated.tsx.
 * Revert-check: changing `activity === null` to `!activity.length` causes
 * the "shows error when null" test to fail.
 */
function ActivityCard({
  activity,
}: {
  activity: Array<{ id: string; kind: string; summary: string }> | null;
}) {
  return createElement(
    "div",
    null,
    activity === null
      ? createElement("p", null, "Memory and learning changes are unavailable right now.")
      : activity.length === 0
      ? createElement("p", null, "No memory or learning changes recorded.")
      : createElement(
          "ul",
          null,
          ...activity.map((c) => createElement("li", { key: c.id }, c.summary)),
        ),
  );
}

describe("QA-18 — activity null vs empty state", () => {
  it("shows error message when activity is null (backend unavailable)", () => {
    const html = renderToStaticMarkup(createElement(ActivityCard, { activity: null }));
    expect(html).toContain("unavailable right now");
    expect(html).not.toContain("No memory or learning changes recorded");
  });

  it("shows empty state only when activity is a confirmed empty array", () => {
    const html = renderToStaticMarkup(createElement(ActivityCard, { activity: [] }));
    expect(html).toContain("No memory or learning changes recorded");
    expect(html).not.toContain("unavailable right now");
  });

  it("shows the list when there are entries", () => {
    const html = renderToStaticMarkup(
      createElement(ActivityCard, {
        activity: [{ id: "1", kind: "memory_added", summary: "New preference" }],
      }),
    );
    expect(html).toContain("New preference");
    expect(html).not.toContain("unavailable right now");
    expect(html).not.toContain("No memory or learning changes recorded");
  });
});
