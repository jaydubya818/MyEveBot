import { skillStore } from "@/agent/lib/skill-store";
import {
  activeSkillEvalRun,
  getSkillEvalSummaries,
  getSkillUsageSummaries,
  latestSkillEvalRun,
  listSkillAssignments,
  setSkillAssignment,
} from "@/agent/lib/skill-manager";
import { apiError } from "@/lib/api-errors";
import { capabilityMap } from "@/lib/capabilities";
import { installedSkills } from "@/lib/installed-skills";
import { personalSkillContentHash } from "@/lib/skill-content-hash";
import {
  SkillEvalAlreadyRunningError,
  changedInstalledSkillNames,
  localSkillEvalTarget,
  skillEvalExecutionAvailable,
  startSkillEvalRun,
} from "@/lib/skill-eval-runner";
import {
  DEFAULT_SPECIALIST_SKILLS,
  SKILL_AGENTS,
  isSkillAgentId,
  type SkillAgentId,
  type SkillEvalRunSummary,
} from "@/lib/skill-manager-types";
import { requireWebAuth, webPrincipal } from "@/lib/web-auth";
import { after } from "next/server";

// Project skills are source-controlled and read-only here. Chat-created skills
// remain editable through Blob storage. Returning both keeps the management UI
// aligned with what Sofie can actually load without shipping skill bodies to
// the browser.

const NAME_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

function defaultAssignments(names: readonly string[]): Record<SkillAgentId, string[]> {
  const known = new Set(names);
  const filtered = (agentId: Exclude<SkillAgentId, "sofie">) =>
    DEFAULT_SPECIALIST_SKILLS[agentId].filter((name) => known.has(name));
  return {
    sofie: [...names].sort(),
    "functional-state": filtered("functional-state"),
    "ux-accessibility": filtered("ux-accessibility"),
    "trust-resilience": filtered("trust-resilience"),
  };
}

export async function GET(request: Request): Promise<Response> {
  const denied = requireWebAuth(request);
  if (denied) return denied;

  const installed = installedSkills.map(
    ({ routingPrompts, negativeRoutingPrompts, ...skill }) => ({
      ...skill,
      routingPromptCount: routingPrompts.length,
      negativeRoutingPromptCount: negativeRoutingPrompts.length,
      source: "installed" as const,
    }),
  );
  const capability = capabilityMap().skills;
  let saved: Array<{
    name: string;
    description: string;
    markdown: string;
    updatedAt: string;
    source: "saved";
    userInvocable: true;
    fileCount: number;
    sizeBytes: number;
    contentHash: string;
    sourcePath: null;
    repository: null;
    repositoryPath: null;
    revision: null;
    license: null;
    sourceEvalPath: null;
    routingPromptCount: 0;
    negativeRoutingPromptCount: 0;
    behavioralEvalCount: 0;
    activationExplicit: false;
  }> = [];
  let savedSkillsStatus: "ready" | "setup_required" | "unavailable" =
    capability.state === "ready" ? "ready" : "setup_required";

  if (capability.state === "ready") {
    try {
      saved = (await skillStore.list()).map((skill) => ({
        ...skill,
        source: "saved" as const,
        userInvocable: true as const,
        fileCount: 1,
        sizeBytes: Buffer.byteLength(skill.markdown, "utf8"),
        contentHash: personalSkillContentHash(skill),
        sourcePath: null,
        repository: null,
        repositoryPath: null,
        revision: null,
        license: null,
        sourceEvalPath: null,
        routingPromptCount: 0,
        negativeRoutingPromptCount: 0,
        behavioralEvalCount: 0,
        activationExplicit: false,
      }));
    } catch (error) {
      console.error("Saved skills list failed", error);
      savedSkillsStatus = "unavailable";
    }
  }

  const skills = [...installed, ...saved];
  const names = skills.map((skill) => skill.name);
  const manager: {
    agents: typeof SKILL_AGENTS;
    assignments: Record<SkillAgentId, string[]>;
    usage: Awaited<ReturnType<typeof getSkillUsageSummaries>>;
    evals: Awaited<ReturnType<typeof getSkillEvalSummaries>>;
    assignmentStatus: "ready" | "setup_required" | "unavailable";
    analyticsStatus: "ready" | "setup_required" | "unavailable";
    evalExecutionStatus: "ready" | "ci_only";
    evalRun: SkillEvalRunSummary | null;
  } = {
    agents: SKILL_AGENTS,
    assignments: defaultAssignments(names),
    usage: {},
    evals: {},
    assignmentStatus: "setup_required",
    analyticsStatus: "setup_required",
    evalExecutionStatus: skillEvalExecutionAvailable() ? "ready" : "ci_only",
    evalRun: null,
  };

  if (process.env.DATABASE_URL?.trim()) {
    try {
      const [assignments, usage, evals, evalRun] = await Promise.all([
        listSkillAssignments(webPrincipal(request)!.id, names),
        getSkillUsageSummaries(webPrincipal(request)!.id),
        getSkillEvalSummaries(webPrincipal(request)!.id),
        latestSkillEvalRun(webPrincipal(request)!.id),
      ]);
      manager.assignments = assignments;
      manager.usage = usage;
      manager.evals = evals;
      manager.evalRun = evalRun;
      manager.assignmentStatus = "ready";
      manager.analyticsStatus = "ready";
    } catch (error) {
      console.error("Skill control-plane data could not be loaded", error);
      manager.assignmentStatus = "unavailable";
      manager.analyticsStatus = "unavailable";
    }
  }

  return Response.json(
    { skills, savedSkillsStatus, manager },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request): Promise<Response> {
  const denied = requireWebAuth(request);
  if (denied) return denied;
  if (!process.env.DATABASE_URL?.trim()) {
    return apiError(request, 503, "database_not_configured", "Skill evals need database setup.");
  }
  if (!skillEvalExecutionAvailable()) {
    return apiError(
      request,
      503,
      "eval_execution_ci_only",
      "Interactive evals are unavailable on this deployment. Run them in CI.",
    );
  }

  const body = (await request.json().catch(() => null)) as {
    mode?: unknown;
    names?: unknown;
  } | null;
  if (
    body === null ||
    (body.mode !== "manual" && body.mode !== "changed") ||
    (body.names !== undefined &&
      (!Array.isArray(body.names) || body.names.some((name) => typeof name !== "string")))
  ) {
    return apiError(request, 400, "invalid_eval_request", "Choose changed skills or named project skills.");
  }

  const ownerId = webPrincipal(request)!.id;
  const requestedNames = Array.isArray(body.names) ? body.names : [];
  let skillNames: string[];
  if (body.mode === "changed") {
    const latest = await getSkillEvalSummaries(ownerId);
    skillNames = changedInstalledSkillNames(latest);
  } else {
    const requested = new Set(requestedNames);
    skillNames = installedSkills.filter((skill) => requested.has(skill.name)).map((skill) => skill.name);
  }

  if (skillNames.length === 0) {
    return Response.json({ unchanged: true, run: await activeSkillEvalRun(ownerId) });
  }

  try {
    const started = await startSkillEvalRun({
      ownerId,
      mode: body.mode,
      skillNames,
      targetUrl: localSkillEvalTarget(new URL(request.url).port || undefined),
    });
    after(() => started.completion);
    return Response.json({ run: started.run }, { status: 202 });
  } catch (error) {
    if (error instanceof SkillEvalAlreadyRunningError) {
      return Response.json(
        { error: { code: "eval_already_running", message: error.message }, run: error.run },
        { status: 409 },
      );
    }
    console.error("Skill eval run could not start", error);
    return apiError(
      request,
      503,
      "eval_start_failed",
      error instanceof Error ? error.message : "The eval run could not start.",
    );
  }
}

export async function PATCH(request: Request): Promise<Response> {
  const denied = requireWebAuth(request);
  if (denied) return denied;
  if (!process.env.DATABASE_URL?.trim()) {
    return apiError(request, 503, "database_not_configured", "Agent assignments need database setup.");
  }
  const body = (await request.json().catch(() => null)) as {
    name?: unknown;
    agentId?: unknown;
    enabled?: unknown;
  } | null;
  if (
    body === null ||
    typeof body.name !== "string" ||
    !NAME_PATTERN.test(body.name) ||
    !isSkillAgentId(body.agentId) ||
    body.agentId === "sofie" ||
    typeof body.enabled !== "boolean"
  ) {
    return apiError(request, 400, "invalid_assignment", "Choose a valid skill and specialist.");
  }

  let exists = installedSkills.some((skill) => skill.name === body.name);
  if (!exists && capabilityMap().skills.state === "ready") {
    exists = (await skillStore.list()).some((skill) => skill.name === body.name);
  }
  if (!exists) return apiError(request, 404, "skill_not_found", "That skill is not available.");

  try {
    await setSkillAssignment({
      ownerId: webPrincipal(request)!.id,
      agentId: body.agentId,
      skillName: body.name,
      enabled: body.enabled,
      assignedBy: "owner",
    });
    return Response.json({
      assignment: { agentId: body.agentId, skillName: body.name, enabled: body.enabled },
    });
  } catch (error) {
    console.error("Skill assignment update failed", error);
    return apiError(request, 503, "assignment_unavailable", "The assignment could not be saved.");
  }
}

export async function PUT(request: Request): Promise<Response> {
  const denied = requireWebAuth(request);
  if (denied) return denied;
  if (capabilityMap().skills.state !== "ready") {
    return apiError(request, 503, "skills_not_configured", "Saved skills need file storage setup.");
  }
  const body = (await request.json().catch(() => null)) as {
    name?: unknown;
    description?: unknown;
    markdown?: unknown;
  } | null;
  if (
    body === null ||
    typeof body.name !== "string" ||
    !NAME_PATTERN.test(body.name) ||
    body.name.length > 50 ||
    typeof body.description !== "string" ||
    body.description.length === 0 ||
    body.description.length > 300 ||
    typeof body.markdown !== "string" ||
    body.markdown.length === 0 ||
    body.markdown.length > 8000
  ) {
    return new Response("Invalid body", { status: 400 });
  }
  const stored = await skillStore.put({
    name: body.name,
    description: body.description,
    markdown: body.markdown,
  });
  return Response.json({
    skill: {
      ...stored,
      source: "saved" as const,
      userInvocable: true as const,
      fileCount: 1,
      sizeBytes: Buffer.byteLength(stored.markdown, "utf8"),
      contentHash: personalSkillContentHash(stored),
      sourcePath: null,
      repository: null,
      repositoryPath: null,
      revision: null,
      license: null,
      sourceEvalPath: null,
      routingPromptCount: 0,
      negativeRoutingPromptCount: 0,
      behavioralEvalCount: 0,
      activationExplicit: false,
    },
  });
}

export async function DELETE(request: Request): Promise<Response> {
  const denied = requireWebAuth(request);
  if (denied) return denied;
  if (capabilityMap().skills.state !== "ready") {
    return apiError(request, 503, "skills_not_configured", "Saved skills need file storage setup.");
  }
  const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
  if (body === null || typeof body.name !== "string" || body.name.length === 0) {
    return new Response("Invalid body", { status: 400 });
  }
  const deleted = await skillStore.delete(body.name);
  if (!deleted) return new Response("Not found", { status: 404 });
  return Response.json({ ok: true });
}
