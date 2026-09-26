import assert from "node:assert/strict";
import test from "node:test";

import telegram, { telegramUserAllowed } from "../agent/channels/telegram.ts";
import { telegramRoutineSendAllowed } from "../lib/routine-notifications.ts";

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

test("local Telegram setup also requires an explicit allowlist", () => {
  assert.equal(telegramUserAllowed(12345678, { NODE_ENV: "development" }), false);
  assert.equal(telegramUserAllowed(12345678, {
    NODE_ENV: "development", TELEGRAM_ALLOWED_USER_IDS: "12345678",
  }), true);
});

test("general Telegram webhook remains release blocked", async () => {
  assert.equal(telegram.receive, undefined);
  assert.equal(telegram.routes.length, 1);
  const response = await telegram.routes[0].handler();
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "channel_write_blocked");
});

test("routine Telegram send requires the exact owner, bot and allowlisted private DM at the send leaf", () => {
  const target = { ownerId: "owner-a", chatId: "12345678", botToken: "bot-a" };
  const configured = {
    TELEGRAM_BOT_TOKEN: "bot-a",
    TELEGRAM_PROACTIVE_CHAT_ID: "12345678",
    TELEGRAM_ALLOWED_USER_IDS: "87654321, 12345678",
  };
  assert.equal(telegramRoutineSendAllowed(target, configured, "owner-a"), true);
  assert.equal(telegramRoutineSendAllowed({ ...target, ownerId: "owner-b" }, configured, "owner-a"), false);
  assert.equal(telegramRoutineSendAllowed({ ...target, chatId: "-12345678" }, {
    ...configured, TELEGRAM_PROACTIVE_CHAT_ID: "-12345678", TELEGRAM_ALLOWED_USER_IDS: "-12345678",
  }, "owner-a"), false, "groups are not owner DMs");

  // These changes can happen after the gateway resolved its target and before
  // the provider request. None may reuse an earlier authorization snapshot.
  assert.equal(telegramRoutineSendAllowed(target, configured, "owner-b"), false);
  assert.equal(telegramRoutineSendAllowed(target, { ...configured, TELEGRAM_ALLOWED_USER_IDS: "87654321" }, "owner-a"), false);
  assert.equal(telegramRoutineSendAllowed(target, { ...configured, TELEGRAM_PROACTIVE_CHAT_ID: "87654321" }, "owner-a"), false);
  assert.equal(telegramRoutineSendAllowed(target, { ...configured, TELEGRAM_BOT_TOKEN: "bot-b" }, "owner-a"), false);
  assert.equal(telegramRoutineSendAllowed(target, { ...configured, TELEGRAM_BOT_TOKEN: "" }, "owner-a"), false);
});
