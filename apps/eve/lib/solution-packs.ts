import type { RoleCatalog, RoleDefinition } from "./role-catalog.ts";

export const DOMAIN_HEALTH_STATES = ["healthy", "watch", "at_risk", "blocked", "unknown", "not_applicable"] as const;

export type DomainHealth = (typeof DOMAIN_HEALTH_STATES)[number];
export type TemplateMaturity = "defined" | "working";
export type ApprovalRequirement = "allowed" | "approval_required" | "prohibited";

export interface SolutionPackRoleSelection {
  packId: string;
  roleId: string;
  contribution: string;
}

export interface SolutionPackDomain {
  id: string;
  name: string;
  purpose: string;
  health: DomainHealth;
  healthBasis: "manual" | "evidence" | "deterministic" | "unavailable";
  goalTemplateIds: readonly string[];
  metricIds: readonly string[];
  roleIds: readonly string[];
  workflowIds: readonly string[];
  artifactIds: readonly string[];
  exampleDecisions: readonly string[];
  risks: readonly string[];
  dependencyDomainIds: readonly string[];
  knowledgeRequirements: readonly string[];
  recommendedCapabilities: readonly string[];
}

export interface GoalTemplateDefinition {
  id: string;
  name: string;
  description: string;
  maturity: TemplateMaturity;
  domainIds: readonly string[];
  inputs: readonly string[];
  outputs: readonly string[];
  workflowIds: readonly string[];
  guardrails: readonly string[];
}

export interface SolutionWorkflowDefinition {
  id: string;
  name: string;
  description: string;
  coordinatorRoleId: string;
  contributorRoleIds: readonly string[];
  domainIds: readonly string[];
  inputs: readonly string[];
  outputs: readonly string[];
  stages: readonly string[];
  checks: readonly string[];
  approvalPolicyId: string;
}

export interface ArtifactDefinition {
  id: string;
  name: string;
  domainId: string;
  description: string;
  inputs: readonly string[];
  outputType: string;
  recommendedRoleIds: readonly string[];
  requiredKnowledge: readonly string[];
  checks: readonly string[];
  approvalPolicyId: string;
  templateRef?: string;
}

export interface MetricDefinition {
  id: string;
  name: string;
  domainId: string;
  definition: string;
  unit: string;
  source: string;
  freshness: string;
  reportingPeriod: string;
  target?: string;
}

export interface ApprovalPolicyDefinition {
  id: string;
  name: string;
  description: string;
  rules: readonly { action: string; requirement: ApprovalRequirement }[];
}

export interface SolutionPack {
  id: string;
  name: string;
  description: string;
  purpose: string;
  rolePackIds: readonly string[];
  roles: readonly SolutionPackRoleSelection[];
  domains: readonly SolutionPackDomain[];
  goalTemplates: readonly GoalTemplateDefinition[];
  workflowTemplates: readonly SolutionWorkflowDefinition[];
  artifactDefinitions: readonly ArtifactDefinition[];
  metricDefinitions: readonly MetricDefinition[];
  knowledgeRequirements: readonly string[];
  recommendedCapabilities: readonly string[];
  approvalPolicies: readonly ApprovalPolicyDefinition[];
  enabledByDefault: boolean;
  tags?: readonly string[];
}

export interface SolutionPackCatalog {
  packs: readonly SolutionPack[];
}

export interface ResolvedSolutionPackRole extends SolutionPackRoleSelection {
  role: RoleDefinition;
}

function requireUniqueIds(items: readonly { id: string }[], label: string, packId: string): Set<string> {
  const ids = new Set<string>();
  for (const item of items) {
    if (!item.id) throw new Error(`${packId} contains a ${label} without an id.`);
    if (ids.has(item.id)) throw new Error(`${packId} contains duplicate ${label} ${item.id}.`);
    ids.add(item.id);
  }
  return ids;
}

export function createSolutionPackCatalog(
  packs: readonly SolutionPack[],
  roleCatalog: RoleCatalog,
  capabilityIds: ReadonlySet<string>,
): SolutionPackCatalog {
  const rolePackIds = new Set(roleCatalog.packs.map((pack) => pack.id));
  const roleIds = new Set(roleCatalog.roles.map((role) => role.id));
  requireUniqueIds(packs, "Solution Pack", "catalog");

  for (const pack of packs) {
    if (!pack.name || !pack.description || !pack.purpose || pack.domains.length === 0) throw new Error(`Solution Pack ${pack.id || "unknown"} is incomplete.`);
    for (const id of pack.rolePackIds) if (!rolePackIds.has(id)) throw new Error(`${pack.id} references unknown Role Pack ${id}.`);

    const selectionIds = new Set<string>();
    for (const selection of pack.roles) {
      if (!pack.rolePackIds.includes(selection.packId)) throw new Error(`${pack.id} selects Role ${selection.roleId} from undeclared Role Pack ${selection.packId}.`);
      const rolePack = roleCatalog.packs.find((candidate) => candidate.id === selection.packId);
      if (!rolePack?.roles.some(({ role }) => role.id === selection.roleId)) throw new Error(`${pack.id} references Role ${selection.roleId} outside Role Pack ${selection.packId}.`);
      if (selectionIds.has(selection.roleId)) throw new Error(`${pack.id} selects Role ${selection.roleId} more than once.`);
      selectionIds.add(selection.roleId);
    }

    const domainIds = requireUniqueIds(pack.domains, "domain", pack.id);
    const goalIds = requireUniqueIds(pack.goalTemplates, "Goal Template", pack.id);
    const workflowIds = requireUniqueIds(pack.workflowTemplates, "Workflow Template", pack.id);
    const artifactIds = requireUniqueIds(pack.artifactDefinitions, "Artifact Definition", pack.id);
    const metricIds = requireUniqueIds(pack.metricDefinitions, "Metric Definition", pack.id);
    const approvalIds = requireUniqueIds(pack.approvalPolicies, "Approval Policy", pack.id);

    for (const domain of pack.domains) {
      for (const id of domain.roleIds) if (!roleIds.has(id) || !selectionIds.has(id)) throw new Error(`${pack.id}:${domain.id} references unselected Role ${id}.`);
      for (const id of domain.goalTemplateIds) if (!goalIds.has(id)) throw new Error(`${pack.id}:${domain.id} references unknown Goal Template ${id}.`);
      for (const id of domain.workflowIds) if (!workflowIds.has(id)) throw new Error(`${pack.id}:${domain.id} references unknown Workflow Template ${id}.`);
      for (const id of domain.artifactIds) if (!artifactIds.has(id)) throw new Error(`${pack.id}:${domain.id} references unknown Artifact Definition ${id}.`);
      for (const id of domain.metricIds) if (!metricIds.has(id)) throw new Error(`${pack.id}:${domain.id} references unknown Metric Definition ${id}.`);
      for (const id of domain.dependencyDomainIds) if (!domainIds.has(id)) throw new Error(`${pack.id}:${domain.id} references unknown domain ${id}.`);
      for (const id of domain.recommendedCapabilities) if (!capabilityIds.has(id)) throw new Error(`${pack.id}:${domain.id} recommends unknown capability ${id}.`);
    }
    for (const goal of pack.goalTemplates) {
      for (const id of goal.domainIds) if (!domainIds.has(id)) throw new Error(`${pack.id}:${goal.id} references unknown domain ${id}.`);
      for (const id of goal.workflowIds) if (!workflowIds.has(id)) throw new Error(`${pack.id}:${goal.id} references unknown Workflow Template ${id}.`);
    }
    for (const workflow of pack.workflowTemplates) {
      if (!selectionIds.has(workflow.coordinatorRoleId)) throw new Error(`${pack.id}:${workflow.id} references unselected coordinator Role ${workflow.coordinatorRoleId}.`);
      for (const id of workflow.contributorRoleIds) if (!selectionIds.has(id)) throw new Error(`${pack.id}:${workflow.id} references unselected contributor Role ${id}.`);
      for (const id of workflow.domainIds) if (!domainIds.has(id)) throw new Error(`${pack.id}:${workflow.id} references unknown domain ${id}.`);
      if (!approvalIds.has(workflow.approvalPolicyId)) throw new Error(`${pack.id}:${workflow.id} references unknown Approval Policy ${workflow.approvalPolicyId}.`);
    }
    for (const artifact of pack.artifactDefinitions) {
      if (!domainIds.has(artifact.domainId)) throw new Error(`${pack.id}:${artifact.id} references unknown domain ${artifact.domainId}.`);
      for (const id of artifact.recommendedRoleIds) if (!selectionIds.has(id)) throw new Error(`${pack.id}:${artifact.id} references unselected Role ${id}.`);
      if (!approvalIds.has(artifact.approvalPolicyId)) throw new Error(`${pack.id}:${artifact.id} references unknown Approval Policy ${artifact.approvalPolicyId}.`);
    }
    for (const id of pack.recommendedCapabilities) if (!capabilityIds.has(id)) throw new Error(`${pack.id} recommends unknown capability ${id}.`);
  }
  return { packs };
}

export function resolveSolutionPackRoles(pack: SolutionPack, roleCatalog: RoleCatalog): ResolvedSolutionPackRole[] {
  return pack.roles.map((selection) => {
    const role = roleCatalog.roles.find((candidate) => candidate.id === selection.roleId);
    if (!role) throw new Error(`Solution Pack ${pack.id} references unknown Role ${selection.roleId}.`);
    return { ...selection, role };
  });
}
