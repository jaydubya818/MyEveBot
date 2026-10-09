import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { browserDomainsForUrl } from "../lib/computer-types.ts";
import { browserDomainsForToolInput } from "../agent/tools/persistent-agent-policy.ts";

test("browser URLs derive a bounded apex and subdomain allowlist", () => {
  assert.deepEqual(browserDomainsForUrl("https://www.Example.com/docs?q=1"), [
    "example.com",
    "*.example.com",
  ]);
  assert.deepEqual(browserDomainsForUrl("https://news.example.com/"), [
    "news.example.com",
    "*.news.example.com",
  ]);
  for (const value of ["file:///etc/passwd", "https://user:secret@example.com", "http://127.0.0.1"]) {
    assert.throws(() => browserDomainsForUrl(value));
  }
});

test("only URL-based browser entry points expand network access", () => {
  assert.deepEqual(browserDomainsForToolInput("browser__navigate", {
    action: "goto",
    url: "https://example.com",
  }), ["example.com", "*.example.com"]);
  assert.deepEqual(browserDomainsForToolInput("browser__read", { url: "https://docs.example.com" }), [
    "docs.example.com",
    "*.docs.example.com",
  ]);
  assert.deepEqual(browserDomainsForToolInput("browser__navigate", { action: "reload" }), []);
  assert.deepEqual(browserDomainsForToolInput("browser__click", { selector: "@e1" }), []);
});

test("authorized browser tools provision on demand instead of advertising disabled stubs", async () => {
  const [policy, instructions, readiness] = await Promise.all([
    readFile(new URL("../agent/tools/persistent-agent-policy.ts", import.meta.url), "utf8"),
    readFile(new URL("../agent/instructions/computer-runtime.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/readiness.ts", import.meta.url), "utf8"),
  ]);
  assert.match(policy, /provisionComputerSession/);
  assert.match(policy, /starts automatically on the first URL-based call/);
  assert.doesNotMatch(policy, /Start a computer session before using browser tools/);
  assert.match(instructions, /Do not say browser access is disabled/);
  assert.match(instructions, /web_search/);
  assert.match(instructions, /persistent cloud desktop/);
  assert.match(instructions, /MUST call \\`stop_computer_session\\` before your final response/);
  assert.match(readiness, /Browser runtime/);
  assert.match(readiness, /@agent-browser\/eve\/tools/);
});
