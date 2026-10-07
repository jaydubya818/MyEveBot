import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALLOWED_FAMILIES,
  DENIED_FAMILIES,
  allowedDestinationHrefs,
  classifyExternalAlphaRoute,
  externalAlphaCapabilityAllowlist,
  externalAlphaEnabledFeatures,
  externalAlphaIngress,
  externalAlphaMemoryApproved,
  externalAlphaMemoryCapabilities,
  externalAlphaRouteRules,
  type Family,
} from "./features.ts";
import { CAPABILITY_DEFINITIONS, getAvailableCapabilities, getCapabilities, getCapability } from "../capability-registry.ts";
import { getCapabilityStatuses } from "../capabilities.ts";
import { productDestinations } from "../../components/owner/destinations.ts";

const root = join(import.meta.dirname, "..", "..");
const installation = (extra: Record<string, string> = {}) =>
  ({ EVE_PROJECT_NAME: "myeve-alpha-tester-1", ...extra }) as unknown as NodeJS.ProcessEnv;
const memoryOn = installation({ MYEVE_EXTERNAL_ALPHA_MEMORY_BACKEND: "local-postgres" });

/** Every route handler and page under app/, as the URL pattern Next.js serves. */
function discover() {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/^(route|page)\.(ts|tsx|js|jsx|mjs)$/.test(name)) {
        const segments = relative(join(root, "app"), dir)
          .split(sep)
          .filter((s) => s && !/^\(.*\)$/.test(s));
        out.push("/" + segments.join("/"));
      }
    }
  };
  walk(join(root, "app"));
  return [...new Set(out)].sort();
}
const concrete = (pattern: string) => pattern.replace(/\[\.\.\.[^\]]+\]/g, "x/y").replace(/\[[^\]]+\]/g, "abc");
const rulesByFamily = (family: Family) => externalAlphaRouteRules.filter((r) => r.family === family);

describe("external-alpha route allowlist (default-deny)", () => {
  it("classifies every app/ route handler and page, and no rule is stale", () => {
    const found = discover();
    const classified = new Set(externalAlphaRouteRules.map((r) => r.pattern));
    expect(found.filter((p) => !classified.has(p)), "unclassified routes: add each to lib/external-alpha/features.ts").toEqual([]);
    expect([...classified].filter((p) => !found.includes(p)), "rules for routes that no longer exist").toEqual([]);
  });

  it("denies every route of every denied family, for every method", () => {
    for (const family of DENIED_FAMILIES) {
      for (const rule of rulesByFamily(family))
        for (const method of ["GET", "POST", "PUT", "DELETE", "PATCH"])
          expect(classifyExternalAlphaRoute(concrete(rule.pattern), method, memoryOn).allowed, `${method} ${rule.pattern} (${family})`).toBe(false);
    }
  });

  it("allows the allowed families with their declared methods only", () => {
    for (const family of ALLOWED_FAMILIES) {
      if (family === "MEMORY") continue;
      for (const rule of rulesByFamily(family)) {
        const path = concrete(rule.pattern);
        const permitted = rule.methods ?? (path.startsWith("/api/") ? ["GET", "POST", "PUT", "PATCH", "DELETE"] : ["GET", "HEAD"]);
        for (const method of permitted) expect(classifyExternalAlphaRoute(path, method, installation()).allowed, `${method} ${rule.pattern}`).toBe(true);
        for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"].filter((m) => !permitted.includes(m)))
          expect(classifyExternalAlphaRoute(path, method, installation()).allowed, `${method} ${rule.pattern}`).toBe(false);
      }
    }
  });

  it("names each required allowed family and each required denied family", () => {
    expect([...ALLOWED_FAMILIES].sort()).toEqual(
      ["CHAT", "CORE", "FILES", "LIVE_AGENT_CARDS", "MEMORY", "OWNER_CLOUD_WORK", "PERSISTENT_AGENTS", "RELAY_LINK", "RESULT_PROOF", "TODAY_WORK"].sort(),
    );
    for (const required of ["PUBLICATION", "MERGE_DEPLOY", "AUTO_REPAIR", "OWNER_COMPUTER", "EMAIL_CONNECTED_APPS", "ROOMS", "ROUTINES", "MESSAGING", "COMPUTER", "FEDERATION"])
      expect(DENIED_FAMILIES).toContain(required);
  });

  it.each([
    ["publication / generated PR decisions", "/api/beta/owner-decision", "POST"],
    ["owner publication page", "/work/123/decision", "GET"],
    ["owner computer worker", "/api/local-computer/worker", "POST"],
    ["email", "/api/email/send", "POST"],
    ["connected apps", "/api/connections", "GET"],
    ["agent card connect", "/api/agentcard/connect/start", "POST"],
    ["rooms", "/api/collaboration", "POST"],
    ["capsules", "/api/capsules", "GET"],
    ["routines", "/api/routines", "POST"],
    ["routine run", "/api/routines/r1/run", "POST"],
    ["automations", "/api/automations", "POST"],
    ["slack", "/api/slack", "POST"],
    ["phone", "/api/phone", "POST"],
    ["imessage", "/api/imessage/send", "POST"],
    ["voice", "/api/voice/token", "POST"],
    ["push", "/api/push", "POST"],
    ["computer", "/api/computer-sessions", "POST"],
    ["browser computer websocket", "/api/computer/ws", "GET"],
    ["unrestricted federation", "/api/relay/owner-execution", "POST"],
    ["peer permissions", "/api/relay/peer-permissions", "POST"],
    ["canary queue", "/api/beta/factory", "POST"],
    ["production canary", "/api/production-canary", "POST"],
    ["business ask", "/api/business/ask", "POST"],
    ["public share link", "/api/shared/tok/content", "GET"],
    ["owner data export", "/api/owner-data", "GET"],
    ["agent channel webhook", "/eve/v1/channels/slack", "POST"],
    ["agent hook", "/eve/v1/hooks/anything", "POST"],
    ["agent schedule", "/eve/v1/schedules/anything", "POST"],
  ])("denies %s", (_name, path, method) => {
    expect(classifyExternalAlphaRoute(path, method, memoryOn).allowed).toBe(false);
    expect(externalAlphaIngress(path, method, memoryOn)?.allowed).toBe(false);
  });

  it.each([
    ["/", "GET"], ["/chat", "GET"], ["/sofie", "GET"], ["/today", "GET"], ["/needs-you", "GET"], ["/inbox", "GET"], ["/work", "GET"],
    ["/work/new", "GET"], ["/team", "GET"], ["/results", "GET"], ["/workspace", "GET"], ["/api/threads", "POST"], ["/api/agents", "GET"],
    ["/api/agents/a1/home", "GET"], ["/api/work-inbox", "GET"], ["/api/beta/results", "GET"], ["/api/files", "GET"], ["/api/relay", "GET"],
    ["/api/relay", "POST"], ["/eve/v1/session", "POST"], ["/eve/v1/info", "GET"], ["/_next/static/chunks/a.js", "GET"], ["/login", "GET"],
  ])("allows %s %s", (path, method) => {
    expect(classifyExternalAlphaRoute(path, method, installation()).allowed).toBe(true);
  });

  it("denies anything unclassified, traversal, encoded separators and lookalikes", () => {
    for (const path of [
      "/api/brand-new-route", "/new-page", "/api", "/api/", "/eve/v1/anything", "/eve/v1/session/../hooks/x", "/api/threads/../email",
      "/api/threads/%2e%2e/email", "/api%2femail", "//api/email", "/api/threads//x", "/chat/extra/segments", "/today.json", "/_next/data/x.json",
      "/api/files/../../etc", "/.env", "/robots.txt",
    ])
      expect(classifyExternalAlphaRoute(path, "GET", memoryOn), path).toMatchObject({ allowed: false });
    expect(classifyExternalAlphaRoute("/api/threads", "OPTIONS", installation()).allowed).toBe(true); // handler decides; not a bypass of a denied family
    expect(classifyExternalAlphaRoute("/api/agentcard", "OPTIONS", installation()).allowed).toBe(false);
  });

  it("applies only to installations and never to other deployments", () => {
    expect(externalAlphaIngress("/api/email/send", "POST", { EVE_PROJECT_NAME: "myeve-canary" } as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(externalAlphaIngress("/api/email/send", "POST", {} as unknown as NodeJS.ProcessEnv)).toBeNull();
    // A malformed tester name is still an installation (typo cannot degrade to a full deployment).
    expect(externalAlphaIngress("/api/email/send", "POST", { EVE_PROJECT_NAME: "myeve-alpha-tester-9" } as unknown as NodeJS.ProcessEnv)?.allowed).toBe(false);
    expect(externalAlphaIngress("/api/email/send", "POST", { MYEVE_EXTERNAL_ALPHA_POLICY: "{}" } as unknown as NodeJS.ProcessEnv)?.allowed).toBe(false);
  });
});

describe("Memory is OFF unless an owner-approved third-party-free backend is configured", () => {
  const memoryRoutes = ["/api/memories", "/api/beta/memory", "/api/owner-knowledge", "/memory"];
  it("denies Memory routes by default, whatever EVE_ENABLED_FEATURES says", () => {
    for (const env of [installation(), installation({ EVE_ENABLED_FEATURES: "memory" }), installation({ SUPERMEMORY_API_KEY: "x", EVE_ENABLED_FEATURES: "memory" }), installation({ MYEVE_EXTERNAL_ALPHA_MEMORY_BACKEND: "supermemory" })]) {
      expect(externalAlphaMemoryApproved(env)).toBe(false);
      for (const path of memoryRoutes) expect(classifyExternalAlphaRoute(path, "GET", env).allowed, path).toBe(false);
    }
  });
  it("allows Memory routes only with the explicit local-postgres flag", () => {
    expect(externalAlphaMemoryApproved(memoryOn)).toBe(true);
    for (const path of memoryRoutes) expect(classifyExternalAlphaRoute(path, "GET", memoryOn).allowed, path).toBe(true);
  });
  it("gates the Memory tools and the third-party client by the same flag", () => {
    const off = getAvailableCapabilities({}, installation({ SUPERMEMORY_API_KEY: "x" })).map((c) => c.id);
    const on = getAvailableCapabilities({}, memoryOn).map((c) => c.id);
    for (const id of externalAlphaMemoryCapabilities) {
      expect(off).not.toContain(id);
      expect(on).toContain(id);
    }
    expect(getCapabilityStatuses(installation()).find((c) => c.id === "memory")?.state).toBe("excluded");
    expect(getCapabilityStatuses(memoryOn).find((c) => c.id === "memory")?.state).not.toBe("excluded");
  });
});

describe("EVE_ENABLED_FEATURES fails closed for installations", () => {
  it("an unset or empty list never means all features", () => {
    for (const raw of [undefined, "", "   "]) {
      const env = installation(raw === undefined ? {} : { EVE_ENABLED_FEATURES: raw });
      expect([...externalAlphaEnabledFeatures(env)]).toEqual([]);
      const statuses = getCapabilityStatuses(env);
      expect(statuses.filter((s) => s.id !== "appearance" && s.state !== "excluded").map((s) => s.id), "capabilities enabled by an unset list").toEqual([]);
    }
  });
  it("a declared list can narrow but never widen", () => {
    const wide = installation({ EVE_ENABLED_FEATURES: "memory,proactive,receipts,skills,file-sharing,integrations,browser,utilities,goals,knowledge" });
    expect([...externalAlphaEnabledFeatures(wide)]).toEqual([]);
    expect([...externalAlphaEnabledFeatures(installation({ MYEVE_EXTERNAL_ALPHA_MEMORY_BACKEND: "local-postgres", EVE_ENABLED_FEATURES: "memory,browser" }))]).toEqual(["memory"]);
    expect([...externalAlphaEnabledFeatures(installation({ MYEVE_EXTERNAL_ALPHA_MEMORY_BACKEND: "local-postgres", EVE_ENABLED_FEATURES: "browser" }))]).toEqual([]);
  });
  it("leaves every non-installation deployment as it was (unset = all)", () => {
    const statuses = getCapabilityStatuses({} as unknown as NodeJS.ProcessEnv);
    expect(statuses.some((s) => s.state !== "excluded")).toBe(true);
  });
});

describe("tools and integrations are an explicit allowlist", () => {
  it("only allowlisted capability ids are ever available to an installation, even with every credential configured", () => {
    const rich = installation({
      SUPERMEMORY_API_KEY: "x", COMPOSIO_API_KEY: "x", SLACK_BOT_TOKEN: "x", AGENTMAIL_API_KEY: "x", DATABASE_URL: "postgres://x",
      EVE_ENABLED_FEATURES: "memory,proactive,receipts,skills,file-sharing,integrations,browser,utilities,goals,knowledge",
    });
    const available = getAvailableCapabilities({}, rich).map((c) => c.id);
    const allowed = new Set([...externalAlphaCapabilityAllowlist]);
    expect(available.filter((id) => !allowed.has(id))).toEqual([]);
    const denied = getCapabilities({}, rich).filter((c) => !allowed.has(c.id) && !externalAlphaMemoryCapabilities.has(c.id));
    expect(denied.length).toBeGreaterThan(100);
    expect(denied.every((c) => c.availability.status === "disabled" && c.availability.reason === "Not part of the external alpha.")).toBe(true);
  });
  it("every allowlisted id exists in the registry (no dead entries)", () => {
    const ids = new Set(CAPABILITY_DEFINITIONS.map((c) => c.id));
    for (const id of [...externalAlphaCapabilityAllowlist, ...externalAlphaMemoryCapabilities]) expect(ids.has(id), id).toBe(true);
  });
  it.each([
    "tool.composio", "tool.send_email", "tool.browser", "tool.slack", "tool.publish", "tool.engineering_direct", "tool.computer",
  ])("does not expose %s", (id) => {
    const found = getCapability(id, installation({ COMPOSIO_API_KEY: "x" }));
    if (found) expect(found.availability.status).not.toBe("available");
  });
  it("leaves a non-installation registry untouched", () => {
    const other = { EVE_PROJECT_NAME: "myeve-canary" } as unknown as NodeJS.ProcessEnv;
    expect(getCapabilities({}, other).some((c) => c.availability.reason === "Not part of the external alpha.")).toBe(false);
  });
});

describe("navigation never links a denied surface", () => {
  it("links only allowlisted destinations, and Memory only when approved", () => {
    const hrefs = allowedDestinationHrefs(productDestinations, installation())!;
    for (const forbidden of ["/business", "/knowledge", "/capsules", "/rooms", "/apps", "/computer", "/brief", "/weekly", "/manage", "/memory"])
      expect(hrefs, forbidden).not.toContain(forbidden);
    for (const required of ["/today", "/chat", "/work", "/inbox", "/needs-you", "/workspace", "/results", "/team", "/privacy", "/search"])
      expect(hrefs, required).toContain(required);
    expect(allowedDestinationHrefs(productDestinations, memoryOn)).toContain("/memory");
    expect(allowedDestinationHrefs(productDestinations, {} as unknown as NodeJS.ProcessEnv)).toBeNull();
  });
  it("every linked href is actually served (no dead links)", () => {
    for (const href of allowedDestinationHrefs(productDestinations, installation())!)
      expect(classifyExternalAlphaRoute(href, "GET", installation()).allowed, href).toBe(true);
  });
});
