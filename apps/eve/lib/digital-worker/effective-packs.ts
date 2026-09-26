import { z } from "zod";
import {
  compositionSchema,
  digitalWorkContractSchema,
  scopeSchema,
  type WorkerComposition,
} from "./contracts.ts";
import {
  capabilityPackSchema,
  JSTACK_CAPABILITY_PACK_V1,
  modeSchema,
  NORMAL_MODE_V1,
  POTATO_MODE_V1,
  rolePackSchema,
  SOFTWARE_ENGINEER_ROLE_V1,
} from "./packs.ts";

const referenceList = z.array(z.string().trim().min(1)).max(30)
  .refine(values => new Set(values).size === values.length);

/** Current authority is supplied by a trusted caller, never by a Role or Mode. */
export const packAuthorityFactsSchema = z.object({
  workId: z.string().uuid(),
  workVersion: z.number().int().positive(),
  criteriaVersion: z.number().int().positive(),
  policyVersion: z.number().int().positive(),
  scope: scopeSchema,
  agentId: z.string().min(1),
  decision: z.enum(["ALLOW", "DENY", "UNKNOWN"]),
  allowedOperations: referenceList,
  allowedResourceRefs: referenceList,
  remainingBudgetUsd: z.number().finite().nonnegative(),
  observedAt: z.string().datetime({ offset: true }),
}).strict();

export const effectiveRunConfigurationSchema = z.object({
  work: z.object({
    id: z.string().uuid(),
    version: z.number().int().positive(),
    criteriaVersion: z.number().int().positive(),
    policyVersion: z.number().int().positive(),
    composition: compositionSchema,
  }).strict(),
  role: rolePackSchema,
  capabilityPacks: z.array(capabilityPackSchema),
  mode: modeSchema,
  authority: z.object({
    status: z.enum(["CURRENT", "BLOCKED"]),
    allowedOperations: referenceList,
    allowedResourceRefs: referenceList,
    remainingBudgetUsd: z.number().finite().nonnegative(),
    reasons: z.array(z.string().min(1)),
  }).strict(),
}).strict().refine(config => config.authority.status === "CURRENT"
  ? config.authority.reasons.length === 0
  : config.authority.allowedOperations.length === 0 &&
    config.authority.allowedResourceRefs.length === 0 &&
    config.authority.remainingBudgetUsd === 0,
"Blocked authority cannot retain executable scope.");
export type EffectiveRunConfiguration = z.infer<typeof effectiveRunConfigurationSchema>;

function sameReference(left: { id: string; version: number }, right: { id: string; version: number }) {
  return left.id === right.id && left.version === right.version;
}

function resolveComposition(composition: WorkerComposition) {
  if (!sameReference(composition.role, SOFTWARE_ENGINEER_ROLE_V1))
    throw new Error("The Software Engineer Role version is unavailable.");
  if (composition.capabilityPacks.length !== 1 ||
      !sameReference(composition.capabilityPacks[0]!, JSTACK_CAPABILITY_PACK_V1) ||
      !SOFTWARE_ENGINEER_ROLE_V1.compatibleCapabilityPacks.includes(JSTACK_CAPABILITY_PACK_V1.id))
    throw new Error("The JStack Capability Pack version is unavailable or incompatible.");
  const mode = [NORMAL_MODE_V1, POTATO_MODE_V1].find(candidate => sameReference(composition.mode, candidate));
  if (!mode) throw new Error("The requested engineering Mode version is unavailable.");
  return mode;
}

/** A serializable Run snapshot. Its authority fields only narrow current Work and policy facts. */
export function resolveEffectiveEngineeringRunConfiguration(
  workInput: unknown,
  authorityInput: unknown,
  now = Date.now(),
): EffectiveRunConfiguration {
  const work = digitalWorkContractSchema.parse(workInput);
  const current = packAuthorityFactsSchema.parse(authorityInput);
  const mode = resolveComposition(work.composition);
  const reasons: string[] = [];
  if (current.workId !== work.workId || current.workVersion !== work.workVersion ||
      current.criteriaVersion !== work.criteriaVersion || current.policyVersion !== work.policyVersion)
    reasons.push("Work, criteria or policy revision changed.");
  if (current.scope.kind !== work.scope.kind || current.scope.id !== work.scope.id ||
      current.agentId !== work.coordinatingAgentId)
    reasons.push("Current authority belongs to a different Agent or scope.");
  if (current.decision !== "ALLOW") reasons.push("Current policy does not allow this Run.");
  if (Date.parse(current.observedAt) > now + 5000 || now - Date.parse(current.observedAt) > 60_000)
    reasons.push("Current authority facts are stale or future-dated.");
  if (Date.parse(work.deadline) <= now) reasons.push("Work deadline has passed.");
  if (current.remainingBudgetUsd <= 0 || current.remainingBudgetUsd > work.budgetUsd)
    reasons.push("Current Work budget is unavailable or inconsistent.");

  const active = reasons.length === 0;
  return effectiveRunConfigurationSchema.parse({
    work: {
      id: work.workId,
      version: work.workVersion,
      criteriaVersion: work.criteriaVersion,
      policyVersion: work.policyVersion,
      composition: work.composition,
    },
    role: SOFTWARE_ENGINEER_ROLE_V1,
    capabilityPacks: [JSTACK_CAPABILITY_PACK_V1],
    mode,
    authority: {
      status: active ? "CURRENT" : "BLOCKED",
      allowedOperations: active ? work.allowedOperations.filter(value => current.allowedOperations.includes(value)) : [],
      allowedResourceRefs: active ? work.resourceRefs.filter(value => current.allowedResourceRefs.includes(value)) : [],
      remainingBudgetUsd: active ? current.remainingBudgetUsd : 0,
      reasons,
    },
  });
}

export const recoverySituationSchema = z.object({
  kind: z.enum(["routine", "scope-change", "authority-change", "irreversible"]),
  operation: z.string().min(1),
  resourceRef: z.string().min(1),
  attemptsRemaining: z.number().int().nonnegative(),
  estimatedCostUsd: z.number().finite().nonnegative(),
  candidateRetained: z.boolean(),
}).strict();

/** Advice only: an admitted route and current Action Gateway check still precede every effect. */
export function recommendEngineeringRecovery(configInput: unknown, situationInput: unknown) {
  const config = effectiveRunConfigurationSchema.parse(configInput);
  const situation = recoverySituationSchema.parse(situationInput);
  const pinnedMode = resolveComposition(config.work.composition);
  if (Object.entries(pinnedMode).some(([key, value]) => config.mode[key as keyof typeof config.mode] !== value))
    throw new Error("The effective Mode does not match the Work's pinned composition.");
  if (config.authority.status !== "CURRENT")
    return { recommendation: "BLOCKED" as const, reason: "Current Work authority must be refreshed." };
  if (!config.authority.allowedOperations.includes(situation.operation) ||
      !config.authority.allowedResourceRefs.includes(situation.resourceRef))
    return { recommendation: "BLOCKED" as const, reason: "This operation or resource is outside current authority." };
  if (situation.kind !== "routine")
    return { recommendation: "ASK_HUMAN" as const, reason: "Scope, authority and irreversible effects require a human decision." };
  if (!situation.candidateRetained || situation.attemptsRemaining === 0 ||
      situation.estimatedCostUsd > config.authority.remainingBudgetUsd)
    return { recommendation: "ASK_HUMAN" as const, reason: "Routine recovery has exhausted its safe bounds." };
  if (config.mode.routineRecovery !== "autonomous")
    return { recommendation: "ASK_HUMAN" as const, reason: "Normal mode asks for guidance before routine recovery." };
  return { recommendation: "RECOVER_WITHIN_SCOPE" as const, reason: "High initiative mode recommends one bounded recovery step." };
}
