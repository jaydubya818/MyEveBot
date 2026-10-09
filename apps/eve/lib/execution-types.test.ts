import { describe, expect, it } from "vitest";
import { occurrenceIdentity, retryDecision, routineConfigurationSchema } from "./execution-types.ts";

const policy = { maxAttempts:3,backoffSeconds:[60,300] };
describe("execution contracts", () => {
  it("separates owners and event identities without delimiter collisions", () => {
    expect(occurrenceIdentity("sarah","daily","one")).toBe(occurrenceIdentity("sarah","daily","one"));
    expect(occurrenceIdentity("sarah","daily","one")).not.toBe(occurrenceIdentity("mike","daily","one"));
    expect(occurrenceIdentity("a:b","c","d")).not.toBe(occurrenceIdentity("a","b:c","d"));
  });
  it("bounds transient retries, including rate limiting", () => {
    expect(retryDecision({category:"rate_limited",attempt:1,policy})).toEqual({eligibility:"retry",delaySeconds:60});
    expect(retryDecision({category:"timeout",attempt:2,policy})).toEqual({eligibility:"retry",delaySeconds:300});
    expect(retryDecision({category:"timeout",attempt:3,policy}).eligibility).toBe("stop");
  });
  it("never replays unknown or already completed writes", () => {
    for (const consequentialOutcome of ["unknown","completed"] as const) {
      expect(retryDecision({category:"timeout",attempt:1,policy,consequentialOutcome}).eligibility).toBe("recovery_required");
    }
  });
  it("waits for missing authority instead of retrying", () => {
    for (const category of ["authorization_failed","approval_required","budget_exceeded","capability_unavailable"] as const) {
      expect(retryDecision({category,attempt:1,policy}).eligibility).toBe("wait");
    }
    expect(retryDecision({category:"unknown",attempt:1,policy}).eligibility).toBe("stop");
  });
  it("rejects unlimited budgets and unknown authority fields", () => {
    expect(()=>routineConfigurationSchema.parse({instructions:"test",authority:{allowedCapabilities:[],allowEverything:true}})).toThrow();
    expect(()=>routineConfigurationSchema.parse({instructions:"test",authority:{allowedCapabilities:[]},retry:{maxAttempts:100}})).toThrow();
  });
});
