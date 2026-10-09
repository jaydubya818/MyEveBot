import { beforeEach, expect, it, vi } from "vitest";
import { digest } from "../engineering/contract.ts";
const m = vi.hoisted(() => ({
  query: vi.fn(),
  agent: vi.fn(),
  policy: vi.fn(),
  active: vi.fn(),
  create: vi.fn(),
}));
vi.mock("../../agent/lib/receipts-db.ts", () => ({
  db: () => ({ query: m.query }),
}));
vi.mock("../../agent/lib/session-settings.ts", () => ({
  resolveSessionAgent: m.agent,
}));
vi.mock("./policy.ts", () => ({
  externalAlphaPolicy: m.policy,
  externalAlphaInstallation: () => !!process.env.MYEVE_EXTERNAL_ALPHA_POLICY,
}));
vi.mock("./allowance.ts", () => ({
  ExternalAlphaAllowance: class {
    assertActive = m.active;
  },
}));
vi.mock("../agents.ts", () => ({
  createAgent: m.create,
  duplicateAgent: vi.fn(),
  getAgent: vi.fn(),
  transitionAgent: vi.fn(),
  updateAgentProfile: vi.fn(),
}));
import manageAgent from "../../agent/tools/manage_agent.ts";
import { assertExternalAlphaTool } from "./tool-authority.ts";
const principal = {
  authenticator: "myeve-web-session",
  principalType: "user",
  principalId: "owner-a",
  attributes: { owner: "true" },
};
const ctx: any = {
  callId: "original-call",
  session: {
    id: "session-a",
    auth: { current: principal, initiator: principal },
    turn: { id: "later-approval-turn" },
  },
};
const proposal = () => ({
  id: "original-allowance",
  step_key: "original-turn:0",
  binding_id: "session-a:original-turn",
  request_sha256: digest({
    ownerId: "owner-a",
    agentId: "agent-a",
    sessionId: "session-a",
    turn: "original-turn",
  }),
});
const input: any = {
  action: "create",
  configuration: {
    name: "Research",
    role: "Research",
    instructions: "Use owner context",
    capabilityIds: [],
    riskCeiling: "low",
  },
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("MYEVE_EXTERNAL_ALPHA_POLICY", "configured");
  m.policy.mockReturnValue({ ownerId: "owner-a" });
  m.agent.mockResolvedValue({
    id: "agent-a",
    ownerId: "owner-a",
    status: "active",
  });
  m.query.mockImplementation(async (sql) =>
    String(sql).includes("tool_claim")
      ? [{ receipt: { state: "ACCEPTED" } }]
      : String(sql).includes("tool_finish")
        ? [{ state: "COMPLETED" }]
        : [proposal()],
  );
  m.active.mockResolvedValue(undefined);
});
it("blocks the real tool execute after a parked approval outlives revocation", async () => {
  m.active.mockRejectedValue(Error("EXTERNAL_ALPHA_AUTHORITY_REVOKED"));
  await expect(manageAgent.execute!(input, ctx)).rejects.toThrow(
    "AUTHORITY_REVOKED",
  );
  expect(m.create).not.toHaveBeenCalled();
  expect(m.active).toHaveBeenCalledWith("original-allowance");
});
it("binds resumed approval to its original allowance, never the approval turn", async () => {
  await manageAgent.execute!(input, ctx);
  expect(m.active).toHaveBeenCalledWith("original-allowance");
  expect(m.create).toHaveBeenCalledOnce();
});
it("rejects a changed Agent or a missing/ambiguous durable proposal", async () => {
  m.agent.mockResolvedValue({
    id: "agent-b",
    ownerId: "owner-a",
    status: "active",
  });
  await expect(manageAgent.execute!(input, ctx)).rejects.toThrow(
    "TOOL_BINDING",
  );
  expect(m.create).not.toHaveBeenCalled();
  m.query.mockResolvedValue([]);
  await expect(assertExternalAlphaTool(ctx, "manage_agent")).rejects.toThrow(
    "PROPOSAL_REQUIRED",
  );
});
it("preserves non-alpha tool behavior without introducing a new database dependency", async () => {
  vi.stubEnv("MYEVE_EXTERNAL_ALPHA_POLICY", "");
  await assertExternalAlphaTool(ctx, "manage_agent");
  expect(m.query).not.toHaveBeenCalled();
  expect(m.policy).not.toHaveBeenCalled();
});
