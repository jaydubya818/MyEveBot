import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canTransition, managedProjectName, normalizeInviteEmail, requireManagedTeamId } from "./state";

describe("managed Eve boundaries", () => {
  it("never reopens a retired environment", () => {
    assert.equal(canTransition("retired", "ready"), false);
    assert.equal(canTransition("ready", "retiring"), true);
    assert.equal(canTransition("requested", "provisioning"), false);
  });

  it("keeps upgrades behind a ready environment and fresh deployment check", () => {
    assert.equal(canTransition("paused", "upgrading"), false);
    assert.equal(canTransition("ready", "upgrading"), true);
    assert.equal(canTransition("upgrading", "deploying"), true);
    assert.equal(canTransition("upgrading", "ready"), false);
  });

  it("uses an opaque environment id for the dedicated project name", () => {
    assert.equal(managedProjectName(`env_${"a".repeat(24)}`), `myeve-beta-${"a".repeat(24)}`);
    assert.throws(() => managedProjectName("alice@example.com"));
  });

  it("normalizes and validates an invite email", () => {
    assert.equal(normalizeInviteEmail(" Alice@Example.com "), "alice@example.com");
    assert.throws(() => normalizeInviteEmail("not-an-email"));
  });

  it("fails closed without a dedicated Vercel team", () => {
    const previous = process.env.MANAGED_EVE_VERCEL_TEAM_ID;
    try {
      delete process.env.MANAGED_EVE_VERCEL_TEAM_ID;
      assert.throws(() => requireManagedTeamId(), /Dedicated managed-beta/);
      process.env.MANAGED_EVE_VERCEL_TEAM_ID = "team_qualificationtest";
      assert.equal(requireManagedTeamId(), "team_qualificationtest");
    } finally {
      if (previous === undefined) delete process.env.MANAGED_EVE_VERCEL_TEAM_ID;
      else process.env.MANAGED_EVE_VERCEL_TEAM_ID = previous;
    }
  });
});
