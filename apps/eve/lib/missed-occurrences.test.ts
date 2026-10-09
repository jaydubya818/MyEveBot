import {describe,it,expect} from "vitest";
import {missedOccurrenceTimes} from "./missed-occurrences.ts";
const base={cron:"0 * * * *",timezone:"UTC",due:new Date("2026-01-01T00:00:00Z"),now:new Date("2026-02-01T00:30:00Z")};
describe("missed occurrences",()=>{
  it("skips explicitly",()=>expect(missedOccurrenceTimes({...base,policy:"skip"})).toEqual([]));
  it("runs only the latest by default policy",()=>expect(missedOccurrenceTimes({...base,policy:"run_latest"}).map(d=>d.toISOString())).toEqual(["2026-02-01T00:00:00.000Z"]));
  it("bounds a month of backlog to three recent periods",()=>expect(missedOccurrenceTimes({...base,policy:"catch_up_bounded"}).map(d=>d.toISOString())).toEqual(["2026-01-31T22:00:00.000Z","2026-01-31T23:00:00.000Z","2026-02-01T00:00:00.000Z"]));
  it("never schedules earlier than the first due period",()=>expect(missedOccurrenceTimes({...base,due:new Date("2026-02-01T00:00:00Z"),policy:"catch_up_bounded"})).toHaveLength(1));
});
