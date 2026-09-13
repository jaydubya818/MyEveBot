import assert from "node:assert/strict";
import test from "node:test";

import { routeAuth } from "eve/channels/auth";

import { eveAuth } from "../agent/channels/eve.ts";
import {
  createWebSessionToken,
  LEGACY_WEB_SESSION_COOKIE,
  passwordMatches,
  requireWebAuth,
  verifyWebSessionToken,
  WEB_SESSION_COOKIE,
  webAuthConfigStatus,
  webPrincipal,
} from "../lib/web-auth.ts";

const productionEnv = {
  NODE_ENV: "production",
  MYEVE_ACCESS_PASSWORD: "a-long-personal-password",
  MYEVE_OWNER_ID: "owner-jay",
  MYEVE_SESSION_SECRET: "0123456789abcdef0123456789abcdef",
};

const AUTH_ENV_KEYS = [
  "NODE_ENV",
  "MYEVE_ACCESS_PASSWORD",
  "MYEVE_OWNER_ID",
  "MYEVE_SESSION_SECRET",
  "SOFIE_ACCESS_PASSWORD",
  "SOFIE_OWNER_ID",
  "SOFIE_SESSION_SECRET",
];

function captureAuthEnv() {
  return Object.fromEntries(AUTH_ENV_KEYS.map((key) => [key, process.env[key]]));
}

function restoreAuthEnv(previous) {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

test("signed owner sessions verify and reject tampering and expiry", () => {
  const now = Date.UTC(2026, 8, 12);
  const token = createWebSessionToken(productionEnv, now);
  assert.deepEqual(verifyWebSessionToken(token, productionEnv, now), { id: "owner-jay" });
  assert.equal(verifyWebSessionToken(`${token}x`, productionEnv, now), null);
  assert.equal(verifyWebSessionToken(token, productionEnv, now + 8 * 24 * 60 * 60 * 1000), null);
});

test("password comparison and configuration validation fail closed", () => {
  assert.equal(passwordMatches("a-long-personal-password", productionEnv), true);
  assert.equal(passwordMatches("not-the-password", productionEnv), false);
  assert.deepEqual(webAuthConfigStatus({ NODE_ENV: "production" }), {
    configured: false,
    missing: ["MYEVE_ACCESS_PASSWORD", "MYEVE_SESSION_SECRET"],
  });
});

test("legacy Sofie auth variables and cookie remain compatible", () => {
  const legacyEnv = {
    NODE_ENV: "production",
    SOFIE_ACCESS_PASSWORD: "a-long-personal-password",
    SOFIE_OWNER_ID: "legacy-owner",
    SOFIE_SESSION_SECRET: "0123456789abcdef0123456789abcdef",
  };
  const token = createWebSessionToken(legacyEnv);
  const request = new Request("https://agent.example/api/threads", {
    headers: { cookie: `${LEGACY_WEB_SESSION_COOKIE}=${token}` },
  });
  assert.deepEqual(webPrincipal(request, legacyEnv), { id: "legacy-owner" });
});

test("production requests need the owner cookie and reject cross-site mutations", () => {
  const token = createWebSessionToken(productionEnv);
  const anonymous = new Request("https://agent.example/api/threads");
  assert.equal(webPrincipal(anonymous, productionEnv), null);

  const authenticated = new Request("https://agent.example/api/threads", {
    headers: { cookie: `${WEB_SESSION_COOKIE}=${token}` },
  });
  assert.deepEqual(webPrincipal(authenticated, productionEnv), { id: "owner-jay" });

  const previous = captureAuthEnv();
  Object.assign(process.env, productionEnv);
  try {
    const denied = requireWebAuth(
      new Request("https://agent.example/api/threads", {
        method: "DELETE",
        headers: {
          cookie: `${WEB_SESSION_COOKIE}=${token}`,
          origin: "https://attacker.example",
        },
      }),
    );
    assert.equal(denied?.status, 403);
  } finally {
    restoreAuthEnv(previous);
  }
});

test("the Eve session auth chain rejects anonymous production origins", async () => {
  const token = createWebSessionToken(productionEnv);
  const previous = captureAuthEnv();
  Object.assign(process.env, productionEnv);
  try {
    const anonymous = await routeAuth(
      new Request("https://agent.example/eve/v1/session"),
      eveAuth,
    );
    assert.ok(anonymous instanceof Response);
    assert.equal(anonymous.status, 401);

    const authenticated = await routeAuth(
      new Request("https://agent.example/eve/v1/session", {
        headers: { cookie: `${WEB_SESSION_COOKIE}=${token}` },
      }),
      eveAuth,
    );
    assert.ok(!(authenticated instanceof Response));
    assert.equal(authenticated.principalId, "owner-jay");
    assert.equal(authenticated.authenticator, "myeve-web-session");
  } finally {
    restoreAuthEnv(previous);
  }
});
