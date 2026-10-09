import type { GoalDatabase, Query } from "./contracts.ts";
const iso = (v: unknown) =>
  v instanceof Date ? v.toISOString() : v == null ? null : String(v);
const limit = (n: number, max: number) =>
  Math.max(1, Math.min(max, Math.floor(n) || 1));
/** Versioned owner-facing contract. Infrastructure identifiers remain in references. */
export class GoalWorkQueries {
  constructor(
    readonly ownerId: string,
    readonly database: GoalDatabase,
  ) {}
  private async detail(tx: Query, id: string) {
    const [g] = await tx.query(
      "SELECT * FROM goals WHERE owner_id=$1 AND id=$2 FOR SHARE",
      [this.ownerId, id],
    );
    if (!g) throw new Error("Goal not found");
    const tasks = await tx.query(
      "SELECT * FROM goal_tasks WHERE goal_id=$1 ORDER BY position,created_at,id LIMIT 51",
      [id],
    );
    const dependencies = await tx.query(
      "SELECT * FROM goal_work_dependencies WHERE owner_id=$1 AND goal_id=$2 ORDER BY task_id,id LIMIT 1001",
      [this.ownerId, id],
    );
    const links = await tx.query(
      "SELECT * FROM goal_work_links WHERE owner_id=$1 AND goal_id=$2 ORDER BY created_at DESC,correlation_key LIMIT 101",
      [this.ownerId, id],
    );
    const evidence = await tx.query(
      "SELECT * FROM goal_outcome_evidence WHERE owner_id=$1 AND goal_id=$2 AND generation=$3 ORDER BY criterion LIMIT 20",
      [this.ownerId, id, g.generation],
    );
    const plans = await tx.query(
      "SELECT id,version,status,summary,strategy,created_at FROM goal_plans WHERE goal_id=$1 ORDER BY version DESC LIMIT 20",
      [id],
    );
    const events = await tx.query(
      "SELECT id,type,summary,goal_task_id,occurred_at FROM eve_events WHERE owner_id=$1 AND goal_id=$2 ORDER BY occurred_at DESC,id DESC LIMIT 100",
      [this.ownerId, id],
    );
    const oldDependencies = await tx.query(
      `SELECT d.task_id,d.depends_on_task_id,t.status FROM goal_task_dependencies d
      JOIN goal_tasks t ON t.id=d.depends_on_task_id JOIN goal_tasks source ON source.id=d.task_id
      WHERE source.goal_id=$1 ORDER BY d.task_id,d.depends_on_task_id LIMIT 1001`,
      [id],
    );
    const truncated =
      tasks.length > 50 ||
      dependencies.length > 1000 ||
      links.length > 100 ||
      oldDependencies.length > 1000;
    const visible = tasks.slice(0, 50).map((t) => {
      const deps = dependencies
        .filter((d) => d.task_id === t.id)
        .map((d) => ({
          id: d.id,
          kind: d.kind,
          label: d.label,
          reference: d.reference,
          dueAt: iso(d.not_before),
          satisfied:
            d.kind === "schedule"
              ? new Date(d.not_before) <= new Date()
              : d.kind === "task"
                ? tasks.some(
                    (t) => t.id === d.reference && t.status === "completed",
                  )
                : !!d.resolved_at,
          options: d.options,
          evidenceRef: d.evidence_ref,
          decision: d.decision_option,
        }));
      for (const d of oldDependencies.filter((d) => d.task_id === t.id))
        deps.push({
          id: `task:${d.depends_on_task_id}`,
          kind: "task",
          label: "Previous task",
          reference: d.depends_on_task_id,
          dueAt: null,
          satisfied: d.status === "completed",
          options: [],
          evidenceRef: null,
          decision: null,
        });
      const current = links.find(
        (l) =>
          l.task_id === t.id &&
          l.goal_generation === g.generation &&
          l.task_generation === t.generation,
      );
      const unresolved = deps.filter((d) => !d.satisfied);
      const activeWork = links.find(
        (l) => l.task_id === t.id && ["prepared", "linked"].includes(l.state),
      );
      const waiting = unresolved.map((d) =>
        d.kind === "owner"
          ? "WAITING FOR OWNER"
          : d.kind === "schedule"
            ? "WAITING FOR SCHEDULE"
            : d.kind === "capability"
              ? "WAITING FOR CAPABILITY"
              : ["task", "work"].includes(d.kind)
                ? "WAITING FOR WORK"
                : "WAITING FOR EXTERNAL",
      );
      return {
        id: t.id,
        objective: t.title,
        criteria: t.success_criteria,
        status: t.status,
        paused: t.paused,
        priority: t.priority,
        dueAt: iso(t.due_at),
        assignedTo: t.assigned_to,
        dependencies: deps,
        waiting: [...new Set(waiting)],
        blocker: t.blocker,
        nextAction: t.paused
          ? "Resume when ready"
          : (unresolved[0]?.label ?? t.next_action),
        eligibleForAdmission:
          g.status === "active" &&
          !t.paused &&
          ![
            "completed",
            "cancelled",
            "blocked",
            "failed",
            "verification",
          ].includes(t.status) &&
          !unresolved.length &&
          !activeWork &&
          !current &&
          !truncated,
        currentWork: activeWork?.work_id ?? current?.work_id ?? null,
        result: current?.result ?? null,
        evidence: current?.result?.evidence ?? [],
        completedAt: iso(t.completed_at),
        history: events
          .filter((e) => e.goal_task_id === t.id)
          .map((e) => ({
            id: e.id,
            type: e.type,
            summary: e.summary,
            at: iso(e.occurred_at),
          })),
      };
    });
    return {
      contractVersion: 1 as const,
      id: g.id,
      objective: g.title,
      revision: g.revision,
      generation: g.generation,
      updatedAt: iso(g.updated_at),
      createdAt: iso(g.created_at),
      completedAt: iso(g.completed_at),
      archivedAt: iso(g.archived_at),
      requireOwnerConfirmation: g.requires_owner_confirmation,
      ownerConfirmed: g.confirmed_generation === g.generation,
      status: g.status,
      priority: g.priority,
      target: iso(g.target_date),
      successCriteria: g.success_criteria as string[],
      progress: {
        completedOutcomes: evidence.length,
        requiredOutcomes: g.success_criteria.length,
        completedTasks: visible.filter((t) => t.status === "completed").length,
        requiredTasks: visible.filter((t) => t.status !== "cancelled").length,
        blockers: visible.filter((t) => t.waiting.length || t.blocker).length,
      },
      plan: plans[0] ?? null,
      planHistory: plans,
      tasks: visible,
      completedOutcomes: evidence.map((e) => ({
        criterion: e.criterion,
        reference: e.reference,
        source: e.source,
      })),
      activeWork: links
        .filter((l) => l.state === "linked")
        .map((l) => ({
          id: l.work_id,
          taskId: l.task_id,
          state: l.work_state,
        })),
      needsYou: visible
        .filter(
          (t) =>
            !t.paused &&
            !["completed", "cancelled"].includes(t.status) &&
            g.status === "active",
        )
        .flatMap((t) =>
          t.dependencies
            .filter((d) => d.kind === "owner" && !d.satisfied)
            .map((d) => ({ taskId: t.id, ...d })),
        ),
      recentResults: links
        .filter((l) => l.result)
        .map((l) => ({
          taskId: l.task_id,
          workId: l.work_id,
          result: l.result,
        })),
      nextAction:
        visible.find((t) => t.eligibleForAdmission)?.objective ??
        visible.find((t) => t.waiting.length)?.nextAction ??
        null,
      history: events.map((e) => ({
        id: e.id,
        type: e.type,
        summary: e.summary,
        at: iso(e.occurred_at),
      })),
      truncated,
    };
  }
  goal(id: string) {
    return this.database.transaction((tx) => this.detail(tx, id));
  }
  async task(goalId: string, taskId: string) {
    const goal = await this.goal(goalId),
      task = goal.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error("Task not found in bounded Goal view");
    return { contractVersion: 1 as const, goalId, ...task };
  }
  async today(afterGoalId = "", pageSize = 10) {
    const take = limit(pageSize, 20);
    const rows = await this.database.query(
      `SELECT id FROM goals WHERE owner_id=$1 AND id>$2 AND status NOT IN ('archived','abandoned')
      ORDER BY id LIMIT $3`,
      [this.ownerId, afterGoalId, take + 1],
    );
    const goals = [];
    for (const row of rows.slice(0, take)) goals.push(await this.goal(row.id));
    return {
      contractVersion: 1 as const,
      goals,
      nextCursor: rows.length > take ? String(rows[take - 1].id) : null,
      canProceed: goals.flatMap((g) =>
        g.tasks
          .filter((t) => t.eligibleForAdmission)
          .map((t) => ({ goalId: g.id, ...t })),
      ),
      doing: goals.flatMap((g) =>
        g.activeWork.map((w) => ({ goalId: g.id, ...w })),
      ),
      blocked: goals.flatMap((g) =>
        g.tasks
          .filter((t) => t.waiting.length || t.blocker)
          .map((t) => ({ goalId: g.id, ...t })),
      ),
      needsYou: goals.flatMap((g) =>
        g.needsYou.map((n) => ({ goalId: g.id, ...n })),
      ),
      recentlyCompleted: goals.flatMap((g) =>
        g.tasks
          .filter(
            (t) =>
              t.status === "completed" &&
              t.completedAt &&
              new Date(t.completedAt).getTime() > Date.now() - 86400000,
          )
          .map((t) => ({ goalId: g.id, ...t })),
      ),
    };
  }
  async interventions(goalId: string) {
    return this.database.transaction(async (tx) => {
      const [goal] = await tx.query(
        "SELECT id FROM goals WHERE owner_id=$1 AND id=$2 FOR SHARE",
        [this.ownerId, goalId],
      );
      if (!goal) throw new Error("Goal not found");
      const rows = await tx.query(
        `SELECT payload->>'classification' AS classification,count(*)::int AS count FROM eve_events
        WHERE owner_id=$1 AND goal_id=$2 AND type='HUMAN_INTERVENTION' GROUP BY payload->>'classification'`,
        [this.ownerId, goalId],
      );
      return {
        necessaryJudgment: Number(
          rows.find((r) => r.classification === "NECESSARY_JUDGMENT")?.count ??
            0,
        ),
        avoidableCoordination: Number(
          rows.find((r) => r.classification === "AVOIDABLE_COORDINATION")
            ?.count ?? 0,
        ),
      };
    });
  }
  async brief(
    since: string,
    until = new Date().toISOString(),
    cursor?: { at: string; id: string },
  ) {
    if (
      !Number.isFinite(Date.parse(since)) ||
      !Number.isFinite(Date.parse(until)) ||
      Date.parse(since) > Date.parse(until)
    )
      throw new Error("Valid brief interval required");
    const events = await this.database.query(
      `SELECT id,type,summary,goal_id,goal_task_id,payload,occurred_at::text AS occurred_at FROM eve_events
      WHERE owner_id=$1 AND occurred_at>$2 AND occurred_at<=$3
      AND (occurred_at,id)>($4::timestamptz,$5::text) ORDER BY occurred_at,id LIMIT 201`,
      [this.ownerId, since, until, cursor?.at ?? since, cursor?.id ?? ""],
    );
    const changes = events.slice(0, 200).map((e) => ({
      id: e.id,
      type: e.type,
      summary: e.summary,
      goalId: e.goal_id,
      taskId: e.goal_task_id,
      at: iso(e.occurred_at)!,
      references: e.payload,
    }));
    const last = changes.at(-1);
    const upcoming = await this.database.query(
      `SELECT d.goal_id,d.task_id,d.label,d.not_before FROM goal_work_dependencies d
      JOIN goals g ON g.id=d.goal_id JOIN goal_tasks t ON t.id=d.task_id WHERE d.owner_id=$1 AND d.kind='schedule'
      AND d.not_before>$2 AND d.not_before<=$2::timestamptz+interval '7 days' AND g.status='active' AND NOT t.paused
      AND t.status NOT IN ('completed','cancelled') ORDER BY d.not_before,d.task_id,d.id LIMIT 101`,
      [this.ownerId, until],
    );
    const current = await this.today();
    return {
      contractVersion: 1 as const,
      since,
      until,
      changes,
      current,
      needsYou: current.needsYou,
      newBlockers: changes.filter((e) => e.type === "RESULT_RECEIVED"),
      nextCursor:
        events.length > 200 && last ? { at: last.at, id: last.id } : null,
      completed: changes.filter((e) =>
        ["TASK_COMPLETED", "GOAL_COMPLETED"].includes(e.type),
      ),
      results: changes.filter((e) =>
        ["RESULT_RECEIVED", "TASK_COMPLETED"].includes(e.type),
      ),
      newlyEligible: changes.filter((e) => e.type === "TASK_ELIGIBLE"),
      progressChanges: changes.filter((e) =>
        [
          "TASK_COMPLETED",
          "GOAL_COMPLETED",
          "GOAL_CHANGED",
          "PLAN_CHANGED",
        ].includes(e.type),
      ),
      upcoming: upcoming.slice(0, 100).map((d) => ({
        goalId: d.goal_id,
        taskId: d.task_id,
        label: d.label,
        dueAt: iso(d.not_before),
      })),
      upcomingTruncated: upcoming.length > 100,
    };
  }
}
