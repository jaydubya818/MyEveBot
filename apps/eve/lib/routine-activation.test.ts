import { describe,expect,it,vi } from "vitest";
import { routineConfigurationSchema,type ExecutionClaim } from "./execution-types.ts";

vi.mock("eve/schedules",()=>({defineSchedule:(definition:unknown)=>definition}));
vi.mock("../agent/lib/receipts-db.ts",()=>({db:()=>{throw new Error("Unexpected database access");}}));

import reminderSchedule from "../agent/schedules/reminders.ts";
import { routineRunner } from "../agent/lib/routine-runner.ts";
import { routineSession } from "../agent/channels/eve.ts";

describe("unqualified routine execution stays blocked",()=>{
  it("does not enqueue or start a worker from the production schedule",async()=>{
    const waitUntil=vi.fn();
    const schedule=reminderSchedule as unknown as {run:(ctx:{waitUntil:typeof waitUntil})=>Promise<void>};
    await schedule.run({waitUntil});
    expect(waitUntil).not.toHaveBeenCalled();
  });
  it("rejects the runner before database or model access",async()=>{
    const claim:ExecutionClaim={ownerId:"owner",routineId:"r",occurrenceId:"o",runId:"run",workerId:"w",version:1,attempt:1,
      configuration:routineConfigurationSchema.parse({instructions:"fixture",authority:{allowedCapabilities:[]}})};
    await expect(routineRunner.preflight(claim)).rejects.toThrow("capability_unavailable");
  });
  it("rejects execution credentials at the channel boundary",async()=>{
    const auth=routineSession();
    await expect(auth(new Request("https://example.test",{headers:{"x-myeve-execution":"fixture"}}))).rejects.toThrow();
  });
});
