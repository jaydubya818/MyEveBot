import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { selectedEngineeringWorkId } from "./engineering-work-binding.ts";

const ownerId = "owner-jay";
const threadId = "thread-1";
const firstWork = "11111111-1111-4111-8111-111111111111";
const secondWork = "22222222-2222-4222-8222-222222222222";

function principal(workId?: string) {
  return { authenticator: "myeve-web-session", principalType: "user", principalId: ownerId,
    attributes: { owner: "true", webThreadId: threadId, ...(workId ? { myeveEngineeringWorkId: workId } : {}) } };
}

function binding(currentWorkId?: string, initiatingWorkId?: string) {
  return { ownerId, threadId, agent: { ownerId, isPrimary: true }, roleId: null, channelKind: "http", mode: "conversation",
    auth: { current: principal(currentWorkId), initiator: principal(initiatingWorkId) } };
}

beforeEach(() => vi.stubEnv("MYEVE_ENGINEERING_MODE", "dogfood"));
afterEach(() => vi.unstubAllEnvs());

describe("selected Engineering Work context", () => {
  it("uses only the authenticated current turn and clears when its header is omitted", () => {
    expect(selectedEngineeringWorkId(binding(firstWork, firstWork))).toBe(firstWork);
    expect(selectedEngineeringWorkId(binding(secondWork, firstWork))).toBe(secondWork);
    expect(selectedEngineeringWorkId(binding(undefined, firstWork))).toBeNull();
  });

  it("rejects other Agents, Roles, child runs, channels and mismatched owner or thread bindings", () => {
    const cases = [
      { ...binding(firstWork), agent: { ownerId, isPrimary: false } },
      { ...binding(firstWork), roleId: "role-researcher" },
      { ...binding(firstWork), channelKind: "subagent" },
      { ...binding(firstWork), mode: "task" },
      { ...binding(firstWork), auth: { current: { ...principal(firstWork), authenticator: "myeve-routine" }, initiator: principal() } },
      { ...binding(firstWork), auth: { current: { ...principal(firstWork), authenticator: "myeve-owner-channel" }, initiator: principal() } },
      { ...binding(firstWork), auth: { current: principal(firstWork), initiator: { ...principal(), principalId: "other-owner" } } },
      { ...binding(firstWork), auth: { current: { ...principal(firstWork), attributes: { ...principal(firstWork).attributes, webThreadId: "other-thread" } }, initiator: principal() } },
      { ...binding(firstWork), auth: { current: principal(firstWork), initiator: { ...principal(), attributes: { ...principal().attributes, webThreadId: "other-thread" } } } },
      { ...binding(firstWork), threadId: null },
    ];
    for (const value of cases) expect(() => selectedEngineeringWorkId(value)).toThrow(/direct primary Agent web chat/);
  });

  it("fails closed on an invalid current claim or disabled feature", () => {
    expect(() => selectedEngineeringWorkId(binding("not-a-uuid"))).toThrow(/id is invalid/);
    vi.stubEnv("MYEVE_ENGINEERING_MODE", "off");
    expect(() => selectedEngineeringWorkId(binding(firstWork))).toThrow(/direct primary Agent web chat/);
    expect(selectedEngineeringWorkId(binding())).toBeNull();
  });
});
