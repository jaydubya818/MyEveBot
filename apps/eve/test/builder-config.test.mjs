import assert from "node:assert/strict";
import test from "node:test";

import { validateConfig } from "../../builder/lib/config.ts";
import { generateInstructions } from "../../builder/lib/instructions.ts";

function validConfig() {
  return {
    agentName: "Sofie",
    projectName: "sofie",
    ownerName: "Jay",
    accessPassword: "a-strong-access-password",
    model: "openai/gpt-5.2",
    features: [],
    instructions: "Help Jay.",
    schedules: [],
    postgres: { mode: "manual", url: "postgres://example" },
    blob: { mode: "manual", token: "" },
    keys: {},
    telegram: null,
  };
}

test("builder requires a strong production access password", () => {
  const missing = validConfig();
  delete missing.accessPassword;
  assert.match(validateConfig(missing), /at least 12 characters/);

  const short = { ...validConfig(), accessPassword: "too-short" };
  assert.match(validateConfig(short), /at least 12 characters/);

  assert.equal(validateConfig(validConfig()), null);
});

test("builder-generated identity is owner and agent configurable", () => {
  const instructions = generateInstructions({
    agentName: "Ava",
    ownerName: "Ada",
    personality: "Calm and precise.",
    features: ["goals"],
    telegramEnabled: false,
  });

  assert.match(instructions, /You are Ava, Ada's personal assistant/);
  assert.match(instructions, /Calm and precise/);
  assert.doesNotMatch(instructions, /\bSofie\b|\bJay\b/);
});

test("builder requires a Telegram allowlist when the channel is enabled", () => {
  const withoutAllowlist = {
    ...validConfig(),
    telegram: {
      botToken: "telegram-bot-token",
      botUsername: "myeve_bot",
      webhookSecret: "webhook-secret",
      allowedUserIds: "",
    },
  };
  assert.match(validateConfig(withoutAllowlist), /at least one allowed user id/);

  const allowlisted = {
    ...withoutAllowlist,
    telegram: { ...withoutAllowlist.telegram, allowedUserIds: "12345678" },
  };
  assert.equal(validateConfig(allowlisted), null);
});
