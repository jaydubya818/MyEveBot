import { describe, expect, it } from "vitest";
import { hostedRelayLabel, hostedRelaySend } from "./hosted-confirmation.ts";
import { relayLeaseEnrollmentSchema } from "../missioncontrol/relay-lease-client.ts";
import { factoryRelayLeaseEnrollmentSchema } from "../engineering/factory-relay-lease-client.ts";

describe("hosted MissionControl Relay routing", () => {
  it("sends only the pinned Relay label to the Mac-local Relay and everything else to MissionControl", async () => {
    const calls: string[] = [];
    const mc = (async (u: RequestInfo | URL) => { calls.push("mc " + String(u)); return new Response("{}"); }) as typeof fetch;
    const relay = (async (u: RequestInfo | URL) => { calls.push("relay " + String(u)); return new Response("{}"); }) as typeof fetch;
    const send = hostedRelaySend("jay", mc, { send: relay, origin: "http://127.0.0.1:8788" });
    await send(hostedRelayLabel("jay") + "/api/v2/runtime/capability-leases/prepare", { method: "POST" });
    await send("https://mc.example.com/api/action", { method: "POST" });
    await send("https://relay.hosted-other.invalid/api/v2/runtime/capability-leases", { method: "POST" });
    expect(calls).toEqual(["relay http://127.0.0.1:8788/api/v2/runtime/capability-leases/prepare", "mc https://mc.example.com/api/action",
      "mc https://relay.hosted-other.invalid/api/v2/runtime/capability-leases"]);
    expect(hostedRelaySend("jay", mc)).toBe(mc);
  });
  it("accepts MyEve agent_<uuid> Agent ids (and agt_ ids) in both Relay lease enrollments, nothing else", () => {
    const base = { ownerId: "myeve.hosted:jay:owner", installationId: "jay", connectionId: "c", enrollmentRevision: 1, origin: "https://relay.hosted-jay.invalid",
      activeFrom: 1, expiresAt: 2, accountId: "acct_12345678", runtimeClientId: "rtc_12345678", taskId: "tsk_12345678", workloadId: "wkl_12345678", audience: "relay-pep",
      capability: { name: "resource.missioncontrol.admit", version: "1.0" }, resource: { type: "target" }, parameters: {},
      relayKey: { keyId: "k", jwk: { kty: "EC", crv: "P-256", x: "x", y: "y" } } };
    for (const [agentId, ok] of [["agent_e0954312-6a71-4727-a915-f1484a0b8736", true], ["agt_12345678", true], ["agent_x", false], ["agent_E0954312-6A71-4727-A915-F1484A0B8736x", false]] as const) {
      expect(relayLeaseEnrollmentSchema.safeParse({ ...base, schema: "mc-relay-lease-enrollment/v1", agentId }).success).toBe(ok);
      expect(factoryRelayLeaseEnrollmentSchema.safeParse({ ...base, schema: "factory-relay-lease-enrollment/v1", agentId }).success).toBe(ok);
    }
  });
});
