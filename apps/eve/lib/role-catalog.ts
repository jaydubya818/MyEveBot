export const ROLE_EXECUTION_MODES = ["on-demand", "declared-specialist"] as const;
export const ROLE_REASONING_LEVELS = ["default", "none", "minimal", "low", "medium", "high", "xhigh"] as const;

export type RoleExecutionMode = (typeof ROLE_EXECUTION_MODES)[number];
export type RoleReasoning = (typeof ROLE_REASONING_LEVELS)[number];

export interface RoleDefinition {
  id: string;
  name: string;
  label?: string;
  description: string;
  category: string;
  responsibilities: readonly string[];
  typicalInputs?: readonly string[];
  typicalOutputs?: readonly string[];
  boundaries: readonly string[];
  recommendedCapabilities: readonly string[];
  recommendedModel?: string;
  recommendedReasoning?: RoleReasoning;
  recommendedRiskCeiling?: "low" | "medium" | "high";
  defaultInstructions?: string;
  verificationRole?: boolean;
  tags?: readonly string[];
  executionMode: RoleExecutionMode;
}

export interface RolePackLifecycle {
  name: string;
  stages: readonly { id: string; label: string }[];
}

export interface RolePackEntry {
  role: RoleDefinition;
  lifecycleStages?: readonly string[];
}

export interface RolePack {
  id: string;
  name: string;
  description: string;
  domain?: string;
  roles: readonly RolePackEntry[];
  lifecycle?: RolePackLifecycle;
  catalogVisibility?: "visible" | "internal";
  tags?: readonly string[];
}

export interface RoleCatalog {
  packs: readonly RolePack[];
  roles: readonly RoleDefinition[];
}

export interface RoleAgentDefaults {
  name: string;
  role: string;
  description: string;
  instructions: string;
  preferredModel: string;
  reasoningPreference: RoleReasoning;
  riskCeiling: "low" | "medium" | "high";
  notificationPolicy: "activity";
  capabilityIds: string[];
  maxSteps: number;
  maxRuntimeSeconds: number;
  maxEstimatedCostUsd: number;
  maxRetries: number;
}

export function createRoleCatalog(packs: readonly RolePack[]): RoleCatalog {
  const packIds = new Set<string>();
  const roles = new Map<string, RoleDefinition>();
  for (const pack of packs) {
    if (packIds.has(pack.id)) throw new Error(`Role Pack ${pack.id} is duplicated.`);
    packIds.add(pack.id);
    if (!pack.id || !pack.name || !pack.description || pack.roles.length === 0) {
      throw new Error(`Role Pack ${pack.id || "unknown"} is incomplete.`);
    }
    const lifecycleIds = new Set(pack.lifecycle?.stages.map((stage) => stage.id) ?? []);
    for (const entry of pack.roles) {
      if (!entry.role.id || !entry.role.name || !entry.role.description) {
        throw new Error(`Role Pack ${pack.id} contains an incomplete Role.`);
      }
      for (const stage of entry.lifecycleStages ?? []) {
        if (!lifecycleIds.has(stage)) throw new Error(`${pack.id}:${entry.role.id} references unknown lifecycle stage ${stage}.`);
      }
      const existing = roles.get(entry.role.id);
      if (existing && existing !== entry.role) {
        throw new Error(`Role ${entry.role.id} has conflicting definitions.`);
      }
      roles.set(entry.role.id, entry.role);
    }
  }
  return { packs, roles: [...roles.values()] };
}

export function roleAgentDefaults(role: RoleDefinition): RoleAgentDefaults {
  const boundaryText = role.boundaries.map((boundary) => `- ${boundary}`).join("\n");
  const instructions = role.defaultInstructions?.trim() || [
    `You are operating in the ${role.name} role.`,
    role.description,
    "",
    "Safety boundaries:",
    boundaryText,
  ].join("\n");

  return {
    name: role.name,
    role: role.name,
    description: role.description,
    instructions,
    preferredModel: role.recommendedModel ?? "",
    reasoningPreference: role.recommendedReasoning ?? "default",
    riskCeiling: role.recommendedRiskCeiling ?? "medium",
    notificationPolicy: "activity",
    capabilityIds: [...role.recommendedCapabilities],
    maxSteps: 20,
    maxRuntimeSeconds: 900,
    maxEstimatedCostUsd: 2,
    maxRetries: 1,
  };
}
