import { describe, expect, it } from "vitest";
import { approvalBinding, resolveApprovalPolicy, safeActionParameters } from "./approvals.ts";

describe("approval policy",()=>{
  it("denies capabilities outside the registry",()=>expect(resolveApprovalPolicy({capabilityId:"missing.capability",actionClass:"read"}).decision).toBe("DENY"));
  it("requires approval for consequential actions",()=>expect(resolveApprovalPolicy({capabilityId:"channel.web",actionClass:"delete"}).decision).toBe("REQUIRE_APPROVAL"));
  it("allows a registered low-risk read",()=>expect(resolveApprovalPolicy({capabilityId:"channel.web",actionClass:"read"}).decision).toBe("ALLOW"));
  it("redacts secrets and binds decisions to exact parameters",()=>{const safe=safeActionParameters({recipient:"owner@example.com",apiKey:"secret-value"});expect(safe.apiKey).toBe("[REDACTED]");expect(approvalBinding({taskId:"one",action:"send",parameters:safe})).not.toBe(approvalBinding({taskId:"one",action:"send",parameters:{...safe,recipient:"other@example.com"}}));});
});
