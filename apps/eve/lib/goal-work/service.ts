import { createHash, randomUUID } from "node:crypto";
import { redactEvidenceText } from "../task-types.ts";
import type {
  DependencyInput,
  DependencySignal,
  GoalContext,
  GoalDatabase,
  NeedsYouItem,
  NeedsYouPort,
  Query,
  ReminderPort,
  SignalPort,
  WorkPort,
  WorkRequest,
} from "./contracts.ts";
import {
  dependency,
  goalInput,
  resultSchema,
  signalSchema,
  taskInput,
  text,
} from "./validation.ts";

type Row = Record<string, any>;
const fingerprint = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const terminal = new Set(["completed", "cancelled"]);
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));
export class GoalWorkService {
  constructor(
    readonly ownerId: string,
    readonly actor: "owner" | "agent",
    readonly database: GoalDatabase,
    readonly work: WorkPort,
    readonly signals: SignalPort,
    readonly inbox?: NeedsYouPort,
  ) {
    text.max(255).parse(ownerId);
  }
  private owner() {
    if (this.actor !== "owner") throw new Error("Owner decision required");
  }
  private async locked<T>(
    id: string,
    fn: (tx: Query, goal: Row) => Promise<T>,
  ): Promise<T> {
    return this.database.transaction(async (tx) => {
      const [goal] = await tx.query(
        "SELECT * FROM goals WHERE owner_id=$1 AND id=$2 FOR UPDATE",
        [this.ownerId, id],
      );
      if (!goal) throw new Error("Goal not found");
      return fn(tx, goal);
    });
  }
  private mutable(goal: Row) {
    if (["completed", "archived", "abandoned"].includes(goal.status))
      throw new Error("Goal is terminal");
  }
  private async task(tx: Query, goalId: string, taskId: string) {
    const [task] = await tx.query(
      "SELECT * FROM goal_tasks WHERE goal_id=$1 AND id=$2",
      [goalId, taskId],
    );
    if (!task) throw new Error("Task not found");
    return task;
  }
  private async event(
    tx: Query,
    goalId: string,
    type: string,
    summary: string,
    taskId?: string,
    payload: object = {},
    idempotencyKey: string | null = null,
  ) {
    await tx.query(
      "UPDATE goals SET revision=revision+1,updated_at=now() WHERE owner_id=$1 AND id=$2",
      [this.ownerId, goalId],
    );
    await tx.query(
      `INSERT INTO eve_events(id,owner_id,type,source_type,goal_id,goal_task_id,summary,payload,idempotency_key)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,
      [
        randomUUID(),
        this.ownerId,
        type,
        this.actor,
        goalId,
        taskId ?? null,
        redactEvidenceText(summary),
        JSON.stringify(payload, (_key, value) =>
          typeof value === "string" ? redactEvidenceText(value) : value,
        ),
        idempotencyKey,
      ],
    );
  }
  async create(value: unknown) {
    const input = goalInput.parse(value);
    return this.database.transaction(async (tx) => {
      const rows = await tx.query(
        `INSERT INTO goals(id,owner_id,title,success_criteria,priority,target_date,status,source,source_reference)
        VALUES($1,$2,$3,$4::jsonb,$5,$6,'active','goal-work',$7) ON CONFLICT DO NOTHING RETURNING id`,
        [
          input.id,
          this.ownerId,
          input.objective,
          JSON.stringify(input.criteria),
          input.priority,
          input.target,
          fingerprint(input),
        ],
      );
      const [goal] = await tx.query(
        "SELECT * FROM goals WHERE owner_id=$1 AND id=$2",
        [this.ownerId, input.id],
      );
      if (!goal || goal.source_reference !== fingerprint(input))
        throw new Error("Goal identity conflict");
      if (rows.length)
        await this.event(tx, input.id, "GOAL_CREATED", "Goal created");
      return goal;
    });
  }
  async plan(
    goalId: string,
    summary: string,
    reason: string,
    resultRef?: string,
    commandId = randomUUID(),
  ) {
    text.parse(summary);
    text.parse(reason);
    text.parse(commandId);
    const commandHash = fingerprint([
      goalId,
      summary,
      reason,
      resultRef ?? null,
    ]);
    const commandKey = `goal-plan:${commandId}`;
    return this.locked(goalId, async (tx, g) => {
      const [prior] = await tx.query(
        "SELECT goal_id,payload FROM eve_events WHERE owner_id=$1 AND idempotency_key=$2",
        [this.ownerId, commandKey],
      );
      if (prior) {
        if (
          prior.goal_id !== goalId ||
          prior.payload.commandHash !== commandHash
        )
          throw new Error("Plan command identity conflict");
        return {
          id: String(prior.payload.planId),
          version: Number(prior.payload.version),
        };
      }
      this.mutable(g);
      if (this.actor === "agent") {
        const [result] = await tx.query(
          "SELECT 1 FROM goal_work_links WHERE owner_id=$1 AND goal_id=$2 AND result_id=$3 AND state='result'",
          [this.ownerId, goalId, resultRef ?? null],
        );
        if (!result)
          throw new Error(
            "Result provenance required for automatic replanning",
          );
      }
      const [last] = await tx.query(
        "SELECT version FROM goal_plans WHERE goal_id=$1 ORDER BY version DESC LIMIT 1",
        [goalId],
      );
      await tx.query(
        "UPDATE goal_plans SET status='superseded',superseded_at=now() WHERE goal_id=$1 AND status='active'",
        [goalId],
      );
      const id = randomUUID(),
        version = Number(last?.version ?? 0) + 1;
      await tx.query(
        "INSERT INTO goal_plans(id,goal_id,version,summary,strategy) VALUES($1,$2,$3,$4,$5)",
        [id, goalId, version, summary, reason],
      );
      await this.event(
        tx,
        goalId,
        "PLAN_CHANGED",
        reason,
        undefined,
        {
          planId: id,
          version,
          resultRef,
          commandHash,
        },
        commandKey,
      );
      return { id, version };
    });
  }
  async addTask(goalId: string, value: unknown) {
    const input = taskInput.parse(value);
    return this.locked(goalId, async (tx, g) => {
      const [existing] = await tx.query(
        "SELECT * FROM goal_tasks WHERE goal_id=$1 AND id=$2",
        [goalId, input.id],
      );
      if (existing) {
        if (existing.provenance.creationHash !== fingerprint(input))
          throw new Error("Task identity conflict");
        return existing;
      }
      this.mutable(g);
      const [count] = await tx.query(
        "SELECT count(*)::int AS n FROM goal_tasks WHERE goal_id=$1",
        [goalId],
      );
      if (count.n >= 50)
        throw new Error("Plan limit reached: review the existing 50 tasks");
      if (input.provenance.kind === "owner") this.owner();
      if (input.provenance.kind === "plan") {
        const [p] = await tx.query(
          "SELECT id FROM goal_plans WHERE goal_id=$1 AND id=$2 AND status='active'",
          [goalId, input.provenance.reference],
        );
        if (!p) throw new Error("Current plan provenance required");
      }
      if (input.provenance.kind === "result") {
        const [r] = await tx.query(
          `SELECT t.provenance FROM goal_work_links l JOIN goal_tasks t ON t.id=l.task_id
          WHERE l.owner_id=$1 AND l.goal_id=$2 AND l.result_id=$3 AND l.state='result'`,
          [this.ownerId, goalId, input.provenance.reference],
        );
        if (
          !r ||
          input.provenance.depth !== Number(r.provenance.depth ?? 0) + 1
        )
          throw new Error("Bounded Result provenance required");
      }
      await tx.query(
        `INSERT INTO goal_tasks(id,goal_id,title,success_criteria,priority,due_at,assigned_to,provenance,required_capabilities,next_action)
        VALUES($1,$2,$3,$4::jsonb,$5,$6,$7,$8::jsonb,$9::jsonb,'Evaluate dependencies and existing authority')`,
        [
          input.id,
          goalId,
          input.objective,
          JSON.stringify(input.criteria),
          input.priority,
          input.dueAt,
          input.assignedTo,
          JSON.stringify({
            ...input.provenance,
            creationHash: fingerprint(input),
          }),
          JSON.stringify(input.requiredCapabilities),
        ],
      );
      await this.replaceDependencies(tx, goalId, input.id, input.dependencies);
      await this.event(tx, goalId, "TASK_CREATED", "Task created", input.id, {
        provenance: input.provenance,
      });
      return this.task(tx, goalId, input.id);
    });
  }
  private async replaceDependencies(
    tx: Query,
    goalId: string,
    taskId: string,
    inputs: DependencyInput[],
  ) {
    if (new Set(inputs.map((d) => d.id)).size !== inputs.length)
      throw new Error("Duplicate dependency identity");
    await tx.query(
      "DELETE FROM goal_work_dependencies WHERE owner_id=$1 AND task_id=$2",
      [this.ownerId, taskId],
    );
    for (const raw of inputs) {
      const d = dependency.parse(raw);
      if (d.kind === "task") {
        await this.task(tx, goalId, d.reference);
        const cycle = await tx.query(
          `WITH RECURSIVE edges AS (
          SELECT task_id,reference AS dependency FROM goal_work_dependencies WHERE owner_id=$1 AND goal_id=$2 AND kind='task'
          UNION SELECT d.task_id,d.depends_on_task_id FROM goal_task_dependencies d JOIN goal_tasks t ON t.id=d.task_id WHERE t.goal_id=$2
        ), reachable(id) AS (SELECT $3::text UNION SELECT e.dependency FROM edges e JOIN reachable r ON e.task_id=r.id)
        SELECT 1 FROM reachable WHERE id=$4`,
          [this.ownerId, goalId, d.reference, taskId],
        );
        if (cycle.length) throw new Error("Dependency cycle");
      }
      await tx.query(
        `INSERT INTO goal_work_dependencies(owner_id,goal_id,task_id,id,kind,reference,label,not_before,options)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
        [
          this.ownerId,
          goalId,
          taskId,
          d.id,
          d.kind,
          d.reference,
          d.label,
          d.notBefore ?? null,
          JSON.stringify(d.options ?? []),
        ],
      );
    }
  }
  async reviseTask(goalId: string, taskId: string, value: unknown) {
    this.owner();
    const input = taskInput.parse(value);
    if (input.id !== taskId) throw new Error("Task identity cannot change");
    return this.locked(goalId, async (tx, g) => {
      this.mutable(g);
      const t = await this.task(tx, goalId, taskId);
      if (terminal.has(t.status))
        throw new Error("Terminal task cannot be revised");
      await this.replaceDependencies(tx, goalId, taskId, input.dependencies);
      await tx.query(
        `UPDATE goal_tasks SET title=$3,success_criteria=$4::jsonb,priority=$5,due_at=$6,assigned_to=$7,
        required_capabilities=$8::jsonb,generation=generation+1,blocker=NULL,status='todo',updated_at=now() WHERE goal_id=$1 AND id=$2`,
        [
          goalId,
          taskId,
          input.objective,
          JSON.stringify(input.criteria),
          input.priority,
          input.dueAt,
          input.assignedTo,
          JSON.stringify(input.requiredCapabilities),
        ],
      );
      await this.event(
        tx,
        goalId,
        "TASK_CHANGED",
        "Owner revised task",
        taskId,
      );
      return this.task(tx, goalId, taskId);
    });
  }
  async reviseGoal(goalId: string, value: unknown) {
    this.owner();
    const input = goalInput.parse(value);
    if (input.id !== goalId) throw new Error("Goal identity cannot change");
    return this.locked(goalId, async (tx, g) => {
      if (g.status === "archived")
        throw new Error("Archived Goal cannot be revised");
      await tx.query(
        `UPDATE goals SET title=$3,success_criteria=$4::jsonb,priority=$5,target_date=$6,updated_at=now()
        WHERE owner_id=$1 AND id=$2`,
        [
          this.ownerId,
          goalId,
          input.objective,
          JSON.stringify(input.criteria),
          input.priority,
          input.target,
        ],
      );
      await this.event(
        tx,
        goalId,
        "GOAL_CHANGED",
        "Owner revised goal",
        undefined,
        {
          previousGeneration: g.generation,
          previousCriteria: g.success_criteria,
        },
      );
    });
  }
  async controlGoal(
    goalId: string,
    action: "pause" | "resume" | "reopen" | "archive",
    reason: string,
  ) {
    this.owner();
    text.parse(reason);
    return this.locked(goalId, async (tx, g) => {
      const allowed =
        action === "reopen"
          ? g.status === "completed"
          : action === "resume"
            ? g.status === "paused"
            : action === "pause"
              ? ["active", "blocked", "waiting"].includes(g.status)
              : g.status !== "archived";
      if (!allowed) throw new Error("Invalid Goal control transition");
      const status =
        action === "archive"
          ? "archived"
          : action === "pause"
            ? "paused"
            : "active";
      await tx.query(
        `UPDATE goals SET status=$3,generation=generation+$4,updated_at=now(),
        archived_at=CASE WHEN $3='archived' THEN now() ELSE archived_at END WHERE owner_id=$1 AND id=$2`,
        [this.ownerId, goalId, status, action === "reopen" ? 1 : 0],
      );
      await this.event(
        tx,
        goalId,
        `GOAL_${action.toUpperCase()}`,
        reason,
        undefined,
        { previousCompletedAt: g.completed_at },
      );
    });
  }
  async controlTask(
    goalId: string,
    taskId: string,
    action: "pause" | "resume" | "cancel",
    reason: string,
  ) {
    this.owner();
    text.parse(reason);
    return this.locked(goalId, async (tx, g) => {
      this.mutable(g);
      const t = await this.task(tx, goalId, taskId);
      if (terminal.has(t.status)) throw new Error("Task is terminal");
      await tx.query(
        `UPDATE goal_tasks SET paused=$3,status=CASE WHEN $4 THEN 'cancelled' ELSE status END,
        blocker=$5,updated_at=now() WHERE goal_id=$1 AND id=$2`,
        [
          goalId,
          taskId,
          action === "pause",
          action === "cancel",
          action === "resume" ? null : reason,
        ],
      );
      const work = await tx.query(
        "SELECT work_id,work_state FROM goal_work_links WHERE owner_id=$1 AND task_id=$2",
        [this.ownerId, taskId],
      );
      await this.event(
        tx,
        goalId,
        `TASK_${action.toUpperCase()}`,
        reason,
        taskId,
        { work },
      );
    });
  }
  private async evaluate(tx: Query, g: Row, t: Row, now: Date) {
    if (g.status !== "active") return `Goal ${g.status}`;
    if (t.paused || terminal.has(t.status))
      return t.paused ? "Task paused" : `Task ${t.status}`;
    if (["blocked", "failed", "verification"].includes(t.status))
      return t.blocker ?? "Task needs review before further Work";
    const deps = await tx.query(
      "SELECT * FROM goal_work_dependencies WHERE owner_id=$1 AND task_id=$2 ORDER BY id",
      [this.ownerId, t.id],
    );
    for (const d of deps) {
      if (d.kind === "schedule" && new Date(d.not_before) > now)
        return "WAITING FOR SCHEDULE";
      if (d.kind === "task") {
        const prior = await this.task(tx, g.id, d.reference);
        if (prior.status !== "completed") return "WAITING FOR WORK";
      } else if (d.kind !== "schedule" && !d.resolved_at)
        return `WAITING FOR ${d.kind === "owner" ? "OWNER" : d.kind === "capability" ? "CAPABILITY" : d.kind === "work" ? "WORK" : "EXTERNAL"}`;
    }
    const legacy = await tx.query(
      `SELECT 1 FROM goal_task_dependencies d JOIN goal_tasks t ON t.id=d.depends_on_task_id
      WHERE d.task_id=$1 AND t.status<>'completed' LIMIT 1`,
      [t.id],
    );
    if (legacy.length) return "WAITING FOR WORK";
    // The Work adapter, not this dependency evaluator, checks current capabilities and authority.
    return null;
  }
  async context(goalId: string, taskId: string): Promise<GoalContext> {
    return this.locked(goalId, async (tx, g) => {
      const t = await this.task(tx, goalId, taskId);
      return {
        ownerId: this.ownerId,
        goalId,
        taskId,
        goalGeneration: g.generation,
        taskGeneration: t.generation,
      };
    });
  }
  async continue(context: GoalContext, now = new Date()) {
    if (context.ownerId !== this.ownerId) throw new Error("Goal not found");
    // Prepare commits BEFORE contacting Work. This is the recoverable outbox intent.
    const prepared = await this.locked(context.goalId, async (tx, g) => {
      const t = await this.task(tx, g.id, context.taskId);
      if (
        g.generation !== context.goalGeneration ||
        t.generation !== context.taskGeneration
      )
        return { blocked: "Stale continuation" };
      const blocked = await this.evaluate(tx, g, t, now);
      if (blocked) return { blocked };
      const [prior] = await tx.query(
        `SELECT * FROM goal_work_links WHERE owner_id=$1 AND task_id=$2
        AND (state IN ('prepared','linked') OR (goal_generation=$3 AND task_generation=$4)) ORDER BY created_at LIMIT 1`,
        [this.ownerId, t.id, g.generation, t.generation],
      );
      if (prior) return { key: String(prior.correlation_key) };
      const [count] = await tx.query(
        "SELECT count(*)::int n FROM goal_work_links WHERE owner_id=$1 AND goal_id=$2",
        [this.ownerId, g.id],
      );
      if (count.n >= 100)
        return { blocked: "Continuation limit reached; owner review required" };
      const [plan] = await tx.query(
        "SELECT version FROM goal_plans WHERE goal_id=$1 AND status='active' ORDER BY version DESC LIMIT 1",
        [g.id],
      );
      const decisions = await tx.query(
        `SELECT id AS "dependencyId",evidence_ref AS reference,decision_option AS option
        FROM goal_work_dependencies WHERE owner_id=$1 AND task_id=$2 AND resolved_at IS NOT NULL`,
        [this.ownerId, t.id],
      );
      const dependencyRows = await tx.query(
        `SELECT d.id,d.kind,d.reference,d.not_before,
        CASE WHEN d.kind='task' THEN (SELECT l.result_id FROM goal_work_links l
          WHERE l.owner_id=$1 AND l.task_id=d.reference AND l.state='result' ORDER BY l.updated_at DESC LIMIT 1)
          ELSE d.evidence_ref END AS evidence_ref
        FROM goal_work_dependencies d WHERE d.owner_id=$1 AND d.task_id=$2 ORDER BY d.id`,
        [this.ownerId, t.id],
      );
      const dependencies: WorkRequest["dependencies"] = dependencyRows.map(
        (d) => ({
          id: d.id,
          kind: d.kind,
          reference: d.reference,
          evidenceRef: d.evidence_ref,
          notBefore: d.not_before ? iso(d.not_before) : null,
        }),
      );
      const legacy = await tx.query(
        `SELECT d.depends_on_task_id,l.result_id FROM goal_task_dependencies d
        LEFT JOIN LATERAL (SELECT result_id FROM goal_work_links WHERE owner_id=$1 AND task_id=d.depends_on_task_id
          AND state='result' ORDER BY updated_at DESC LIMIT 1) l ON true WHERE d.task_id=$2 ORDER BY d.depends_on_task_id`,
        [this.ownerId, t.id],
      );
      for (const d of legacy)
        dependencies.push({
          id: `task:${d.depends_on_task_id}`,
          kind: "task",
          reference: d.depends_on_task_id,
          evidenceRef: d.result_id ?? null,
          notBefore: null,
        });
      const key = createHash("sha256")
        .update(
          JSON.stringify([
            this.ownerId,
            g.id,
            t.id,
            g.generation,
            t.generation,
          ]),
        )
        .digest("hex");
      const request: WorkRequest = {
        ...context,
        correlationKey: key,
        objective: t.title,
        goalObjective: g.title,
        criteria: t.success_criteria,
        requiredCapabilities: t.required_capabilities,
        assignedTo: t.assigned_to,
        targetAt: t.due_at ? iso(t.due_at) : null,
        goalCriteria: g.success_criteria,
        planVersion: plan?.version ?? 0,
        dependencies,
        decisions: decisions as WorkRequest["decisions"],
      };
      await tx.query(
        `INSERT INTO goal_work_links(owner_id,goal_id,task_id,goal_generation,task_generation,correlation_key,request,state)
        VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,'prepared')`,
        [
          this.ownerId,
          g.id,
          t.id,
          g.generation,
          t.generation,
          key,
          JSON.stringify(request),
        ],
      );
      await this.event(
        tx,
        g.id,
        "TASK_ELIGIBLE",
        "Task eligible for Work admission",
        t.id,
      );
      return { key };
    });
    if (!prepared.key) return prepared;
    return this.locked(context.goalId, async (tx, g) => {
      const t = await this.task(tx, g.id, context.taskId);
      const [link] = await tx.query(
        "SELECT * FROM goal_work_links WHERE owner_id=$1 AND correlation_key=$2",
        [this.ownerId, prepared.key],
      );
      if (link.state === "result")
        return { workId: link.work_id, resultId: link.result_id };
      if (link.state === "denied" || link.state === "superseded")
        return {
          blocked:
            link.reason ??
            "Canonical Work cancelled; revise task before continuing",
        };
      const blocked = await this.evaluate(tx, g, t, now);
      if (blocked) return { blocked };
      if (
        link.goal_generation !== g.generation ||
        link.task_generation !== t.generation
      ) {
        // Never replace unknown or active Work with another generation. Canonical
        // cancellation/reconciliation belongs to Work, not Goal orchestration.
        return {
          blocked: "Previous Work requires canonical reconciliation",
          workId: link.work_id,
        };
      }
      if (link.state === "linked") return { workId: link.work_id };
      const result = await this.work.ensure(link.request as WorkRequest);
      if ("denied" in result) {
        // Known denial creates no Work; retain prepared intent for re-admission
        // under the same key when capability/authority becomes available.
        await tx.query(
          "UPDATE goal_work_links SET reason=$3,updated_at=now() WHERE owner_id=$1 AND correlation_key=$2",
          [this.ownerId, prepared.key, result.denied],
        );
        await tx.query(
          "UPDATE goal_tasks SET blocker=$3 WHERE goal_id=$1 AND id=$2",
          [g.id, t.id, result.denied],
        );
        return { blocked: result.denied };
      }
      if (
        result.ownerId !== this.ownerId ||
        result.correlationKey !== prepared.key
      )
        throw new Error("Work correlation mismatch");
      await tx.query(
        `UPDATE goal_work_links SET state='linked',work_id=$3,work_state=$4,reason=NULL,updated_at=now()
        WHERE owner_id=$1 AND correlation_key=$2`,
        [this.ownerId, prepared.key, result.id, result.state],
      );
      await tx.query(
        "UPDATE goal_tasks SET status='in_progress',blocker=NULL,started_at=coalesce(started_at,now()),updated_at=now() WHERE goal_id=$1 AND id=$2",
        [g.id, t.id],
      );
      await this.event(tx, g.id, "WORK_LINKED", "Work started", t.id, {
        workId: result.id,
      });
      return { workId: result.id };
    });
  }
  /** Reconcile only canonical state; never cancels or reauthorizes execution. */
  async reconcileWork(goalId: string, taskId: string) {
    return this.locked(goalId, async (tx, g) => {
      await this.task(tx, goalId, taskId);
      const links = await tx.query(
        "SELECT * FROM goal_work_links WHERE owner_id=$1 AND task_id=$2 AND state IN ('prepared','linked') ORDER BY created_at LIMIT 100",
        [this.ownerId, taskId],
      );
      for (const link of links) {
        const found = await this.work.find(this.ownerId, link.correlation_key);
        // Absence alone does not prove that an in-flight remote create failed.
        if (!found) continue;
        if (
          found.ownerId !== this.ownerId ||
          found.correlationKey !== link.correlation_key
        )
          throw new Error("Work correlation mismatch");
        await tx.query(
          "UPDATE goal_work_links SET work_id=$3,work_state=$4,state=$5,updated_at=now() WHERE owner_id=$1 AND correlation_key=$2",
          [
            this.ownerId,
            link.correlation_key,
            found.id,
            found.state,
            found.state === "cancelled" ? "superseded" : "linked",
          ],
        );
        await this.event(
          tx,
          g.id,
          "WORK_RECONCILED",
          "Canonical Work state reconciled",
          taskId,
          { workId: found.id, state: found.state },
        );
      }
    });
  }
  async signal(value: DependencySignal) {
    const signal = signalSchema.parse(value);
    if (signal.ownerId !== this.ownerId || !(await this.signals.verify(signal)))
      throw new Error("Untrusted dependency signal");
    return this.locked(signal.goalId, async (tx, g) => {
      const t = await this.task(tx, g.id, signal.taskId);
      if (
        g.generation !== signal.goalGeneration ||
        t.generation !== signal.taskGeneration
      )
        throw new Error("Stale dependency signal");
      const [prior] = await tx.query(
        "SELECT payload FROM goal_work_signals WHERE owner_id=$1 AND event_id=$2",
        [this.ownerId, signal.eventId],
      );
      if (prior) {
        // jsonb key order is not stable; compare normalized fields, not raw JSON text.
        if (
          Object.keys({ ...prior.payload, ...signal }).some(
            (k) => prior.payload[k] !== signal[k as keyof DependencySignal],
          )
        )
          throw new Error("Event identity conflict");
        return { duplicate: true };
      }
      const [d] = await tx.query(
        "SELECT * FROM goal_work_dependencies WHERE owner_id=$1 AND task_id=$2 AND id=$3",
        [this.ownerId, t.id, signal.dependencyId],
      );
      if (!d || d.kind !== signal.kind || d.reference !== signal.reference)
        throw new Error("Unrelated dependency signal");
      if (d.kind === "owner" && !d.options.includes(signal.option))
        throw new Error("Invalid owner decision");
      await tx.query(
        "INSERT INTO goal_work_signals(owner_id,event_id,payload) VALUES($1,$2,$3::jsonb)",
        [this.ownerId, signal.eventId, JSON.stringify(signal)],
      );
      if (!d.resolved_at) {
        await tx.query(
          `UPDATE goal_work_dependencies SET resolved_at=now(),evidence_ref=$4,decision_option=$5
          WHERE owner_id=$1 AND task_id=$2 AND id=$3`,
          [this.ownerId, t.id, d.id, signal.evidenceRef, signal.option ?? null],
        );
        await this.event(
          tx,
          g.id,
          d.kind === "owner" ? "OWNER_DECISION" : "DEPENDENCY_CLEARED",
          d.label,
          t.id,
          {
            dependencyId: d.id,
            evidenceRef: signal.evidenceRef,
            option: signal.option,
          },
        );
      }
      return { duplicate: !!d.resolved_at };
    });
  }
  async ingestResult(
    goalId: string,
    taskId: string,
    workId: string,
    resultId: string,
  ) {
    const result = resultSchema.parse(
      await this.work.result(this.ownerId, workId, resultId),
    );
    return this.locked(goalId, async (tx, g) => {
      const t = await this.task(tx, goalId, taskId);
      const [link] = await tx.query(
        "SELECT * FROM goal_work_links WHERE owner_id=$1 AND task_id=$2 AND work_id=$3",
        [this.ownerId, taskId, workId],
      );
      if (
        !link ||
        result.ownerId !== this.ownerId ||
        result.workId !== workId ||
        result.id !== resultId ||
        result.correlationKey !== link.correlation_key
      )
        throw new Error("Result correlation mismatch");
      if (link.result_id === resultId)
        return { duplicate: true, completed: t.status === "completed" };
      if (link.state === "result")
        throw new Error(
          "A different Result is already recorded for this continuation",
        );
      await tx.query(
        `UPDATE goal_work_links SET state='result',result_id=$3,result=$4::jsonb,updated_at=now()
        WHERE owner_id=$1 AND correlation_key=$2`,
        [this.ownerId, link.correlation_key, resultId, JSON.stringify(result)],
      );
      const contextMatches =
        link.task_generation === t.generation &&
        link.goal_generation === g.generation;
      const current = contextMatches && result.current;
      const complete =
        current &&
        !terminal.has(t.status) &&
        result.outcome === "SUCCEEDED" &&
        result.verified &&
        result.evidence.length > 0 &&
        t.success_criteria.length > 0 &&
        t.success_criteria.every((c: string) =>
          result.satisfiedCriteria.includes(c),
        );
      if (complete) {
        await tx.query(
          "UPDATE goal_tasks SET status='completed',completed_at=now(),blocker=NULL,next_action='Outcome verified',updated_at=now() WHERE goal_id=$1 AND id=$2",
          [goalId, taskId],
        );
        for (const criterion of result.satisfiedGoalCriteria ?? [])
          if (g.success_criteria.includes(criterion))
            await tx.query(
              `INSERT INTO goal_outcome_evidence(owner_id,goal_id,generation,criterion,reference,source)
            VALUES($1,$2,$3,$4,$5,'result') ON CONFLICT DO NOTHING`,
              [this.ownerId, goalId, g.generation, criterion, resultId],
            );
      } else if (contextMatches && !terminal.has(t.status)) {
        await tx.query(
          "UPDATE goal_tasks SET status='blocked',blocker=$3,next_action='Review the Result and revise the plan',updated_at=now() WHERE goal_id=$1 AND id=$2",
          [
            goalId,
            taskId,
            result.reason ||
              "Result does not satisfy current verified criteria",
          ],
        );
      }
      await this.event(
        tx,
        goalId,
        complete ? "TASK_COMPLETED" : "RESULT_RECEIVED",
        complete
          ? "Verified task outcome complete"
          : "Result retained; task not completed",
        taskId,
        { resultId, workId, current, reason: result.reason },
      );
      return { completed: complete };
    });
  }
  async confirmOutcome(goalId: string, criterion: string, decisionRef: string) {
    this.owner();
    text.parse(decisionRef);
    return this.locked(goalId, async (tx, g) => {
      this.mutable(g);
      if (!g.success_criteria.includes(criterion))
        throw new Error("Unknown Goal criterion");
      await tx.query(
        `INSERT INTO goal_outcome_evidence(owner_id,goal_id,generation,criterion,reference,source)
        VALUES($1,$2,$3,$4,$5,'owner') ON CONFLICT DO NOTHING`,
        [this.ownerId, goalId, g.generation, criterion, decisionRef],
      );
      await this.event(
        tx,
        goalId,
        "OWNER_OUTCOME_CONFIRMED",
        "Owner confirmed Goal outcome",
        undefined,
        { criterion, decisionRef },
      );
    });
  }
  async completeGoal(goalId: string) {
    return this.locked(goalId, async (tx, g) => {
      if (g.status === "completed") return { completed: true };
      if (g.status !== "active") return { completed: false };
      const [row] = await tx.query(
        `SELECT NOT EXISTS(SELECT 1 FROM goal_tasks WHERE goal_id=$2 AND status NOT IN ('completed','cancelled'))
        AND NOT EXISTS(SELECT 1 FROM goal_work_links WHERE owner_id=$1 AND goal_id=$2 AND state IN ('prepared','linked'))
        AND jsonb_array_length($4::jsonb)>0 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text($4::jsonb) c
        WHERE NOT EXISTS(SELECT 1 FROM goal_outcome_evidence e WHERE e.owner_id=$1 AND e.goal_id=$2 AND e.generation=$3 AND e.criterion=c)) AS eligible`,
        [
          this.ownerId,
          goalId,
          g.generation,
          JSON.stringify(g.success_criteria),
        ],
      );
      if (!row.eligible) return { completed: false };
      await tx.query(
        "UPDATE goals SET status='completed',completed_at=now(),updated_at=now() WHERE owner_id=$1 AND id=$2",
        [this.ownerId, goalId],
      );
      await this.event(
        tx,
        goalId,
        "GOAL_COMPLETED",
        "Goal success criteria satisfied",
        undefined,
        { generation: g.generation, criteria: g.success_criteria },
      );
      return { completed: true };
    });
  }
  async needsYou(goalId: string): Promise<NeedsYouItem[]> {
    return (await this.attentionSnapshot(goalId)).items;
  }
  async attentionSnapshot(goalId: string) {
    return this.locked(goalId, async (tx, g) => {
      if (g.status !== "active")
        return {
          ownerId: this.ownerId,
          goalId,
          revision: Number(g.revision),
          items: [] as NeedsYouItem[],
        };
      const rows = await tx.query(
        `SELECT d.*,t.generation,t.title FROM goal_work_dependencies d JOIN goal_tasks t ON t.id=d.task_id
        WHERE d.owner_id=$1 AND d.goal_id=$2 AND d.kind='owner' AND d.resolved_at IS NULL AND NOT t.paused
        AND t.status NOT IN ('completed','cancelled') ORDER BY d.task_id,d.id LIMIT 100`,
        [this.ownerId, goalId],
      );
      const items: NeedsYouItem[] = rows.map((d) => ({
        id: `goal-task:${createHash("sha256")
          .update(
            JSON.stringify([
              this.ownerId,
              g.id,
              g.generation,
              d.task_id,
              d.generation,
              d.id,
            ]),
          )
          .digest("hex")}`,
        source: "goal-task" as const,
        ownerId: this.ownerId,
        goalId,
        taskId: d.task_id,
        goalGeneration: g.generation,
        taskGeneration: d.generation,
        dependencyId: d.id,
        title: d.label,
        options: d.options,
        reference: d.reference,
        revision: Number(g.revision),
        updatedAt: iso(g.updated_at),
      }));
      return {
        ownerId: this.ownerId,
        goalId,
        revision: Number(g.revision),
        items,
      };
    });
  }
  async tick(goalId: string, now = new Date()) {
    // Bounded, deterministic pass. No recursive task generation or model prompts.
    const contexts = await this.locked(goalId, async (tx, g) => {
      const tasks = await tx.query(
        `SELECT id,generation FROM goal_tasks WHERE goal_id=$1 AND status NOT IN ('completed','cancelled')
        ORDER BY CASE priority WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'normal' THEN 2 ELSE 1 END DESC,
        due_at NULLS LAST,created_at,id LIMIT 50`,
        [goalId],
      );
      return tasks.map((t) => ({
        ownerId: this.ownerId,
        goalId,
        taskId: t.id,
        goalGeneration: g.generation,
        taskGeneration: t.generation,
      }));
    });
    const outcomes = [];
    for (const context of contexts)
      outcomes.push(await this.continue(context, now));
    if (this.inbox)
      await this.inbox.reconcile(await this.attentionSnapshot(goalId));
    await this.completeGoal(goalId);
    return outcomes;
  }
  async receive(signal: DependencySignal, now = new Date()) {
    const resolution = await this.signal(signal);
    // A crash here is recovered by the ordinary bounded tick; resolved dependency is durable.
    await this.tick(signal.goalId, now);
    return resolution;
  }
  async receiveResult(
    goalId: string,
    taskId: string,
    workId: string,
    resultId: string,
    now = new Date(),
  ) {
    const result = await this.ingestResult(goalId, taskId, workId, resultId);
    await this.tick(goalId, now);
    return result;
  }
  async linkReminder(
    port: ReminderPort,
    input: {
      goalId: string;
      taskId?: string;
      workId?: string;
      reminderId: string;
    },
  ) {
    await this.locked(input.goalId, async (tx) => {
      if (input.taskId) await this.task(tx, input.goalId, input.taskId);
      if (input.workId) {
        const [work] = await tx.query(
          "SELECT 1 FROM goal_work_links WHERE owner_id=$1 AND goal_id=$2 AND work_id=$3",
          [this.ownerId, input.goalId, input.workId],
        );
        if (!work) throw new Error("Work not found");
      }
    });
    return port.ensure({
      ...input,
      ownerId: this.ownerId,
      key: JSON.stringify([
        this.ownerId,
        input.goalId,
        input.taskId ?? null,
        input.workId ?? null,
        input.reminderId,
      ]),
    });
  }
}
