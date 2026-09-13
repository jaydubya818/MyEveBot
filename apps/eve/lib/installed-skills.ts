import catalog from "./installed-skills.generated.json";

export interface InstalledSkill {
  name: string;
  description: string;
  userInvocable: boolean;
  fileCount: number;
  sizeBytes: number;
  contentHash: string;
  sourcePath: string;
  repository: string | null;
  revision: string | null;
}

export const installedSkills: readonly InstalledSkill[] = catalog;
