import assert from "node:assert/strict";
import { it } from "node:test";
import { managedHealthUrl } from "./health";

it("limits health probes to HTTPS Vercel hosts with no redirected path or query", () => {
  assert.equal(managedHealthUrl("https://myeve-beta-example.vercel.app").href,
    "https://myeve-beta-example.vercel.app/eve/v1/health");
  for (const url of [
    "http://myeve-beta-example.vercel.app",
    "https://myeve-beta-example.vercel.app.evil.test",
    "https://myeve-beta-example.vercel.app/other",
    "https://myeve-beta-example.vercel.app/?token=secret",
  ]) assert.throws(() => managedHealthUrl(url));
});
