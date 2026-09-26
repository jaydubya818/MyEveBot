import assert from "node:assert/strict";
import { test } from "node:test";

import { createDeployment } from "./vercel-api";

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
    assert.equal(body.files.filter((file) => file.sha && file.size).length, 3);
    assert.equal(new Set(body.files.map((file) => file.sha)).size, uploaded.length);
    return Response.json({ id: "dpl_test", url: "test.vercel.app", target: "production" });
  });
  const contents = Buffer.alloc(3_000_000, "a").toString("base64");
  const files = ["a.txt", "b.txt", "c.txt"].map((file) => ({ file, data: contents, encoding: "base64" as const }));
  const result = await createDeployment("test-token", "team_test", "test-project", files);
  assert.equal(result.id, "dpl_test");
  assert.ok(uploaded.length >= 1);
  assert.ok(deploymentBytes < 10_000_000);
});
