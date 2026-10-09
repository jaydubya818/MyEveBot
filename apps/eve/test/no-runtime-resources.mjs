// Qualification preload: build/boot may fetch fonts but cannot call runtime providers.
import { appendFileSync } from "node:fs";
const original = globalThis.fetch;
globalThis.fetch = async function(input, init) {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (process.env.MYEVE_QUALIFICATION_EMPTY_DATABASE === "1" && url.hostname.endsWith(".invalid")) {
    const body = JSON.parse(init?.body ?? "{}");
    if (!/^\s*SELECT\b/i.test(body.query ?? "")) throw new Error("The readiness fixture permits only SELECT queries.");
    return Response.json({ fields: [], rows: [], rowCount: 0, command: "SELECT", rowAsArray: true });
  }
  if (/(^|\.)(vercel\.com|neon\.tech|orgo\.ai)$/.test(url.hostname)) {
    if (process.env.MYEVE_RESOURCE_ATTEMPT_LOG) appendFileSync(process.env.MYEVE_RESOURCE_ATTEMPT_LOG, "blocked-provider-attempt\n");
    throw new Error("External runtime resources are forbidden during qualification.");
  }
  return original(input, init);
};
