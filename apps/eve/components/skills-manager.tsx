"use client";

import { Badge, Button, Input, InputArea, Loader, Switch } from "@cloudflare/kumo";
import {
  ArrowSquareOutIcon,
  ArrowsClockwiseIcon,
  CheckCircleIcon,
  ClockCounterClockwiseIcon,
  CodeIcon,
  FloppyDiskIcon,
  PencilSimpleIcon,
  PlayIcon,
  RobotIcon,
  ShieldCheckIcon,
  TrashIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  SkillAgentDefinition,
  SkillAgentId,
  SkillEvalRunSummary,
  SkillEvalSummary,
  SkillUsageSummary,
} from "@/lib/skill-manager-types";
import { cn } from "@/lib/utils";

interface SkillItem {
  name: string;
  description: string;
  source: "installed" | "saved";
  userInvocable: boolean;
  fileCount: number;
  sizeBytes: number;
  contentHash: string;
  sourcePath: string | null;
  repository: string | null;
  revision: string | null;
  markdown?: string;
  updatedAt?: string;
}

interface SkillManagerData {
  agents: readonly SkillAgentDefinition[];
  assignments: Record<SkillAgentId, string[]>;
  usage: Record<string, SkillUsageSummary>;
  evals: Record<string, SkillEvalSummary>;
  assignmentStatus: "ready" | "setup_required" | "unavailable";
  analyticsStatus: "ready" | "setup_required" | "unavailable";
  evalExecutionStatus: "ready" | "ci_only";
  evalRun: SkillEvalRunSummary | null;
}

interface SkillsResponse {
  skills?: SkillItem[];
  savedSkillsStatus?: "ready" | "setup_required" | "unavailable";
  manager?: SkillManagerData;
}

type ScopeFilter = "all" | "installed" | "saved";
type AssignmentFilter = "all" | `agent:${SkillAgentId}` | "task:product-qa";

const EMPTY_USAGE: SkillUsageSummary = {
  total: 0,
  succeeded: 0,
  failed: 0,
  cancelled: 0,
  inProgress: 0,
  completionRate: null,
  averageDurationMs: null,
  inputTokens: 0,
  outputTokens: 0,
  costUsd: 0,
  taskRunCount: 0,
  byAgent: {},
  lastUsedAt: null,
  activity: [],
};
const EMPTY_EVAL: SkillEvalSummary = {
  verdict: "not_run",
  runCount: 0,
  lastRunAt: null,
  passedAssertions: 0,
  assertionCount: 0,
  contentHash: null,
  durationMs: null,
  inputTokens: 0,
  outputTokens: 0,
  costUsd: 0,
  error: null,
};

function shortRelativeTime(iso: string | null): string {
  if (iso === null) return "Never";
  const elapsed = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(elapsed)) return "Unknown";
  if (elapsed < 60_000) return "Now";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m ago`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h ago`;
  if (elapsed < 604_800_000) return `${Math.floor(elapsed / 86_400_000)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(durationMs: number | null): string {
  if (durationMs === null) return "—";
  if (durationMs < 1_000) return `${Math.round(durationMs)} ms`;
  if (durationMs < 60_000) return `${(durationMs / 1_000).toFixed(1)} s`;
  return `${Math.round(durationMs / 60_000)} min`;
}

function formatCost(costUsd: number): string {
  if (costUsd <= 0) return "Not reported";
  if (costUsd < 0.01) return `$${costUsd.toFixed(4)}`;
  return `$${costUsd.toFixed(2)}`;
}

function formatTokens(tokens: number): string {
  return tokens === 0 ? "—" : new Intl.NumberFormat().format(tokens);
}

function evalIsCurrent(skill: SkillItem, summary: SkillEvalSummary): boolean {
  return summary.contentHash !== null && summary.contentHash === skill.contentHash;
}

function evalLabel(skill: SkillItem, summary: SkillEvalSummary): string {
  if (skill.source === "saved") return "Not covered";
  if (summary.verdict === "not_run") return "Not run";
  if (!evalIsCurrent(skill, summary)) return "Changed";
  if (summary.verdict === "passed") return "Passed";
  if (summary.verdict === "failed") return "Failed";
  if (summary.verdict === "scored") return "Below bar";
  return "Skipped";
}

function evalTone(skill: SkillItem, summary: SkillEvalSummary): string {
  if (summary.runCount > 0 && !evalIsCurrent(skill, summary)) return "text-kumo-warning";
  if (summary.verdict === "passed") return "text-kumo-success";
  if (summary.verdict === "failed" || summary.verdict === "scored") return "text-kumo-danger";
  return "text-kumo-subtle";
}

function ActivitySparkline({ values }: { values: readonly number[] }) {
  const recent = values.slice(-24);
  const max = Math.max(1, ...recent);
  if (recent.every((value) => value === 0)) {
    return <span className="text-xs text-kumo-subtle">—</span>;
  }
  return (
    <span className="flex h-6 w-20 items-end gap-px" aria-label={`${recent.reduce((sum, value) => sum + value, 0)} recent uses`}>
      {recent.map((value, index) => (
        <span
          key={index}
          className={cn(
            "w-0.5 rounded-sm",
            value === 0 ? "h-px bg-kumo-hairline" : "bg-kumo-success",
          )}
          style={value === 0 ? undefined : { height: `${Math.max(3, Math.round((value / max) * 22))}px` }}
        />
      ))}
    </span>
  );
}

function UsageHeatmap({ values }: { values: readonly number[] }) {
  const normalized = values.length >= 84 ? values.slice(-84) : [...Array(84 - values.length).fill(0), ...values];
  const max = Math.max(1, ...normalized);
  return (
    <div
      className="grid w-fit grid-flow-col grid-rows-7 gap-1"
      aria-label={`${normalized.reduce((sum, value) => sum + value, 0)} skill uses in the last 12 weeks`}
    >
      {normalized.map((value, index) => {
        const intensity = value / max;
        return (
          <span
            key={index}
            title={`${value} ${value === 1 ? "use" : "uses"}`}
            className={cn(
              "size-2.5 rounded-[3px] border border-kumo-hairline",
              intensity === 0 && "bg-kumo-recessed",
              intensity > 0 && intensity <= 0.33 && "bg-emerald-950",
              intensity > 0.33 && intensity <= 0.66 && "bg-emerald-700",
              intensity > 0.66 && "bg-kumo-success",
            )}
          />
        );
      })}
    </div>
  );
}

function FilterButton({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors",
        active ? "bg-kumo-recessed text-kumo-strong" : "text-kumo-subtle hover:bg-kumo-tint hover:text-kumo-default",
      )}
      onClick={onClick}
    >
      <span className="truncate">{label}</span>
      <span className="tabular-nums">{count}</span>
    </button>
  );
}

function ManagerNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 border-b border-kumo-warning/20 bg-kumo-warning/5 px-3 py-2 text-xs text-kumo-subtle">
      <WarningCircleIcon className="mt-0.5 size-3.5 shrink-0 text-kumo-warning" aria-hidden />
      <p>{children}</p>
    </div>
  );
}

export function SkillsManager() {
  const [response, setResponse] = useState<SkillsResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<ScopeFilter>("all");
  const [assignmentFilter, setAssignmentFilter] = useState<AssignmentFilter>("all");
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [assignmentPending, setAssignmentPending] = useState<SkillAgentId | null>(null);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftDescription, setDraftDescription] = useState("");
  const [draftMarkdown, setDraftMarkdown] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [evalPending, setEvalPending] = useState(false);
  const [evalError, setEvalError] = useState<string | null>(null);

  const loadSkills = useCallback(async () => {
    const result = await fetch("/api/skills", { cache: "no-store" }).catch(() => null);
    if (result === null || !result.ok) {
      setFailed(true);
      return;
    }
    const body = (await result.json()) as SkillsResponse;
    if (body.manager === undefined) {
      setFailed(true);
      return;
    }
    setResponse(body);
    setFailed(false);
    setSelectedName((current) => current ?? body.skills?.[0]?.name ?? null);
  }, []);

  useEffect(() => {
    void loadSkills();
  }, [loadSkills]);

  const skills = response?.skills ?? [];
  const manager = response?.manager;
  const selected = skills.find((skill) => skill.name === selectedName) ?? skills[0] ?? null;
  const evalRunActive = manager?.evalRun?.status === "queued" || manager?.evalRun?.status === "running";

  useEffect(() => {
    if (!evalRunActive) return;
    const timer = window.setInterval(() => void loadSkills(), 1_500);
    return () => window.clearInterval(timer);
  }, [evalRunActive, loadSkills]);

  const assignedAgents = (skillName: string): SkillAgentId[] =>
    manager?.agents
      .filter((agent) => manager.assignments[agent.id]?.includes(skillName))
      .map((agent) => agent.id) ?? [];

  const productQaSkills = useMemo(() => {
    if (manager === undefined) return new Set<string>();
    return new Set(
      manager.agents
        .filter((agent) => agent.kind === "specialist")
        .flatMap((agent) => manager.assignments[agent.id] ?? []),
    );
  }, [manager]);

  const changedProjectSkills = useMemo(
    () =>
      skills.filter((skill) => {
        if (skill.source !== "installed") return false;
        const evaluation = manager?.evals[skill.name] ?? EMPTY_EVAL;
        return !evalIsCurrent(skill, evaluation);
      }),
    [manager, skills],
  );

  const visibleSkills = skills.filter((skill) => {
    const needle = query.trim().toLocaleLowerCase();
    if (
      needle.length > 0 &&
      !skill.name.toLocaleLowerCase().includes(needle) &&
      !skill.description.toLocaleLowerCase().includes(needle)
    ) {
      return false;
    }
    if (scope !== "all" && skill.source !== scope) return false;
    if (assignmentFilter.startsWith("agent:")) {
      const agentId = assignmentFilter.slice(6) as SkillAgentId;
      return manager?.assignments[agentId]?.includes(skill.name) ?? false;
    }
    if (assignmentFilter === "task:product-qa") return productQaSkills.has(skill.name);
    return true;
  });

  useEffect(() => {
    if (selected !== null && !visibleSkills.some((skill) => skill.name === selected.name)) {
      setSelectedName(visibleSkills[0]?.name ?? null);
    }
  }, [scope, assignmentFilter, query]); // eslint-disable-line react-hooks/exhaustive-deps

  function beginEdit(skill: SkillItem) {
    setDraftDescription(skill.description);
    setDraftMarkdown(skill.markdown ?? "");
    setEditing(true);
  }

  async function savePersonalSkill(skill: SkillItem) {
    if (draftDescription.trim().length === 0 || draftMarkdown.trim().length === 0) return;
    setSaving(true);
    const result = await fetch("/api/skills", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: skill.name,
        description: draftDescription.trim(),
        markdown: draftMarkdown.trim(),
      }),
    }).catch(() => null);
    if (result?.ok) {
      const body = (await result.json()) as { skill?: SkillItem };
      if (body.skill !== undefined) {
        setResponse((current) =>
          current === null
            ? current
            : {
                ...current,
                skills: current.skills?.map((item) =>
                  item.name === skill.name && item.source === "saved" ? body.skill! : item,
                ),
              },
        );
      }
      setEditing(false);
    }
    setSaving(false);
  }

  async function deletePersonalSkill(skill: SkillItem) {
    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }
    setDeleteArmed(false);
    const result = await fetch("/api/skills", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: skill.name }),
    }).catch(() => null);
    if (!result?.ok) return;
    setResponse((current) =>
      current === null
        ? current
        : { ...current, skills: current.skills?.filter((item) => item.name !== skill.name) },
    );
    setSelectedName(skills.find((item) => item.name !== skill.name)?.name ?? null);
  }

  async function updateAssignment(agentId: SkillAgentId, enabled: boolean) {
    if (manager === undefined || selected === null || agentId === "sofie") return;
    setAssignmentError(null);
    setAssignmentPending(agentId);
    const previous = manager.assignments[agentId];
    const next = enabled
      ? [...new Set([...previous, selected.name])].sort()
      : previous.filter((name) => name !== selected.name);
    setResponse((current) =>
      current?.manager === undefined
        ? current
        : {
            ...current,
            manager: {
              ...current.manager,
              assignments: { ...current.manager.assignments, [agentId]: next },
            },
          },
    );
    const result = await fetch("/api/skills", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: selected.name, agentId, enabled }),
    }).catch(() => null);
    if (!result?.ok) {
      setResponse((current) =>
        current?.manager === undefined
          ? current
          : {
              ...current,
              manager: {
                ...current.manager,
                assignments: { ...current.manager.assignments, [agentId]: previous },
              },
            },
      );
      setAssignmentError("Assignment could not be saved. Check database readiness and retry.");
    }
    setAssignmentPending(null);
  }

  async function runSkillEvals(mode: "manual" | "changed", names: string[] = []) {
    setEvalPending(true);
    setEvalError(null);
    const result = await fetch("/api/skills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, names }),
    }).catch(() => null);
    if (result === null) {
      setEvalError("The eval run could not be started. Check the local agent server and retry.");
      setEvalPending(false);
      return;
    }
    const body = (await result.json().catch(() => null)) as {
      unchanged?: boolean;
      run?: SkillEvalRunSummary | null;
      error?: { message?: string };
    } | null;
    if (!result.ok && result.status !== 409) {
      setEvalError(body?.error?.message ?? "The eval run could not be started.");
      setEvalPending(false);
      return;
    }
    if (body?.run !== undefined) {
      setResponse((current) =>
        current?.manager === undefined
          ? current
          : { ...current, manager: { ...current.manager, evalRun: body.run ?? null } },
      );
    }
    if (body?.unchanged) await loadSkills();
    setEvalPending(false);
  }

  if (response === null && !failed) {
    return (
      <div className="flex min-h-[34rem] items-center justify-center">
        <Loader size={20} />
      </div>
    );
  }
  if (failed || response === null || manager === undefined) {
    return (
      <div className="flex gap-3 rounded-xl border border-kumo-danger/25 bg-kumo-danger/5 p-4 text-sm">
        <WarningCircleIcon className="mt-0.5 size-4 shrink-0 text-kumo-danger" aria-hidden />
        <p>The skills control plane could not be loaded. Refresh and retry.</p>
      </div>
    );
  }

  const projectSkills = skills.filter((skill) => skill.source === "installed");
  const evaluatedCount = projectSkills.filter((skill) => {
    const evaluation = manager.evals[skill.name] ?? EMPTY_EVAL;
    return evaluation.verdict === "passed" && evalIsCurrent(skill, evaluation);
  }).length;
  const totalUses = Object.values(manager.usage).reduce((total, item) => total + item.total, 0);
  const completedUses = Object.values(manager.usage).reduce((total, item) => total + item.succeeded, 0);
  const latestRun = manager.evalRun;
  const runProgress = latestRun === null || latestRun.requestedCount === 0
    ? 0
    : Math.min(100, Math.round((latestRun.completedCount / latestRun.requestedCount) * 100));
  const failedRunSkills = latestRun?.requestedSkills.filter((name) => {
    const evaluation = manager.evals[name];
    return evaluation?.verdict === "failed" || evaluation?.verdict === "scored";
  }) ?? [];

  return (
    <div className="overflow-hidden rounded-xl border border-kumo-hairline bg-kumo-base">
      <div className="grid grid-cols-[1fr_1fr_1fr] border-b border-kumo-hairline">
        <div className="px-4 py-3">
          <p className="text-[10px] font-semibold tracking-[0.14em] text-kumo-subtle uppercase">Catalog</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{skills.length}</p>
          <p className="text-xs text-kumo-subtle">validated packages</p>
        </div>
        <div className="border-x border-kumo-hairline px-4 py-3">
          <p className="text-[10px] font-semibold tracking-[0.14em] text-kumo-subtle uppercase">Routing evals</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{evaluatedCount}/{projectSkills.length}</p>
          <p className="text-xs text-kumo-subtle">current checks passed</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-[10px] font-semibold tracking-[0.14em] text-kumo-subtle uppercase">Observed use</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{totalUses}</p>
          <p className="text-xs text-kumo-subtle">{completedUses} completed turns</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-kumo-hairline px-3 py-2.5">
        <p className="text-xs text-kumo-subtle">
          <span className={cn("font-medium", changedProjectSkills.length > 0 ? "text-kumo-warning" : "text-kumo-success")}>
            {changedProjectSkills.length}
          </span>{" "}
          project {changedProjectSkills.length === 1 ? "skill needs" : "skills need"} a current routing check
        </p>
        <Button
          size="sm"
          variant="secondary"
          icon={ArrowsClockwiseIcon}
          loading={evalPending}
          disabled={
            changedProjectSkills.length === 0 ||
            evalRunActive ||
            manager.evalExecutionStatus !== "ready"
          }
          title={manager.evalExecutionStatus === "ready" ? "Uses real model calls and may incur provider cost" : "Run changed-skill evals in CI for this deployment"}
          onClick={() => void runSkillEvals("changed")}
        >
          {changedProjectSkills.length === 0 ? "All current" : `Run ${changedProjectSkills.length} changed`}
        </Button>
      </div>

      {latestRun !== null && (
        <div className={cn(
          "border-b px-3 py-2.5 text-xs",
          latestRun.status === "failed" ? "border-kumo-danger/20 bg-kumo-danger/5" : "border-kumo-hairline bg-kumo-canvas",
        )}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <span className={cn(
                "size-2 rounded-full",
                evalRunActive ? "animate-pulse bg-kumo-warning" : latestRun.status === "completed" ? "bg-kumo-success" : "bg-kumo-danger",
              )} aria-hidden />
              <span className="font-medium">
                {latestRun.status === "queued" ? "Eval queued" : latestRun.status === "running" ? "Eval running" : latestRun.status === "completed" ? "Latest eval completed" : "Latest eval needs attention"}
              </span>
              <span className="text-kumo-subtle">
                {latestRun.completedCount}/{latestRun.requestedCount} checks · {formatCost(latestRun.costUsd)}
              </span>
            </span>
            {latestRun.status === "failed" && failedRunSkills.length > 0 && manager.evalExecutionStatus === "ready" && (
              <Button
                size="sm"
                variant="ghost"
                icon={ArrowsClockwiseIcon}
                loading={evalPending}
                disabled={evalRunActive}
                onClick={() => void runSkillEvals("manual", failedRunSkills)}
              >
                Retry {failedRunSkills.length} failed
              </Button>
            )}
          </div>
          {evalRunActive && (
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-kumo-recessed" aria-label={`${runProgress}% complete`}>
              <div className="h-full rounded-full bg-kumo-warning transition-[width]" style={{ width: `${runProgress}%` }} />
            </div>
          )}
          {latestRun.error !== null && <p className="mt-1 text-kumo-danger">{latestRun.error}</p>}
        </div>
      )}
      {evalError !== null && (
        <div className="flex items-center justify-between gap-3 border-b border-kumo-danger/20 bg-kumo-danger/5 px-3 py-2 text-xs text-kumo-danger">
          <span>{evalError}</span>
          <button type="button" aria-label="Dismiss eval error" onClick={() => setEvalError(null)}><XIcon className="size-3.5" /></button>
        </div>
      )}

      {manager.assignmentStatus !== "ready" && (
        <ManagerNotice>
          Agent assignments are showing project defaults. Apply the latest database migration to manage overrides.
        </ManagerNotice>
      )}
      {response.savedSkillsStatus !== "ready" && (
        <ManagerNotice>
          Project skills are ready; personal skills need Blob storage before they can be created or edited.
        </ManagerNotice>
      )}

      <div className="grid min-h-[38rem] lg:grid-cols-[9.5rem_minmax(0,1fr)] min-[1200px]:grid-cols-[9rem_minmax(0,1fr)_15rem]!">
        <aside className="border-b border-kumo-hairline bg-kumo-canvas p-3 lg:border-e lg:border-b-0">
          <Input
            size="sm"
            value={query}
            aria-label="Search skills"
            placeholder="Search skills"
            onChange={(event) => setQuery(event.target.value)}
          />

          <div className="mt-5">
            <p className="mb-1 px-2 text-[10px] font-semibold tracking-[0.14em] text-kumo-subtle uppercase">Scope</p>
            <FilterButton active={scope === "all"} label="All skills" count={skills.length} onClick={() => setScope("all")} />
            <FilterButton active={scope === "installed"} label="Project" count={skills.filter((skill) => skill.source === "installed").length} onClick={() => setScope("installed")} />
            <FilterButton active={scope === "saved"} label="Personal" count={skills.filter((skill) => skill.source === "saved").length} onClick={() => setScope("saved")} />
          </div>

          <div className="mt-5">
            <p className="mb-1 px-2 text-[10px] font-semibold tracking-[0.14em] text-kumo-subtle uppercase">Agents</p>
            {manager.agents.map((agent) => (
              <FilterButton
                key={agent.id}
                active={assignmentFilter === `agent:${agent.id}`}
                label={agent.label}
                count={manager.assignments[agent.id]?.length ?? 0}
                onClick={() => setAssignmentFilter(`agent:${agent.id}`)}
              />
            ))}
          </div>

          <div className="mt-5">
            <p className="mb-1 px-2 text-[10px] font-semibold tracking-[0.14em] text-kumo-subtle uppercase">Tasks</p>
            <FilterButton
              active={assignmentFilter === "task:product-qa"}
              label="Product QA"
              count={productQaSkills.size}
              onClick={() => setAssignmentFilter("task:product-qa")}
            />
          </div>

          {assignmentFilter !== "all" && (
            <button
              type="button"
              className="mt-4 flex items-center gap-1 px-2 text-[11px] text-kumo-subtle hover:text-kumo-default"
              onClick={() => setAssignmentFilter("all")}
            >
              <XIcon className="size-3" aria-hidden />
              Clear assignment filter
            </button>
          )}
        </aside>

        <section className="min-w-0 border-b border-kumo-hairline min-[1200px]:border-e min-[1200px]:border-b-0">
          <div className="flex items-center justify-between gap-3 border-b border-kumo-hairline px-3 py-2.5">
            <p className="text-xs text-kumo-subtle">
              <span className="font-medium text-kumo-default">{visibleSkills.length}</span> matching skills
            </p>
            <p className="text-[11px] text-kumo-subtle">Tasks inherit their agent&apos;s assignments</p>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[31rem]">
              <div className="grid grid-cols-[minmax(9rem,1fr)_4.75rem_3rem_4.5rem_3rem_4.5rem] gap-2 border-b border-kumo-hairline px-3 py-2 text-[10px] font-semibold tracking-[0.12em] text-kumo-subtle uppercase">
                <span>Name</span><span>Scope</span><span>Agents</span><span>Eval</span><span>Uses</span><span>Activity</span>
              </div>
              <div className="max-h-[37rem] overflow-y-auto">
                {visibleSkills.length === 0 ? (
                  <p className="px-4 py-16 text-center text-sm text-kumo-subtle">No skills match these filters.</p>
                ) : visibleSkills.map((skill) => {
                  const usage = manager.usage[skill.name] ?? EMPTY_USAGE;
                  const evaluation = manager.evals[skill.name] ?? EMPTY_EVAL;
                  const assigned = assignedAgents(skill.name);
                  const isSelected = selected?.name === skill.name;
                  return (
                    <button
                      key={`${skill.source}:${skill.name}`}
                      type="button"
                      aria-pressed={isSelected}
                      className={cn(
                        "grid w-full grid-cols-[minmax(9rem,1fr)_4.75rem_3rem_4.5rem_3rem_4.5rem] items-center gap-2 border-b border-kumo-hairline px-3 py-2.5 text-left transition-colors last:border-b-0",
                        isSelected ? "bg-kumo-recessed shadow-[inset_2px_0_0_var(--color-kumo-success)]" : "hover:bg-kumo-tint",
                      )}
                      onClick={() => { setSelectedName(skill.name); setEditing(false); setDeleteArmed(false); }}
                    >
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <span className={cn("size-1.5 shrink-0 rounded-full", evaluation.verdict === "failed" && evalIsCurrent(skill, evaluation) ? "bg-kumo-danger" : evaluation.verdict === "passed" && evalIsCurrent(skill, evaluation) ? "bg-kumo-success" : evaluation.runCount > 0 && !evalIsCurrent(skill, evaluation) ? "bg-kumo-warning" : "bg-kumo-subtle")} aria-hidden />
                          <span className="truncate font-mono text-xs font-medium">{skill.name}</span>
                        </span>
                        <span className="mt-0.5 block truncate pl-3.5 text-[11px] text-kumo-subtle" title={skill.description}>{skill.description}</span>
                      </span>
                      <span><Badge variant="secondary">{skill.source === "installed" ? "Project" : "Personal"}</Badge></span>
                      <span className="text-xs tabular-nums text-kumo-subtle">{assigned.length}</span>
                      <span className={cn("text-xs font-medium", evalTone(skill, evaluation))}>{evalLabel(skill, evaluation)}</span>
                      <span className="text-xs tabular-nums text-kumo-subtle">{usage.total || "—"}</span>
                      <ActivitySparkline values={usage.activity} />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <aside className="min-w-0 bg-kumo-canvas p-4 lg:col-span-2 min-[1200px]:col-span-1!">
          {selected === null ? (
            <div className="flex min-h-64 items-center justify-center text-sm text-kumo-subtle">Select a skill to inspect it.</div>
          ) : (() => {
            const usage = manager.usage[selected.name] ?? EMPTY_USAGE;
            const evaluation = manager.evals[selected.name] ?? EMPTY_EVAL;
            return (
              <div className="flex flex-col gap-5">
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-lg font-semibold">{selected.name}</p>
                      <p className="mt-1 text-xs text-kumo-subtle">{selected.userInvocable ? "Automatic or slash command" : "Automatic routing"}</p>
                    </div>
                    <span className="flex items-center gap-1 text-[11px] text-kumo-success"><CheckCircleIcon className="size-3.5" weight="fill" aria-hidden />Valid</span>
                  </div>
                  {!editing && <p className="mt-4 text-sm leading-6 text-kumo-subtle">{selected.description}</p>}
                </div>

                {editing ? (
                  <div className="flex flex-col gap-3 rounded-xl border border-kumo-hairline bg-kumo-base p-3">
                    <Input value={draftDescription} aria-label="Skill description" onChange={(event) => setDraftDescription(event.target.value)} />
                    <InputArea rows={10} value={draftMarkdown} aria-label="Skill instructions" onChange={(event) => setDraftMarkdown(event.target.value)} />
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
                      <Button size="sm" icon={FloppyDiskIcon} loading={saving} onClick={() => savePersonalSkill(selected)}>Save</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-[10px] font-semibold tracking-[0.14em] text-kumo-subtle uppercase">Observed activity</p>
                        <span className="text-[11px] text-kumo-subtle">{usage.total} loads · {shortRelativeTime(usage.lastUsedAt)}</span>
                      </div>
                      <div className="overflow-x-auto rounded-xl border border-kumo-hairline bg-kumo-base p-3">
                        <UsageHeatmap values={usage.activity} />
                      </div>
                      <dl className="mt-2 grid grid-cols-3 overflow-hidden rounded-xl border border-kumo-hairline bg-kumo-base text-center">
                        <div className="px-2 py-2.5">
                          <dt className="text-[10px] text-kumo-subtle">Completed</dt>
                          <dd className="mt-0.5 text-sm font-medium tabular-nums">{usage.succeeded}</dd>
                        </div>
                        <div className="border-x border-kumo-hairline px-2 py-2.5">
                          <dt className="text-[10px] text-kumo-subtle">Completion</dt>
                          <dd className="mt-0.5 text-sm font-medium tabular-nums">{usage.completionRate === null ? "—" : `${Math.round(usage.completionRate * 100)}%`}</dd>
                        </div>
                        <div className="px-2 py-2.5">
                          <dt className="text-[10px] text-kumo-subtle">QA tasks</dt>
                          <dd className="mt-0.5 text-sm font-medium tabular-nums">{usage.taskRunCount || "—"}</dd>
                        </div>
                      </dl>
                      <dl className="mt-2 grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-[11px]">
                        <dt className="text-kumo-subtle">After-load time</dt><dd>{formatDuration(usage.averageDurationMs)} average</dd>
                        <dt className="text-kumo-subtle">Tokens</dt><dd>{formatTokens(usage.inputTokens + usage.outputTokens)}</dd>
                        <dt className="text-kumo-subtle">Model cost</dt><dd>{formatCost(usage.costUsd)}</dd>
                        {(usage.failed > 0 || usage.cancelled > 0 || usage.inProgress > 0) && (
                          <><dt className="text-kumo-subtle">Other outcomes</dt><dd>{usage.failed} failed · {usage.cancelled} cancelled · {usage.inProgress} open</dd></>
                        )}
                      </dl>
                      <p className="mt-2 text-[10px] leading-4 text-kumo-subtle">Completion means the turn finished after loading this skill; it does not prove the skill caused the result.</p>
                    </div>

                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-[10px] font-semibold tracking-[0.14em] text-kumo-subtle uppercase">Agent assignments</p>
                        <span className="text-[11px] text-kumo-subtle">new sessions</span>
                      </div>
                      <div className="divide-y divide-kumo-hairline overflow-hidden rounded-xl border border-kumo-hairline bg-kumo-base">
                        {manager.agents.map((agent) => {
                          const checked = manager.assignments[agent.id]?.includes(selected.name) ?? false;
                          const locked = agent.assignmentMode === "fixed" || manager.assignmentStatus !== "ready";
                          return (
                            <div key={agent.id} className="flex items-center gap-3 px-3 py-2.5">
                              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-kumo-recessed"><RobotIcon className="size-3.5 text-kumo-subtle" aria-hidden /></span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-xs font-medium">{agent.label}</span>
                                <span className="block truncate text-[10px] text-kumo-subtle">{agent.taskLabel}</span>
                              </span>
                              {agent.assignmentMode === "fixed" ? (
                                <Badge variant="secondary">Core</Badge>
                              ) : (
                                <Switch
                                  label={<span className="sr-only">Assign {selected.name} to {agent.label}</span>}
                                  checked={checked}
                                  disabled={locked || assignmentPending !== null}
                                  transitioning={assignmentPending === agent.id}
                                  onCheckedChange={(next) => void updateAssignment(agent.id, next)}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {assignmentError !== null && <p className="mt-2 text-xs text-kumo-danger">{assignmentError}</p>}
                    </div>

                    <div>
                      <p className="mb-2 text-[10px] font-semibold tracking-[0.14em] text-kumo-subtle uppercase">Quality</p>
                      <div className="divide-y divide-kumo-hairline overflow-hidden rounded-xl border border-kumo-hairline bg-kumo-base text-xs">
                        <div className="flex items-center gap-3 px-3 py-2.5">
                          <ShieldCheckIcon className="size-4 text-kumo-success" aria-hidden />
                          <span className="flex-1">Package integrity</span>
                          <span className="font-medium text-kumo-success">Passed</span>
                        </div>
                        <div className="flex items-center gap-3 px-3 py-2.5">
                          <ClockCounterClockwiseIcon className={cn("size-4", evalTone(selected, evaluation))} aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className="block">Routing eval</span>
                            <span className="block truncate text-[10px] text-kumo-subtle">{selected.source === "saved" ? "Personal skills are not in the project routing suite" : evaluation.runCount === 0 ? "No behavioral run recorded" : !evalIsCurrent(selected, evaluation) ? "Content changed since the last run" : `${evaluation.passedAssertions}/${evaluation.assertionCount} assertions · ${shortRelativeTime(evaluation.lastRunAt)}`}</span>
                          </span>
                          <span className={cn("font-medium", evalTone(selected, evaluation))}>{evalLabel(selected, evaluation)}</span>
                        </div>
                      </div>
                      {selected.source === "installed" && (
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="text-[10px] text-kumo-subtle">
                            {evaluation.durationMs === null ? "No run timing" : `${formatDuration(evaluation.durationMs)} · ${formatCost(evaluation.costUsd)}`}
                          </span>
                          <Button
                            size="sm"
                            variant="secondary"
                            icon={PlayIcon}
                            loading={evalPending}
                            disabled={evalRunActive || manager.evalExecutionStatus !== "ready"}
                            title={manager.evalExecutionStatus === "ready" ? "Runs a real model-backed routing check" : "Run this eval in CI for this deployment"}
                            onClick={() => void runSkillEvals("manual", [selected.name])}
                          >
                            Run eval
                          </Button>
                        </div>
                      )}
                      {evaluation.error !== null && <p className="mt-2 text-xs text-kumo-danger">{evaluation.error}</p>}
                    </div>

                    <div>
                      <p className="mb-2 text-[10px] font-semibold tracking-[0.14em] text-kumo-subtle uppercase">Provenance</p>
                      <dl className="grid grid-cols-[5rem_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-xl border border-kumo-hairline bg-kumo-base p-3 text-xs">
                        <dt className="text-kumo-subtle">Scope</dt><dd>{selected.source === "installed" ? "Project" : "Personal"}</dd>
                        <dt className="text-kumo-subtle">Files</dt><dd>{selected.fileCount} · {formatBytes(selected.sizeBytes)}</dd>
                        <dt className="text-kumo-subtle">Source</dt><dd className="truncate font-mono" title={selected.sourcePath ?? undefined}>{selected.repository ?? "Conversation"}</dd>
                        {selected.revision !== null && <><dt className="text-kumo-subtle">Revision</dt><dd className="truncate font-mono" title={selected.revision}>{selected.revision.slice(0, 9)}</dd></>}
                        {selected.sourcePath !== null && <><dt className="text-kumo-subtle">Path</dt><dd className="break-all font-mono text-[10px]">{selected.sourcePath}</dd></>}
                      </dl>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {selected.source === "saved" && (
                        <>
                          <Button size="sm" variant="secondary" icon={PencilSimpleIcon} onClick={() => beginEdit(selected)}>Edit</Button>
                          <Button size="sm" variant={deleteArmed ? "destructive" : "ghost"} icon={TrashIcon} onClick={() => void deletePersonalSkill(selected)}>{deleteArmed ? "Confirm delete" : "Delete"}</Button>
                        </>
                      )}
                      {selected.repository !== null && (
                        <a className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-kumo-subtle hover:bg-kumo-tint hover:text-kumo-default" href={`https://github.com/${selected.repository}/tree/${selected.revision ?? "main"}/skills/${selected.name}`} target="_blank" rel="noreferrer">
                          <CodeIcon className="size-3.5" aria-hidden />Source<ArrowSquareOutIcon className="size-3" aria-hidden />
                        </a>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })()}
        </aside>
      </div>
    </div>
  );
}
