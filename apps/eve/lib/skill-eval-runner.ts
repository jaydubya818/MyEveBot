import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import {
  activeSkillEvalRun,
  createSkillEvalRun,
  failSkillEvalRun,
} from "../agent/lib/skill-manager";
import { installedSkills } from "./installed-skills";
import type {
  SkillEvalRunMode,
  SkillEvalRunSummary,
  SkillEvalSummary,
} from "./skill-manager-types";

const MAX_ERROR_OUTPUT = 8_000;

function localRuntimePaths(): { appRoot: string; eveCli: string } {
  const cwd = process.cwd();
  const appRoot = cwd.endsWith(join("apps", "eve")) ? cwd : join(cwd, "apps", "eve");
  const candidates = [
    join(appRoot, "node_modules", "eve", "bin", "eve.js"),
    join(appRoot, "..", "..", "node_modules", "eve", "bin", "eve.js"),
  ];
  const eveCli = candidates.find((path) => existsSync(path));
  if (eveCli === undefined) throw new Error("The local Eve CLI could not be resolved.");
  return { appRoot, eveCli };
}

export class SkillEvalAlreadyRunningError extends Error {
  constructor(readonly run: SkillEvalRunSummary) {
    super("A skill eval run is already active.");
  }
}

export function skillEvalExecutionAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VERCEL !== "1";
}

export function evalIdForSkill(skillName: string): string | null {
  const index = installedSkills.findIndex((skill) => skill.name === skillName);
  return index === -1 ? null : `skills/routing/${String(index).padStart(4, "0")}`;
}

export function changedInstalledSkillNames(
  latest: Readonly<Record<string, SkillEvalSummary>>,
): string[] {
  return installedSkills
    .filter((skill) => latest[skill.name]?.contentHash !== skill.contentHash)
    .map((skill) => skill.name);
}

export function localSkillEvalTarget(
  port = process.env.PORT?.trim() || "3000",
): string {
  if (!/^\d{1,5}$/.test(port) || Number(port) > 65_535) {
    throw new Error("PORT must be a valid local TCP port before skill evals can run.");
  }
  return `http://127.0.0.1:${port}`;
}

function runEvalProcess(input: {
  runId: string;
  ownerId: string;
  mode: SkillEvalRunMode;
  skillNames: readonly string[];
  targetUrl: string;
}): Promise<void> {
  const evalIds = input.skillNames.map(evalIdForSkill).filter((id): id is string => id !== null);
  return new Promise((resolve) => {
    let runtime: ReturnType<typeof localRuntimePaths>;
    try {
      runtime = localRuntimePaths();
    } catch (error) {
      void failSkillEvalRun(
        input.runId,
        error instanceof Error ? error.message : "The local Eve CLI could not be resolved.",
      ).finally(resolve);
      return;
    }
    const child = spawn(
      process.execPath,
      [
        runtime.eveCli,
        "eval",
        ...evalIds,
        "--url",
        input.targetUrl,
        "--strict",
        "--max-concurrency",
        "2",
      ],
      {
        cwd: runtime.appRoot,
        env: {
          ...process.env,
          SKILL_EVAL_RUN_ID: input.runId,
          SKILL_EVAL_OWNER_ID: input.ownerId,
          SKILL_EVAL_MODE: input.mode,
        },
        stdio: ["ignore", "ignore", "pipe"],
      },
    );
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-MAX_ERROR_OUTPUT);
    });
    child.once("error", async (error) => {
      await failSkillEvalRun(input.runId, error.message).catch(() => undefined);
      resolve();
    });
    child.once("exit", async (code, signal) => {
      if (code !== 0) {
        const reason = stderr.trim() || `Eval process exited with ${signal ?? `code ${code}`}.`;
        await failSkillEvalRun(input.runId, reason).catch(() => undefined);
      }
      resolve();
    });
  });
}

export async function startSkillEvalRun(input: {
  ownerId: string;
  mode: SkillEvalRunMode;
  skillNames: readonly string[];
  targetUrl: string;
}): Promise<{ run: SkillEvalRunSummary; completion: Promise<void> }> {
  if (!skillEvalExecutionAvailable()) {
    throw new Error("Interactive eval execution is unavailable on this deployment. Run the eval suite in CI.");
  }
  const active = await activeSkillEvalRun(input.ownerId);
  if (active !== null) throw new SkillEvalAlreadyRunningError(active);

  const known = new Set(installedSkills.map((skill) => skill.name));
  const skillNames = [...new Set(input.skillNames)].filter((name) => known.has(name)).sort();
  if (skillNames.length === 0) throw new Error("Choose at least one project skill to evaluate.");

  const runId = `skill_eval_${randomUUID()}`;
  const run = await createSkillEvalRun({
    id: runId,
    ownerId: input.ownerId,
    mode: input.mode,
    target: `remote:${input.targetUrl}`,
    skillNames,
  });
  return {
    run,
    completion: runEvalProcess({ ...input, runId, skillNames }),
  };
}
