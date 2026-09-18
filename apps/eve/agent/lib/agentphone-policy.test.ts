import { describe, expect, it } from "vitest";

import {
  estimatedSmsSegments,
  firstOutboundDisclosure,
  isPhoneQuietHour,
  isValidTimezone,
  phoneConsentCommand,
} from "./agentphone-policy";

describe("phoneConsentCommand", () => {
  it("recognizes carrier stop and restart commands without matching prose", () => {
    expect(phoneConsentCommand(" stop ")).toBe("block");
    expect(phoneConsentCommand("UNSUBSCRIBE")).toBe("block");
    expect(phoneConsentCommand("START")).toBe("allow");
    expect(phoneConsentCommand("please stop by tomorrow")).toBeNull();
  });
});

describe("phone quiet hours", () => {
  it("handles an overnight window in the configured timezone", () => {
    expect(isPhoneQuietHour(new Date("2026-09-18T06:00:00Z"), "America/Los_Angeles", 21, 8)).toBe(true);
    expect(isPhoneQuietHour(new Date("2026-09-18T19:00:00Z"), "America/Los_Angeles", 21, 8)).toBe(false);
    expect(isPhoneQuietHour(new Date(), "UTC", 8, 8)).toBe(false);
  });

  it("validates IANA timezone names", () => {
    expect(isValidTimezone("America/Los_Angeles")).toBe(true);
    expect(isValidTimezone("not/a-zone")).toBe(false);
  });
});

it("builds the required first-message disclosure", () => {
  expect(firstOutboundDisclosure("Sofie", "Hello")).toContain("Sofie: Hello");
  expect(firstOutboundDisclosure("Sofie", "Hello")).toContain("Reply STOP to opt out");
});

it("counts estimated 160-character SMS segments", () => {
  expect(estimatedSmsSegments("")).toBe(0);
  expect(estimatedSmsSegments("x".repeat(160))).toBe(1);
  expect(estimatedSmsSegments("x".repeat(161))).toBe(2);
});
