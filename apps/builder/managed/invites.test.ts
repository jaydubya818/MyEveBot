import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decryptRelayInvite, encryptRelayInvite } from "./invites";

describe("managed Relay invitation", () => {
  it("encrypts a production invite and authenticates its contents", () => {
    process.env.MANAGED_EVE_INVITE_KEY = Buffer.alloc(32, 7).toString("base64url");
    const token = "a".repeat(43);
    const url = `https://relay-sage-nine.vercel.app/signup#invite=${token}`;
    const encrypted = encryptRelayInvite(url);
    assert.ok(!encrypted.includes(token));
    assert.equal(decryptRelayInvite(encrypted), url);
    const bytes = Buffer.from(encrypted, "base64url");
    bytes[bytes.length - 1] ^= 1;
    assert.throws(() => decryptRelayInvite(bytes.toString("base64url")));
  });

  it("rejects unapproved redirect destinations", () => {
    process.env.MANAGED_EVE_INVITE_KEY = Buffer.alloc(32, 7).toString("base64url");
    const token = "a".repeat(43);
    assert.throws(() => encryptRelayInvite(`https://evil.example/signup#invite=${token}`));
    assert.throws(() => encryptRelayInvite(`https://relay-sage-nine.vercel.app/login#invite=${token}`));
    assert.throws(() => encryptRelayInvite(`https://relay-sage-nine.vercel.app/signup?invite=${token}`));
  });
});
