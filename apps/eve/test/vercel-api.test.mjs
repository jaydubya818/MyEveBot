import assert from "node:assert/strict";
import test from "node:test";

import {
  assertRequiredProjectEnvKeys,
  createDeployment,
  VercelApiError,
} from "../../builder/lib/vercel-api.ts";

test("builder forces a fresh production deployment", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  let requestUrl;
  let requestBody;
  globalThis.fetch = async (url, init) => {
    requestUrl = new URL(String(url));
    requestBody = JSON.parse(String(init.body));
    return Response.json({
      id: "dpl_production",
      url: "agent.example.vercel.app",
      readyState: "QUEUED",
      target: "production",
    });
  };

  await createDeployment("token", null, "agent", []);

  assert.equal(requestUrl.pathname, "/v13/deployments");
  assert.equal(requestUrl.searchParams.get("forceNew"), "1");
  assert.equal(requestBody.target, "production");
});

test("builder rejects a preview deployment returned for a production request", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async () =>
    Response.json({
      id: "dpl_preview",
      url: "agent-preview.example.vercel.app",
      readyState: "QUEUED",
      target: null,
    });

  await assert.rejects(
    createDeployment("token", null, "agent", []),
    (error) =>
      error instanceof VercelApiError &&
      error.stage === "deploy" &&
      /preview deployment instead of Production/.test(error.message),
  );
});

test("builder stops before build when Vercel drops required environment variables", () => {
  assert.throws(
    () => assertRequiredProjectEnvKeys(["DATABASE_URL"], ["DATABASE_URL", "SUPERMEMORY_API_KEY"]),
    (error) =>
      error instanceof VercelApiError &&
      error.stage === "env" &&
      /SUPERMEMORY_API_KEY/.test(error.message),
  );
});
