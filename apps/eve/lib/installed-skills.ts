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
  repositoryPath: string | null;
  revision: string | null;
  license: string | null;
  sourceEvalPath: string | null;
  routingPrompts: readonly string[];
  negativeRoutingPrompts: readonly { prompt: string; owner?: string }[];
  behavioralEvalCount: number;
  activationExplicit: boolean;
}

export const installedSkills: readonly InstalledSkill[] = catalog;
