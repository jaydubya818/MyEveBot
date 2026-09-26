import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isManagedAdmin } from "./admin-auth";

describe("managed operator boundary", () => {
  it("fails closed when unconfigured or supplied a wrong token", () => {
    delete process.env.MANAGED_EVE_ADMIN_TOKEN;
    assert.equal(isManagedAdmin(new Request("https://builder.example/api/managed/invites")), false);
    process.env.MANAGED_EVE_ADMIN_TOKEN = "x".repeat(48);
    assert.equal(isManagedAdmin(new Request("https://builder.example/api/managed/invites", {
      headers: { authorization: `Bearer ${"y".repeat(48)}` },
    })), false);
  });

  it("accepts only the configured operator token", () => {
    process.env.MANAGED_EVE_ADMIN_TOKEN = "x".repeat(48);
    assert.equal(isManagedAdmin(new Request("https://builder.example/api/managed/invites", {
      headers: { authorization: `Bearer ${"x".repeat(48)}` },
    })), true);
  });
});
