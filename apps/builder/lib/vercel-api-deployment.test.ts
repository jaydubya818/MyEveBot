import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { it } from "node:test";
import { createDeployment } from "./vercel-api";

it("uploads a large file and sends a small content-addressed deployment request", async () => {
  const originalFetch = globalThis.fetch;
  const contents = Buffer.alloc(8 * 1024 * 1024, 42);
  const sha = createHash("sha1").update(contents).digest("hex");
  const calls: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push(url.pathname);
    if (url.pathname === "/v2/files") {
      assert.equal(init?.headers && new Headers(init.headers).get("x-vercel-digest"), sha);
      assert.deepEqual(Buffer.from(init?.body as Uint8Array), contents);
      return Response.json({});
    }
    if (url.pathname === "/v13/deployments") {
      const body = JSON.parse(String(init?.body));
      assert.ok(Buffer.byteLength(String(init?.body)) < 1024);
      assert.deepEqual(body.files, [{ file: "large.bin", sha, size: contents.length }]);
      return Response.json({ id: "dpl_disposable", url: "disposable.vercel.app", target: "production", readyState: "QUEUED" });
    }
    throw new Error(`Unexpected API: ${url.pathname}`);
  };
  try {
    const result = await createDeployment("disposable-token", null, "disposable-project", [
      { file: "large.bin", data: contents.toString("base64"), encoding: "base64" },
    ]);
    assert.equal(result.id, "dpl_disposable");
    assert.deepEqual(calls, ["/v2/files", "/v13/deployments"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
