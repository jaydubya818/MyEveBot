import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { BetaChatUsage, BetaChatUsageView } from "./beta-chat-usage";
import { DestinationGate } from "./destination-gate";
import type { AlphaChatUsage } from "@/lib/external-alpha/usage-contract";
const usage: AlphaChatUsage = { version: 1, checkedAt: "2026-10-23T20:00:00Z", dayIndex: 20749, resetsAt: "2026-10-24T00:00:00Z", activatedAt: "2026-10-23T16:50:12Z", expiresAt: "2026-10-28T16:50:12Z", state: "active", localPaused: false, dailyTurnsUsed: 9, quotaRemaining: 1, dailyReservedMicrousd: 900000, trialReservedMicrousd: 1200000, limits: { dailyTurns: 10, perTurnMicrousd: 100000, dailyMicrousd: 1000000, trialMicrousd: 5000000, sharedDailyMicrousd: 2000000, sharedTrialMicrousd: 10000000 }, measured: { dailyMicrousd: 41234, trialMicrousd: 61234, unsettledOperations: 1 } };
it("distinguishes permanent reservation limits, settled measured usage, daily turns, and UTC boundaries", () => {
  const html = renderToStaticMarkup(<BetaChatUsageView usage={usage} />);
  for (const text of ["1/10 chat turns remaining today", "$0.90 / $1.00", "$1.20 / $5.00", "$0.0412", "9/10 turns reserved", "Reservations are not refunded", "recorded spend is incomplete", "00:00:00 GMT", "Paid Work and purchases are disabled"])
    expect(html).toContain(text);
});
it.each(["expired", "revoked", "inactive", "paused"] as const)("explains %s independently of unused quota", state => {
  const html = renderToStaticMarkup(<BetaChatUsageView usage={{ ...usage, state }} />);
  expect(html).toContain('role="status"'); expect(html).not.toContain("fully reserved");
});
it("shows exhaustion without claiming low model spend restores quota", () => {
  const html = renderToStaticMarkup(<BetaChatUsageView usage={{ ...usage, quotaRemaining: 0 }} />);
  expect(html).toContain("fully reserved"); expect(html).toContain("Daily limits reset at 00:00 UTC");
});
it("does not add beta usage outside tester installations", () => {
  expect(renderToStaticMarkup(<BetaChatUsage refreshKey="fixture" />)).toBe("");
  expect(renderToStaticMarkup(<DestinationGate hrefs={["/chat"]}><BetaChatUsage refreshKey="fixture" /></DestinationGate>)).toContain("Checking chat allowance");
});
