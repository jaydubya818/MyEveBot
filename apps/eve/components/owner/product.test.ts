import { describe, it, expect } from "vitest";
import {
  displayCanonicalAttention,
  displayCanonicalWork,
} from "./canonical-boundaries";
import { channelFixtures, engineeringFixture } from "./product-fixtures";
import {
  searchKnowledge,
  searchGoals,
  searchResults,
  matchesProductQuery,
} from "./search-model";
import { exampleSnapshot } from "./preview";
describe("product source boundaries", () => {
  it("does not turn candidates or reported readiness into qualified results", () => {
    expect(
      displayCanonicalWork({
        ...engineeringFixture,
        readiness: { ready: true, reasons: [] },
      }),
    ).toMatchObject({
      ready: false,
      result: null,
      boundary: "WAITING_FOR_CANONICAL_Q37",
    });
    expect(displayCanonicalWork(null).ready).toBe(false);
  });
  it("keeps external messages informational and excludes other owners", () => {
    const items = displayCanonicalAttention("fixture-owner-a", [
      ...channelFixtures,
      {
        ...channelFixtures[0]!,
        id: "other",
        ownerId: "fixture-owner-b",
        title: "PRIVATE SECRET",
      },
    ]);
    expect(items.filter((item) => item.needsYou)).toHaveLength(1);
    expect(JSON.stringify(items)).not.toContain("PRIVATE SECRET");
    expect(items.every((item) => !item.canExecute)).toBe(true);
  });
  it("does not escalate internal coordination, resolved or superseded attention", () => {
    for (const status of ["RESOLVED", "SUPERSEDED", "EXPIRED"]) {
      expect(
        displayCanonicalAttention("fixture-owner-a", [
          { ...channelFixtures[1]!, status },
        ])[0]!.needsYou,
      ).toBe(false);
    }
    expect(
      displayCanonicalAttention("fixture-owner-a", [
        {
          ...channelFixtures[1]!,
          action: {
            involvement: "AVOIDABLE_COORDINATION",
            prompt: "retry transport",
          },
        },
      ])[0]!.needsYou,
    ).toBe(false);
  });
  it("searches recorded results and keeps identity in destination links", () => {
    const sample = exampleSnapshot();
    const goal = sample.goals[0]!;
    expect(
      searchGoals(sample.goals, goal.title.slice(0, 5))[0]?.href,
    ).toContain(encodeURIComponent(goal.id));
    const outcome = sample.outcomes[0]!;
    expect(
      searchResults(sample.outcomes, outcome.summary.slice(0, 5))[0]?.href,
    ).toContain(encodeURIComponent(outcome.id));
    expect(searchKnowledge([])).toEqual([]);
    expect(matchesProductQuery("a", "alpha")).toBe(false);
  });
});
