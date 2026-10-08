import { externalAlphaInstallation } from "./policy.ts";

/** Feature allowlist for an external-alpha installation. Everything not listed
 * here is DENIED server-side (proxy, capability registry, tool authority) and
 * absent from navigation. A new route, page or capability is denied until a
 * reviewer classifies it; features.test.ts enumerates the source tree and fails
 * when something is unclassified.
 *
 * The allowlist is closed: EVE_ENABLED_FEATURES can only narrow it. */

export const ALLOWED_FAMILIES = [
  "CORE", // sign-in, health, static assets, readiness
  "CHAT", // Sofie / Chat
  "PERSISTENT_AGENTS",
  "LIVE_AGENT_CARDS",
  "TODAY_WORK", // Today, Work Inbox, Needs You, approvals
  "OWNER_CLOUD_WORK", // bounded owner CLOUD Work (start/stop is a Sofie tool, never a web route)
  "RESULT_PROOF",
  "FILES",
  "RELAY_LINK", // owner-facing view/link only
] as const;
export const DENIED_FAMILIES = [
  "MEMORY", // release remains OFF; configuration cannot enable it
  "PUBLICATION", // publication, generated PRs, owner publication decisions
  "MERGE_DEPLOY",
  "AUTO_REPAIR",
  "OWNER_COMPUTER",
  "COMPUTER", // cloud computer sessions, browser automation
  "EMAIL_CONNECTED_APPS", // email, Composio, payment cards
  "ROOMS", // rooms, collaboration, capsules
  "ROUTINES", // routines, reminders, automations, webhooks, scheduled delivery
  "MESSAGING", // Slack, Telegram, phone, iMessage, voice, push
  "FEDERATION", // unrestricted Relay federation (peers, grants, artifacts, owner execution)
  "CANARY", // canary, validation and qualification surfaces
  "BUSINESS",
  "KNOWLEDGE_SKILLS", // knowledge graph, skills, learning, finance, decision intelligence
  "SHARING", // public share links
  "ADMIN", // advanced settings, owner data export, diagnostics
] as const;
export type AllowedFamily = (typeof ALLOWED_FAMILIES)[number];
export type DeniedFamily = (typeof DENIED_FAMILIES)[number];
export type Family = AllowedFamily | DeniedFamily;
const allowedSet: ReadonlySet<string> = new Set(ALLOWED_FAMILIES);

/** Memory remains OFF for this release, including the local backend. Legacy
 * configuration is not authorization to widen the qualified feature scope. */
export const EXTERNAL_ALPHA_MEMORY_BACKEND_ENV = "MYEVE_EXTERNAL_ALPHA_MEMORY_BACKEND";
export const EXTERNAL_ALPHA_MEMORY_APPROVED_VALUE = "local-postgres";
export function externalAlphaMemoryApproved(_env: NodeJS.ProcessEnv = process.env): boolean {
  return false;
}
export function externalAlphaFamilyAllowed(family: Family, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!allowedSet.has(family)) return false;
  if (family === "MEMORY") return externalAlphaMemoryApproved(env);
  return true;
}

interface Rule {
  family: Family;
  methods?: readonly string[];
}
const READ = ["GET", "HEAD"] as const;
const rules = new Map<string, Rule>();
function add(family: Family, paths: readonly string[], methods?: readonly string[]) {
  for (const path of paths) {
    if (rules.has(path)) throw Error("Duplicate external-alpha route rule: " + path);
    rules.set(path, { family, ...(methods ? { methods } : {}) });
  }
}

// ---- API routes (app/api/**/route.ts) -------------------------------------
add("CORE", ["/api/auth/login", "/api/auth/logout", "/api/auth/status", "/api/features", "/api/readiness", "/api/capabilities", "/api/update-check", "/api/commands"], undefined);
add("CHAT", ["/api/threads", "/api/threads/[id]", "/api/threads/search", "/api/chat-work", "/api/models"]);
add("PERSISTENT_AGENTS", ["/api/agents", "/api/agents/[id]", "/api/agents/[id]/[action]", "/api/agents/activity"]);
add("LIVE_AGENT_CARDS", ["/api/agents/[id]/home"], READ);
add("TODAY_WORK", [
  "/api/work-inbox", "/api/work-thread", "/api/responsibilities",
  "/api/beta/activity", "/api/beta/goals", "/api/beta/inbox", "/api/beta/work", "/api/beta/start",
  "/api/goals", "/api/goals/[id]", "/api/goals/focus", "/api/outcomes", "/api/outcomes/[id]",
  "/api/task-runs", "/api/task-runs/[id]", "/api/task-runs/[id]/artifacts/[artifactId]",
  "/api/actions", "/api/actions/[id]/recover", "/api/actions/[id]/resolve",
  "/api/approvals", "/api/approvals/[id]",
]);
add("RESULT_PROOF", ["/api/beta/results", "/api/beta/evidence"], READ);
add("FILES", [
  "/api/files", "/api/files/[id]/content", "/api/files/upload",
  "/api/artifacts", "/api/artifacts/[id]", "/api/artifacts/[id]/comments", "/api/artifacts/[id]/content",
  "/api/artifacts/[id]/draft", "/api/artifacts/[id]/restore", "/api/artifacts/[id]/versions", "/api/artifacts/upload",
]);
add("MEMORY", ["/api/memories", "/api/beta/memory", "/api/owner-knowledge"]);
// Relay: owner view and link only. The command guard in lib/relay/owner-api.ts
// narrows POST to the link/credential operations in relay-link.ts.
add("RELAY_LINK", ["/api/relay"], ["GET", "HEAD", "POST"]);

add("PUBLICATION", ["/api/beta/owner-decision"]);
add("CANARY", [
  "/api/beta/factory", "/api/beta/factory-installation",
  "/api/production-canary", "/api/production-canary/controller",
  "/api/production-validation", "/api/production-validation/controller",
  "/api/cloud-qualification/access", "/api/cloud-qualification/controller",
  "/api/relay/qualification-artifacts",
]);
add("FEDERATION", ["/api/relay/artifacts/[id]", "/api/relay/owner-execution", "/api/relay/peer-permissions"]);
add("EMAIL_CONNECTED_APPS", [
  "/api/agentcard", "/api/agentcard/connect/start", "/api/agentcard/connect/verify",
  "/api/connections", "/api/email", "/api/email/attachments/[messageId]/[attachmentId]",
  "/api/email/domain", "/api/email/key", "/api/email/send", "/api/email/threads/[id]",
]);
add("ROOMS", ["/api/collaboration", "/api/capsules"]);
add("ROUTINES", [
  "/api/automations", "/api/routines", "/api/routines/[id]/readiness", "/api/routines/[id]/run",
  "/api/review-schedule", "/api/reviews",
]);
add("MESSAGING", [
  "/api/channels", "/api/channels/search", "/api/imessage", "/api/imessage/attachment", "/api/imessage/pair",
  "/api/imessage/pair/verify", "/api/imessage/send", "/api/imessage/spectrum", "/api/imessage/transcript",
  "/api/imessage/typing", "/api/imessage/unpair", "/api/phone", "/api/slack", "/api/voice/token", "/api/push",
]);
add("OWNER_COMPUTER", ["/api/local-computer/worker"]);
add("COMPUTER", [
  "/api/computer", "/api/computer/ws", "/api/computer-profiles", "/api/computer-runtime", "/api/computer-sessions",
  "/api/computer-sessions/[id]", "/api/computer-sessions/[id]/actions",
  "/api/computer-sessions/[id]/artifacts/[artifactId]", "/api/computer-sessions/[id]/live-view",
  "/api/computer-sessions/[id]/owner-input",
]);
add("BUSINESS", ["/api/business", "/api/business/ask", "/api/business/files/[id]"]);
add("KNOWLEDGE_SKILLS", [
  "/api/beta/learning", "/api/knowledge", "/api/knowledge/[id]", "/api/knowledge/relationships", "/api/knowledge/sources",
  "/api/learning", "/api/skills", "/api/finance", "/api/decision-intelligence", "/api/videos/[file]",
]);
add("SHARING", ["/api/shared/[token]/content", "/api/artifacts/[id]/shares", "/api/artifacts/[id]/shares/[shareId]"]);
add("ADMIN", ["/api/control", "/api/operations", "/api/owner-data", "/api/beta/feedback"]);

// ---- Pages (app/**/page.tsx) ----------------------------------------------
add("CORE", ["/", "/login", "/privacy", "/welcome"]);
add("CHAT", ["/chat", "/sofie", "/search"]);
add("PERSISTENT_AGENTS", ["/agents", "/team"]);
add("TODAY_WORK", ["/today", "/needs-you", "/inbox", "/approvals", "/activity", "/work", "/work-canvas"]);
add("OWNER_CLOUD_WORK", ["/work/new"]);
add("RESULT_PROOF", ["/results"]);
add("FILES", ["/files", "/workspace", "/workspace/[id]"]);
add("MEMORY", ["/memory"]);
add("PUBLICATION", ["/work/[id]/decision"]);
add("EMAIL_CONNECTED_APPS", ["/email", "/apps"]);
add("ROOMS", ["/rooms", "/capsules"]);
add("ROUTINES", ["/brief", "/weekly", "/review"]);
add("MESSAGING", ["/channels", "/imessage"]);
add("COMPUTER", ["/computer"]);
add("BUSINESS", ["/business"]);
add("KNOWLEDGE_SKILLS", ["/goals", "/knowledge", "/knowledge-record", "/learning"]);
add("SHARING", ["/share/[token]"]);
add("ADMIN", ["/manage", "/manage/[section]", "/beta-preview", "/product-preview"]);

/** Static assets that carry no behaviour. */
const staticPatterns: readonly RegExp[] = [
  /^\/_next\/(?:static|image)(?:\/.*)?$/,
  /^\/(?:favicon\.ico|icon\.svg|sw\.js|sofie-night-clouds\.jpg)$/,
];
/** The mounted agent service. Chat sessions only: every channel webhook, hook
 * and schedule under /eve/v1 is denied. */
const eveAgentPatterns: readonly { re: RegExp; methods: readonly string[] }[] = [
  { re: /^\/eve\/v1\/(?:health|info)$/, methods: ["GET", "HEAD"] },
  { re: /^\/eve\/v1\/session(?:\/[^/]+)?(?:\/(?:stream|cancel|clear|reset))?$/, methods: ["GET", "HEAD", "POST"] },
];

export interface ExternalAlphaRouteRule {
  pattern: string;
  family: Family;
  methods?: readonly string[];
}
export const externalAlphaRouteRules: readonly ExternalAlphaRouteRule[] = [...rules].map(([pattern, rule]) => ({ pattern, ...rule }));

// Most specific first: fewer dynamic segments win, so a literal child such as
// /api/agents/[id]/home is never shadowed by /api/agents/[id]/[action].
const dynamic = (pattern: string) => pattern.split("/").filter((s) => s.startsWith("[")).length;
const compiled = [...externalAlphaRouteRules]
  .sort((a, b) => dynamic(a.pattern) - dynamic(b.pattern) || b.pattern.length - a.pattern.length)
  .map((rule) => ({
  rule,
  re: new RegExp(
    "^" +
      (rule.pattern === "/"
        ? "/"
        : rule.pattern
            .split("/")
            .map((segment) => (segment.startsWith("[") ? "[^/]+" : segment.replace(/[.*+?^${}()|\\]/g, "\\$&")))
            .join("/")) +
      "$",
  ),
}));

export type IngressVerdict =
  | { allowed: true; family: Family }
  | { allowed: false; family: Family | "UNCLASSIFIED"; reason: "FAMILY_DENIED" | "METHOD_DENIED" | "UNCLASSIFIED" };

/** Pure classification. Unknown paths are denied (default-deny). */
export function classifyExternalAlphaRoute(
  pathname: string,
  method: string,
  env: NodeJS.ProcessEnv = process.env,
): IngressVerdict {
  const verb = method.toUpperCase();
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  // Reject traversal and encoded separators before any pattern is consulted.
  if (path.includes("//") || /(?:^|\/)\.\.?(?:\/|$)/.test(path) || /%2f|%5c|%2e/i.test(path))
    return { allowed: false, family: "UNCLASSIFIED", reason: "UNCLASSIFIED" };
  if (staticPatterns.some((re) => re.test(path)))
    return READ.includes(verb as "GET") ? { allowed: true, family: "CORE" } : { allowed: false, family: "CORE", reason: "METHOD_DENIED" };
  for (const e of eveAgentPatterns)
    if (e.re.test(path))
      return e.methods.includes(verb) ? { allowed: true, family: "CHAT" } : { allowed: false, family: "CHAT", reason: "METHOD_DENIED" };
  for (const { rule, re } of compiled) {
    if (!re.test(path)) continue;
    if (!externalAlphaFamilyAllowed(rule.family, env)) return { allowed: false, family: rule.family, reason: "FAMILY_DENIED" };
    // API and page defaults: pages read; API routes use their handler's own methods.
    const methods = rule.methods ?? (path.startsWith("/api/") ? undefined : READ);
    if (methods && !methods.includes(verb)) return { allowed: false, family: rule.family, reason: "METHOD_DENIED" };
    return { allowed: true, family: rule.family };
  }
  return { allowed: false, family: "UNCLASSIFIED", reason: "UNCLASSIFIED" };
}

/** Used by the proxy. Non-installations are never affected. */
export function externalAlphaIngress(
  pathname: string,
  method: string,
  env: NodeJS.ProcessEnv = process.env,
): IngressVerdict | null {
  if (!externalAlphaInstallation(env)) return null;
  return classifyExternalAlphaRoute(pathname, method, env);
}

// ---- Navigation -------------------------------------------------------------
/** Only pages the installation may serve are linked from navigation. */
export function externalAlphaNavigable(href: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const path = href.split(/[?#]/)[0] || "/";
  const verdict = classifyExternalAlphaRoute(path, "GET", env);
  return verdict.allowed;
}
export function allowedDestinationHrefs<T extends { href: string }>(
  destinations: readonly T[],
  env: NodeJS.ProcessEnv = process.env,
): string[] | null {
  if (!externalAlphaInstallation(env)) return null;
  return destinations.filter((d) => externalAlphaNavigable(d.href, env)).map((d) => d.href);
}

// ---- Capability registry (tools and integrations) ---------------------------
/** Capability ids an external-alpha installation may expose. Everything else is
 * unavailable regardless of EVE_ENABLED_FEATURES or configured credentials. */
export const externalAlphaCapabilityAllowlist: ReadonlySet<string> = new Set([
  "channel.web", "database.neon", "storage.blob", "model.gateway",
  "files.read", "files.write", "tool.read_file", "tool.write_file",
  "tool.discover_capabilities", "tool.ask_question",
  "tool.list_agents", "tool.get_agent", "tool.manage_agent", "tool.persistent-agent-policy", "tool.list_roles",
  "tool.engineering_work", "tool.engineering_factory",
]);
export const externalAlphaMemoryCapabilities: ReadonlySet<string> = new Set([
  "memory.supermemory", "tool.remember", "tool.search_memory", "tool.list_memories", "tool.forget",
]);
export function externalAlphaCapabilityAllowed(id: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (externalAlphaCapabilityAllowlist.has(id)) return true;
  return externalAlphaMemoryCapabilities.has(id) && externalAlphaMemoryApproved(env);
}
/** Legacy feature flags an installation may carry. A declared EVE_ENABLED_FEATURES
 * can narrow this set, never widen it; an unset value means this set, never "all". */
export function externalAlphaEnabledFeatures(env: NodeJS.ProcessEnv = process.env): Set<string> {
  const allowed = new Set<string>(externalAlphaMemoryApproved(env) ? ["memory"] : []);
  const raw = env.EVE_ENABLED_FEATURES;
  if (raw === undefined || raw.trim().length === 0) return allowed;
  const declared = new Set(raw.split(",").map((v) => v.trim()).filter(Boolean));
  return new Set([...allowed].filter((f) => declared.has(f)));
}
