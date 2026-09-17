import { describe, expect, it } from "vitest";

import { getStarterJobs } from "./activation";

describe("getStarterJobs", () => {
  it("always returns five jobs with access, boundaries, and finish lines", () => {
    const jobs = getStarterJobs([], false);
    expect(jobs).toHaveLength(5);
    for (const job of jobs) {
      expect(job.access.length).toBeGreaterThan(0);
      expect(job.boundary.length).toBeGreaterThan(0);
      expect(job.finishLine.length).toBeGreaterThan(0);
      expect(job.prompt.length).toBeGreaterThan(0);
    }
  });

  it("uses connected-account names only for read-only discovery", () => {
    const job = getStarterJobs(["Gmail", "Slack"], true)[3];
    expect(job.title).toBe("Inspect connected work");
    expect(job.access).toBe("Gmail, Slack");
    expect(job.boundary).toContain("Read-only");
    expect(job.prompt).toContain("Do not send, edit, delete, or share");
  });

  it("offers a safe connection-planning job when no account is connected", () => {
    const job = getStarterJobs([], false)[3];
    expect(job.title).toBe("Map the account I should connect");
    expect(job.prompt).toContain("Do not request credentials");
  });
});
