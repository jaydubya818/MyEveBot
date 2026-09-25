import { getCapabilityStatuses } from "./capabilities.ts";

export const CAPABILITY_KINDS = [
  "tool",
  "skill",
  "integration",
  "channel",
  "specialist",
  "model",
  "memory",
  "browser",
  "computer",
  "storage",
  "scheduler",
  "finance",
  "database",
] as const;

export type CapabilityKind = (typeof CAPABILITY_KINDS)[number];
export type CapabilityAvailability =
  | "available"
  | "unconfigured"
  | "degraded"
  | "disabled"
  | "unavailable";
export type CapabilityRisk = "low" | "medium" | "high" | "critical";
export type CapabilityApprovalMode = "none" | "always" | "conditional" | "owner_policy";

export interface CapabilityDefinition {
  id: string;
  name: string;
  description: string;
  kind: CapabilityKind;
  version: string;
  permissions: readonly string[];
  risk: { level: CapabilityRisk; categories: readonly string[] };
  approvalPolicy: { mode: CapabilityApprovalMode };
  evidence: { supported: boolean; required?: boolean; types?: readonly string[] };
  estimatedCost: { type: "fixed" | "estimated" | "metered"; unit?: string };
  dependencies: readonly string[];
  configuration: readonly string[];
  source: {
    type: "builtin" | "runtime_skill" | "integration" | "user";
    reference?: string;
  };
  feature?: string;
  keywords: readonly string[];
}

export interface ResolvedCapability extends CapabilityDefinition {
  availability: {
    status: CapabilityAvailability;
    configured: boolean;
    reason?: string;
  };
}

export interface CapabilityFilters {
  approvalMode?: CapabilityApprovalMode;
  availability?: CapabilityAvailability;
  kind?: CapabilityKind;
  maxRisk?: CapabilityRisk;
  permission?: string;
}

const RISK_ORDER: Record<CapabilityRisk, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

interface ToolOptions {
  description: string;
  feature?: string;
  permissions: readonly string[];
  risk?: CapabilityRisk;
  riskCategories?: readonly string[];
  approval?: CapabilityApprovalMode;
  evidence?: CapabilityDefinition["evidence"];
  configuration?: readonly string[];
  dependencies?: readonly string[];
  keywords?: readonly string[];
}

function tool(name: string, options: ToolOptions): CapabilityDefinition {
  return {
    id: `tool.${name}`,
    name: name.replaceAll("_", " "),
    description: options.description,
    kind: "tool",
    version: "1",
    permissions: options.permissions,
    risk: {
      level: options.risk ?? "low",
      categories: options.riskCategories ?? [],
    },
    approvalPolicy: { mode: options.approval ?? "none" },
    evidence: options.evidence ?? { supported: false },
    estimatedCost: { type: "estimated", unit: "model/tool call" },
    dependencies: options.dependencies ?? [],
    configuration: options.configuration ?? [],
    source: { type: "builtin", reference: `agent/tools/${name}.ts` },
    feature: options.feature,
    keywords: options.keywords ?? [],
  };
}

function platform(
  id: string,
  name: string,
  kind: CapabilityKind,
  description: string,
  options: Partial<Omit<CapabilityDefinition, "id" | "name" | "kind" | "description">> = {},
): CapabilityDefinition {
  return {
    id,
    name,
    kind,
    description,
    version: options.version ?? "1",
    permissions: options.permissions ?? ["read"],
    risk: options.risk ?? { level: "low", categories: [] },
    approvalPolicy: options.approvalPolicy ?? { mode: "none" },
    evidence: options.evidence ?? { supported: false },
    estimatedCost: options.estimatedCost ?? { type: "fixed" },
    dependencies: options.dependencies ?? [],
    configuration: options.configuration ?? [],
    source: options.source ?? { type: "builtin" },
    feature: options.feature,
    keywords: options.keywords ?? [],
  };
}

export const CAPABILITY_DEFINITIONS: readonly CapabilityDefinition[] = [
  platform("federation.request", "Federated work request", "integration", "Request bounded work through the existing Federation boundary; never expands local authority.", {permissions:["work.request"],configuration:["MYEVE_RELAY_ENABLED"],keywords:["federation","relay"]}),
  platform("notification.send","Result notification","channel","Deliver an owner-approved completed result through a claimed outbox entry.",{
    permissions:["notification.send"],risk:{level:"medium",categories:["external-communication"]},
    evidence:{supported:true,required:true,types:["provider-message-id"]},
    configuration:["DATABASE_URL"],keywords:["notification","delivery","result"],
  }),
  platform("database.neon", "Neon database", "database", "Durable application records and migrations.", {
    permissions: ["database.read", "database.write"],
    configuration: ["DATABASE_URL"],
    keywords: ["persist", "record", "history", "task", "goal"],
  }),
  platform("storage.blob", "Vercel Blob", "storage", "Private durable files, skills, and evidence artifacts.", {
    permissions: ["files.read", "files.write", "files.delete"],
    configuration: ["BLOB_READ_WRITE_TOKEN"],
    risk: { level: "medium", categories: ["durable-data"] },
    approvalPolicy: { mode: "conditional" },
    keywords: ["file", "artifact", "upload", "evidence"],
  }),
  platform("memory.supermemory", "Long-term memory", "memory", "Recall durable facts and preferences across conversations.", {
    feature: "memory",
    configuration: ["SUPERMEMORY_API_KEY"],
    permissions: ["memory.read", "memory.write", "memory.delete"],
    risk: { level: "medium", categories: ["personal-data"] },
    approvalPolicy: { mode: "conditional" },
    keywords: ["remember", "recall", "preference", "history"],
  }),
  platform("integration.composio", "Connected apps", "integration", "Discover and use owner-connected applications through Composio.", {
    feature: "integrations",
    configuration: ["COMPOSIO_API_KEY"],
    permissions: ["apps.discover", "apps.read", "apps.write"],
    risk: { level: "high", categories: ["external-side-effect", "personal-data"] },
    approvalPolicy: { mode: "owner_policy" },
    estimatedCost: { type: "metered", unit: "provider action" },
    source: { type: "integration", reference: "agent/connections/composio.ts" },
    keywords: ["email", "calendar", "github", "notion", "linear", "slack"],
  }),
  platform("channel.web", "Web chat", "channel", "Authenticated owner conversation and streaming UI.", {
    permissions: ["messages.receive", "messages.respond"],
    source: { type: "builtin", reference: "agent/channels/eve.ts" },
    keywords: ["chat", "conversation", "message"],
  }),
  platform("channel.telegram", "Telegram", "channel", "Private proactive and conversational Telegram delivery.", {
    configuration: [
      "TELEGRAM_BOT_TOKEN",
      "TELEGRAM_WEBHOOK_SECRET_TOKEN",
      "TELEGRAM_ALLOWED_USER_IDS",
    ],
    permissions: ["messages.receive", "messages.send"],
    risk: { level: "high", categories: ["external-communication"] },
    approvalPolicy: { mode: "owner_policy" },
    source: { type: "builtin", reference: "agent/channels/telegram.ts" },
    keywords: ["telegram", "notify", "message", "push"],
  }),
  platform("scheduler.automations", "Automation scheduler", "scheduler", "Run reminders and webhook-triggered work durably.", {
    feature: "proactive",
    configuration: ["DATABASE_URL"],
    permissions: ["automations.read", "automations.write", "automations.execute"],
    risk: { level: "medium", categories: ["proactive-action"] },
    approvalPolicy: { mode: "conditional" },
    dependencies: ["database.neon"],
    keywords: ["schedule", "reminder", "recurring", "webhook", "later"],
  }),
  platform("notification.review-delivery", "Review delivery", "channel", "Deliver scheduled Daily Brief and Weekly Review checkpoints through owner-configured channels.", {
    feature: "goals",
    configuration: ["DATABASE_URL", "OWNER_TIMEZONE", "optional Web Push or Telegram configuration"],
    permissions: ["reviews.read", "reviews.schedule", "messages.send"],
    risk: { level: "medium", categories: ["proactive-action", "external-communication"] },
    approvalPolicy: { mode: "owner_policy" },
    dependencies: ["database.neon", "goals.operating-system"],
    source: { type: "builtin", reference: "agent/schedules/review-delivery.ts" },
    keywords: ["daily brief", "weekly review", "schedule", "digest", "push", "telegram"],
  }),
  platform("computer.browser", "Browser and computer", "computer", "Operate an isolated browser in a supervised sandbox.", {
    feature: "browser",
    permissions: ["browser.read", "browser.interact"],
    risk: { level: "high", categories: ["external-side-effect", "credential-boundary"] },
    approvalPolicy: { mode: "owner_policy" },
    evidence: { supported: true, types: ["screenshot", "log"] },
    estimatedCost: { type: "metered", unit: "sandbox minute" },
    source: { type: "builtin", reference: "agent/extensions/browser/extension.ts" },
    keywords: ["browse", "website", "computer", "form", "research"],
  }),
  platform("computer.session.create", "Start computer sessions", "computer", "Provision an Agent-attributed isolated execution session.", {
    feature: "browser",
    configuration: ["DATABASE_URL"],
    permissions: ["computer.session.create"],
    risk: { level: "medium", categories: ["delegated-execution"] },
    approvalPolicy: { mode: "owner_policy" },
    evidence: { supported: true, types: ["event", "action", "artifact"] },
    dependencies: ["computer.browser", "database.neon"],
    source: { type: "builtin", reference: "lib/computer-sessions.ts" },
    keywords: ["computer", "session", "start", "sandbox"],
  }),
  platform("computer.session.stop", "Stop computer sessions", "computer", "Stop an Agent computer session and revoke further action authority.", {
    feature: "browser",
    configuration: ["DATABASE_URL"],
    permissions: ["computer.session.stop"],
    dependencies: ["computer.browser", "database.neon"],
    source: { type: "builtin", reference: "lib/computer-sessions.ts" },
    keywords: ["computer", "session", "stop", "cleanup"],
  }),
  platform("computer.observe", "Observe computer sessions", "computer", "Read safe session, browser, resource, artifact, and control metadata without acquiring authority.", {
    feature: "browser", configuration: ["DATABASE_URL"], permissions: ["computer.observe"],
    dependencies: ["computer.session.create"], source: { type: "builtin", reference: "lib/live-session-provider.ts" },
    keywords: ["computer", "watch", "observe", "live", "status"],
  }),
  platform("computer.pause", "Pause computer authority", "computer", "Revoke Agent interactive authority while preserving the execution environment.", {
    feature: "browser", configuration: ["DATABASE_URL"], permissions: ["computer.pause"],
    risk: { level: "medium", categories: ["execution-control"] }, approvalPolicy: { mode: "owner_policy" },
    dependencies: ["computer.session.create"], source: { type: "builtin", reference: "lib/computer-control.ts" },
    keywords: ["computer", "pause", "authority", "control"],
  }),
  platform("computer.takeover", "Human Takeover", "computer", "Transfer exclusive session-bound interactive control to the authenticated owner.", {
    feature: "browser", configuration: ["DATABASE_URL", "SESSION_BOUND_OWNER_INPUT_PROVIDER"], permissions: ["computer.takeover", "computer.owner_input", "computer.return_control"],
    risk: { level: "high", categories: ["credential-boundary", "execution-control"] }, approvalPolicy: { mode: "owner_policy" },
    dependencies: ["computer.session.create"], source: { type: "builtin", reference: "lib/live-session-provider.ts" },
    keywords: ["computer", "takeover", "owner input", "mfa", "login", "return control"],
  }),
  platform("browser.navigate", "Browser navigation", "browser", "Navigate the isolated browser to public web pages.", {
    feature: "browser", configuration: ["DATABASE_URL"], permissions: ["browser.navigate"],
    risk: { level: "low", categories: ["external-read"] }, dependencies: ["computer.browser"],
    source: { type: "builtin", reference: "agent/extensions/browser/extension.ts" }, keywords: ["browser", "navigate", "url"],
  }),
  platform("browser.read", "Browser reading", "browser", "Read pages and inspect browser state without submitting data.", {
    feature: "browser", configuration: ["DATABASE_URL"], permissions: ["browser.read"],
    risk: { level: "low", categories: ["external-read"] }, dependencies: ["computer.browser"],
    source: { type: "builtin", reference: "agent/extensions/browser/extension.ts" }, keywords: ["browser", "read", "snapshot"],
  }),
  platform("browser.click", "Browser interaction", "browser", "Click and select controls in the isolated browser.", {
    feature: "browser", configuration: ["DATABASE_URL"], permissions: ["browser.click"],
    risk: { level: "high", categories: ["external-side-effect"] }, approvalPolicy: { mode: "owner_policy" },
    dependencies: ["computer.browser"], source: { type: "builtin", reference: "agent/extensions/browser/extension.ts" },
    keywords: ["browser", "click", "select", "interact"],
  }),
  platform("browser.type", "Browser typing", "browser", "Type non-secret values into controls in the isolated browser.", {
    feature: "browser", configuration: ["DATABASE_URL"], permissions: ["browser.type"],
    risk: { level: "high", categories: ["external-side-effect", "data-disclosure"] }, approvalPolicy: { mode: "owner_policy" },
    dependencies: ["computer.browser"], source: { type: "builtin", reference: "agent/extensions/browser/extension.ts" },
    keywords: ["browser", "type", "fill", "form"],
  }),
  platform("terminal.execute", "Sandbox terminal", "computer", "Run a bounded allowlist of read-only diagnostic commands inside the Agent's isolated Eve sandbox.", {
    configuration: ["DATABASE_URL"], permissions: ["terminal.execute"],
    risk: { level: "medium", categories: ["code-execution", "sandbox-data"] }, approvalPolicy: { mode: "owner_policy" },
    evidence: { supported: true, types: ["log", "artifact"] }, dependencies: ["computer.browser"],
    source: { type: "builtin", reference: "agent/tools/bash.ts" }, keywords: ["terminal", "command", "shell", "sandbox"],
  }),
  platform("web.search", "Web search", "browser", "Search the public web without taking actions on websites.", {
    permissions: ["web.search"],
    risk: { level: "low", categories: ["external-read"] },
    keywords: ["web", "search", "research", "sources"],
  }),
  platform("web.read", "Web reading", "browser", "Fetch and read public web pages without interactive browser control.", {
    permissions: ["web.read"],
    risk: { level: "low", categories: ["external-read"] },
    keywords: ["web", "read", "fetch", "research", "sources"],
  }),
  platform("files.read", "File reading", "storage", "Read and search files in the Agent sandbox.", {
    permissions: ["files.read"],
    risk: { level: "low", categories: ["sandbox-data"] },
    keywords: ["file", "read", "search", "research"],
  }),
  platform("files.write", "File writing", "storage", "Create and update files in the Agent sandbox.", {
    permissions: ["files.write"],
    risk: { level: "medium", categories: ["sandbox-data", "durable-data"] },
    approvalPolicy: { mode: "conditional" },
    keywords: ["file", "write", "artifact", "report"],
  }),
  platform("finance.receipts", "Receipt finance", "finance", "Record and summarize owner-provided receipt information.", {
    feature: "receipts",
    configuration: ["DATABASE_URL"],
    permissions: ["finance.read", "finance.write", "finance.delete"],
    risk: { level: "medium", categories: ["financial-data"] },
    approvalPolicy: { mode: "conditional" },
    dependencies: ["database.neon"],
    keywords: ["receipt", "spending", "expense", "merchant", "budget"],
  }),
  platform("model.gateway", "AI Gateway models", "model", "Reasoning and generation through available AI Gateway models.", {
    configuration: ["AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN"],
    permissions: ["model.generate"],
    estimatedCost: { type: "metered", unit: "token" },
    keywords: ["reason", "write", "analyze", "plan"],
  }),
  platform("skill.authored", "Authored skills", "skill", "Versioned procedures shipped with this agent deployment.", {
    permissions: ["skills.read"],
    source: { type: "builtin", reference: "agent/skills" },
    keywords: ["workflow", "procedure", "expertise"],
  }),
  platform("skill.runtime", "Personal skills", "skill", "Owner-created reusable procedures stored privately.", {
    feature: "skills",
    configuration: ["BLOB_READ_WRITE_TOKEN"],
    permissions: ["skills.read", "skills.write", "skills.delete"],
    risk: { level: "medium", categories: ["standing-behavior"] },
    approvalPolicy: { mode: "conditional" },
    dependencies: ["storage.blob"],
    source: { type: "runtime_skill", reference: "agent/lib/skill-store.ts" },
    keywords: ["skill", "workflow", "routine", "repeat"],
  }),
  platform("skill.control-plane", "Skill control plane", "skill", "Agent assignments, usage evidence, and routing eval history for available skills.", {
    feature: "skills",
    configuration: ["DATABASE_URL"],
    permissions: ["skills.read", "skills.assign", "skills.evaluate"],
    risk: { level: "medium", categories: ["standing-behavior"] },
    approvalPolicy: { mode: "conditional" },
    evidence: { supported: true, types: ["usage-event", "eval-result"] },
    dependencies: ["database.neon", "skill.authored"],
    source: { type: "builtin", reference: "agent/lib/skill-manager.ts" },
    keywords: ["skill", "agent", "assignment", "usage", "eval", "quality"],
  }),
  platform("goals.operating-system", "Goal operating system", "scheduler", "Turn desired outcomes into durable plans, tasks, dependencies, progress, and a deterministic next action.", {
    feature: "goals",
    configuration: ["DATABASE_URL"],
    permissions: ["goals.read", "goals.write"],
    risk: { level: "medium", categories: ["durable-data", "standing-intent"] },
    approvalPolicy: { mode: "conditional" },
    evidence: { supported: true, types: ["event", "run", "artifact"] },
    dependencies: ["database.neon"],
    source: { type: "builtin", reference: "lib/goals.ts" },
    keywords: ["goal", "milestone", "task", "plan", "focus", "next action", "progress"],
  }),
  platform("knowledge.structured", "Structured knowledge", "database", "Preserve typed claims, decisions, commitments, relationships, and inspectable provenance.", {
    feature: "knowledge",
    configuration: ["DATABASE_URL"],
    permissions: ["knowledge.read", "knowledge.write"],
    risk: { level: "medium", categories: ["durable-data", "personal-data"] },
    approvalPolicy: { mode: "conditional" },
    evidence: { supported: true, required: true, types: ["source", "provenance"] },
    dependencies: ["database.neon"],
    source: { type: "builtin", reference: "lib/knowledge.ts" },
    keywords: ["knowledge", "fact", "observation", "hypothesis", "decision", "decide", "commitment", "preference", "provenance"],
  }),
  platform("specialist.functional-state", "Functional & State specialist", "specialist", "Checks critical behavior and state transitions.", {
    configuration: ["DATABASE_URL", "BLOB_READ_WRITE_TOKEN"],
    permissions: ["qa.execute", "evidence.write"],
    risk: { level: "medium", categories: ["delegated-execution"] },
    approvalPolicy: { mode: "conditional" },
    evidence: { supported: true, required: true, types: ["screenshot", "report", "json"] },
    dependencies: ["database.neon", "storage.blob", "computer.browser"],
    source: { type: "builtin", reference: "agent/subagents/functional-state/agent.ts" },
    keywords: ["qa", "test", "functional", "state"],
  }),
  platform("specialist.ux-accessibility", "UX & Accessibility specialist", "specialist", "Checks responsive, keyboard, identity, and accessibility behavior.", {
    configuration: ["DATABASE_URL", "BLOB_READ_WRITE_TOKEN"],
    permissions: ["qa.execute", "evidence.write"],
    risk: { level: "medium", categories: ["delegated-execution"] },
    approvalPolicy: { mode: "conditional" },
    evidence: { supported: true, required: true, types: ["screenshot", "report", "json"] },
    dependencies: ["database.neon", "storage.blob", "computer.browser"],
    source: { type: "builtin", reference: "agent/subagents/ux-accessibility/agent.ts" },
    keywords: ["qa", "test", "ux", "accessibility", "responsive", "keyboard"],
  }),
  platform("specialist.trust-resilience", "Trust & Resilience specialist", "specialist", "Checks auth, data boundaries, failure, and recovery behavior.", {
    configuration: ["DATABASE_URL", "BLOB_READ_WRITE_TOKEN"],
    permissions: ["qa.execute", "evidence.write"],
    risk: { level: "medium", categories: ["delegated-execution"] },
    approvalPolicy: { mode: "conditional" },
    evidence: { supported: true, required: true, types: ["screenshot", "report", "json"] },
    dependencies: ["database.neon", "storage.blob", "computer.browser"],
    source: { type: "builtin", reference: "agent/subagents/trust-resilience/agent.ts" },
    keywords: ["qa", "test", "security", "auth", "failure", "recovery"],
  }),
  tool("discover_capabilities", { description: "Discover which capabilities can help accomplish an objective, including availability, risk, and approval requirements.", permissions: ["capabilities.read"], keywords: ["capability", "available", "tool", "plan", "objective"] }),
  tool("list_agents", { description: "List persistent owner Agents and their effective capability state.", permissions: ["agents.read"], configuration: ["DATABASE_URL"], dependencies: ["database.neon"], keywords: ["agent", "specialist", "lifecycle"] }),
  tool("get_agent", { description: "Inspect one owner-scoped persistent Agent.", permissions: ["agents.read"], configuration: ["DATABASE_URL"], dependencies: ["database.neon"], keywords: ["agent", "specialist", "configuration"] }),
  tool("manage_agent", { description: "Create and manage owner-scoped persistent Agents with explicit capabilities.", permissions: ["agents.write"], risk: "medium", riskCategories: ["standing-behavior", "delegated-execution"], approval: "conditional", configuration: ["DATABASE_URL"], dependencies: ["database.neon"], keywords: ["agent", "create", "pause", "resume", "duplicate", "archive"] }),
  tool("persistent-agent-policy", { description: "Enforce persistent Agent lifecycle, capability, availability, and risk boundaries at execution time.", permissions: ["agents.enforce"], configuration: ["DATABASE_URL"], dependencies: ["database.neon"], keywords: ["agent", "policy", "capability", "security"] }),
  tool("start_computer_session", { description: "Provision the current Agent's isolated computer session.", permissions: ["computer.session.create"], risk: "medium", riskCategories: ["delegated-execution"], approval: "owner_policy", configuration: ["DATABASE_URL"], dependencies: ["computer.session.create"], keywords: ["computer", "session", "start"] }),
  tool("get_computer_session", { description: "Inspect the current Agent's computer session, actions, and artifacts.", permissions: ["computer.session.read"], configuration: ["DATABASE_URL"], dependencies: ["computer.session.create"], keywords: ["computer", "session", "inspect"] }),
  tool("manage_computer_session", { description: "Pause an Agent computer and request owner takeover for sensitive input.", permissions: ["computer.session.stop"], risk: "medium", riskCategories: ["delegated-execution"], approval: "owner_policy", configuration: ["DATABASE_URL"], dependencies: ["computer.session.create"], keywords: ["computer", "pause", "takeover", "mfa"] }),
  tool("recover_computer_session", { description: "Recover failed, expired, or stopped computer work in a fresh isolated session with preserved lineage.", permissions: ["computer.session.create"], risk: "medium", riskCategories: ["delegated-execution"], approval: "owner_policy", configuration: ["DATABASE_URL"], dependencies: ["computer.session.create"], keywords: ["computer", "recover", "retry", "reconnect"] }),
  tool("stop_computer_session", { description: "Stop the current Agent's computer session and revoke further actions.", permissions: ["computer.session.stop"], configuration: ["DATABASE_URL"], dependencies: ["computer.session.stop"], keywords: ["computer", "session", "stop"] }),
  tool("record_computer_artifact", { description: "Persist a meaningful computer-session artifact or evidence checkpoint.", permissions: ["files.write", "evidence.write"], risk: "medium", riskCategories: ["durable-data"], configuration: ["DATABASE_URL", "BLOB_READ_WRITE_TOKEN"], dependencies: ["files.write", "storage.blob"], evidence: { supported: true, required: false, types: ["screenshot", "download", "report", "file", "log", "json"] }, keywords: ["computer", "artifact", "evidence", "screenshot"] }),
  tool("bash", { description: "Run a bounded read-only diagnostic command in the active Agent computer sandbox.", permissions: ["terminal.execute"], risk: "medium", riskCategories: ["code-execution", "sandbox-data"], approval: "owner_policy", configuration: ["DATABASE_URL"], dependencies: ["terminal.execute"], keywords: ["terminal", "diagnostic", "command"] }),
  tool("read_file", { description: "Read a file from the active Agent computer workspace.", permissions: ["files.read"], configuration: ["DATABASE_URL"], dependencies: ["files.read"], keywords: ["file", "read", "workspace"] }),
  tool("write_file", { description: "Write a bounded file in the active Agent computer workspace.", permissions: ["files.write"], risk: "medium", riskCategories: ["sandbox-data"], configuration: ["DATABASE_URL"], dependencies: ["files.write"], keywords: ["file", "write", "workspace"] }),
  tool("create_goal", { description: "Create a durable goal, optionally with its first plan, milestones, and tasks.", feature: "goals", permissions: ["goals.write"], risk: "medium", riskCategories: ["durable-data"], approval: "conditional", configuration: ["DATABASE_URL"], dependencies: ["goals.operating-system"], keywords: ["goal", "plan", "milestone", "task", "outcome"] }),
  tool("get_routine_readiness", {description:"Inspect owner-scoped Routine readiness without changing authority or executing work.",permissions:["routines.read"],configuration:["DATABASE_URL"],keywords:["routine","readiness"]}),
  tool("list_goals", { description: "List owner goals and their progress.", feature: "goals", permissions: ["goals.read"], configuration: ["DATABASE_URL"], dependencies: ["goals.operating-system"], keywords: ["goal", "progress", "status"] }),
  tool("get_goal", { description: "Inspect one goal, including plan, tasks, dependencies, events, and next action.", feature: "goals", permissions: ["goals.read"], configuration: ["DATABASE_URL"], dependencies: ["goals.operating-system"], keywords: ["goal", "task", "plan", "activity"] }),
  tool("update_goal", { description: "Edit a goal or apply a legal lifecycle transition.", feature: "goals", permissions: ["goals.write"], risk: "medium", riskCategories: ["durable-data"], approval: "conditional", configuration: ["DATABASE_URL"], dependencies: ["goals.operating-system"], keywords: ["goal", "edit", "pause", "complete", "archive"] }),
  tool("manage_goal_task", { description: "Create, edit, transition, or delete a goal task.", feature: "goals", permissions: ["goals.write"], risk: "medium", riskCategories: ["durable-data"], approval: "conditional", configuration: ["DATABASE_URL"], dependencies: ["goals.operating-system"], keywords: ["goal", "task", "next action", "complete", "block"] }),
  tool("manage_goal_structure", { description: "Manage versioned plans, milestones, and task dependencies for a goal.", feature: "goals", permissions: ["goals.write"], risk: "medium", riskCategories: ["durable-data"], approval: "conditional", configuration: ["DATABASE_URL"], dependencies: ["goals.operating-system"], keywords: ["goal", "plan", "milestone", "dependency"] }),
  tool("goal_focus", { description: "Return the highest-priority unblocked next actions with explainable ranking.", feature: "goals", permissions: ["goals.read"], configuration: ["DATABASE_URL"], dependencies: ["goals.operating-system"], keywords: ["focus", "next action", "priority", "today"] }),
  tool("record_outcome", { description: "Record observed effectiveness linked to existing goal execution and evidence.", feature: "goals", permissions: ["goals.write"], risk: "medium", riskCategories: ["durable-data"], approval: "conditional", configuration: ["DATABASE_URL"], dependencies: ["goals.operating-system"], keywords: ["outcome", "effectiveness", "result", "feedback"] }),
  tool("list_outcomes", { description: "List owner-scoped outcomes and explicit effectiveness feedback.", feature: "goals", permissions: ["goals.read"], configuration: ["DATABASE_URL"], dependencies: ["goals.operating-system"], keywords: ["outcome", "effectiveness", "feedback"] }),
  tool("update_outcome_feedback", { description: "Apply owner-provided effectiveness feedback to an existing outcome.", feature: "goals", permissions: ["goals.write"], risk: "medium", riskCategories: ["durable-data"], approval: "conditional", configuration: ["DATABASE_URL"], dependencies: ["goals.operating-system"], keywords: ["outcome", "effectiveness", "feedback", "helpful"] }),
  tool("delete_outcome", { description: "Delete one owner-scoped result and revoke its evidence links.", feature: "goals", permissions: ["goals.write"], risk: "high", riskCategories: ["durable-delete"], approval: "always", configuration: ["DATABASE_URL"], dependencies: ["goals.operating-system"], keywords: ["outcome", "result", "delete", "revoke"] }),
  tool("review_progress", { description: "Generate a deterministic daily brief or weekly review from canonical state.", feature: "goals", permissions: ["goals.read"], configuration: ["DATABASE_URL"], dependencies: ["goals.operating-system"], keywords: ["daily brief", "weekly review", "stalled", "risk", "priority"] }),
  tool("get_review_schedule", { description: "Inspect owner review schedules, available delivery channels, and recent delivery results.", feature: "goals", permissions: ["reviews.read"], configuration: ["DATABASE_URL"], dependencies: ["notification.review-delivery"], keywords: ["daily brief", "weekly review", "schedule", "delivery history"] }),
  tool("update_review_schedule", { description: "Update an explicitly owner-approved review schedule and delivery policy.", feature: "goals", permissions: ["reviews.schedule"], risk: "medium", riskCategories: ["proactive-action", "external-communication"], approval: "always", configuration: ["DATABASE_URL", "OWNER_TIMEZONE"], dependencies: ["notification.review-delivery"], keywords: ["daily brief", "weekly review", "schedule", "timezone", "quiet hours", "delivery"] }),
  tool("record_fact", { description: "Record a durable fact with confidence and current-conversation provenance.", feature: "knowledge", permissions: ["knowledge.write"], risk: "medium", riskCategories: ["durable-data", "personal-data"], approval: "conditional", configuration: ["DATABASE_URL"], dependencies: ["knowledge.structured"], keywords: ["fact", "know", "confirm", "provenance"] }),
  tool("record_observation", { description: "Record a noticed pattern without promoting it to a preference.", feature: "knowledge", permissions: ["knowledge.write"], risk: "medium", riskCategories: ["durable-data", "personal-data"], approval: "conditional", configuration: ["DATABASE_URL"], dependencies: ["knowledge.structured"], keywords: ["observation", "pattern", "noticed", "evidence"] }),
  tool("record_decision", { description: "Record an explicit decision with rationale, reopen condition, and provenance.", feature: "knowledge", permissions: ["knowledge.write"], risk: "medium", riskCategories: ["durable-data", "standing-intent"], approval: "conditional", configuration: ["DATABASE_URL"], dependencies: ["knowledge.structured"], keywords: ["decision", "decide", "rationale", "revisit", "supersede"] }),
  tool("record_commitment", { description: "Record an explicit owner obligation without broad automatic extraction.", feature: "knowledge", permissions: ["knowledge.write"], risk: "medium", riskCategories: ["durable-data", "standing-intent"], approval: "conditional", configuration: ["DATABASE_URL"], dependencies: ["knowledge.structured"], keywords: ["commitment", "promise", "due", "obligation"] }),
  tool("record_hypothesis", { description: "Record an uncertain hypothesis with a test and conversation provenance.", feature: "knowledge", permissions: ["knowledge.write"], risk: "medium", riskCategories: ["durable-data", "personal-data"], approval: "conditional", configuration: ["DATABASE_URL"], dependencies: ["knowledge.structured"], keywords: ["hypothesis", "test", "uncertain"] }),
  tool("record_preference", { description: "Record an explicitly stated owner preference with provenance.", feature: "knowledge", permissions: ["knowledge.write"], risk: "medium", riskCategories: ["durable-data", "personal-data"], approval: "conditional", configuration: ["DATABASE_URL"], dependencies: ["knowledge.structured"], keywords: ["preference", "prefer", "guidance"] }),
  tool("get_knowledge", { description: "Inspect structured Knowledge with sources and version history.", feature: "knowledge", permissions: ["knowledge.read"], configuration: ["DATABASE_URL"], dependencies: ["knowledge.structured"], keywords: ["knowledge", "inspect", "provenance", "history"] }),
  tool("update_knowledge_status", { description: "Apply an explicit valid status change to owner-scoped Knowledge.", feature: "knowledge", permissions: ["knowledge.write"], risk: "medium", riskCategories: ["durable-data", "personal-data"], approval: "conditional", configuration: ["DATABASE_URL"], dependencies: ["knowledge.structured"], keywords: ["knowledge", "status", "fulfilled", "rejected"] }),
  tool("search_knowledge", { description: "Search typed structured knowledge with status, Goal, confidence, and date filters.", feature: "knowledge", permissions: ["knowledge.read"], configuration: ["DATABASE_URL"], dependencies: ["knowledge.structured"], keywords: ["knowledge", "search", "fact", "decision", "history"] }),
  tool("search_owner_knowledge", { description: "Search canonical owner Memory and Knowledge with type, scope, provenance, and review filters.", feature: "knowledge", permissions: ["knowledge.read", "memory.read"], configuration: ["DATABASE_URL"], dependencies: ["knowledge.structured"], keywords: ["knowledge", "memory", "search", "provenance", "review"] }),
  tool("inspect_owner_knowledge", { description: "Inspect one authorized canonical Memory or Knowledge record with provenance and scope transparency.", feature: "knowledge", permissions: ["knowledge.read", "memory.read"], configuration: ["DATABASE_URL"], dependencies: ["knowledge.structured"], keywords: ["knowledge", "memory", "inspect", "source", "scope"] }),
  tool("list_decisions", { description: "List durable decisions and their history.", feature: "knowledge", permissions: ["knowledge.read"], configuration: ["DATABASE_URL"], dependencies: ["knowledge.structured"], keywords: ["decision", "decide", "rationale", "reopen", "history"] }),
  tool("list_commitments", { description: "List durable commitments and their lifecycle state.", feature: "knowledge", permissions: ["knowledge.read"], configuration: ["DATABASE_URL"], dependencies: ["knowledge.structured"], keywords: ["commitment", "obligation", "due", "open"] }),
  tool("list_roles", { description: "List reusable Role Packs and inspect Role responsibilities, boundaries, recommendations, lifecycle stages, and execution mode.", permissions: ["agents.read"], keywords: ["role", "role pack", "expertise", "delegate"] }),
  tool("list_solution_packs", { description: "List reusable Solution Packs and inspect their domains, Roles, Goal Templates, workflows, artifacts, metrics, and approval boundaries.", permissions: ["agents.read"], keywords: ["solution pack", "founder os", "business", "workflow", "template"] }),
  platform("tool.agent", "agent", "tool", "Delegate a bounded assignment to a fresh general-purpose copy of the primary Agent.", {
    permissions: ["agents.delegate"],
    risk: { level: "medium", categories: ["delegated-execution"] },
    approvalPolicy: { mode: "conditional" },
    estimatedCost: { type: "estimated", unit: "model/tool call" },
    source: { type: "builtin", reference: "eve:agent" },
    keywords: ["delegate", "worker", "parallel", "subagent"],
  }),
  tool("workflow", { description: "Coordinate general-purpose workers and declared specialists in a bounded workflow.", permissions: ["agents.delegate"], risk: "medium", riskCategories: ["delegated-execution"], approval: "conditional", keywords: ["workflow", "parallel", "delegate"] }),
  tool("start_task", { description: "Create a durable bounded work contract before multi-step execution or delegation.", permissions: ["agents.delegate"], risk: "medium", riskCategories: ["delegated-execution", "durable-data"], approval: "conditional", configuration: ["DATABASE_URL"], dependencies: ["database.neon"], keywords: ["task", "work", "delegate", "progress"] }),
  tool("complete_work", { description: "Publish an evidence-backed work result for owner review.", permissions: ["agents.delegate"], risk: "medium", riskCategories: ["durable-data"], approval: "conditional", configuration: ["DATABASE_URL"], dependencies: ["database.neon"], evidence: { supported: true, required: true, types: ["result", "verification"] }, keywords: ["task", "complete", "result", "evidence"] }),
  tool("start_product_qa", { description: "Create the fixed three-specialist product-QA contract.", permissions: ["qa.write", "qa.execute"], risk: "medium", approval: "conditional", configuration: ["DATABASE_URL", "BLOB_READ_WRITE_TOKEN"], dependencies: ["database.neon", "storage.blob"], keywords: ["qa", "test", "preview"] }),
  tool("inspect_tasks", { description: "Inspect owner-scoped audited QA runs and evidence.", permissions: ["qa.read"], configuration: ["DATABASE_URL"], dependencies: ["database.neon"], keywords: ["qa", "activity", "task"] }),
  tool("update_task", { description: "Apply a legal lifecycle transition to an audited QA run.", permissions: ["qa.write"], risk: "medium", approval: "conditional", configuration: ["DATABASE_URL"], dependencies: ["database.neon"], keywords: ["qa", "task", "retry", "cancel"] }),
  tool("complete_task", { description: "Complete QA only after specialists and required evidence pass.", permissions: ["qa.write"], risk: "medium", evidence: { supported: true, required: true, types: ["report", "screenshot", "json"] }, configuration: ["DATABASE_URL"], dependencies: ["database.neon"], keywords: ["qa", "complete", "verify"] }),
  tool("record_task_evidence", { description: "Store redacted, checksummed evidence for an assigned QA check.", permissions: ["evidence.write"], risk: "medium", evidence: { supported: true, required: true, types: ["report", "screenshot", "log", "json"] }, configuration: ["DATABASE_URL", "BLOB_READ_WRITE_TOKEN"], dependencies: ["database.neon", "storage.blob"], keywords: ["evidence", "qa", "artifact"] }),
  tool("create_reminder", { description: "Create a one-off or recurring proactive reminder.", feature: "proactive", permissions: ["automations.write"], risk: "medium", approval: "conditional", configuration: ["DATABASE_URL"], dependencies: ["scheduler.automations"], keywords: ["remind", "schedule", "recurring"] }),
  tool("make_routine", { description: "Create a named recurring routine from a proven result with an explicit approval boundary.", feature: "proactive", permissions: ["automations.write"], risk: "medium", riskCategories: ["standing-behavior", "proactive-action"], approval: "always", configuration: ["DATABASE_URL"], dependencies: ["scheduler.automations"], keywords: ["routine", "repeat", "schedule", "result"] }),
  tool("list_routines", { description: "List active and paused named routines.", feature: "proactive", permissions: ["automations.read"], configuration: ["DATABASE_URL"], dependencies: ["scheduler.automations"], keywords: ["routine", "schedule", "history"] }),
  tool("manage_routine", { description: "Pause, resume, edit, or dry-run a named routine.", feature: "proactive", permissions: ["automations.write"], risk: "medium", riskCategories: ["standing-behavior", "proactive-action"], approval: "always", configuration: ["DATABASE_URL"], dependencies: ["scheduler.automations"], keywords: ["routine", "pause", "resume", "edit", "test"] }),
  tool("list_reminders", { description: "List active reminders.", feature: "proactive", permissions: ["automations.read"], configuration: ["DATABASE_URL"], dependencies: ["scheduler.automations"], keywords: ["reminder", "schedule"] }),
  tool("cancel_reminder", { description: "Cancel an active reminder.", feature: "proactive", permissions: ["automations.write"], risk: "medium", approval: "conditional", configuration: ["DATABASE_URL"], dependencies: ["scheduler.automations"], keywords: ["reminder", "cancel"] }),
  tool("create_webhook", { description: "Create a secret inbound event trigger.", feature: "proactive", permissions: ["automations.write"], risk: "high", riskCategories: ["external-ingress"], approval: "conditional", configuration: ["DATABASE_URL"], dependencies: ["scheduler.automations"], keywords: ["webhook", "trigger", "event"] }),
  tool("list_webhooks", { description: "List event triggers without exposing stored secrets unnecessarily.", feature: "proactive", permissions: ["automations.read"], configuration: ["DATABASE_URL"], dependencies: ["scheduler.automations"], keywords: ["webhook", "trigger"] }),
  tool("delete_webhook", { description: "Delete an inbound event trigger.", feature: "proactive", permissions: ["automations.delete"], risk: "high", riskCategories: ["durable-delete"], approval: "conditional", configuration: ["DATABASE_URL"], dependencies: ["scheduler.automations"], keywords: ["webhook", "delete"] }),
  tool("remember", { description: "Save a durable personal fact or explicit preference.", feature: "memory", permissions: ["memory.write"], risk: "medium", riskCategories: ["personal-data"], configuration: ["SUPERMEMORY_API_KEY"], dependencies: ["memory.supermemory"], keywords: ["remember", "preference", "fact"] }),
  tool("search_memory", { description: "Search long-term memory for relevant context.", feature: "memory", permissions: ["memory.read"], configuration: ["SUPERMEMORY_API_KEY"], dependencies: ["memory.supermemory"], keywords: ["remember", "recall", "history"] }),
  tool("list_memories", { description: "List inspectable long-term memory entries.", feature: "memory", permissions: ["memory.read"], configuration: ["SUPERMEMORY_API_KEY"], dependencies: ["memory.supermemory"], keywords: ["memory", "audit"] }),
  tool("forget", { description: "Forget one durable memory entry.", feature: "memory", permissions: ["memory.delete"], risk: "high", riskCategories: ["durable-delete", "personal-data"], approval: "conditional", configuration: ["SUPERMEMORY_API_KEY"], dependencies: ["memory.supermemory"], keywords: ["forget", "memory", "delete"] }),
  tool("create_skill", { description: "Create or replace a reusable personal procedure.", feature: "skills", permissions: ["skills.write"], risk: "medium", riskCategories: ["standing-behavior"], approval: "conditional", configuration: ["BLOB_READ_WRITE_TOKEN"], dependencies: ["skill.runtime", "storage.blob"], keywords: ["skill", "workflow", "routine"] }),
  tool("delete_skill", { description: "Delete a reusable personal procedure.", feature: "skills", permissions: ["skills.delete"], risk: "high", riskCategories: ["durable-delete", "standing-behavior"], approval: "conditional", configuration: ["BLOB_READ_WRITE_TOKEN"], dependencies: ["skill.runtime", "storage.blob"], keywords: ["skill", "delete"] }),
  tool("inspect_skills", { description: "Inspect available skills, their agent assignments, observed usage, and latest eval results.", feature: "skills", permissions: ["skills.read"], configuration: ["DATABASE_URL"], dependencies: ["skill.control-plane"], keywords: ["skill", "agent", "usage", "eval", "assignment"] }),
  tool("assign_skill", { description: "Assign a skill to a declared QA specialist for new delegated sessions.", feature: "skills", permissions: ["skills.assign"], risk: "medium", riskCategories: ["standing-behavior"], approval: "always", configuration: ["DATABASE_URL"], dependencies: ["skill.control-plane"], keywords: ["skill", "agent", "assign", "enable"] }),
  tool("unassign_skill", { description: "Remove a skill from a declared QA specialist for new delegated sessions.", feature: "skills", permissions: ["skills.assign"], risk: "medium", riskCategories: ["standing-behavior"], approval: "always", configuration: ["DATABASE_URL"], dependencies: ["skill.control-plane"], keywords: ["skill", "agent", "unassign", "disable"] }),
  tool("run_skill_evals", { description: "Run real routing evals for changed or named project skills.", feature: "skills", permissions: ["skills.evaluate"], risk: "medium", riskCategories: ["model-cost"], approval: "always", evidence: { supported: true, types: ["run", "assertion"] }, configuration: ["DATABASE_URL", "AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN"], dependencies: ["skill.control-plane", "model.gateway"], keywords: ["skill", "eval", "quality", "changed", "routing"] }),
  tool("share_file", { description: "Store and share a file through durable Blob storage.", feature: "file-sharing", permissions: ["files.write", "files.share"], risk: "high", riskCategories: ["data-disclosure"], approval: "conditional", configuration: ["BLOB_READ_WRITE_TOKEN"], dependencies: ["storage.blob"], keywords: ["file", "share", "upload", "artifact"] }),
  tool("artifacts", { description: "Create, inspect, revise, share, and restore durable work artifacts.", feature: "file-sharing", permissions: ["files.read", "files.write", "files.share"], risk: "high", riskCategories: ["durable-data", "data-disclosure"], approval: "owner_policy", configuration: ["DATABASE_URL", "BLOB_READ_WRITE_TOKEN"], dependencies: ["database.neon", "storage.blob"], evidence: { supported: true, types: ["artifact", "revision"] }, keywords: ["artifact", "document", "spreadsheet", "presentation", "revision"] }),
  tool("send_attachment", { description: "Send an existing file attachment through the active supported channel.", feature: "file-sharing", permissions: ["files.read", "messages.send"], risk: "high", riskCategories: ["data-disclosure", "external-communication"], approval: "owner_policy", configuration: ["BLOB_READ_WRITE_TOKEN"], dependencies: ["storage.blob"], keywords: ["attachment", "file", "send", "message"] }),
  tool("agentphone", { description: "Send texts and place calls from the agent's dedicated phone number.", feature: "integrations", permissions: ["messages.send", "calls.place"], risk: "high", riskCategories: ["external-communication", "metered-action"], approval: "owner_policy", configuration: ["AGENTPHONE_API_KEY or DATABASE_URL"], keywords: ["phone", "text", "sms", "call"] }),
  tool("imessage", { description: "Send messages and reactions through the configured iMessage channel.", feature: "integrations", permissions: ["messages.send"], risk: "high", riskCategories: ["external-communication"], approval: "owner_policy", configuration: ["SPECTRUM_PROJECT_ID or IMESSAGE_ROUTER_URL"], keywords: ["imessage", "message", "reaction"] }),
  tool("computer", { description: "Operate an Agent-isolated persistent cloud desktop with owner takeover for authentication.", feature: "integrations", permissions: ["computer.execute"], risk: "high", riskCategories: ["external-side-effect", "credential-boundary"], approval: "owner_policy", configuration: ["DATABASE_URL", "ORGO_API_KEY or DATABASE_URL"], evidence: { supported: true, types: ["screenshot", "log"] }, keywords: ["computer", "desktop", "browser", "profile", "login", "task"] }),
  tool("local_computer_task", { description: "Run an approved bounded task through the owner's local computer bridge.", feature: "integrations", permissions: ["computer.execute"], risk: "critical", riskCategories: ["local-device", "external-side-effect", "credential-boundary"], approval: "always", configuration: ["SOFIE_LOCAL_MCP_URL", "SOFIE_LOCAL_MCP_TOKEN"], evidence: { supported: true, types: ["screenshot", "log"] }, keywords: ["local computer", "mac", "desktop", "task"] }),
  tool("email_address", { description: "Read the agent inbox address and unread count.", feature: "integrations", permissions: ["email.read"], configuration: ["AGENTMAIL_API_KEY or DATABASE_URL"], keywords: ["email", "address", "inbox"] }),
  tool("list_emails", { description: "List conversations in the agent inbox.", feature: "integrations", permissions: ["email.read"], configuration: ["AGENTMAIL_API_KEY or DATABASE_URL"], keywords: ["email", "inbox", "unread"] }),
  tool("read_email", { description: "Read a complete email conversation and optionally mark it read.", feature: "integrations", permissions: ["email.read", "email.write"], risk: "medium", riskCategories: ["personal-data", "durable-data"], approval: "owner_policy", configuration: ["AGENTMAIL_API_KEY or DATABASE_URL"], keywords: ["email", "read", "thread"] }),
  tool("search_emails", { description: "Search the agent inbox by sender, recipient, subject, or body.", feature: "integrations", permissions: ["email.read"], configuration: ["AGENTMAIL_API_KEY or DATABASE_URL"], keywords: ["email", "search", "inbox"] }),
  tool("send_email", { description: "Send a new email from the agent inbox.", feature: "integrations", permissions: ["email.send"], risk: "high", riskCategories: ["external-communication"], approval: "owner_policy", configuration: ["AGENTMAIL_API_KEY or DATABASE_URL"], keywords: ["email", "send", "compose"] }),
  tool("reply_to_email", { description: "Reply within an existing agent-inbox conversation.", feature: "integrations", permissions: ["email.send"], risk: "high", riskCategories: ["external-communication"], approval: "owner_policy", configuration: ["AGENTMAIL_API_KEY or DATABASE_URL"], keywords: ["email", "reply", "thread"] }),
  tool("label_email", { description: "Apply or remove organizational labels on an email conversation.", feature: "integrations", permissions: ["email.write"], risk: "medium", riskCategories: ["durable-data"], approval: "owner_policy", configuration: ["AGENTMAIL_API_KEY or DATABASE_URL"], keywords: ["email", "label", "archive", "trash"] }),
  tool("connect_email_domain", { description: "Connect a custom domain to the agent inbox and return required DNS records.", feature: "integrations", permissions: ["email.domain.write"], risk: "high", riskCategories: ["dns-change", "external-side-effect"], approval: "owner_policy", configuration: ["AGENTMAIL_API_KEY or DATABASE_URL"], keywords: ["email", "domain", "dns", "connect"] }),
  tool("check_email_domain", { description: "Check custom email-domain verification and required DNS records.", feature: "integrations", permissions: ["email.domain.read"], configuration: ["AGENTMAIL_API_KEY or DATABASE_URL"], keywords: ["email", "domain", "dns", "verify"] }),
  tool("remove_email_domain", { description: "Disconnect the custom domain from the agent inbox.", feature: "integrations", permissions: ["email.domain.delete"], risk: "high", riskCategories: ["durable-delete", "external-side-effect"], approval: "owner_policy", configuration: ["AGENTMAIL_API_KEY or DATABASE_URL"], keywords: ["email", "domain", "disconnect"] }),
  tool("connect_card", { description: "Start the protected flow for connecting the owner's payment card.", feature: "integrations", permissions: ["payments.connect"], risk: "critical", riskCategories: ["financial-action", "credential-boundary"], approval: "always", configuration: ["AGENTCARD_CLIENT_ID or DATABASE_URL"], keywords: ["card", "payment", "connect"] }),
  tool("verify_card_code", { description: "Verify the one-time code for a pending payment-card connection.", feature: "integrations", permissions: ["payments.connect"], risk: "critical", riskCategories: ["financial-action", "credential-boundary"], approval: "always", configuration: ["AGENTCARD_CLIENT_ID or DATABASE_URL"], keywords: ["card", "payment", "verify", "code"] }),
  tool("attach_own_card", { description: "Attach the connected owner card to the agent wallet.", feature: "integrations", permissions: ["payments.connect"], risk: "critical", riskCategories: ["financial-action"], approval: "owner_policy", configuration: ["AGENTCARD_CLIENT_ID or DATABASE_URL"], keywords: ["card", "wallet", "attach"] }),
  tool("check_card_attachment", { description: "Inspect the current card and wallet attachment state.", feature: "integrations", permissions: ["payments.read"], configuration: ["AGENTCARD_CLIENT_ID or DATABASE_URL"], keywords: ["card", "wallet", "status"] }),
  tool("record_agentcard_consent", { description: "Record explicit owner consent for the card platform and issuer terms.", feature: "integrations", permissions: ["payments.consent"], risk: "critical", riskCategories: ["financial-action", "legal-consent"], approval: "always", configuration: ["AGENTCARD_CLIENT_ID or DATABASE_URL"], keywords: ["card", "consent", "terms"] }),
  tool("start_agentcard_phone_verification", { description: "Start phone verification required by the card platform.", feature: "integrations", permissions: ["payments.verify"], risk: "high", riskCategories: ["financial-action", "external-communication"], approval: "always", configuration: ["AGENTCARD_CLIENT_ID or DATABASE_URL"], keywords: ["card", "phone", "verify"] }),
  tool("verify_agentcard_phone", { description: "Verify the one-time phone code required by the card platform.", feature: "integrations", permissions: ["payments.verify"], risk: "critical", riskCategories: ["financial-action", "credential-boundary"], approval: "owner_policy", configuration: ["AGENTCARD_CLIENT_ID or DATABASE_URL"], keywords: ["card", "phone", "code"] }),
  tool("fund_agentcard_wallet", { description: "Fund the agent wallet with an explicit amount and payment method.", feature: "integrations", permissions: ["payments.fund"], risk: "critical", riskCategories: ["financial-action", "money-movement"], approval: "always", configuration: ["AGENTCARD_CLIENT_ID or DATABASE_URL"], keywords: ["card", "wallet", "fund", "payment"] }),
  tool("render_video", { description: "Render a Remotion composition to an MP4 and store the result.", feature: "integrations", permissions: ["media.render", "files.write"], risk: "medium", riskCategories: ["metered-action", "durable-data"], approval: "conditional", configuration: ["BLOB_READ_WRITE_TOKEN"], dependencies: ["storage.blob"], keywords: ["video", "render", "remotion", "mp4"] }),
  tool("log_receipt", { description: "Record receipt details using integer-cent storage.", feature: "receipts", permissions: ["finance.write"], risk: "medium", configuration: ["DATABASE_URL"], dependencies: ["finance.receipts"], keywords: ["receipt", "expense", "spending"] }),
  tool("query_receipts", { description: "Search recorded receipts.", feature: "receipts", permissions: ["finance.read"], configuration: ["DATABASE_URL"], dependencies: ["finance.receipts"], keywords: ["receipt", "expense", "search"] }),
  tool("spending_summary", { description: "Summarize recorded spending by time and category.", feature: "receipts", permissions: ["finance.read"], configuration: ["DATABASE_URL"], dependencies: ["finance.receipts"], keywords: ["spending", "summary", "budget"] }),
  tool("delete_receipt", { description: "Delete a recorded receipt.", feature: "receipts", permissions: ["finance.delete"], risk: "high", riskCategories: ["durable-delete", "financial-data"], approval: "conditional", configuration: ["DATABASE_URL"], dependencies: ["finance.receipts"], keywords: ["receipt", "delete"] }),
  tool("get_weather", { description: "Get current weather information.", feature: "utilities", permissions: ["internet.read"], keywords: ["weather", "temperature", "forecast"] }),
  tool("roll_dice", { description: "Generate a bounded random dice result.", feature: "utilities", permissions: ["utility.execute"], keywords: ["dice", "random"] }),
] as const;

function enabledFeatures(env: NodeJS.ProcessEnv): Set<string> {
  const raw = env.EVE_ENABLED_FEATURES;
  if (raw === undefined || raw.trim().length === 0) {
    return new Set(["memory", "proactive", "receipts", "skills", "file-sharing", "integrations", "browser", "utilities", "goals", "knowledge"]);
  }
  return new Set(raw.split(",").map((value) => value.trim()).filter(Boolean));
}

function configured(definition: CapabilityDefinition, env: NodeJS.ProcessEnv): boolean {
  if (definition.id === "model.gateway") {
    return Boolean(env.AI_GATEWAY_API_KEY?.trim() || env.VERCEL_OIDC_TOKEN?.trim() || env.VERCEL === "1");
  }
  return definition.configuration.every((name) => {
    if (name.includes(" or ")) return name.split(" or ").some((part) => Boolean(env[part]?.trim()));
    return Boolean(env[name]?.trim());
  });
}

function availabilityFor(
  definition: CapabilityDefinition,
  env: NodeJS.ProcessEnv,
): ResolvedCapability["availability"] {
  if (definition.feature && !enabledFeatures(env).has(definition.feature)) {
    return { status: "disabled", configured: false, reason: "Not included in this deployment." };
  }
  const isConfigured = configured(definition, env);
  if (!isConfigured) {
    return {
      status: "unconfigured",
      configured: false,
      reason: `Requires ${definition.configuration.join(" and ")}.`,
    };
  }
  return { status: "available", configured: true };
}

function matchesFilters(capability: ResolvedCapability, filters: CapabilityFilters): boolean {
  if (filters.kind && capability.kind !== filters.kind) return false;
  if (filters.availability && capability.availability.status !== filters.availability) return false;
  if (filters.approvalMode && capability.approvalPolicy.mode !== filters.approvalMode) return false;
  if (filters.permission && !capability.permissions.includes(filters.permission)) return false;
  if (filters.maxRisk && RISK_ORDER[capability.risk.level] > RISK_ORDER[filters.maxRisk]) return false;
  return true;
}

export function getCapabilities(
  filters: CapabilityFilters = {},
  env: NodeJS.ProcessEnv = process.env,
): ResolvedCapability[] {
  return CAPABILITY_DEFINITIONS.map((definition) => ({
    ...definition,
    availability: availabilityFor(definition, env),
  })).filter((capability) => matchesFilters(capability, filters));
}

export function getCapability(
  id: string,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedCapability | null {
  return getCapabilities({}, env).find((capability) => capability.id === id) ?? null;
}

export function getAvailableCapabilities(
  filters: Omit<CapabilityFilters, "availability"> = {},
  env: NodeJS.ProcessEnv = process.env,
): ResolvedCapability[] {
  return getCapabilities({ ...filters, availability: "available" }, env);
}

function objectiveTerms(objective: string): string[] {
  return [...new Set(objective.toLowerCase().match(/[a-z0-9]+/g) ?? [])].filter(
    (term) => term.length > 2,
  );
}

export function findCapabilities(
  query: string,
  filters: CapabilityFilters = {},
  env: NodeJS.ProcessEnv = process.env,
): ResolvedCapability[] {
  const terms = objectiveTerms(query);
  if (terms.length === 0) return getCapabilities(filters, env);
  return getCapabilities(filters, env).filter((capability) => {
    const haystack = [capability.id, capability.name, capability.description, ...capability.keywords]
      .join(" ")
      .toLowerCase();
    return terms.some((term) => haystack.includes(term));
  });
}

export function getCapabilitiesForObjective(
  objective: string,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedCapability[] {
  const terms = objectiveTerms(objective);
  return getAvailableCapabilities({}, env)
    .map((capability) => {
      const fields = [capability.name, capability.description, ...capability.keywords].map((value) => value.toLowerCase());
      const score = terms.reduce(
        (total, term) => total + fields.filter((field) => field.includes(term)).length,
        0,
      );
      return { capability, score };
    })
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score || left.capability.name.localeCompare(right.capability.name))
    .map((match) => match.capability);
}

export function checkCapabilityAvailability(
  id: string,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedCapability["availability"] | null {
  return getCapability(id, env)?.availability ?? null;
}

export function sectionCapabilityStatuses(env: NodeJS.ProcessEnv = process.env) {
  return getCapabilityStatuses(env);
}
