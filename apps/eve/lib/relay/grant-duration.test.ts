import { describe, expect, it } from "vitest";
import { grantExpiry } from "./grant-duration";
import { grantSchema, submissionSchema } from "./contracts";

describe("grant duration", () => {
  it("uses exact finite durations and explicit null for until revoked", () => {
    const now = Date.parse("2026-09-23T00:00:00Z");
    expect(grantExpiry("1d", now)).toBe("2026-09-24T00:00:00.000Z");
    expect(grantExpiry("7d", now)).toBe("2026-09-30T00:00:00.000Z");
    expect(grantExpiry("30d", now)).toBe("2026-10-23T00:00:00.000Z");
    expect(grantExpiry("never", now)).toBeNull();
    for (const value of [undefined, null, "forever", "999999d"]) expect(() => grantExpiry(value, now)).toThrow();
  });
  it("accepts explicit no expiry only for a grant, not a request", () => {
    const grant = { granteeOwnerId: "owner", granteeAgentId: "peer", capability: "message.send", resource: "resource", conditions: { expiresAt: null, rateLimit: { calls: 10, windowSeconds: 3600 }, allowedTopics: [], approvalRequired: true } };
    expect(grantSchema.safeParse(grant).success).toBe(true);
    expect(grantSchema.safeParse({ ...grant, conditions: { ...grant.conditions, expiresAt: undefined } }).success).toBe(false);
    expect(submissionSchema.safeParse({ target: "relay://owner/peer", capability: "message.send", resource: "resource", expiresAt: null, idempotencyKey: "test-message-0001", payload: { body: "Hello" } }).success).toBe(false);
  });
});
