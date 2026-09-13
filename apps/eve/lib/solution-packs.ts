import type { RoleCatalog, RoleDefinition } from "./role-catalog.ts";

export interface SolutionPackRoleSelection {
  packId: string;
  roleId: string;
  contribution: string;
}

export interface SolutionPackCapabilityRecommendation {
  capabilityId: string;
  purpose: string;
}

export interface SolutionPackCheckpoint {
  id: string;
  name: string;
  description: string;
  recommendedCapabilityIds: readonly string[];
}

export interface SolutionPack {
  id: string;
  name: string;
  description: string;
  intendedFor: string;
  outcome: string;
  roles: readonly SolutionPackRoleSelection[];
  capabilityRecommendations: readonly SolutionPackCapabilityRecommendation[];
  checkpoints: readonly SolutionPackCheckpoint[];
  guardrails: readonly string[];
  tags?: readonly string[];
}

export interface SolutionPackCatalog {
  packs: readonly SolutionPack[];
}

export interface ResolvedSolutionPackRole extends SolutionPackRoleSelection {
  role: RoleDefinition;
}

export function createSolutionPackCatalog(
  packs: readonly SolutionPack[],
  roleCatalog: RoleCatalog,
  capabilityIds: ReadonlySet<string>,
): SolutionPackCatalog {
  const solutionPackIds = new Set<string>();

  for (const solutionPack of packs) {
    if (solutionPackIds.has(solutionPack.id)) {
      throw new Error(`Solution Pack ${solutionPack.id} is defined more than once.`);
    }
    solutionPackIds.add(solutionPack.id);

    const roleSelectionIds = new Set<string>();
    for (const selection of solutionPack.roles) {
      const rolePack = roleCatalog.packs.find((candidate) => candidate.id === selection.packId);
      if (!rolePack) throw new Error(`Solution Pack ${solutionPack.id} references unknown Role Pack ${selection.packId}.`);
      if (!rolePack.roles.some(({ role }) => role.id === selection.roleId)) {
        throw new Error(`Solution Pack ${solutionPack.id} references Role ${selection.roleId} outside Role Pack ${selection.packId}.`);
      }
      const selectionId = `${selection.packId}:${selection.roleId}`;
      if (roleSelectionIds.has(selectionId)) {
        throw new Error(`Solution Pack ${solutionPack.id} selects ${selectionId} more than once.`);
      }
      roleSelectionIds.add(selectionId);
    }

    const recommendations = [
      ...solutionPack.capabilityRecommendations.map(({ capabilityId }) => capabilityId),
      ...solutionPack.checkpoints.flatMap(({ recommendedCapabilityIds }) => recommendedCapabilityIds),
    ];
    for (const capabilityId of recommendations) {
      if (!capabilityIds.has(capabilityId)) {
        throw new Error(`Solution Pack ${solutionPack.id} recommends unknown capability ${capabilityId}.`);
      }
    }
  }

  return { packs };
}

export function resolveSolutionPackRoles(
  solutionPack: SolutionPack,
  roleCatalog: RoleCatalog,
): ResolvedSolutionPackRole[] {
  return solutionPack.roles.map((selection) => {
    const role = roleCatalog.roles.find((candidate) => candidate.id === selection.roleId);
    if (!role) throw new Error(`Solution Pack ${solutionPack.id} references unknown Role ${selection.roleId}.`);
    return { ...selection, role };
  });
}
