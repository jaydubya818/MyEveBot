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
  tool("create_goal", { description: "Create a durable goal, optionally with its first plan, milestones, and tasks.", feature: "goals", permissions: ["goals.write"], risk: "medium", riskCategories: ["durable-data"], approval: "conditional", configuration: ["DATABASE_URL"], dependencies: ["goals.operating-system"], keywords: ["goal", "plan", "milestone", "task", "outcome"] }),
  tool("list_goals", { description: "List owner goals and their progress.", feature: "goals", permissions: ["goals.read"], configuration: ["DATABASE_URL"], dependencies: ["goals.operating-system"], keywords: ["goal", "progress", "status"] }),
  tool("get_goal", { description: "Inspect one goal, including plan, tasks, dependencies, events, and next action.", feature: "goals", permissions: ["goals.read"], configuration: ["DATABASE_URL"], dependencies: ["goals.operating-system"], keywords: ["goal", "task", "plan", "activity"] }),
  tool("update_goal", { description: "Edit a goal or apply a legal lifecycle transition.", feature: "goals", permissions: ["goals.write"], risk: "medium", riskCategories: ["durable-data"], approval: "conditional", configuration: ["DATABASE_URL"], dependencies: ["goals.operating-system"], keywords: ["goal", "edit", "pause", "complete", "archive"] }),
  tool("manage_goal_task", { description: "Create, edit, transition, or delete a goal task.", feature: "goals", permissions: ["goals.write"], risk: "medium", riskCategories: ["durable-data"], approval: "conditional", configuration: ["DATABASE_URL"], dependencies: ["goals.operating-system"], keywords: ["goal", "task", "next action", "complete", "block"] }),
  tool("manage_goal_structure", { description: "Manage versioned plans, milestones, and task dependencies for a goal.", feature: "goals", permissions: ["goals.write"], risk: "medium", riskCategories: ["durable-data"], approval: "conditional", configuration: ["DATABASE_URL"], dependencies: ["goals.operating-system"], keywords: ["goal", "plan", "milestone", "dependency"] }),
  tool("goal_focus", { description: "Return the highest-priority unblocked next actions with explainable ranking.", feature: "goals", permissions: ["goals.read"], configuration: ["DATABASE_URL"], dependencies: ["goals.operating-system"], keywords: ["focus", "next action", "priority", "today"] }),
  tool("record_outcome", { description: "Record observed effectiveness linked to existing goal execution and evidence.", feature: "goals", permissions: ["goals.write"], risk: "medium", riskCategories: ["durable-data"], approval: "conditional", configuration: ["DATABASE_URL"], dependencies: ["goals.operating-system"], keywords: ["outcome", "effectiveness", "result", "feedback"] }),
  tool("list_outcomes", { description: "List owner-scoped outcomes and explicit effectiveness feedback.", feature: "goals", permissions: ["goals.read"], configuration: ["DATABASE_URL"], dependencies: ["goals.operating-system"], keywords: ["outcome", "effectiveness", "feedback"] }),
  tool("update_outcome_feedback", { description: "Apply owner-provided effectiveness feedback to an existing outcome.", feature: "goals", permissions: ["goals.write"], risk: "medium", riskCategories: ["durable-data"], approval: "conditional", configuration: ["DATABASE_URL"], dependencies: ["goals.operating-system"], keywords: ["outcome", "effectiveness", "feedback", "helpful"] }),
  tool("review_progress", { description: "Generate a deterministic daily brief or weekly review from canonical state.", feature: "goals", permissions: ["goals.read"], configuration: ["DATABASE_URL"], dependencies: ["goals.operating-system"], keywords: ["daily brief", "weekly review", "stalled", "risk", "priority"] }),
  tool("agent", { description: "Delegate a bounded assignment to a declared specialist.", permissions: ["agents.delegate"], risk: "medium", riskCategories: ["delegated-execution"], approval: "conditional", keywords: ["delegate", "specialist"] }),
  tool("workflow", { description: "Run declared specialist work as a coordinated workflow.", permissions: ["agents.delegate"], risk: "medium", riskCategories: ["delegated-execution"], approval: "conditional", keywords: ["workflow", "parallel", "delegate"] }),
  tool("start_product_qa", { description: "Create the fixed three-specialist product-QA contract.", permissions: ["qa.write", "qa.execute"], risk: "medium", approval: "conditional", configuration: ["DATABASE_URL", "BLOB_READ_WRITE_TOKEN"], dependencies: ["database.neon", "storage.blob"], keywords: ["qa", "test", "preview"] }),
  tool("inspect_tasks", { description: "Inspect owner-scoped audited QA runs and evidence.", permissions: ["qa.read"], configuration: ["DATABASE_URL"], dependencies: ["database.neon"], keywords: ["qa", "activity", "task"] }),
  tool("update_task", { description: "Apply a legal lifecycle transition to an audited QA run.", permissions: ["qa.write"], risk: "medium", approval: "conditional", configuration: ["DATABASE_URL"], dependencies: ["database.neon"], keywords: ["qa", "task", "retry", "cancel"] }),
  tool("complete_task", { description: "Complete QA only after specialists and required evidence pass.", permissions: ["qa.write"], risk: "medium", evidence: { supported: true, required: true, types: ["report", "screenshot", "json"] }, configuration: ["DATABASE_URL"], dependencies: ["database.neon"], keywords: ["qa", "complete", "verify"] }),
  tool("record_task_evidence", { description: "Store redacted, checksummed evidence for an assigned QA check.", permissions: ["evidence.write"], risk: "medium", evidence: { supported: true, required: true, types: ["report", "screenshot", "log", "json"] }, configuration: ["DATABASE_URL", "BLOB_READ_WRITE_TOKEN"], dependencies: ["database.neon", "storage.blob"], keywords: ["evidence", "qa", "artifact"] }),
  tool("create_reminder", { description: "Create a one-off or recurring proactive reminder.", feature: "proactive", permissions: ["automations.write"], risk: "medium", approval: "conditional", configuration: ["DATABASE_URL"], dependencies: ["scheduler.automations"], keywords: ["remind", "schedule", "recurring"] }),
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
    return new Set(["memory", "proactive", "receipts", "skills", "file-sharing", "integrations", "browser", "utilities", "goals"]);
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
