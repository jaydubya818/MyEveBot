import { expect, it, vi } from "vitest";
import { refusalCode } from "./refusal-code.ts";
import { QualificationRoot, QualificationRootRefused } from "./root.ts";

it("keeps only the leading owner-safe code of a refusal", () => {
  expect(refusalCode(Object.assign(new Error("x"), { code: "HOSTED_CONFIRMATION_PROPOSE:[Request ID: 4cc4864492c05e60] Server Error" }))).toBe("HOSTED_CONFIRMATION_PROPOSE");
  expect(refusalCode(new Error("QDEV_WORK_BUDGET_EXCEEDS_OPERATION_RESERVATION:1"))).toBe("QDEV_WORK_BUDGET_EXCEEDS_OPERATION_RESERVATION:1");
  expect(refusalCode(new Error("HOSTED_POLICY_OWNER"))).toBe("HOSTED_POLICY_OWNER");
  expect(refusalCode(new Error("connect ECONNREFUSED postgres://user:secret@host/db"))).toBe("UNCLASSIFIED");
  expect(refusalCode(new Error("FACTORY_X:12345 secret"))).toBe("FACTORY_X");
  expect(refusalCode(null, "FALLBACK")).toBe("FALLBACK");
});

it("the root surfaces the underlying refusal code of an unbuildable confirmed request (stable root code, detail in the message)", async () => {
  const planSha256 = "a".repeat(64), error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const host = (refusal?: string) => ({ enabled: () => true, config: async (ownerId: string) => ({ ownerId,
    ownerRequest: { derive: async () => ({ planSha256, config: null, ...(refusal ? { refusal } : {}) }) } }) });
  const run = (refusal?: string) => new QualificationRoot(host(refusal) as never).run({ ownerId: "owner", kind: "human" }, { request: "Build it", planSha256 }).catch(e => e);
  const surfaced = await run("HOSTED_CONFIRMATION_PROPOSE");
  expect(surfaced).toBeInstanceOf(QualificationRootRefused);
  expect([surfaced.code, surfaced.detail, surfaced.message]).toEqual(["QDEV_ROOT_UNCONFIGURED", "HOSTED_CONFIRMATION_PROPOSE", "QDEV_ROOT_UNCONFIGURED:HOSTED_CONFIRMATION_PROPOSE"]);
  expect((await run("not a code; postgres://x")).message).toBe("QDEV_ROOT_UNCONFIGURED");
  expect((await run()).message).toBe("QDEV_ROOT_UNCONFIGURED");
  expect(error).toHaveBeenCalledWith("[qdev] root unconfigured: HOSTED_CONFIRMATION_PROPOSE");
  error.mockRestore();
});
