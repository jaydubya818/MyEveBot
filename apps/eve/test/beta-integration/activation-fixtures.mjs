import {betaTestPort} from './test-postgres.mjs';
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { fork } from "node:child_process";
import { once } from "node:events";
import { Pool } from "pg";
import { createWebSessionToken } from "../../lib/web-auth.ts";
import {
  BetaIntegration,
  betaIntegration,
  betaRequest,
} from "../../lib/beta-integration/runtime.ts";
import { CanonicalBetaWork } from "../../lib/beta-integration/canonical-work.ts";
import { engineeringConversationModel } from "../../lib/engineering/conversation-model.ts";
import {
  NativeRouteAuthority,
  nativeProfileHash,
  NATIVE_PROVIDER,
} from "../../lib/engineering/native-routing.ts";
import { runtimeSchema } from "../../lib/engineering/runtime.ts";
import { manifestForSnapshot } from "../../lib/engineering/base-preflight.ts";
import { digest, profileSchema } from "../../lib/engineering/contract.ts";
import { EngineeringKnowledgeStore } from "../../lib/engineering/knowledge.ts";
import { DirectDevelopmentStore } from "../../lib/engineering/direct-development.ts";
import { DirectVerificationDriver } from "../../lib/engineering/direct-verification-driver.ts";
import { NativeResultStore } from "../../lib/engineering/native-results.ts";
import { LearningRuntime } from "../../lib/total-recall/runtime.ts";
import { LearningStore } from "../../lib/total-recall/store.ts";
process.env.MYEVE_WORK_RECALL_ENABLED = "true";
const pool = new Pool({
  host: "127.0.0.1",
  port: betaTestPort,
  user: "postgres",
  database: "myeve_beta_phase2",
  max: 12,
});
const beta = new BetaIntegration(pool, {
  repository: "qualification/design-partner",
  maxCostUsd: 10,
  maxDurationSeconds: 3600,
});
Object.assign(process.env, {
  MYEVE_BETA_MODE: "qualification",
  MYEVE_BETA_DATABASE_URL:
    `postgresql://postgres@127.0.0.1:${betaTestPort}/myeve_beta_phase2`,
  MYEVE_ACCESS_PASSWORD: "local-activation-browser-only",
  MYEVE_SESSION_SECRET:
    "local-activation-browser-secret-qualification-only-2026",
  MYEVE_ENGINEERING_MODE: "dogfood",
  MYEVE_ENGINEERING_CONFIG: "/tmp/myeve-beta-activation-config.json",
});
async function request(owner, resource, body, expected = 200) {
  process.env.MYEVE_OWNER_ID = owner;
  const response = await betaRequest(
    new Request("http://localhost/api/beta/" + resource, {
      method: body ? "POST" : "GET",
      headers: {
        origin: "http://localhost",
        cookie: "myeve_session=" + createWebSessionToken(),
        "content-type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
    resource.split("?")[0],
  );
  const data = await response.json();
  assert.equal(response.status, expected, JSON.stringify(data));
  return data;
}
async function command(owner, work, operation, responseId, expected = 200) {
  return request(
    owner,
    "work",
    {
      operation,
      workId: work.id,
      expectedVersion: work.version,
      expectedGeneration: work.generation,
      ...(responseId ? { responseId } : {}),
    },
    expected,
  );
}
const source = {
  sha: "db5d95cf3d1dadf04a118f38bd5b388a5a226c31",
  files: {
    "README.md": "Controlled local qualification. No live verification.\n",
    ".github/workflows/quantity-ci.yml": "name: quantity-ci\n",
    ".gitignore": "node_modules\n",
    "package.json": '{"scripts":{"test":"node --test"}}\n',
    "test/quantity.test.mjs": "import test from 'node:test';\n",
  },
};
async function context(owner, work, config, session = "context") {
  let prompt,
    schema,
    calls = 0;
  const model = engineeringConversationModel(
    {
      store: beta.store(owner),
      workId: work.id,
      sessionId: session,
      stepKey: session + ":turn:0",
      modelId: "anthropic/claude-sonnet-5",
      productive: true,
    },
    {
      authority: new NativeRouteAuthority(
        beta.store(owner),
        async () => config,
      ),
      catalog: async () => ({
        models: [
          {
            id: "anthropic/claude-sonnet-5",
            pricing: { input: "0.000002", output: "0.00001" },
          },
        ],
      }),
      model: () => ({
        doGenerate: async (options) => {
          calls++;
          prompt = JSON.stringify(options.prompt);
          schema = JSON.stringify(options.tools);
          return {
            content: [
              {
                type: "text",
                text: "Controlled provider: current evidence inspected; admission is separate.",
              },
            ],
            usage: { inputTokens: { total: 100 }, outputTokens: { total: 20 } },
            finishReason: { unified: "stop", raw: "stop" },
            warnings: [],
            providerMetadata: {
              gateway: { cost: "0.003", requestId: "CONTROLLED-LOCAL-FIXTURE" },
            },
          };
        },
      }),
    },
  );
  await model.doGenerate({
    prompt: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Inspect the selected Work and its launch deadline.",
          },
        ],
      },
    ],
    tools: [
      {
        type: "function",
        name: "engineering_direct",
        inputSchema: { type: "object" },
      },
    ],
  });
  assert.equal(calls, 1);
  assert(!schema.includes('"write"'));
  assert(schema.includes("admit"));
  return prompt;
}
function configuration(owner, agentId, work) {
  const profile = profileSchema.parse({
    id: "beta-controlled-context",
    version: 1,
    repository: work.repository,
    privateQualification: true,
    baseBranch: "main",
    allowedPaths: ["quantity.mjs"],
    checks: [
      {
        id: "positive",
        program: "quantity.mjs",
        input: "1\n",
        expectedOutput: "1\n",
        expectedExitCode: 0,
        criterionIds: work.criteria.map((c) => c.id),
      },
    ],
    requiredCI: ["quantity-ci"],
    reviewerLogins: ["jaydubya818"],
    policyVersion: 1,
    executor: "claude-code",
    image: `node@sha256:${"b".repeat(64)}`,
    maxRuns: 3,
    maxModelRequests: 10,
    maxOutputTokens: 1024,
  });
  const config = runtimeSchema.parse({
    mode: "isolated-dogfood",
    ownerId: owner,
    agentId,
    objective: work.objective,
    criteria: work.criteria,
    profile,
    approvedBase: manifestForSnapshot(source),
    brokerPort: 55470,
    model: "claude-sonnet-5",
  });
  config.nativeQualification = {
    provider: NATIVE_PROVIDER,
    modelId: "anthropic/claude-sonnet-5",
    scopeId: owner,
    profileHash: nativeProfileHash(config),
    evidenceRef: "CONTROLLED-LOCAL-FIXTURE-NOT-LIVE",
    qualifiedAt: new Date(Date.now() - 1000).toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  };
  return config;
}

export { pool, beta, source, context, configuration, request, command };
