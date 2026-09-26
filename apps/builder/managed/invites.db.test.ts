import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, test } from "node:test";
import { managedDb } from "./db";
import { claimManagedInvite, issueManagedInvite, lookupManagedInvite, revokeManagedInvite } from "./invites";

const enabled = Boolean(process.env.MANAGED_EVE_TEST_DATABASE_URL);

test("a disposable database enforces invite reservations and single use", { skip: !enabled }, async () => {
  process.env.MANAGED_EVE_DATABASE_URL = process.env.MANAGED_EVE_TEST_DATABASE_URL;
  process.env.MANAGED_EVE_INVITE_KEY = randomBytes(32).toString("base64url");
  process.env.MANAGED_EVE_MAX_ACTIVE = "2";
  const suffix = randomBytes(6).toString("hex");
  const relayInviteUrl = `https://relay-sage-nine.vercel.app/signup#invite=${"a".repeat(43)}`;
  const invite = (email: string) => issueManagedInvite({
    email, relayInviteUrl, builderOrigin: "https://myeve-builder.vercel.app", monthlyModelBudgetUsd: 5,
  });
  const firstEmail = `first-${suffix}@example.test`;
  const secondEmail = `second-${suffix}@example.test`;
  const [first, second] = await Promise.all([invite(firstEmail), invite(secondEmail)]);
  await assert.rejects(invite(`third-${suffix}@example.test`), /capacity reached/);
  await assert.rejects(invite(firstEmail), /capacity reached|already has/);
  const firstToken = new URL(first.url).searchParams.get("invite")!;
  const secondToken = new URL(second.url).searchParams.get("invite")!;
  assert.equal((await lookupManagedInvite(firstToken))?.email, firstEmail);
  const claimed = await claimManagedInvite({ token: firstToken, ownerName: "Test Owner", agentName: "Test Eve" });
  assert.match(claimed.environmentId, /^env_[a-f0-9]{24}$/);
  await assert.rejects(claimManagedInvite({ token: firstToken, ownerName: "Another", agentName: "Eve" }), /already used/);
  await assert.rejects(invite(`fourth-${suffix}@example.test`), /capacity reached/);
  await claimManagedInvite({ token: secondToken, ownerName: "Another Owner", agentName: "Second Eve" });
  const result = await managedDb().query<{ total: string }>(
    "SELECT count(*)::text AS total FROM managed_eve_environments WHERE email IN ($1,$2)",
    [firstEmail, secondEmail],
  );
  assert.equal(result.rows[0]?.total, "2");
  await managedDb().query(
    "UPDATE managed_eve_environments SET state='retired' WHERE email IN ($1,$2)",
    [firstEmail, secondEmail],
  );
  const expiringEmail = `expired-${suffix}@example.test`;
  await invite(expiringEmail);
  await managedDb().query(
    "UPDATE managed_beta_invites SET expires_at=now()-interval '1 minute' WHERE email=$1 AND claimed_at IS NULL",
    [expiringEmail],
  );
  const replacement = await invite(expiringEmail);
  assert.equal(replacement.email, expiringEmail);
  assert.equal(await revokeManagedInvite(replacement.id), true);
  assert.equal(await revokeManagedInvite(replacement.id), false);
  const revokedToken = new URL(replacement.url).searchParams.get("invite")!;
  assert.equal(await lookupManagedInvite(revokedToken), null);
  await assert.rejects(claimManagedInvite({ token: revokedToken, ownerName: "Owner", agentName: "Eve" }), /already used/);
  assert.equal(await revokeManagedInvite(first.id), false);
});

after(async () => {
  if (enabled) await managedDb().end();
});
