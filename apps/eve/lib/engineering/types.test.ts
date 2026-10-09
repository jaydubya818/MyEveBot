import { describe, expect, it } from "vitest";
import { createWorkSchema, evaluateReadiness, nextWorkState } from "./types";

const criterion = {
  id: "60ddff89-2a33-436d-a940-30c410bc3421",
  statement: "Reject invalid input",
  method: "test" as const,
};
const work = {
  lifecycle: "active" as const,
  control: "agent" as const,
  criteriaVersion: 1,
  criteria: [criterion],
};
const observation = {
  criterionId: criterion.id,
  criteriaVersion: 1,
  candidate: "commit-a",
  profile: "profile-a",
  producer: "supervisor" as const,
  result: "passed" as const,
};
const ready = () => ({
  work,
  candidate: "commit-a",
  profile: "profile-a",
  observations: [observation],
  activeAttempt: false,
  unresolvedEffect: false,
  authorityCurrent: true,
});

describe("engineering readiness boundaries", () => {
  it("rejects empty or duplicate criteria even when supplied outside intake validation", () => {
    for (const criteria of [[], [criterion, criterion]]) {
      expect(
        evaluateReadiness({ ...ready(), work: { ...work, criteria } }).ready,
      ).toBe(false);
    }
  });
  it("requires current qualified evidence instead of a success summary", () => {
    expect(evaluateReadiness(ready()).ready).toBe(true);
    expect(evaluateReadiness({ ...ready(), observations: [] }).ready).toBe(
      false,
    );
  });
  it.each([
    { candidate: "commit-b" },
    { profile: "profile-b" },
    { criteriaVersion: 2 },
    { producer: "human" as const },
    { result: "failed" as const },
    { result: "unknown" as const },
  ])("rejects incompatible observation %j", (change) => {
    expect(
      evaluateReadiness({
        ...ready(),
        observations: [{ ...observation, ...change }],
      }).ready,
    ).toBe(false);
  });
  it("does not choose a convenient result among conflicting producer observations", () => {
    expect(
      evaluateReadiness({
        ...ready(),
        observations: [observation, { ...observation, result: "failed" }],
      }).ready,
    ).toBe(false);
  });
  it.each([
    { activeAttempt: true },
    { unresolvedEffect: true },
    { authorityCurrent: false },
    { candidate: null },
  ])("blocks unsafe current state %j", (change) => {
    expect(evaluateReadiness({ ...ready(), ...change }).ready).toBe(false);
  });
  it("does not let tests satisfy a human-only criterion", () => {
    expect(
      evaluateReadiness({
        ...ready(),
        work: { ...work, criteria: [{ ...criterion, method: "human" }] },
      }).ready,
    ).toBe(false);
  });
});
describe("Work control", () => {
  it("reopens terminal work paused, without renewing execution authority", () => {
    expect(
      nextWorkState(
        { lifecycle: "cancelled", control: "paused" },
        { operation: "reopen", expectedVersion: 3 },
      ),
    ).toEqual({ lifecycle: "active", control: "paused" });
  });
  it("does not let an ordinary resume revive cancelled work or bypass stopping", () => {
    expect(() =>
      nextWorkState(
        { lifecycle: "cancelled", control: "paused" },
        { operation: "resume", expectedVersion: 3 },
      ),
    ).toThrow("Reopen");
    expect(() =>
      nextWorkState(
        { lifecycle: "active", control: "stopping" },
        { operation: "takeover", expectedVersion: 3 },
      ),
    ).toThrow("Wait for execution");
  });
  it("rejects duplicate criterion IDs and unbounded limits", () => {
    const input = {
      title: "Fix input",
      objective: "Reject negative values",
      repository: "test/project",
      criteria: [criterion],
      maxCostUsd: 1,
      maxDurationSeconds: 60,
      idempotencyKey: criterion.id,
    };
    expect(createWorkSchema.safeParse(input).success).toBe(true);
    expect(
      createWorkSchema.safeParse({ ...input, criteria: [criterion, criterion] })
        .success,
    ).toBe(false);
    expect(
      createWorkSchema.safeParse({ ...input, maxCostUsd: Infinity }).success,
    ).toBe(false);
    expect(
      createWorkSchema.safeParse({
        ...input,
        repository: "https://attacker.example/repo",
      }).success,
    ).toBe(false);
  });
});
