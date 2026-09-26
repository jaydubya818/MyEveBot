import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  knowledgeActor: vi.fn(async () => ({ ownerId: "owner-a", createdByType: "agent", createdById: "agent-sofie" })),
  provenance: vi.fn(),
  owner: vi.fn(() => "owner-a"),
}));
vi.mock("../lib/knowledge-context.ts", () => ({
  knowledgeActor: mocks.knowledgeActor, currentConversationProvenance: mocks.provenance,
}));
vi.mock("../../lib/task-runs.ts", () => ({ taskOwnerFromAuth: mocks.owner }));

import recordFact from "./record_fact.ts";
import searchKnowledge from "./search_knowledge.ts";

const selected = "9e732386-2ba8-4435-b67d-7044260775e6";
const context = {
  session: { auth: { current: { attributes: { myeveEngineeringWorkId: selected } } } },
} as unknown as Parameters<typeof recordFact.execute>[1];

describe("selected Work fact tools", () => {
  it("does not silently record a selected Work fact as generic owner knowledge", async () => {
    await expect(recordFact.execute({ statement: "A fact", confidence: 1 }, context))
      .rejects.toThrow("requires engineeringWorkId");
    expect(mocks.provenance).not.toHaveBeenCalled();
  });

  it("does not search unrelated owner Knowledge in a selected Work turn", async () => {
    await expect(searchKnowledge.execute({ query: "fact", limit: 25 }, context))
      .rejects.toThrow("requires engineeringWorkId");
  });
});
