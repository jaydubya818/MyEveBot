import { randomUUID } from "node:crypto";

import { db } from "../agent/lib/receipts-db.ts";
import {
  CAPABILITY_DEFINITIONS,
  getCapability,
  type CapabilityRisk,
} from "./capability-registry.ts";
import { PRIMARY_AGENT_BOOTSTRAP } from "./primary-agent-bootstrap.ts";

export const AGENT_STATUSES = ["active", "paused", "disabled", "archived"] as const;
export const AGENT_REASONING = ["default", "none", "minimal", "low", "medium", "high", "xhigh"] as const;
export const AGENT_RISK_CEILINGS = ["low", "medium", "high"] as const;
export const AGENT_NOTIFICATION_POLICIES = ["silent", "activity", "digest", "push_on_block"] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];
export type AgentReasoning = (typeof AGENT_REASONING)[number];
export type AgentRiskCeiling = (typeof AGENT_RISK_CEILINGS)[number];
export type AgentNotificationPolicy = (typeof AGENT_NOTIFICATION_POLICIES)[number];
export type AgentActorType = "owner" | "agent" | "system";

export interface AgentLimits {
  maxSteps: number;
  maxRuntimeSeconds: number;
  maxEstimatedCostUsd: number;
  maxRetries: number;
}

export interface AgentCapabilityView {
  id: string;
  name: string;
  enabled: boolean;
  risk: CapabilityRisk;
  availability: "available" | "unconfigured" | "degraded" | "disabled" | "unavailable";
  availabilityReason?: string;
}

export interface AgentView {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
  label: string | null;
  role: string;
  description: string;
  instructions: string;
  status: AgentStatus;
  isPrimary: boolean;
  preferredModel: string | null;
  reasoningPreference: AgentReasoning;
  avatarConfig: Record<string, unknown>;
  riskCeiling: AgentRiskCeiling;
  notificationPolicy: AgentNotificationPolicy;
  limits: AgentLimits;
  capabilities: AgentCapabilityView[];
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface AgentWriteInput {
  name: string;
  role: string;
  description?: string;
  instructions: string;
  preferredModel?: string | null;
  reasoningPreference?: AgentReasoning;
  riskCeiling?: AgentRiskCeiling;
  notificationPolicy?: AgentNotificationPolicy;
  limits?: Partial<AgentLimits>;
  capabilityIds?: readonly string[];
}

export interface AgentActor {
  type: AgentActorType;
  id?: string;
}

export interface AgentActivityView {
  id: string; agentId: string; agentName: string; type: string; actorType: AgentActorType;
  summary: string; changes: Record<string, unknown>; createdAt: string;
}

type Row = Record<string, unknown>;
const MODEL_ID_PATTERN = /^[\w.-]+\/[\w.:-]+$/;
const RISK_ORDER: Record<CapabilityRisk, number> = { low: 0, medium: 1, high: 2, critical: 3 };
const DEFAULT_LIMITS: AgentLimits = {
  maxSteps: 20,
  maxRuntimeSeconds: 900,
  maxEstimatedCostUsd: 2,
  maxRetries: 1,
};

function asText(value: unknown): string { return typeof value === "string" ? value : String(value ?? ""); }
function nullableText(value: unknown): string | null { return value == null ? null : asText(value); }
function asIso(value: unknown): string { return value instanceof Date ? value.toISOString() : asText(value); }

export function agentSlug(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "agent";
}

export function validateAgentInput(input: AgentWriteInput): string | null {
  if (!input.name?.trim() || input.name.trim().length > 80) return "Name must be between 1 and 80 characters.";
  if (!input.role?.trim() || input.role.trim().length > 120) return "Role must be between 1 and 120 characters.";
  if (!input.instructions?.trim() || input.instructions.length > 20_000) return "Instructions must be between 1 and 20,000 characters.";
  if (input.description !== undefined && input.description.length > 2_000) return "Description must be 2,000 characters or fewer.";
  if (input.preferredModel && !MODEL_ID_PATTERN.test(input.preferredModel)) return "Preferred model must look like provider/model.";
  if (input.reasoningPreference && !AGENT_REASONING.includes(input.reasoningPreference)) return "Unknown reasoning preference.";
  if (input.riskCeiling && !AGENT_RISK_CEILINGS.includes(input.riskCeiling)) return "Unknown risk ceiling.";
  if (input.notificationPolicy && !AGENT_NOTIFICATION_POLICIES.includes(input.notificationPolicy)) return "Unknown notification policy.";
  const limits = { ...DEFAULT_LIMITS, ...input.limits };
  if (!Number.isInteger(limits.maxSteps) || limits.maxSteps < 1 || limits.maxSteps > 200) return "Max steps must be between 1 and 200.";
  if (!Number.isInteger(limits.maxRuntimeSeconds) || limits.maxRuntimeSeconds < 10 || limits.maxRuntimeSeconds > 86_400) return "Max runtime must be between 10 and 86,400 seconds.";
  if (!Number.isFinite(limits.maxEstimatedCostUsd) || limits.maxEstimatedCostUsd <= 0) return "Max estimated cost must be greater than zero.";
  if (!Number.isInteger(limits.maxRetries) || limits.maxRetries < 0 || limits.maxRetries > 10) return "Max retries must be between 0 and 10.";
  const ids = [...new Set(input.capabilityIds ?? [])];
  if (ids.length !== (input.capabilityIds ?? []).length) return "Capability ids must be unique.";
  for (const id of ids) {
    const capability = CAPABILITY_DEFINITIONS.find((item) => item.id === id);
    if (!capability) return `Unknown capability: ${id}.`;
    if (RISK_ORDER[capability.risk.level] > RISK_ORDER[input.riskCeiling ?? "low"]) {
      return `${capability.name} exceeds the Agent's ${(input.riskCeiling ?? "low")} risk ceiling.`;
    }
  }
  return null;
}

async function uniqueSlug(ownerId: string, name: string, excludeId?: string): Promise<string> {
  const base = agentSlug(name);
  const rows = await db().query(
    `SELECT slug FROM agents WHERE owner_id = $1 AND slug LIKE $2 AND ($3::text IS NULL OR id <> $3)`,
    [ownerId, `${base}%`, excludeId ?? null],
  ) as Row[];
  const used = new Set(rows.map((row) => asText(row.slug)));
  if (!used.has(base)) return base;
  for (let suffix = 2; suffix < 10_000; suffix++) if (!used.has(`${base}-${suffix}`)) return `${base}-${suffix}`;
  throw new Error("Could not create a unique Agent slug.");
}

function capabilityViews(rows: Row[], env: NodeJS.ProcessEnv): AgentCapabilityView[] {
  return rows.map((row) => {
    const resolved = getCapability(asText(row.capability_id), env);
    return {
      id: asText(row.capability_id),
      name: resolved?.name ?? asText(row.capability_id),
      enabled: row.enabled === true,
      risk: resolved?.risk.level ?? "critical",
      availability: resolved?.availability.status ?? "unavailable",
      ...(resolved?.availability.reason ? { availabilityReason: resolved.availability.reason } : {}),
    };
  });
}

function toAgent(row: Row, capabilityRows: Row[], env: NodeJS.ProcessEnv): AgentView {
  const avatar = row.avatar_config;
  return {
    id: asText(row.id), ownerId: asText(row.owner_id), name: asText(row.name), slug: asText(row.slug),
    label: nullableText(row.label), role: asText(row.role), description: asText(row.description),
    instructions: asText(row.instructions), status: asText(row.status) as AgentStatus,
    isPrimary: row.is_primary === true, preferredModel: nullableText(row.preferred_model),
    reasoningPreference: asText(row.reasoning_preference) as AgentReasoning,
    avatarConfig: avatar && typeof avatar === "object" && !Array.isArray(avatar) ? avatar as Record<string, unknown> : {},
    riskCeiling: asText(row.risk_ceiling) as AgentRiskCeiling,
    notificationPolicy: asText(row.notification_policy) as AgentNotificationPolicy,
    limits: { maxSteps: Number(row.max_steps), maxRuntimeSeconds: Number(row.max_runtime_seconds), maxEstimatedCostUsd: Number(row.max_estimated_cost_usd), maxRetries: Number(row.max_retries) },
    capabilities: capabilityViews(capabilityRows, env), createdAt: asIso(row.created_at), updatedAt: asIso(row.updated_at), archivedAt: row.archived_at == null ? null : asIso(row.archived_at),
  };
}

async function recordAudit(ownerId: string, agentId: string, type: string, actor: AgentActor, summary: string, changes: unknown = {}): Promise<void> {
  await db().query(
    `INSERT INTO agent_audit_events (id, owner_id, agent_id, event_type, actor_type, actor_id, summary, changes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
    [`agent_event_${randomUUID()}`, ownerId, agentId, type, actor.type, actor.id ?? null, summary, JSON.stringify(changes)],
  );
}

export async function ensurePrimaryAgent(ownerId: string): Promise<AgentView> {
  const existing = await db().query(`SELECT id FROM agents WHERE owner_id = $1 AND is_primary LIMIT 1`, [ownerId]) as Row[];
  if (existing[0]) return (await getAgent(ownerId, asText(existing[0].id)))!;
  const id = `agent_${randomUUID()}`;
  const slug = await uniqueSlug(ownerId, PRIMARY_AGENT_BOOTSTRAP.name);
  await db().query(
    `INSERT INTO agents (id, owner_id, name, slug, role, description, instructions, is_primary, preferred_model, risk_ceiling, created_by_type)
     VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8,'high','system') ON CONFLICT DO NOTHING`,
    [id, ownerId, PRIMARY_AGENT_BOOTSTRAP.name, slug, PRIMARY_AGENT_BOOTSTRAP.role, PRIMARY_AGENT_BOOTSTRAP.description, PRIMARY_AGENT_BOOTSTRAP.instructions, PRIMARY_AGENT_BOOTSTRAP.preferredModel],
  );
  const primary = await db().query(`SELECT id FROM agents WHERE owner_id = $1 AND is_primary LIMIT 1`, [ownerId]) as Row[];
  const primaryId = asText(primary[0]?.id);
  if (!primaryId) throw new Error("Primary Agent initialization failed.");
  if (primaryId === id) await recordAudit(ownerId, id, "created", { type: "system" }, `${PRIMARY_AGENT_BOOTSTRAP.name} initialized as the primary Agent.`);
  return (await getAgent(ownerId, primaryId))!;
}

export async function listAgents(ownerId: string, includeArchived = false): Promise<AgentView[]> {
  await ensurePrimaryAgent(ownerId);
  const rows = await db().query(
    `SELECT * FROM agents WHERE owner_id = $1 AND ($2::boolean OR status <> 'archived') ORDER BY is_primary DESC, name ASC`,
    [ownerId, includeArchived],
  ) as Row[];
  const capabilities = await db().query(`SELECT * FROM agent_capabilities WHERE owner_id = $1 AND enabled`, [ownerId]) as Row[];
  return rows.map((row) => toAgent(row, capabilities.filter((cap) => cap.agent_id === row.id), process.env));
}

export async function getAgent(ownerId: string, agentId: string, database: {query:(sql:string,params:unknown[])=>Promise<unknown>} = db()): Promise<AgentView | null> {
  const rows = await database.query(`SELECT * FROM agents WHERE owner_id = $1 AND id = $2 LIMIT 1`, [ownerId, agentId]) as Row[];
  if (!rows[0]) return null;
  const capabilities = await database.query(`SELECT * FROM agent_capabilities WHERE owner_id = $1 AND agent_id = $2 AND enabled ORDER BY capability_id`, [ownerId, agentId]) as Row[];
  return toAgent(rows[0], capabilities, process.env);
}

export async function createAgent(ownerId: string, input: AgentWriteInput, actor: AgentActor): Promise<AgentView> {
  const error = validateAgentInput(input); if (error) throw new Error(error);
  await ensurePrimaryAgent(ownerId);
  const id = `agent_${randomUUID()}`; const slug = await uniqueSlug(ownerId, input.name);
  const limits = { ...DEFAULT_LIMITS, ...input.limits };
  const capabilityIds = input.capabilityIds ?? [];
  await db().transaction((tx) => [
    tx`INSERT INTO agents (id,owner_id,name,slug,role,description,instructions,preferred_model,reasoning_preference,risk_ceiling,notification_policy,max_steps,max_runtime_seconds,max_estimated_cost_usd,max_retries,created_by_type,created_by_id)
       VALUES (${id},${ownerId},${input.name.trim()},${slug},${input.role.trim()},${input.description?.trim() ?? ""},${input.instructions.trim()},${input.preferredModel || null},${input.reasoningPreference ?? "default"},${input.riskCeiling ?? "low"},${input.notificationPolicy ?? "activity"},${limits.maxSteps},${limits.maxRuntimeSeconds},${limits.maxEstimatedCostUsd},${limits.maxRetries},${actor.type},${actor.id ?? null})`,
    ...capabilityIds.map((capabilityId) => tx`INSERT INTO agent_capabilities (owner_id, agent_id, capability_id, assigned_by_type, assigned_by_id) VALUES (${ownerId},${id},${capabilityId},${actor.type},${actor.id ?? null})`),
    tx`INSERT INTO agent_audit_events (id,owner_id,agent_id,event_type,actor_type,actor_id,summary,changes)
       VALUES (${`agent_event_${randomUUID()}`},${ownerId},${id},'created',${actor.type},${actor.id ?? null},${`${input.name.trim()} Agent created.`},${JSON.stringify({ capabilityIds })}::jsonb)`,
  ]);
  return (await getAgent(ownerId, id))!;
}

export async function updateAgent(ownerId: string, agentId: string, input: AgentWriteInput, actor: AgentActor): Promise<AgentView> {
  const current = await getAgent(ownerId, agentId); if (!current) throw new Error("Agent not found.");
  const error = validateAgentInput(input); if (error) throw new Error(error);
  const slug = input.name.trim() === current.name ? current.slug : await uniqueSlug(ownerId, input.name, agentId);
  const limits = { ...DEFAULT_LIMITS, ...input.limits };
  const beforeCapabilities = current.capabilities.filter((capability) => capability.enabled).map((capability) => capability.id).sort();
  const afterCapabilities = [...(input.capabilityIds ?? [])].sort();
  const capabilitiesChanged = JSON.stringify(beforeCapabilities) !== JSON.stringify(afterCapabilities);
  await db().transaction((tx) => [
    tx`UPDATE agents SET name=${input.name.trim()},slug=${slug},role=${input.role.trim()},description=${input.description?.trim() ?? ""},instructions=${input.instructions.trim()},preferred_model=${input.preferredModel || null},reasoning_preference=${input.reasoningPreference ?? "default"},risk_ceiling=${input.riskCeiling ?? "low"},notification_policy=${input.notificationPolicy ?? "activity"},max_steps=${limits.maxSteps},max_runtime_seconds=${limits.maxRuntimeSeconds},max_estimated_cost_usd=${limits.maxEstimatedCostUsd},max_retries=${limits.maxRetries},updated_at=now() WHERE owner_id=${ownerId} AND id=${agentId}`,
    tx`DELETE FROM agent_capabilities WHERE owner_id=${ownerId} AND agent_id=${agentId}`,
    ...afterCapabilities.map((capabilityId) => tx`INSERT INTO agent_capabilities (owner_id, agent_id, capability_id, assigned_by_type, assigned_by_id) VALUES (${ownerId},${agentId},${capabilityId},${actor.type},${actor.id ?? null})`),
    tx`INSERT INTO agent_audit_events (id,owner_id,agent_id,event_type,actor_type,actor_id,summary,changes)
       VALUES (${`agent_event_${randomUUID()}`},${ownerId},${agentId},'updated',${actor.type},${actor.id ?? null},${`${input.name.trim()} Agent configuration updated.`},${JSON.stringify({ capabilityIds: afterCapabilities })}::jsonb)`,
    ...(capabilitiesChanged ? [tx`INSERT INTO agent_audit_events (id,owner_id,agent_id,event_type,actor_type,actor_id,summary,changes)
       VALUES (${`agent_event_${randomUUID()}`},${ownerId},${agentId},'capabilities_changed',${actor.type},${actor.id ?? null},${`${input.name.trim()} Agent capabilities changed.`},${JSON.stringify({ before: beforeCapabilities, after: afterCapabilities })}::jsonb)`] : []),
  ]);
  return (await getAgent(ownerId, agentId))!;
}

export async function transitionAgent(ownerId: string, agentId: string, status: Exclude<AgentStatus,"disabled"> | "disabled", actor: AgentActor): Promise<AgentView> {
  const current = await getAgent(ownerId, agentId); if (!current) throw new Error("Agent not found.");
  if (current.isPrimary && status !== "active") throw new Error("The primary Agent cannot be paused, disabled, or archived without a replacement.");
  const event = status === "active" ? "resumed" : status;
  await db().transaction((tx) => [
    tx`UPDATE agents SET status=${status}, archived_at=CASE WHEN ${status}='archived' THEN now() ELSE NULL END, updated_at=now() WHERE owner_id=${ownerId} AND id=${agentId}`,
    tx`INSERT INTO agent_audit_events (id,owner_id,agent_id,event_type,actor_type,actor_id,summary,changes)
       VALUES (${`agent_event_${randomUUID()}`},${ownerId},${agentId},${event},${actor.type},${actor.id ?? null},${`${current.name} ${event}.`},'{}'::jsonb)`,
  ]);
  return (await getAgent(ownerId, agentId))!;
}

export async function duplicateAgent(ownerId: string, agentId: string, name: string | undefined, actor: AgentActor): Promise<AgentView> {
  const source = await getAgent(ownerId, agentId); if (!source) throw new Error("Agent not found.");
  const copy = await createAgent(ownerId, { name: name?.trim() || `${source.name} Copy`, role: source.role, description: source.description, instructions: source.instructions, preferredModel: source.preferredModel, reasoningPreference: source.reasoningPreference, riskCeiling: source.riskCeiling, notificationPolicy: source.notificationPolicy, limits: source.limits, capabilityIds: source.capabilities.filter((cap) => cap.enabled).map((cap) => cap.id) }, actor);
  await recordAudit(ownerId, copy.id, "duplicated", actor, `${copy.name} duplicated from ${source.name}.`, { sourceAgentId: source.id });
  return copy;
}

export function effectiveCapability(agent: AgentView, capabilityId: string, options: {checkAvailability?:boolean} = {}): { allowed: boolean; reason?: string } {
  if (agent.status !== "active") return { allowed: false, reason: `${agent.name} is ${agent.status} and cannot execute work.` };
  if (agent.isPrimary) return { allowed: true };
  const definition = getCapability(capabilityId);
  const assignment = agent.capabilities.find((capability) => capability.enabled && (
    capability.id === capabilityId || definition?.dependencies.includes(capability.id)
  ));
  if (!assignment) return { allowed: false, reason: `Capability unavailable for ${agent.name}. It is not assigned.` };
  if (definition && RISK_ORDER[definition.risk.level] > RISK_ORDER[agent.riskCeiling]) return { allowed: false, reason: `Capability unavailable for ${agent.name}. It exceeds the Agent's ${agent.riskCeiling} risk ceiling.` };
  if (options.checkAvailability===false) return {allowed:true};
  if (assignment.availability !== "available") return { allowed: false, reason: `Capability unavailable for ${agent.name}. ${assignment.availabilityReason ?? "Required configuration is unavailable."}` };
  if (definition && definition.availability.status !== "available") return { allowed: false, reason: `Capability unavailable for ${agent.name}. ${definition.availability.reason ?? "Required configuration is unavailable."}` };
  return { allowed: true };
}

export async function listAgentActivity(ownerId: string, limit = 50): Promise<AgentActivityView[]> {
  const rows = await db().query(
    `SELECT e.id,e.agent_id,a.name AS agent_name,e.event_type,e.actor_type,e.summary,e.changes,e.created_at
     FROM agent_audit_events e JOIN agents a ON a.owner_id=e.owner_id AND a.id=e.agent_id
     WHERE e.owner_id=$1 ORDER BY e.created_at DESC,e.id DESC LIMIT $2`,
    [ownerId, Math.max(1, Math.min(limit, 100))],
  ) as Row[];
  return rows.map((row) => ({
    id: asText(row.id), agentId: asText(row.agent_id), agentName: asText(row.agent_name),
    type: asText(row.event_type), actorType: asText(row.actor_type) as AgentActorType,
    summary: asText(row.summary),
    changes: row.changes && typeof row.changes === "object" && !Array.isArray(row.changes) ? row.changes as Record<string, unknown> : {},
    createdAt: asIso(row.created_at),
  }));
}
