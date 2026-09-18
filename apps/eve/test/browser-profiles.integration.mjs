import assert from "node:assert/strict";
import test from "node:test";

import { db } from "../agent/lib/receipts-db.ts";
import { createAgent } from "../lib/agents.ts";
import {
  advanceBrowserProfileGeneration,
  ensureBrowserProfile,
  resolveBrowserProfile,
  revokeBrowserProfileGrant,
  setBrowserProfileStatus,
  shareBrowserProfile,
} from "../lib/browser-profiles.ts";

const integration = process.env.DATABASE_URL?.trim() ? test : test.skip;

integration("persistent browser profiles isolate Agents and enforce revocable sharing", async () => {
  const ownerId = `browser_profile_test_${crypto.randomUUID()}`;
  const actor = { type: "owner", id: ownerId };
  try {
    const researcher = await createAgent(ownerId, { name: "Profile Researcher", role: "Research", instructions: "Research safely.", riskCeiling: "high" }, actor);
    const operator = await createAgent(ownerId, { name: "Profile Operator", role: "Operations", instructions: "Operate safely.", riskCeiling: "high" }, actor);
    const researcherProfile = await ensureBrowserProfile(ownerId, researcher);
    const operatorProfile = await ensureBrowserProfile(ownerId, operator);
    assert.notEqual(researcherProfile.id, operatorProfile.id);
    assert.equal((await resolveBrowserProfile(ownerId, researcher)).id, researcherProfile.id);
    await assert.rejects(() => resolveBrowserProfile(ownerId, operator, researcherProfile.id), /not shared/);

    await shareBrowserProfile(ownerId, researcherProfile.id, operator.id);
    assert.equal((await resolveBrowserProfile(ownerId, operator, researcherProfile.id)).id, researcherProfile.id);
    await revokeBrowserProfileGrant(ownerId, researcherProfile.id, operator.id);
    await assert.rejects(() => resolveBrowserProfile(ownerId, operator, researcherProfile.id), /not shared/);

    const blocked = await setBrowserProfileStatus({ ownerId, profileId: researcherProfile.id, status: "reconnect_required", failureSummary: "Session expired." });
    assert.equal(blocked.status, "reconnect_required");
    assert.equal(blocked.failureSummary, "Session expired.");
    const reset = await advanceBrowserProfileGeneration(ownerId, researcherProfile.id);
    assert.equal(reset.generation, 2);
    assert.equal(reset.status, "ready");
    assert.equal(reset.lastAuthenticatedAt, null);
  } finally {
    await db().query(`DELETE FROM persistent_browser_profile_grants WHERE owner_id=$1`, [ownerId]);
    await db().query(`DELETE FROM persistent_browser_profiles WHERE owner_id=$1`, [ownerId]);
    await db().query(`DELETE FROM eve_events WHERE owner_id=$1`, [ownerId]);
    await db().query(`DELETE FROM agent_audit_events WHERE owner_id=$1`, [ownerId]);
    await db().query(`DELETE FROM agent_capabilities WHERE owner_id=$1`, [ownerId]);
    await db().query(`DELETE FROM agents WHERE owner_id=$1`, [ownerId]);
  }
});
