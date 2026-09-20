import {
  getCapability,
  type ResolvedCapability,
} from "./capability-registry.ts";
import { effectiveCapability, getAgent, type AgentView } from "./agents.ts";
import { ROUTINE_TOOLS } from "./routine-capabilities.ts";
import {
  routineConfigurationSchema,
  type RoutineConfiguration,
  type ExecutionDatabase,
} from "./execution-types.ts";
import { ROUTINE_RELEASE } from "./routine-release.ts";
import { db } from "../agent/lib/receipts-db.ts";
import {
  capabilityAvailability,
  type Availability,
  type AvailabilityInput,
} from "./routine-availability.ts";

export type AdmissionState =
  | "READY"
  | "NEEDS_CONFIGURATION"
  | "NEEDS_APPROVAL"
  | "BLOCKED"
  | "AUTO_PAUSED"
  | "DISABLED";
export type AdmissionReason =
  | "provider_missing"
  | "account_missing"
  | "capability_blocked"
  | "routine_not_approved"
  | "routine_version_stale"
  | "agent_unavailable"
  | "profile_grant_missing"
  | "provider_unqualified"
  | "budget_exceeded"
  | "dependency_unavailable"
  | "federation_disabled"
  | "manifest_invalid"
  | "routine_disabled"
  | "auto_paused"
  | "global_disabled";
export const ADMISSION_MESSAGES: Record<AdmissionReason, string> = {
  provider_missing:
    "Connect the required provider before this Routine can run.",
  account_missing:
    "An authenticated account is required before this Routine can run.",
  capability_blocked:
    "This capability is outside the permitted Routine tools or Agent authority.",
  routine_not_approved: "Review this Routine's capabilities before it can run.",
  routine_version_stale: "This Routine changed. Review its current version.",
  agent_unavailable: "Choose an active Agent for this Routine.",
  profile_grant_missing: "Review this Agent's browser profile access.",
  provider_unqualified:
    "This capability has not been qualified for Routine execution.",
  budget_exceeded:
    "The Routine's budget or execution limits are unavailable or exceeded.",
  dependency_unavailable:
    "A required dependency is unavailable. Check its configuration.",
  federation_disabled: "Federation is disabled for this deployment.",
  manifest_invalid: "Review the Routine's capability manifest.",
  routine_disabled: "This Routine is disabled or paused.",
  auto_paused: "This Routine paused after repeated execution failures.",
  global_disabled: "Routine execution is disabled for this deployment.",
};
export interface AdmissionIssue {
  code: AdmissionReason;
  message: string;
  capabilityId?: string;
}
export interface CapabilityReadiness {
  id: string;
  name: string;
  required: boolean;
  permission: "ALLOW" | "REQUIRE_APPROVAL" | "DENY";
  availability: Availability;
  issues: AdmissionIssue[];
}
export interface AdmissionResult {
  state: AdmissionState;
  version: number;
  evaluatedAt: string;
  issues: AdmissionIssue[];
  capabilities: CapabilityReadiness[];
  executionEnabled: boolean;
  canRun: boolean;
  optionalUnavailable: number;
}
export interface AdmissionSubject {
  ownerId: string;
  id: string;
  version: number;
  status: string;
  approved: boolean;
  configuration: RoutineConfiguration;
  agentId: string;
  expectedVersion?: number;
  spent?: number;
}
export interface AdmissionDependencies {
  agent(ownerId: string, agentId: string): Promise<AgentView | null>;
  capability(id: string): ResolvedCapability | undefined;
  permission(agent: AgentView, id: string): boolean;
  availability(input: AvailabilityInput): Promise<Availability>;
  executionEnabled(): boolean;
}
const rank = { low: 0, medium: 1, high: 2, critical: 3 };
export function snapshotRoutineConfiguration(
  input: RoutineConfiguration,
): RoutineConfiguration {
  const config = routineConfigurationSchema.parse(input);
  if (config.manifest) return config;
  return {
    ...config,
    manifest: {
      version: 1,
      tools: Object.entries(ROUTINE_TOOLS)
        .filter(([, v]) =>
          config.authority.allowedCapabilities.includes(v.capability),
        )
        .map(([tool]) => tool),
      required: [...config.authority.allowedCapabilities].sort(),
      optional:
        config.deliveryChannel === "in_app"
          ? []
          : [{ capabilityId: "notification.send", fallback: "in_app_result" }],
    },
  };
}
/** Deterministic admission; the receipt is evidence, never execution authority. */
export async function evaluateRoutineAdmission(
  subject: AdmissionSubject,
  deps: AdmissionDependencies,
): Promise<AdmissionResult> {
  const issues: AdmissionIssue[] = [],
    capabilities: CapabilityReadiness[] = [];
  const add = (code: AdmissionReason, capabilityId?: string) => ({
    code,
    message: ADMISSION_MESSAGES[code],
    ...(capabilityId ? { capabilityId } : {}),
  });
  const config = subject.configuration,
    manifest = config.manifest;
  if (["disabled", "paused", "archived"].includes(subject.status))
    issues.push(add("routine_disabled"));
  if (subject.status === "auto_paused") issues.push(add("auto_paused"));
  if (
    subject.expectedVersion !== undefined &&
    subject.expectedVersion !== subject.version
  )
    issues.push(add("routine_version_stale"));
  if (!subject.approved || !manifest) issues.push(add("routine_not_approved"));
  let agent: AgentView | null = null;
  try {
    agent = await deps.agent(subject.ownerId, subject.agentId);
  } catch {
    issues.push(add("dependency_unavailable"));
  }
  if (!agent || agent.ownerId !== subject.ownerId || agent.status !== "active")
    issues.push(add("agent_unavailable"));
  if (
    agent &&
    (config.limits.maxSteps > agent.limits.maxSteps ||
      config.limits.maxRuntimeSeconds > agent.limits.maxRuntimeSeconds ||
      config.limits.maxCostUsd > agent.limits.maxEstimatedCostUsd ||
      !Number.isFinite(subject.spent ?? 0) ||
      (subject.spent ?? 0) >= config.limits.maxCostUsd)
  )
    issues.push(add("budget_exceeded"));
  if (manifest) {
    const required = [...new Set(manifest.required)].sort();
    const mapped = manifest.tools.map(
      (tool) => ROUTINE_TOOLS[tool]?.capability,
    );
    if (
      manifest.tools.some((tool) => !ROUTINE_TOOLS[tool]) ||
      required.some(
        (id) => !config.authority.allowedCapabilities.includes(id),
      ) ||
      config.authority.allowedCapabilities.some(
        (id) => !required.includes(id),
      ) ||
      mapped.some((id) => !id || !required.includes(id)) ||
      (config.deliveryChannel !== "in_app" &&
        !manifest.optional.some(
          (o) => o.capabilityId === "notification.send",
        )) ||
      manifest.optional.some(
        (o) =>
          o.capabilityId !== "notification.send" ||
          o.fallback !== "in_app_result",
      )
    )
      issues.push(add("manifest_invalid"));
    for (const item of [
      ...required.map((id) => ({ id, required: true })),
      ...manifest.optional.map((o) => ({
        id: o.capabilityId,
        required: false,
      })),
    ]) {
      const problems: AdmissionIssue[] = [];
      let definition: ResolvedCapability | undefined,
        availability: Availability = {
          status: "UNAVAILABLE",
          reasonCode: "dependency_unavailable",
        };
      let permission: CapabilityReadiness["permission"] = "DENY";
      try {
        definition = deps.capability(item.id);
        if (!definition) problems.push(add("capability_blocked", item.id));
        else {
          const supported = manifest.tools.some(
            (tool) =>
              ROUTINE_TOOLS[tool]?.capability === item.id &&
              ROUTINE_TOOLS[tool]?.classification !== "BLOCKED",
          );
          const permitted =
            !item.required ||
            (!!agent &&
              deps.permission(agent, item.id) &&
              rank[definition.risk.level] <=
                rank[config.authority.maximumRisk]);
          permission = permitted
            ? item.id === "tool.send_email" ||
              config.authority.requiresApprovalFor.includes(item.id) ||
              definition.approvalPolicy.mode === "always"
              ? "REQUIRE_APPROVAL"
              : "ALLOW"
            : "DENY";
          if (!permitted) problems.push(add("capability_blocked", item.id));
          availability = await deps.availability({
            ownerId: subject.ownerId,
            agentId: subject.agentId,
            capability: definition,
            targets: config.authority.allowedTargets.filter(
              (t) => t.capabilityId === item.id,
            ),
            deliveryChannel: config.deliveryChannel,
          });
          if (availability.status !== "AVAILABLE")
            problems.push(
              add(availability.reasonCode ?? "dependency_unavailable", item.id),
            );
          // Availability can explain absent profiles/accounts before unsupported executor qualification.
          if (
            item.required &&
            !supported &&
            availability.status === "AVAILABLE"
          )
            problems.push(add("capability_blocked", item.id));
          for (const dependency of definition.dependencies) {
            const dependencyDefinition = deps.capability(dependency);
            if (
              !dependencyDefinition ||
              dependencyDefinition.availability.status !== "available"
            )
              problems.push(add("dependency_unavailable", item.id));
          }
        }
      } catch {
        problems.push(add("dependency_unavailable", item.id));
      }
      capabilities.push({
        id: item.id,
        name: definition?.name ?? item.id,
        required: item.required,
        permission,
        availability,
        issues: problems,
      });
      if (item.required) issues.push(...problems);
    }
  }
  const order: AdmissionReason[] = [
    "routine_disabled",
    "auto_paused",
    "routine_version_stale",
    "manifest_invalid",
    "capability_blocked",
    "agent_unavailable",
    "profile_grant_missing",
    "provider_unqualified",
    "budget_exceeded",
    "federation_disabled",
    "provider_missing",
    "account_missing",
    "dependency_unavailable",
    "routine_not_approved",
  ];
  issues.sort(
    (a, b) =>
      order.indexOf(a.code) - order.indexOf(b.code) ||
      (a.capabilityId ?? "").localeCompare(b.capabilityId ?? ""),
  );
  const code = issues[0]?.code;
  const state: AdmissionState = !code
    ? "READY"
    : code === "routine_disabled"
      ? "DISABLED"
      : code === "auto_paused"
        ? "AUTO_PAUSED"
        : [
              "provider_missing",
              "account_missing",
              "dependency_unavailable",
            ].includes(code)
          ? "NEEDS_CONFIGURATION"
          : code === "routine_not_approved"
            ? "NEEDS_APPROVAL"
            : "BLOCKED";
  const executionEnabled = deps.executionEnabled();
  return {
    state,
    version: subject.version,
    evaluatedAt: new Date().toISOString(),
    issues,
    capabilities,
    executionEnabled,
    canRun: state === "READY" && executionEnabled,
    optionalUnavailable: capabilities.filter(
      (c) => !c.required && c.issues.length > 0,
    ).length,
  };
}
export class RoutineAdmission {
  readonly dependencies: AdmissionDependencies;
  readonly database: ExecutionDatabase;
  constructor(
    database: ExecutionDatabase = db() as ExecutionDatabase,
    dependencies?: AdmissionDependencies,
  ) {
    this.database = database;
    this.dependencies = dependencies ?? {
      agent: (owner, id) => getAgent(owner, id, database),
      capability: (id) => getCapability(id) ?? undefined,
      permission: (agent, id) =>
        effectiveCapability(agent, id, { checkAvailability: false }).allowed,
      availability: (input) => capabilityAvailability(input, database),
      executionEnabled: () => ROUTINE_RELEASE.enabled,
    };
  }
  async inspect(
    ownerId: string,
    id: string,
    expectedVersion?: number,
  ): Promise<AdmissionResult | null> {
    const [row] = await this.database.query(
      `SELECT r.*,v.review_binding,
      EXISTS(SELECT 1 FROM reminders m WHERE m.owner_id=r.owner_id AND m.execution_routine_id=r.id AND m.reviewed_version=m.configuration_version AND m.status IN ('active','done')) AS reminder_reviewed
      FROM execution_routines r JOIN execution_routine_versions v ON v.owner_id=r.owner_id AND v.routine_id=r.id AND v.version=r.version WHERE r.owner_id=$1 AND r.id=$2`,
      [ownerId, id],
    );
    if (!row) return null;
    return evaluateRoutineAdmission(
      {
        ownerId,
        id,
        version: Number(row.version),
        status: String(row.status),
        approved:
          row.source_kind === "reminder"
            ? row.reminder_reviewed === true
            : !!row.review_binding,
        configuration: routineConfigurationSchema.parse(row.configuration),
        agentId: String(row.agent_id),
        expectedVersion,
      },
      this.dependencies,
    );
  }
}
