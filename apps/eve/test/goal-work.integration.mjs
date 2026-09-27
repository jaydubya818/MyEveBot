import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { spawnSync } from "node:child_process";
import { goalAttentionEvent } from "../lib/goal-work/attention-adapter.ts";
import { Pool } from "pg";
import { GoalWorkService } from "../lib/goal-work/service.ts";
import { GoalWorkQueries } from "../lib/goal-work/projections.ts";
import { dispatchGoalPage } from "../lib/goal-work/dispatcher.ts";

// Deliberately cannot use DATABASE_URL or a hosted database.
const port = Number(process.env.GOAL_TEST_PORT ?? 55473);
const pool = new Pool({
  host: "127.0.0.1",
  port,
  user: "myeve_goals",
  database: "postgres",
  max: 16,
});
const schema = `goals_${randomUUID().replaceAll("-", "")}`;
const admin = await pool.connect();
await admin.query(`CREATE SCHEMA ${schema}`);
const connect = async () => {
  const c = await pool.connect();
  await c.query(`SET search_path TO ${schema}`);
  return c;
};
const database = {
  async query(s, p) {
    const c = await connect();
    try {
      return (await c.query(s, p)).rows;
    } finally {
      c.release();
    }
  },
  async transaction(body) {
    const c = await connect();
    await c.query("BEGIN");
    try {
      const out = await body({
        query: async (s, p) => (await c.query(s, p)).rows,
      });
      await c.query("COMMIT");
      return out;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  },
};
const tests = [];
const metrics = {
  duplicateConsequentialWork: 0,
  falseTaskCompletions: 0,
  falseGoalCompletions: 0,
  goalDerivedAuthorityGrants: 0,
  crossOwnerDisclosures: 0,
  necessaryOwnerDecisions: 0,
  avoidableCoordinationDebt: 0,
};
const check = async (name, fn) => {
  await fn();
  tests.push(name);
  console.log(`PASS ${name}`);
};
let crashAfterWork = false,
  denied = false;
const work = {
  async ensure(request) {
    assert.ok(
      ![
        "authority",
        "budget",
        "tools",
        "providerAccess",
        "writerAuthority",
      ].some((k) => k in request),
    );
    if (denied) return { denied: "Existing authority unavailable" };
    const c = await connect();
    try {
      await c.query(
        `INSERT INTO fixture_work(id,owner_id,key,request) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(owner_id,key) DO NOTHING`,
        [
          randomUUID(),
          request.ownerId,
          request.correlationKey,
          JSON.stringify(request),
        ],
      );
      const {
        rows: [row],
      } = await c.query(
        "SELECT * FROM fixture_work WHERE owner_id=$1 AND key=$2",
        [request.ownerId, request.correlationKey],
      );
      assert.deepEqual(row.request, request);
      if (crashAfterWork) {
        crashAfterWork = false;
        throw new Error("process lost after canonical Work commit");
      }
      return {
        id: row.id,
        ownerId: row.owner_id,
        correlationKey: row.key,
        state: row.state,
      };
    } finally {
      c.release();
    }
  },
  async find(owner, key) {
    const [r] = await database.query(
      "SELECT * FROM fixture_work WHERE owner_id=$1 AND key=$2",
      [owner, key],
    );
    return r
      ? { id: r.id, ownerId: r.owner_id, correlationKey: r.key, state: r.state }
      : null;
  },
  async result(owner, workId, resultId) {
    const [r] = await database.query(
      "SELECT result FROM fixture_work WHERE owner_id=$1 AND id=$2",
      [owner, workId],
    );
    if (!r?.result || r.result.id !== resultId)
      throw new Error("Authoritative Result not found");
    return r.result;
  },
};
const signalPort = {
  async verify(s) {
    return s.evidenceRef === `verified:${s.reference}`;
  },
};
const inbox = {
  async reconcile({ ownerId: owner, goalId: goal, revision, items }) {
    await database.query(
      `INSERT INTO fixture_inbox(owner_id,goal_id,revision,items) VALUES($1,$2,$4,$3::jsonb)
  ON CONFLICT(owner_id,goal_id) DO UPDATE SET items=excluded.items,revision=excluded.revision WHERE fixture_inbox.revision<excluded.revision`,
      [owner, goal, JSON.stringify(items), revision],
    );
  },
};
const service = (owner = "alice", actor = "owner") =>
  new GoalWorkService(owner, actor, database, work, signalPort, inbox);
const goal = async (id, criteria = ["Beta launched"]) =>
  service().create({
    id,
    objective: "Launch the design-partner beta",
    criteria,
  });
const task = async (g, id, deps = [], criteria = ["Verified outcome"]) =>
  service().addTask(g, {
    id,
    objective: id,
    criteria,
    dependencies: deps,
    provenance: { kind: "owner", reference: "owner-request" },
  });
const ctx = async (g, t) => service().context(g, t);
const detail = async (g) => new GoalWorkQueries("alice", database).goal(g);
const makeResult = async (workId, overrides = {}) => {
  const [row] = await database.query("SELECT * FROM fixture_work WHERE id=$1", [
    workId,
  ]);
  const result = {
    id: randomUUID(),
    ownerId: row.owner_id,
    workId,
    correlationKey: row.key,
    outcome: "SUCCEEDED",
    current: true,
    verified: true,
    satisfiedCriteria: row.request.criteria,
    evidence: ["verified-output:artifact"],
    reason: "Verified",
    ...overrides,
  };
  await database.query(
    "UPDATE fixture_work SET result=$2::jsonb,state='completed' WHERE id=$1",
    [workId, JSON.stringify(result)],
  );
  return result;
};
const signal = async (g, t, id, kind, reference, extra = {}) => ({
  ...(await ctx(g, t)),
  eventId: randomUUID(),
  dependencyId: id,
  kind,
  reference,
  evidenceRef: `verified:${reference}`,
  ...extra,
});
try {
  await admin.query(`SET search_path TO ${schema}`);
  // Only prerequisite columns needed by the existing 0003 migration.
  await admin.query(
    "CREATE TABLE task_runs(id text PRIMARY KEY,owner_id text,updated_at timestamptz DEFAULT now())",
  );
  await admin.query(
    await readFile(
      new URL("../migrations/0003_goal_operating_system.sql", import.meta.url),
      "utf8",
    ),
  );
  await admin.query(
    await readFile(
      new URL("./fixtures/goal-work/schema.sql", import.meta.url),
      "utf8",
    ),
  );
  await admin.query(`CREATE TABLE fixture_work(id text PRIMARY KEY,owner_id text,key text,request jsonb,result jsonb,state text DEFAULT 'active',UNIQUE(owner_id,key));
    CREATE TABLE fixture_inbox(owner_id text,goal_id text,revision integer,items jsonb,PRIMARY KEY(owner_id,goal_id)); CREATE TABLE fixture_reminder_links(owner_id text,key text,input jsonb,PRIMARY KEY(owner_id,key))`);

  await check(
    "Golden journey: durable Goal → Plan → A → external reply → B → owner decision → C → Goal complete",
    async () => {
      await goal("golden");
      await service().plan(
        "golden",
        "Prepare, invite, launch",
        "Three bounded outcomes",
      );
      await task("golden", "A");
      await task("golden", "B", [
        { id: "A", kind: "task", reference: "A", label: "Prepare beta" },
        {
          id: "reply",
          kind: "external",
          reference: "thread:partner",
          label: "Partner reply",
        },
      ]);
      await task("golden", "C", [
        { id: "B", kind: "task", reference: "B", label: "Partner ready" },
        {
          id: "decision",
          kind: "owner",
          reference: "launch-decision",
          label: "Choose launch cohort",
          options: ["A", "B"],
        },
      ]);
      const first = await service().tick("golden");
      const a = first.find((x) => x.workId).workId;
      const ar = await makeResult(a);
      await service().receiveResult("golden", "A", a, ar.id);
      assert.equal(
        (await detail("golden")).tasks
          .find((t) => t.id === "B")
          .waiting.includes("WAITING FOR EXTERNAL"),
        true,
      );
      // Reconstruct the service, as after process/session restart. No chat history.
      const reply = await signal(
        "golden",
        "B",
        "reply",
        "external",
        "thread:partner",
      );
      await service().receive(reply);
      await service().receive(reply);
      const b = (await detail("golden")).tasks.find(
        (t) => t.id === "B",
      ).currentWork;
      const [bContext] = await database.query(
        "SELECT request FROM fixture_work WHERE id=$1",
        [b],
      );
      assert.equal(
        bContext.request.dependencies.find((d) => d.reference === "A")
          .evidenceRef,
        ar.id,
      );
      const br = await makeResult(b);
      await service().receiveResult("golden", "B", b, br.id);
      const items = await service().needsYou("golden");
      assert.equal(items.length, 1);
      const decision = await signal(
        "golden",
        "C",
        "decision",
        "owner",
        "launch-decision",
        { option: "B" },
      );
      await service().receive(decision);
      metrics.necessaryOwnerDecisions++;
      const c = (await detail("golden")).tasks.find(
        (t) => t.id === "C",
      ).currentWork;
      const cr = await makeResult(c, {
        satisfiedGoalCriteria: ["Beta launched"],
      });
      await service().receiveResult("golden", "C", c, cr.id);
      const final = await detail("golden");
      assert.equal(final.status, "completed");
      assert.equal(final.progress.completedTasks, 3);
      assert.equal(final.progress.completedOutcomes, 1);
      assert.equal(final.needsYou.length, 0);
      const [counts] = await database.query(
        "SELECT count(*)::int n FROM fixture_work WHERE request->>'goalId'=$1",
        ["golden"],
      );
      assert.equal(counts.n, 3);
      const [decisions] = await database.query(
        "SELECT request->'decisions' AS d FROM fixture_work WHERE id=$1",
        [c],
      );
      assert.equal(
        decisions.d.find((d) => d.option === "B").reference,
        "verified:launch-decision",
      );
    },
  );
  await check(
    "Concurrent duplicate eligibility and process loss after Work creation reuse exactly one durable Work",
    async () => {
      await goal("crash");
      await task("crash", "crash-task");
      const context = await ctx("crash", "crash-task");
      crashAfterWork = true;
      await assert.rejects(
        async () => service().continue(context),
        /process lost/,
      );
      const outcomes = await Promise.all(
        Array.from({ length: 12 }, () => service().continue(context)),
      );
      assert.equal(new Set(outcomes.map((o) => o.workId)).size, 1);
      const [row] = await database.query(
        "SELECT count(*)::int n FROM fixture_work WHERE request->>'taskId'=$1",
        ["crash-task"],
      );
      assert.equal(row.n, 1);
      assert.equal(
        (await service().continue(context)).workId,
        outcomes[0].workId,
      );
    },
  );
  await check(
    "Duplicate authenticated events concurrently clear one dependency and create one Work",
    async () => {
      await goal("events");
      await task("events", "event-task", [
        {
          id: "file",
          kind: "file",
          reference: "requirement:tax-2026",
          label: "Tax document",
        },
      ]);
      const event = await signal(
        "events",
        "event-task",
        "file",
        "file",
        "requirement:tax-2026",
      );
      await assert.rejects(
        async () =>
          service().receive({
            ...event,
            reference: "unrelated",
            evidenceRef: "verified:unrelated",
          }),
        /Unrelated/,
      );
      await assert.rejects(
        async () =>
          service().receive({ ...event, evidenceRef: "model says done" }),
        /Untrusted/,
      );
      await Promise.all(
        Array.from({ length: 8 }, () => service().receive(event)),
      );
      const [r] = await database.query(
        "SELECT count(*)::int n FROM eve_events WHERE goal_id='events' AND type='DEPENDENCY_CLEARED'",
      );
      assert.equal(r.n, 1);
      const [w] = await database.query(
        "SELECT count(*)::int n FROM fixture_work WHERE request->>'goalId'='events'",
      );
      assert.equal(w.n, 1);
      await assert.rejects(
        async () => service().receive({ ...event, option: "changed" }),
        /identity conflict/,
      );
    },
  );
  await check(
    "Stale generations, Goal pause, delayed event, restart and resume preserve current truth",
    async () => {
      await goal("negative");
      await task("negative", "negative-task", [
        {
          id: "reply",
          kind: "external",
          reference: "reply",
          label: "Waiting reply",
        },
      ]);
      const old = await ctx("negative", "negative-task");
      await service().reviseTask("negative", "negative-task", {
        id: "negative-task",
        objective: "Revised task",
        criteria: ["New verified outcome"],
        dependencies: [
          {
            id: "reply",
            kind: "external",
            reference: "reply",
            label: "Waiting reply",
          },
        ],
        provenance: { kind: "owner", reference: "revision" },
      });
      assert.equal(
        (await service().continue(old)).blocked,
        "Stale continuation",
      );
      await assert.rejects(
        async () =>
          service().receive({
            ...(await signal(
              "negative",
              "negative-task",
              "reply",
              "external",
              "reply",
            )),
            taskGeneration: old.taskGeneration,
          }),
        /Stale/,
      );
      await service().controlGoal("negative", "pause", "Owner pause");
      const event = await signal(
        "negative",
        "negative-task",
        "reply",
        "external",
        "reply",
      );
      await service().receive(event);
      assert.equal((await detail("negative")).tasks[0].currentWork, null);
      await service().controlGoal("negative", "resume", "Owner resume");
      await service().tick("negative");
      assert.ok((await detail("negative")).tasks[0].currentWork);
    },
  );
  await check(
    "Schedule cannot bypass other dependencies or authority",
    async () => {
      await goal("schedule");
      await task("schedule", "scheduled-task", [
        {
          id: "time",
          kind: "schedule",
          reference: "schedule-1",
          label: "Launch window",
          notBefore: "2030-01-01T00:00:00.000Z",
        },
        {
          id: "provider",
          kind: "capability",
          reference: "provider-ready",
          label: "Provider available",
        },
      ]);
      await service().tick("schedule", new Date("2029-12-31"));
      assert.equal((await detail("schedule")).tasks[0].currentWork, null);
      await service().signal(
        await signal(
          "schedule",
          "scheduled-task",
          "provider",
          "capability",
          "provider-ready",
        ),
      );
      await service().tick("schedule", new Date("2029-12-31"));
      assert.equal((await detail("schedule")).tasks[0].currentWork, null);
      denied = true;
      await service().tick("schedule", new Date("2030-01-01"));
      assert.equal((await detail("schedule")).tasks[0].currentWork, null);
      denied = false;
      await service().tick("schedule", new Date("2030-01-01"));
      assert.ok((await detail("schedule")).tasks[0].currentWork);
    },
  );
  await check(
    "FAILED, PARTIAL, unverified, stale and incomplete criteria Results never complete tasks",
    async () => {
      for (const [name, patch] of Object.entries({
        failed: { outcome: "FAILED" },
        partial: { outcome: "PARTIAL" },
        unverified: { verified: false },
        stale: { current: false },
        criteria: { satisfiedCriteria: [] },
        noEvidence: { evidence: [] },
      })) {
        const g = `result-${name}`,
          t = `task-${name}`;
        await goal(g);
        await task(g, t);
        const w = await service().continue(await ctx(g, t));
        const r = await makeResult(w.workId, patch);
        assert.equal(
          (await service().ingestResult(g, t, w.workId, r.id)).completed,
          false,
        );
        assert.notEqual((await detail(g)).tasks[0].status, "completed");
        assert.equal((await service().completeGoal(g)).completed, false);
      }
    },
  );
  await check(
    "Goal completion requires outcome evidence, preserves history on reopen and archive never resumes",
    async () => {
      await goal("outcome");
      await task("outcome", "outcome-task");
      const w = await service().continue(await ctx("outcome", "outcome-task"));
      const r = await makeResult(w.workId);
      await service().receiveResult("outcome", "outcome-task", w.workId, r.id);
      assert.equal((await detail("outcome")).status, "active");
      await assert.rejects(
        async () =>
          new GoalWorkService(
            "alice",
            "agent",
            database,
            work,
            signalPort,
          ).confirmOutcome("outcome", "Beta launched", "claim"),
        /Owner/,
      );
      await service().confirmOutcome(
        "outcome",
        "Beta launched",
        "owner-decision:accepted",
      );
      await service().completeGoal("outcome");
      await service().controlGoal("outcome", "reopen", "Evidence invalidated");
      assert.equal((await service().completeGoal("outcome")).completed, false);
      assert.ok(
        (await detail("outcome")).history.some(
          (e) => e.type === "GOAL_COMPLETED",
        ),
      );
      await service().controlGoal(
        "outcome",
        "archive",
        "Keep historical record",
      );
      await service().tick("outcome");
      assert.equal((await detail("outcome")).status, "archived");
      await assert.rejects(
        async () => service().controlGoal("outcome", "resume", "Invalid"),
        /Invalid/,
      );
    },
  );
  await check(
    "Owner isolation on queries, continuation, signals and result linkage",
    async () => {
      await assert.rejects(
        async () => new GoalWorkQueries("bob", database).goal("golden"),
        /not found/,
      );
      await assert.rejects(
        async () => service("bob").context("golden", "A"),
        /not found/,
      );
      await assert.rejects(
        async () => service("bob").continue(await ctx("crash", "crash-task")),
        /not found/,
      );
      assert.equal(
        (await new GoalWorkQueries("bob", database).today()).goals.length,
        0,
      );
      await assert.rejects(
        async () =>
          service("bob").signal(
            await signal(
              "events",
              "event-task",
              "file",
              "file",
              "requirement:tax-2026",
            ),
          ),
        /Untrusted/,
      );
      const w = (await detail("crash")).tasks[0].currentWork;
      await assert.rejects(
        async () =>
          service("bob").ingestResult("crash", "crash-task", w, "fake"),
        /not found/,
      );
    },
  );
  await check(
    "Task cancellation wins against later Result; paused Task survives restart",
    async () => {
      await goal("cancel");
      await task("cancel", "cancel-task");
      await service().controlTask(
        "cancel",
        "cancel-task",
        "pause",
        "Owner pause",
      );
      await service().tick("cancel");
      assert.equal((await detail("cancel")).tasks[0].currentWork, null);
      await service().controlTask(
        "cancel",
        "cancel-task",
        "resume",
        "Owner resume",
      );
      const w = await service().continue(await ctx("cancel", "cancel-task"));
      await service().controlTask(
        "cancel",
        "cancel-task",
        "cancel",
        "Scope removed",
      );
      const r = await makeResult(w.workId);
      await service().receiveResult("cancel", "cancel-task", w.workId, r.id);
      assert.equal((await detail("cancel")).tasks[0].status, "cancelled");
      assert.ok(
        (await detail("cancel")).history.some((e) => e.type === "TASK_CANCEL"),
      );
    },
  );
  await check(
    "Material revision fences active Work and old Result cannot finish revised task",
    async () => {
      await goal("revision");
      await task("revision", "revision-task");
      const old = await ctx("revision", "revision-task");
      const w = await service().continue(old);
      await service().reviseGoal("revision", {
        id: "revision",
        objective: "Launch a different beta",
        criteria: ["New outcome"],
      });
      assert.equal(
        (await service().continue(old)).blocked,
        "Stale continuation",
      );
      assert.match(
        (await service().continue(await ctx("revision", "revision-task")))
          .blocked,
        /reconciliation/,
      );
      const r = await makeResult(w.workId);
      assert.equal(
        (
          await service().ingestResult(
            "revision",
            "revision-task",
            w.workId,
            r.id,
          )
        ).completed,
        false,
      );
      const next = await service().continue(
        await ctx("revision", "revision-task"),
      );
      assert.notEqual(next.workId, w.workId);
      const [row] = await database.query(
        "SELECT request FROM fixture_work WHERE id=$1",
        [next.workId],
      );
      assert.equal(row.request.goalObjective, "Launch a different beta");
    },
  );
  await check(
    "Plan evolution records history, bounds follow-ups, rejects cycles and oversized plans",
    async () => {
      await goal("plan");
      await service().plan("plan", "A B C", "Initial evidence");
      await task("plan", "plan-A");
      const w = await service().continue(await ctx("plan", "plan-A"));
      const r = await makeResult(w.workId);
      await service().ingestResult("plan", "plan-A", w.workId, r.id);
      await service().plan("plan", "A D C", "Result A makes B unnecessary");
      await service("alice", "agent").addTask("plan", {
        id: "plan-D",
        objective: "Required D",
        criteria: ["D"],
        provenance: { kind: "result", reference: r.id, depth: 1 },
      });
      await assert.rejects(
        async () =>
          service("alice", "agent").addTask("plan", {
            id: "bad-depth",
            objective: "Runaway",
            criteria: ["D"],
            provenance: { kind: "result", reference: r.id, depth: 4 },
          }),
        /Bounded/,
      );
      await task("plan", "cycle-A");
      await task("plan", "cycle-B", [
        { id: "a", kind: "task", reference: "cycle-A", label: "A" },
      ]);
      await assert.rejects(
        async () =>
          service().reviseTask("plan", "cycle-A", {
            id: "cycle-A",
            objective: "A",
            criteria: ["a"],
            dependencies: [
              { id: "b", kind: "task", reference: "cycle-B", label: "B" },
            ],
            provenance: { kind: "owner", reference: "edit" },
          }),
        /cycle/,
      );
      assert.equal((await detail("plan")).planHistory.length, 2);
      await goal("large");
      for (let n = 0; n < 50; n++) await task("large", `large-${n}`);
      await assert.rejects(async () => task("large", "large-51"), /Plan limit/);
      assert.equal((await detail("large")).tasks.length, 50);
    },
  );
  await check(
    "Database fences reject narrative task/Goal completion and deletion of retained Work",
    async () => {
      await assert.rejects(
        async () =>
          database.query(
            "UPDATE goal_tasks SET status='completed' WHERE id='large-1'",
          ),
        /Result required/,
      );
      await assert.rejects(
        async () =>
          database.query(
            "UPDATE goals SET status='completed' WHERE id='large'",
          ),
        /evidence required/,
      );
      await assert.rejects(
        async () =>
          database.query("DELETE FROM goal_tasks WHERE id='crash-task'"),
        /history must be retained/,
      );
    },
  );
  await check(
    "Concurrent completion vs cancellation and Goal completion vs new task remain serializable",
    async () => {
      for (let n = 0; n < 6; n++) {
        const g = `race-${n}`,
          t = `race-task-${n}`;
        await goal(g);
        await task(g, t);
        const w = await service().continue(await ctx(g, t));
        const r = await makeResult(w.workId, {
          satisfiedGoalCriteria: ["Beta launched"],
        });
        const out = await Promise.allSettled([
          service().ingestResult(g, t, w.workId, r.id),
          service().controlTask(g, t, "cancel", "Owner cancel"),
        ]);
        assert.ok(out.some((x) => x.status === "fulfilled"));
        const d = await detail(g);
        assert.ok(["cancelled", "completed"].includes(d.tasks[0].status));
        if (d.tasks[0].status === "cancelled")
          await service().confirmOutcome(g, "Beta launched", "owner:outcome");
        await Promise.allSettled([
          service().completeGoal(g),
          task(g, `late-${n}`),
        ]);
        const final = await detail(g);
        if (final.status === "completed")
          assert.ok(
            final.tasks.every((t) =>
              ["completed", "cancelled"].includes(t.status),
            ),
          );
      }
    },
  );
  await check(
    "Pause between durable eligibility and dispatch prevents Work; concurrent schedule and manual continuation deduplicate",
    async () => {
      await goal("pause-window");
      await task("pause-window", "pause-window-task");
      const context = await ctx("pause-window", "pause-window-task");
      let first = true;
      const intercepted = {
        ...database,
        async transaction(body) {
          const out = await database.transaction(body);
          if (first) {
            first = false;
            await service().controlGoal(
              "pause-window",
              "pause",
              "Pause wins before dispatch",
            );
          }
          return out;
        },
      };
      const worker = new GoalWorkService(
        "alice",
        "owner",
        intercepted,
        work,
        signalPort,
      );
      assert.equal((await worker.continue(context)).blocked, "Goal paused");
      const [count] = await database.query(
        "SELECT count(*)::int n FROM fixture_work WHERE request->>'taskId'='pause-window-task'",
      );
      assert.equal(count.n, 0);
      await service().controlGoal("pause-window", "resume", "Resume");
      const [manual] = await Promise.all([
        service().continue(context),
        service().tick("pause-window"),
      ]);
      assert.ok(manual.workId);
      const [once] = await database.query(
        "SELECT count(*)::int n FROM fixture_work WHERE request->>'taskId'='pause-window-task'",
      );
      assert.equal(once.n, 1);
    },
  );
  await check(
    "SIGKILL at seven durable checkpoints preserves progress and correlation",
    async () => {
      const killAt = (point, g, t = "", extra = "") => {
        const child = spawnSync(
          process.execPath,
          [
            "--import",
            "tsx",
            new URL("./fixtures/goal-work/crash-worker.mjs", import.meta.url)
              .pathname,
            schema,
            point,
            g,
            t,
            extra,
          ],
          { encoding: "utf8" },
        );
        assert.equal(child.signal, "SIGKILL", child.stderr);
        assert.equal(child.status, null);
      };
      killAt("goalCreation", "killed-goal");
      assert.equal((await detail("killed-goal")).status, "active");
      killAt("taskCreation", "killed-goal", "killed-task");
      assert.equal((await detail("killed-goal")).tasks.length, 1);
      killAt("eligibility", "killed-goal", "killed-task");
      const [prepared] = await database.query(
        "SELECT * FROM goal_work_links WHERE task_id='killed-task'",
      );
      assert.equal(prepared.state, "prepared");
      killAt("workCreation", "killed-goal", "killed-task");
      await service().tick("killed-goal");
      const w = (await detail("killed-goal")).tasks[0].currentWork;
      assert.ok(w);
      const [count] = await database.query(
        "SELECT count(*)::int n FROM fixture_work WHERE request->>'taskId'='killed-task'",
      );
      assert.equal(count.n, 1);
      const r = await makeResult(w, { satisfiedGoalCriteria: ["Outcome"] });
      killAt(
        "result",
        "killed-goal",
        "killed-task",
        JSON.stringify({ workId: w, resultId: r.id }),
      );
      assert.equal((await detail("killed-goal")).tasks[0].status, "completed");
      killAt("goalCompletion", "killed-goal");
      assert.equal((await detail("killed-goal")).status, "completed");
      await goal("killed-dependency");
      await task("killed-dependency", "killed-reply", [
        {
          id: "reply",
          kind: "external",
          reference: "thread:kill",
          label: "Reply",
        },
      ]);
      const event = await signal(
        "killed-dependency",
        "killed-reply",
        "reply",
        "external",
        "thread:kill",
      );
      killAt(
        "dependencyClear",
        "killed-dependency",
        "killed-reply",
        JSON.stringify(event),
      );
      await service().tick("killed-dependency");
      assert.ok((await detail("killed-dependency")).tasks[0].currentWork);
      await service().receive(event);
      const [once] = await database.query(
        "SELECT count(*)::int n FROM fixture_work WHERE request->>'taskId'='killed-reply'",
      );
      assert.equal(once.n, 1);
    },
  );
  await check(
    "Ambiguous stale intent is fenced until canonical reconciliation; stale Inbox snapshot cannot reopen decision",
    async () => {
      await goal("ambiguous");
      await task("ambiguous", "ambiguous-task");
      crashAfterWork = true;
      await assert.rejects(
        async () =>
          service().continue(await ctx("ambiguous", "ambiguous-task")),
        /process lost/,
      );
      await service().reviseGoal("ambiguous", {
        id: "ambiguous",
        objective: "Changed objective",
        criteria: ["Beta launched"],
      });
      assert.match(
        (await service().continue(await ctx("ambiguous", "ambiguous-task")))
          .blocked,
        /reconciliation/,
      );
      await service().reconcileWork("ambiguous", "ambiguous-task");
      const old = (await detail("ambiguous")).tasks[0].currentWork;
      assert.ok(old);
      await database.query(
        "UPDATE fixture_work SET state='cancelled' WHERE id=$1",
        [old],
      );
      await service().reconcileWork("ambiguous", "ambiguous-task");
      const next = await service().continue(
        await ctx("ambiguous", "ambiguous-task"),
      );
      assert.ok(next.workId);
      assert.notEqual(next.workId, old);
      await goal("attention");
      await task("attention", "attention-task", [
        {
          id: "choice",
          kind: "owner",
          reference: "choice",
          label: "Choose",
          options: ["A", "B"],
        },
      ]);
      const before = await service().attentionSnapshot("attention");
      await inbox.reconcile(before);
      const event = goalAttentionEvent(before.items[0]);
      assert.equal(event.action.involvement, "NECESSARY_JUDGMENT");
      assert.equal(event.action.kind, "decision");
      await service().receive(
        await signal(
          "attention",
          "attention-task",
          "choice",
          "owner",
          "choice",
          { option: "B" },
        ),
      );
      await inbox.reconcile(before);
      const [row] = await database.query(
        "SELECT items FROM fixture_inbox WHERE goal_id='attention'",
      );
      assert.deepEqual(row.items, []);
    },
  );
  await check(
    "Creation/plan replay is immutable, completed-task revisions reopen, and audit uses existing redaction",
    async () => {
      const input = {
        id: "identity",
        objective: "Identity goal",
        criteria: ["Outcome"],
      };
      await service().create(input);
      await assert.rejects(
        () => service().create({ ...input, priority: "critical" }),
        /identity conflict/,
      );
      await service().reviseGoal("identity", {
        ...input,
        objective: "Revised identity goal",
      });
      assert.equal(
        (await service().create(input)).title,
        "Revised identity goal",
      );
      const p = await service().plan(
        "identity",
        "One step",
        "Owner plan",
        undefined,
        "durable-plan-command",
      );
      assert.deepEqual(
        await service().plan(
          "identity",
          "One step",
          "Owner plan",
          undefined,
          "durable-plan-command",
        ),
        p,
      );
      await assert.rejects(
        () =>
          service().plan(
            "identity",
            "Changed step",
            "Owner plan",
            undefined,
            "durable-plan-command",
          ),
        /identity conflict/,
      );
      await task("identity", "identity-task");
      await assert.rejects(
        () =>
          service().addTask("identity", {
            id: "identity-task",
            objective: "identity-task",
            criteria: ["Verified outcome"],
            dependencies: [
              {
                id: "different",
                kind: "external",
                reference: "reply",
                label: "Reply",
              },
            ],
            provenance: { kind: "owner", reference: "owner-request" },
          }),
        /identity conflict/,
      );
      const w = await service().continue(
        await ctx("identity", "identity-task"),
      );
      const r = await makeResult(w.workId);
      await service().ingestResult("identity", "identity-task", w.workId, r.id);
      await database.query(
        "UPDATE goal_tasks SET title='Corrected scope' WHERE id='identity-task'",
      );
      assert.equal((await detail("identity")).tasks[0].status, "todo");
      await service().controlGoal("identity", "pause", "password=secret-value");
      const [e] = await database.query(
        "SELECT summary FROM eve_events WHERE goal_id='identity' AND type='GOAL_PAUSE'",
      );
      assert.doesNotMatch(e.summary, /secret-value/);
    },
  );
  await check(
    "Existing reminder references deduplicate without creating another scheduler or cross-owner links",
    async () => {
      const port = {
        async ensure(input) {
          assert.equal(input.ownerId, "alice");
          await database.query(
            "INSERT INTO fixture_reminder_links(owner_id,key,input) VALUES($1,$2,$3::jsonb) ON CONFLICT DO NOTHING",
            [input.ownerId, input.key, JSON.stringify(input)],
          );
        },
      };
      const input = {
        goalId: "crash",
        taskId: "crash-task",
        reminderId: "existing-recurring-reminder",
      };
      await service().linkReminder(port, input);
      await service().linkReminder(port, input);
      await service().linkReminder(port, {
        ...input,
        reminderId: "existing-one-time-reminder",
      });
      const [count] = await database.query(
        "SELECT count(*)::int n FROM fixture_reminder_links",
      );
      assert.equal(count.n, 2);
      await assert.rejects(
        () => service("bob").linkReminder(port, input),
        /not found/,
      );
      await assert.rejects(
        () =>
          service().linkReminder(port, { ...input, workId: "unrelated-work" }),
        /not found/,
      );
    },
  );
  await check(
    "Queries are bounded, briefs replay with a fixed watermark, dispatcher exposes fair Goal pagination",
    async () => {
      const q = new GoalWorkQueries("alice", database);
      const today = await q.today("", 2);
      assert.equal(today.goals.length, 2);
      assert.ok(today.nextCursor);
      const other = await q.today(today.nextCursor, 2);
      assert.ok(
        other.goals.every((g) => !today.goals.some((x) => x.id === g.id)),
      );
      const brief = await q.brief("2020-01-01T00:00:00.000Z");
      assert.ok(brief.completed.length);
      assert.equal(brief.contractVersion, 1);
      if (brief.nextCursor) {
        const next = await q.brief(brief.since, brief.until, brief.nextCursor);
        assert.ok(
          next.changes.every((e) => !brief.changes.some((c) => c.id === e.id)),
        );
      }
      denied = true;
      const page = await dispatchGoalPage(service());
      denied = false;
      assert.equal(page.outcomes.length, 10);
      assert.ok(page.nextCursor);
      const timings = {};
      for (const [name, fn] of Object.entries({
        today: () => q.today(),
        goalDetail: () => q.goal("large"),
        taskDetail: () => q.task("large", "large-1"),
        dailyBrief: () => q.brief("2020-01-01T00:00:00.000Z"),
      })) {
        if (name === "dependencyEvaluation") continue;
        const start = performance.now();
        await fn();
        timings[name] = Number((performance.now() - start).toFixed(2));
      }
      const c = await ctx("negative", "negative-task");
      const start = performance.now();
      await service().continue(c);
      timings.dependencyEvaluation = Number(
        (performance.now() - start).toFixed(2),
      );
      console.log("PERFORMANCE_MS", JSON.stringify(timings));
    },
  );
  const [duplicates] = await database.query(
    "SELECT count(*)::int n FROM (SELECT owner_id,key FROM fixture_work GROUP BY owner_id,key HAVING count(*)>1) d",
  );
  metrics.duplicateConsequentialWork = duplicates.n;
  console.log(
    "QUALIFICATION",
    JSON.stringify({
      tests: tests.length,
      metrics,
      boundary:
        "PostgreSQL + durable local Work/Inbox fixtures; no production adapters",
    }),
  );
} finally {
  await admin.query("SET search_path TO public");
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  admin.release();
  await pool.end();
}
