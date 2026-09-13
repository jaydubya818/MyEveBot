import assert from "node:assert/strict";
import test from "node:test";

import { apiError, requireDatabase } from "../lib/api-errors.ts";

test("structured API errors preserve a bounded request id", async () => {
  const response = apiError(
    new Request("https://sofie.example/api/test", {
      headers: { "x-request-id": "request-from-edge" },
    }),
    503,
    "service_unavailable",
    "Service is unavailable.",
  );

  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    error: {
      code: "service_unavailable",
      message: "Service is unavailable.",
      requestId: "request-from-edge",
    },
  });
});

test("database guard returns setup required instead of throwing", async () => {
  const previous = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    const response = requireDatabase(new Request("https://sofie.example/api/threads"));
    assert.equal(response?.status, 503);
    const body = await response?.json();
    assert.equal(body.error.code, "database_not_configured");
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
});
