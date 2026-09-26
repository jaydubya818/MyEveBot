import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RoutingSummary, RoutingTimeline, type RoutingSnapshot } from "./routing-summary";

const routing: RoutingSnapshot = {
  decision: {
    id: "route_1", workId: "work_1", workVersion: 3,
    selectedRoute: "DEEP_AGENT", reason: "Exploratory debugging in one repository.",
    source: "SOFIE_RECOMMENDATION", profile: {
      profileVersion: 1,
      workShape: "exploratory",
      decomposition: "single_task",
      interaction: "low",
      parallelism: "low",
      verification: "automated",
      duration: "short",
      ambiguity: "moderate",
      externalExpertise: "none",
      humanJudgment: "low",
      risk: "low",
    },
    eligibleRoutes: ["DEEP_AGENT", "DIRECT"],
    rejectedRoutes: [{ route: "MYFACTORY", reason: "Acceptance criteria are not bounded yet." }],
    constraints: ["Repository access required"], providerId: "deep-agents", providerVersion: "1",
    status: "PROPOSED", createdAt: "2026-09-25T12:00:00.000Z",
  },
  transitions: [], runs: [],
};

describe("read-only execution routing", () => {
  it("distinguishes an unavailable routing projection from no selected route", () => {
    expect(renderToStaticMarkup(<RoutingSummary routing={undefined} />)).toContain("Routing status is unavailable.");
    expect(renderToStaticMarkup(<RoutingSummary routing={{ decision: null, transitions: [], runs: [] }} />)).toContain("No route selected.");
  });

  it("shows a proposed route as a recommendation with its persisted rationale and rejected alternatives", () => {
    const markup = renderToStaticMarkup(<RoutingSummary routing={routing} stale />);
    expect(markup).toContain("Recommended strategy");
    expect(markup).toContain("Deep Agent");
    expect(markup).toContain("It has not admitted an execution route");
    expect(markup).toContain("Exploratory debugging in one repository.");
    expect(markup).toContain("Profile Version");
    expect(markup).toContain("Provider in proposal");
    expect(markup).toContain("Recorded");
    expect(markup).toContain("Acceptance criteria are not bounded yet.");
    expect(markup).toContain("Work details could not be refreshed");
    expect(markup).not.toContain("Admitted strategy");
  });

  it("marks a stale provider as previously selected rather than current", () => {
    const markup = renderToStaticMarkup(<RoutingSummary routing={{
      ...routing,
      decision: { ...routing.decision!, status: "STALE" },
    }} />);
    expect(markup).toContain("Previous strategy");
    expect(markup).toContain("Previously selected provider");
    expect(markup).toContain("reevaluated before dispatch");
    expect(markup).not.toContain("Admitted strategy");
  });

  it("renders route changes in time order even without a provider run", () => {
    const markup = renderToStaticMarkup(<RoutingTimeline transitions={[
      { id: "later", fromRoute: "DEEP_AGENT", toRoute: "MYFACTORY", reason: "Specification is bounded.", trigger: "factory_ready", createdAt: "2026-09-25T12:10:00.000Z" },
      { id: "earlier", fromRoute: null, toRoute: "DEEP_AGENT", reason: "Investigate ambiguity.", trigger: "work_started", createdAt: "2026-09-25T12:00:00.000Z" },
    ]} />);
    expect(markup.indexOf("Investigate ambiguity.")).toBeLessThan(markup.indexOf("Specification is bounded."));
    expect(markup).toContain("Deep Agent");
    expect(markup).toContain("MyFactory");
  });
});
