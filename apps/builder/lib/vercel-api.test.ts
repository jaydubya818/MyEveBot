import assert from "node:assert/strict";
import { test } from "node:test";

import { connectStoreToProject, createBlobStore, createDeployment, upsertEnv } from "./vercel-api";

test("a source bundle above Vercel's request cap uploads files by digest", async (context) => {
  const uploaded: string[] = [];
  let deploymentBytes = 0;
  context.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/v2/files")) {
      uploaded.push(String((init?.headers as Record<string, string>)["x-vercel-digest"]));
      return Response.json({});
    }
    assert.match(url, /\/v13\/deployments/);
    deploymentBytes = Buffer.byteLength(String(init?.body));
    const body = JSON.parse(String(init?.body)) as { files: { sha?: string; size?: number }[] };
    assert.equal(body.files.filter((file) => file.sha && file.size).length, uploaded.length);
    return Response.json({ id: "dpl_test", url: "test.vercel.app", target: "production" });
  });
  const contents = Buffer.alloc(3_000_000, "a").toString("base64");
  const files = ["a.txt", "b.txt", "c.txt"].map((file) => ({ file, data: contents, encoding: "base64" as const }));
  const result = await createDeployment("test-token", "team_test", "test-project", files);
  assert.equal(result.id, "dpl_test");
  assert.ok(uploaded.length >= 1);
  assert.ok(deploymentBytes < 10_000_000);
});

// The Files/skills runtime uses authenticated private Blob reads. A public
// store both breaks those writes and gives uploaded private data public URLs.
test("new owner storage is private", async (context) => {
  context.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    assert.match(String(input), /\/v1\/storage\/stores\/blob/);
    assert.equal(init?.method, "POST");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.access, "private");
    assert.equal(body.name, "isolated-owner-blob");
    return Response.json({store: {id: "store_private", access: "private"}});
  });
  assert.equal(await createBlobStore("test-token", "team_test", "isolated-owner-blob"), "store_private");
});

// Owner credentials must never reach Preview or Development deployments,
// where any branch build could read or write the owner's production data.
test("connected stores inject credentials into Production only", async (context) => {
  context.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    assert.match(String(input), /\/v1\/storage\/stores\/store_db\/connections/);
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body.envVarEnvironments, ["production"]);
    return Response.json({});
  });
  await connectStoreToProject("test-token", "team_test", "store_db", "prj_owner");
});

test("owner secrets are written to Production only", async (context) => {
  context.mock.method(globalThis, "fetch", async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { key: string; target: string[] }[];
    assert.equal(body.length, 2);
    for (const entry of body) assert.deepEqual(entry.target, ["production"]);
    return Response.json({});
  });
  await upsertEnv("test-token", "team_test", "prj_owner", [
    { key: "DATABASE_URL", value: "postgres://example.invalid/db" },
    { key: "MYEVE_SESSION_SECRET", value: "test-only" },
  ]);
});
