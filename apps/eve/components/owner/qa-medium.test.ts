/**
 * Regression tests for QA-17 and QA-18.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, it, expect, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) =>
    createElement("a", { href }, children),
}));

import { deduplicateApiErrors } from "@/lib/error-dedup";
import { ActivityCard } from "./activity-card";
import { ACTIVITY_PAGE_DESCRIPTION, productDestinations } from "./destinations";
import { exampleSnapshot } from "./preview";
import { DEEP_AGENT_UNAVAILABLE_LABEL } from "@/lib/deep-agent-availability";
import { formatLimitedModeDetail } from "@/lib/capability-notice";

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
      "Inbox: the list is empty",
    ];
    expect(deduplicateApiErrors(errors)).toEqual([
      "could not confirm this request",
      "the list is empty",
    ]);
  });
});

describe("ActivityCard — QA-18", () => {
  it("renders an unavailable error when changes is null", () => {
    const html = renderToStaticMarkup(createElement(ActivityCard, { changes: null }));
    expect(html).toContain("unavailable right now");
    expect(html).not.toContain("No memory or learning changes recorded");
  });

  it("renders the empty state only after a successful empty read", () => {
    const html = renderToStaticMarkup(createElement(ActivityCard, { changes: [] }));
    expect(html).toContain("No memory or learning changes recorded");
    expect(html).not.toContain("unavailable right now");
  });
});

describe("nav labels — QA-30", () => {
  it("does not title two destinations 'Agents'", () => {
    const labels: string[] = productDestinations.map((item) => item.label);
    expect(labels.filter((label) => label === "Agents")).toHaveLength(0);
    expect(productDestinations.some((item) => item.href === "/team" && item.label === "Team")).toBe(
      true,
    );
  });

  it("keeps Memory, Knowledge, Capsules, Results and Activity as distinct homes", () => {
    const byHref = Object.fromEntries(productDestinations.map((item) => [item.href, item.label]));
    expect(byHref["/memory"]).toBe("Memory");
    expect(byHref["/knowledge"]).toBe("Knowledge");
    expect(byHref["/capsules"]).toBe("Capsules");
    expect(byHref["/results"]).toBe("Results");
    expect(byHref["/activity"]).toBe("Activity");
    const labels = productDestinations.map((item) => item.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("Deep Agent availability — QA-27", () => {
  it("keeps the unavailable-until-qualified label stable", () => {
    expect(DEEP_AGENT_UNAVAILABLE_LABEL).toBe("Deep Agent is unavailable until qualified");
  });
});

describe("preview outcome identity — QA-16", () => {
  it("keeps a stable runId so preview results are inspectable", () => {
    expect(exampleSnapshot().outcomes[0].runId).toBe("preview-task");
  });
});

describe("activity subtitle — QA-40", () => {
  it("describes memory and learning instead of a generic outcome", () => {
    expect(ACTIVITY_PAGE_DESCRIPTION).toBe(
      "Memory changes, learning updates, and context from recent work.",
    );
  });
});

describe("limited-mode copy — QA-38", () => {
  it("truncates after three capability labels", () => {
    expect(formatLimitedModeDetail(["Memory", "Skills", "Computer", "Phone"])).toBe(
      "Memory, Skills, and 2 more need setup. Everything else remains available.",
    );
  });
});
