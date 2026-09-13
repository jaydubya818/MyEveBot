import assert from "node:assert/strict";
import test from "node:test";

import { telegramUserAllowed } from "../agent/channels/telegram.ts";

test("production Telegram access fails closed without an allowlist", () => {
  assert.equal(telegramUserAllowed(12345678, { NODE_ENV: "production" }), false);
});

test("production Telegram access accepts only explicitly allowed users", () => {
  const env = {
    NODE_ENV: "production",
    TELEGRAM_ALLOWED_USER_IDS: "12345678, 87654321",
  };
  assert.equal(telegramUserAllowed(12345678, env), true);
  assert.equal(telegramUserAllowed(11111111, env), false);
  assert.equal(telegramUserAllowed(undefined, env), false);
});

test("local Telegram setup remains usable without an allowlist", () => {
  assert.equal(telegramUserAllowed(12345678, { NODE_ENV: "development" }), true);
});
