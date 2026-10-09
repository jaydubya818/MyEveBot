import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  resolve: vi.fn(),
  inspect: vi.fn(),
  validate: vi.fn(),
  sign: vi.fn(),
}));
vi.mock("./execution-auth.ts", () => ({
  EXECUTION_HEADER: "fixture",
  resolveExecution: m.resolve,
  signExecution: m.sign,
}));
vi.mock("./routine-review.ts", () => ({
  ROUTINE_EXECUTION_READY: true,
  validateRoutineAgent: m.validate,
}));
vi.mock("./routine-admission.ts", () => ({
  RoutineAdmission: class {
    inspect = m.inspect;
  },
}));
import { routineRunner } from "../agent/lib/routine-runner.ts";
import type { ExecutionClaim } from "./execution-types.ts";
beforeEach(() => {
  vi.resetAllMocks();
  m.resolve.mockResolvedValue({ agentId: "ava" });
  m.inspect.mockResolvedValue({ canRun: true });
});
it.each(["resolve", "inspect", "validate", "sign"] as const)(
  "treats post-claim %s failure as blocked preflight, not execution failure",
  async (step) => {
    m[step].mockImplementation(() => {
      throw new Error("private dependency diagnostic");
    });
    await expect(
      routineRunner.preflight({
        ownerId: "sarah",
        routineId: "daily",
        configuration: {},
      } as ExecutionClaim),
    ).rejects.toMatchObject({
      category: "capability_unavailable",
      message: "capability_unavailable",
    });
  },
);
