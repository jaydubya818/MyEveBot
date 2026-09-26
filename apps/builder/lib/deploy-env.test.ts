import assert from "node:assert/strict";
import { test } from "node:test";

import { buildEnv } from "./deploy-env";
import type { AgentConfig } from "./config";

const config: AgentConfig = {
  agentName: "Test Eve", projectName: "test-eve", ownerName: "Tester", ownerTimezone: "UTC",
  accessPassword: "test-only-password", model: "anthropic/claude-sonnet-4",
  features: [], instructions: "Help the owner.", telegram: null, schedules: [],
  postgres: { mode: "create" }, blob: { mode: "create" }, keys: {},
};

test("managed deployment stamps its isolated owner identity while BYO keeps legacy default", () => {
  const stamps = { templateVersion: "test", templateRelease: 1, builderUrl: "https://builder.example" };
  const managed = buildEnv(config, { ...stamps, ownerId: "managed-owner-id" });
  const byo = buildEnv(config, stamps);
  assert.equal(managed.find(({ key }) => key === "MYEVE_OWNER_ID")?.value, "managed-owner-id");
  assert.equal(byo.find(({ key }) => key === "MYEVE_OWNER_ID")?.value, "owner");
  assert.notEqual(managed.find(({ key }) => key === "MYEVE_SESSION_SECRET")?.value,
    byo.find(({ key }) => key === "MYEVE_SESSION_SECRET")?.value);
});
