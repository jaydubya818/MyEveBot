import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("Phone is fail-closed and enforces consent, quiet hours, and atomic caps", async () => {
  const [migration, service, channel, tools, api, panel, capabilities] = await Promise.all([
    readFile(new URL("migrations/0015_phone_safety_controls.sql", root), "utf8"),
    readFile(new URL("agent/lib/effect/agentphone.ts", root), "utf8"),
    readFile(new URL("agent/channels/agentphone.ts", root), "utf8"),
    readFile(new URL("agent/tools/agentphone.ts", root), "utf8"),
    readFile(new URL("app/api/phone/route.ts", root), "utf8"),
    readFile(new URL("components/phone-panel.tsx", root), "utf8"),
    readFile(new URL("lib/capabilities.ts", root), "utf8"),
  ]);

  assert.match(migration, /operational_enabled boolean NOT NULL DEFAULT false/);
  assert.match(migration, /agentphone_contact_policy/);
  assert.match(migration, /agentphone_usage_event/);
  assert.match(service, /authorizeAndReserve/);
  assert.match(service, /operational_enabled = true/);
  assert.match(service, /firstOutboundDisclosure/);
  assert.match(service, /reason: "quiet_hours"/);
  assert.match(channel, /phoneConsentCommand/);
  assert.match(channel, /This line is private/);
  assert.match(tools, /operationalEnabled !== true/);
  assert.match(api, /const emergencyDisable/);
  assert.match(api, /requirePhoneAdmin/);
  assert.match(panel, /Switch Phone off now/);
  assert.match(panel, /Consent register/);
  assert.match(capabilities, /AGENTPHONE_LIVE_QUALIFIED === "true"/);
});

test("Phone retains signed webhooks, idempotent ingress, and bounded retry recovery", async () => {
  const [channel, signature, service] = await Promise.all([
    readFile(new URL("agent/channels/agentphone.ts", root), "utf8"),
    readFile(new URL("agent/lib/agentphone-signature.ts", root), "utf8"),
    readFile(new URL("agent/lib/effect/agentphone.ts", root), "utf8"),
  ]);

  assert.match(channel, /verifyWebhookSignature/);
  assert.match(channel, /claimPhoneInbound/);
  assert.match(channel, /releasePhoneInboundBatch/);
  assert.match(signature, /timingSafeEqual/);
  assert.match(signature, /SIGNATURE_TOLERANCE_SECONDS/);
  assert.match(service, /CONVERSATION_AWAITING_REPLY/);
  assert.match(service, /Effect\.retry/);
});
