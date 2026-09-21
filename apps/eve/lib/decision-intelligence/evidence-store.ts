import { open, readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  evaluationArtifactSchema,
  type EvaluationArtifact,
} from "./evaluation.ts";

/** Synthetic artifacts only. No owner content, subject reference, or raw provider response is accepted. */
export async function readEvaluationRuns(
  directory: string | undefined,
): Promise<EvaluationArtifact[]> {
  if (!directory) return [];
  let names: string[];
  try {
    names = await readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw new Error("Evaluation evidence unavailable");
  }
  const files = names
    .filter((name) => /^[a-zA-Z0-9_-]+\.json$/.test(name))
    .sort()
    .slice(-10);
  const runs: EvaluationArtifact[] = [];
  for (const file of files) {
    const handle = await open(join(directory, file), "r");
    try {
      if ((await handle.stat()).size > 2_000_000)
        throw new Error("Evaluation artifact exceeds size limit");
      runs.push(
        evaluationArtifactSchema.parse(
          JSON.parse(await handle.readFile("utf8")),
        ),
      );
    } finally {
      await handle.close();
    }
  }
  return runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
