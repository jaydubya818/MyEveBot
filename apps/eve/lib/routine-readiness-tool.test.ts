import { beforeEach, describe, it, expect, vi } from "vitest";
const inspect = vi.hoisted(() => vi.fn());
vi.mock("./routine-admission.ts", () => ({
  RoutineAdmission: class {
    inspect = inspect;
  },
}));
import tool from "../agent/tools/get_routine_readiness.ts";
const context = (owner: string | null, role = "owner") =>
  ({
    session: {
      auth: {
        current: owner ? { principalId: owner, attributes: { role } } : null,
      },
    },
  }) as never;
beforeEach(() => {
  inspect.mockReset();
});
describe("Routine readiness Agent tool", () => {
  it("is read-only and binds the authenticated owner", async () => {
    inspect.mockResolvedValue({ state: "READY" });
    expect(await tool.execute({ routineId: "r" }, context("sarah"))).toEqual({
      readiness: { state: "READY" },
    });
    expect(inspect).toHaveBeenCalledWith("sarah", "r");
  });
  it("denies guests and missing authentication before metadata access", async () => {
    for (const ctx of [context(null), context("other", "guest")])
      await expect(tool.execute({ routineId: "r" }, ctx)).rejects.toThrow(
        "Owner authentication",
      );
    expect(inspect).not.toHaveBeenCalled();
  });
  it("does not leak lookup failure details", async () => {
    inspect.mockRejectedValue(new Error("private fixture"));
    expect(
      JSON.stringify(await tool.execute({ routineId: "r" }, context("sarah"))),
    ).not.toContain("private fixture");
  });
});
