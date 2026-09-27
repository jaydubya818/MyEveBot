import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  composeToday,
  composeBrief,
  betaGoal,
} from "../lib/goal-work/product-adapter.ts";
import { goalFollowUp } from "../lib/goal-work/inbox-adapter.ts";
import {
  goalMemoryRequest,
  goalLearningReferences,
} from "../lib/goal-work/context-adapter.ts";
/** Future integration harness implements the same local, seeded dependencies.
 * Never run a proof-producing fixture against live provider/production Work. */
export async function runGoalWorkAcceptance(h) {
  const passed = [],
    artifacts = {};
  const check = async (name, fn) => {
    await fn();
    passed.push(name);
    console.log(`PASS ${name}`);
  };
  const start = new Date(Date.now() - 1000).toISOString();
  const create = async (id, criteria = ["Outcome"], confirmation = false) => {
    const response = await h.call({
      operation: "create",
      goal: {
        id,
        objective:
          {
            "00-golden": "Launch the design-partner beta",
            "01-today": "Prepare the next partner cohort",
            "02-blocked": "Resolve the partner import failure",
          }[id] ?? id,
        criteria,
        ...(confirmation ? { requireOwnerConfirmation: true } : {}),
      },
    });
    assert.equal(response.status, 201, await response.clone().text());
    return (await response.json()).goal;
  };
  const plan = async (g, summary = "Prepare a bounded plan") =>
    h.service().plan(g, summary, "Goal-authorized initial plan");
  const task = (g, p, id, dependencies = [], criteria = ["Verified outcome"]) =>
    h.service().addTask(g, {
      id,
      objective:
        {
          "A-prepare": "Prepare the beta workspace",
          "B-invite": "Confirm partner access",
          "C-launch": "Launch the selected cohort",
          "Ready-next": "Draft the next invitation",
          "Scheduled-later": "Review tomorrow’s responses",
          "Needs-repair": "Review the failed partner import",
        }[id] ?? id,
      criteria,
      dependencies,
      provenance: { kind: "plan", reference: p.id },
    });
  const detail = (g) => h.queries().goal(g);
  const taskWork = async (g, t) =>
    (await detail(g)).tasks.find((x) => x.id === t)?.currentWork;
  const result = async (g, t, patch = {}, receiptPatch = {}) => {
    const workId = await taskWork(g, t),
      r = await h.produce(workId, patch, receiptPatch);
    return h.service().receiveResult(g, t, workId, r.id);
  };
  await check(
    "Authenticated API enforces signed sessions, CSRF, owner isolation, input bounds and optimistic revisions",
    async () => {
      const denied = await h.api(
        new Request("http://goal.fixture/api/goal-work"),
      );
      assert.equal(denied.status, 401);
      const g = await create("api");
      assert.equal(
        (
          await h.call({
            operation: "create",
            ownerId: "bob",
            goal: { id: "bad", objective: "Bad", criteria: ["No"] },
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await h.call(
            {
              operation: "control",
              goalId: g.id,
              action: "pause",
              reason: "Pause",
              expectedRevision: g.revision,
            },
            "alice",
            "POST",
            undefined,
            { origin: "http://attacker.test" },
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await h.call(
            null,
            "bob",
            "GET",
            "http://goal.fixture/api/goal-work?goalId=api",
          )
        ).status,
        404,
      );
      assert.equal(
        (
          await h.call({
            operation: "create",
            goal: {
              id: "large-api",
              objective: "x".repeat(40000),
              criteria: ["No"],
            },
          })
        ).status,
        413,
      );
      const changed = await h.call({
        operation: "change",
        goal: {
          id: "api",
          objective: "Updated outcome",
          criteria: ["Outcome"],
        },
        expectedRevision: g.revision,
      });
      assert.equal(changed.status, 200);
      assert.equal(
        (
          await h.call({
            operation: "control",
            goalId: "api",
            action: "pause",
            reason: "Stale",
            expectedRevision: g.revision,
          })
        ).status,
        409,
      );
      const r = await h.call(
        null,
        "alice",
        "GET",
        "http://goal.fixture/api/goal-work?goalId=api",
      );
      assert.equal(r.headers.get("cache-control"), "no-store");
    },
  );
  await check(
    "Canonical Work/Result and actual Inbox multi-session golden journey needs only initial instruction and one choice",
    async () => {
      await create("00-golden", ["Beta launched"]);
      const p = await plan("00-golden");
      await task("00-golden", p, "A-prepare", [], ["Beta prepared"]);
      await task(
        "00-golden",
        p,
        "B-invite",
        [
          {
            id: "prepare",
            kind: "task",
            reference: "A-prepare",
            label: "Prepare beta",
          },
          {
            id: "reply",
            kind: "external",
            reference: "thread:partner",
            label: "Waiting for partner reply",
          },
        ],
        ["Partner confirmed"],
      );
      await task(
        "00-golden",
        p,
        "C-launch",
        [
          {
            id: "invite",
            kind: "task",
            reference: "B-invite",
            label: "Confirm partner",
          },
          {
            id: "choice",
            kind: "owner",
            reference: "launch-cohort",
            label: "Choose the launch cohort",
            options: ["A", "B"],
          },
        ],
        ["Beta launched"],
      );
      await h.service().tick("00-golden");
      const first = await taskWork("00-golden", "A-prepare");
      assert.ok(first);
      const request = await h.service().context("00-golden", "A-prepare");
      const duplicate = await Promise.all(
        Array.from({ length: 8 }, () => h.service().continue(request)),
      );
      assert.ok(duplicate.every((x) => x.workId === first));
      const a = await h.produce(first);
      await h.service().receiveResult("00-golden", "A-prepare", first, a.id);
      await h.restart(); // Session B starts with PostgreSQL and the canonical Inbox's durable fixture only.
      assert.equal(await taskWork("00-golden", "B-invite"), null);
      const reply = await h.registerEvent(
        "00-golden",
        "B-invite",
        "reply",
        "external",
        "thread:partner",
      );
      await h.events.deliver(reply);
      await h.events.deliver(reply);
      const b = await taskWork("00-golden", "B-invite");
      assert.ok(b);
      const [retained] = await h.raw.query(
        "SELECT intent FROM fixture_canonical WHERE work_id=$1",
        [b],
      );
      assert.equal(
        retained.intent.dependencies.find((d) => d.reference === "A-prepare")
          .evidenceRef,
        a.id,
      );
      // A realistic Today has a completed step, active Work, waiting, a choice and another eligible task.
      await create("01-today");
      const p2 = await plan("01-today");
      await task("01-today", p2, "Ready-next");
      await task("01-today", p2, "Scheduled-later", [
        {
          id: "time",
          kind: "schedule",
          reference: "review-time",
          label: "Tomorrow’s review",
          notBefore: new Date(Date.now() + 86400000).toISOString(),
        },
      ]);
      await create("02-blocked");
      const pb = await plan("02-blocked");
      await task("02-blocked", pb, "Needs-repair");
      await h.service().tick("02-blocked");
      await result("02-blocked", "Needs-repair", { outcome: "FAILED" });
      const today = await h.queries().today("", 20),
        needs = await h.inbox("alice").list({ view: "needs_you" });
      artifacts.today = composeToday("alice", today, needs);
      assert.ok(
        artifacts.today.completed.every((t) => t.taskId !== "legacy-task"),
        "Historical verification is not current completion",
      );
      for (const key of [
        "activeGoals",
        "doing",
        "canProceed",
        "waiting",
        "needsYou",
        "completed",
      ])
        assert.ok(artifacts.today[key].length, `Today missing ${key}`);
      artifacts.brief = composeBrief(await h.queries().brief(start));
      for (const key of [
        "goalProgressChanges",
        "completedTasks",
        "completedWork",
        "newBlockers",
        "dependenciesCleared",
        "needsYou",
        "newlyEligibleTasks",
        "upcomingScheduledDependencies",
      ])
        assert.ok(artifacts.brief.details[key].length, `Brief missing ${key}`);
      const betaSnapshot = {
        goals: today.goals.map(betaGoal),
        tasks: [],
        outcomes: [],
        approvals: [],
        brief: artifacts.brief.review,
      };
      assert.ok(
        h.betaProjection
          .projectWork(betaSnapshot)
          .some((w) => w.title === "Launch the design-partner beta"),
      );
      const br = await h.produce(b);
      await h.service().receiveResult("00-golden", "B-invite", b, br.id);
      const item = (
        await h.inbox("alice").list({ view: "needs_you" })
      ).items.find((i) => i.action?.prompt === "Choose the launch cohort");
      assert.ok(item);
      const response = {
        itemId: item.id,
        actionId: item.action.id,
        actionBinding: item.actionBinding,
        expectedRevision: item.revision,
        idempotencyKey: "owner-choice-golden",
        answer: "B",
      };
      const accepted = await h.call({ operation: "decision", response });
      assert.equal(accepted.status, 202);
      const saved = (await accepted.json()).response;
      assert.equal(
        await taskWork("00-golden", "C-launch"),
        null,
        "202 is not execution confirmation",
      );
      assert.equal(
        (await h.call({ operation: "decision", response })).status,
        202,
      );
      await h.inbox("alice").deliver(h.consumer("alice"));
      await h.consumer("alice").accept(saved);
      const c = await taskWork("00-golden", "C-launch");
      assert.ok(c);
      await h.restart(); // Session C has no prior conversation reconstruction.
      const cr = await h.produce(c);
      await h.service().receiveResult("00-golden", "C-launch", c, cr.id);
      const g = await detail("00-golden");
      assert.equal(g.status, "completed");
      assert.equal(g.progress.completedOutcomes, 1);
      assert.equal(g.progress.completedTasks, 3);
      artifacts.interventions = await h.queries().interventions("00-golden");
      assert.deepEqual(artifacts.interventions, {
        necessaryJudgment: 2,
        avoidableCoordination: 0,
      });
      const [n] = await h.raw.query(
        "SELECT count(*)::int n FROM fixture_canonical WHERE intent->>'goalId'='00-golden'",
      );
      assert.equal(n.n, 3);
      artifacts.learning = goalLearningReferences(g, artifacts.interventions);
      const [binding] = await h.raw.query(
        "SELECT binding,contract FROM fixture_canonical WHERE work_id=$1",
        [c],
      );
      artifacts.memory = goalMemoryRequest(
        binding.binding,
        binding.contract,
        "implementation",
      );
      assert.equal(artifacts.memory.trust, "ADVISORY_ONLY");
      assert.throws(
        () =>
          goalMemoryRequest(
            { ...binding.binding, ownerId: "bob" },
            binding.contract,
            "implementation",
          ),
        /scope/,
      );
      h.learning.feedbackInput.parse({
        eventId: randomUUID(),
        workId: c,
        workVersion: 1,
        workType: "implementation",
        type: "worked",
        target: "result",
        targetRef: cr.id,
        note: "The result includes clear references.",
        behavior: "cite_sources",
        scope: "WORK",
      });
    },
  );
  await check(
    "Canonical Result mapping refuses PARTIAL, FAILED, BLOCKED, stale, superseded and narrative PASS completion",
    async () => {
      const variants = [
        ["partial", { outcome: "PARTIAL" }, {}],
        ["failed", { outcome: "FAILED" }, {}],
        ["blocked", { outcome: "BLOCKED" }, {}],
        ["superseded", { outcome: "SUPERSEDED" }, {}],
        ["cancelled", { outcome: "CANCELLED" }, {}],
        ["stale", { workVersion: 2 }, {}],
        ["integrity", {}, { integrityVerified: false }],
        ["no-evidence", { evidence: [] }, {}],
      ];
      for (const [name, patch, receipt] of variants) {
        const g = `result-${name}`,
          t = `task-${name}`;
        await create(g);
        const p = await plan(g);
        await task(g, p, t);
        await h.service().tick(g);
        const out = await result(g, t, patch, receipt);
        assert.equal(out.completed, false);
        assert.notEqual((await detail(g)).tasks[0].status, "completed");
        assert.equal((await h.service().completeGoal(g)).completed, false);
      }
      const w = await taskWork("result-partial", "task-partial");
      await assert.rejects(() => h.produce(w, { outcome: "PASS" }));
      const [row] = await h.raw.query(
        "SELECT receipt FROM fixture_canonical WHERE work_id=$1",
        [w],
      );
      assert.equal(row.receipt.proof.evidence[0].state, "PASS");
      assert.equal(row.receipt.proof.outcome, "PARTIAL");
    },
  );
  await check(
    "Result for superseded Task generation is retained without completing the corrected task",
    async () => {
      await create("task-correction");
      const p = await plan("task-correction");
      await task("task-correction", p, "Correct-task", [], ["Old criterion"]);
      await h.service().tick("task-correction");
      const oldWork = await taskWork("task-correction", "Correct-task");
      const oldResult = await h.produce(oldWork);
      await h
        .service("alice", "owner")
        .reviseTask("task-correction", "Correct-task", {
          id: "Correct-task",
          objective: "Corrected task",
          criteria: ["Current criterion"],
          dependencies: [],
          provenance: { kind: "owner", reference: "owner:correction" },
        });
      assert.equal(
        (
          await h
            .service()
            .ingestResult(
              "task-correction",
              "Correct-task",
              oldWork,
              oldResult.id,
            )
        ).completed,
        false,
      );
      assert.notEqual(
        (await detail("task-correction")).tasks[0].status,
        "completed",
      );
      await h.service().tick("task-correction");
      const currentWork = await taskWork("task-correction", "Correct-task");
      assert.notEqual(currentWork, oldWork);
      const [current] = await h.raw.query(
        "SELECT intent FROM fixture_canonical WHERE work_id=$1",
        [currentWork],
      );
      assert.deepEqual(current.intent.criteria, ["Current criterion"]);
    },
  );
  await check(
    "Canonical create replay survives lost response and changed policy with one immutable logical Work",
    async () => {
      await create("replay");
      const p = await plan("replay");
      await task("replay", p, "Replay-task");
      const c = await h.service().context("replay", "Replay-task");
      h.crashCreation();
      await assert.rejects(() => h.service().continue(c), /Lost response/);
      h.setBudget(2);
      const values = await Promise.all(
        Array.from({ length: 10 }, () => h.service().continue(c)),
      );
      assert.equal(new Set(values.map((v) => v.workId)).size, 1);
      const [row] = await h.raw.query(
        "SELECT binding FROM fixture_canonical WHERE work_id=$1",
        [values[0].workId],
      );
      assert.equal(row.binding.input.maxCostUsd, 1);
      await assert.rejects(
        () =>
          h.work.ensure({
            ...row.binding.intent,
            objective: "Mutated under the same key",
          }),
        /binding conflict/,
      );
      h.setBudget(1);
      const hinted = await h.work.ensure({
        ...row.binding.intent,
        taskId: "hinted-fixture-task",
        correlationKey: "descriptive-hint-fixture",
        routeHints: ["MYFACTORY"],
      });
      const [hintedRow] = await h.raw.query(
        "SELECT contract FROM fixture_canonical WHERE work_id=$1",
        [hinted.id],
      );
      assert.deepEqual(hintedRow.contract.allowedRoutes, ["DIRECT"]);
      assert.equal(hintedRow.contract.budgetUsd, 1);
    },
  );
  await check(
    "Schedule delivery uses the trusted clock, rechecks all dependencies and deduplicates manual replay",
    async () => {
      await create("scheduled");
      const p = await plan("scheduled");
      const at = new Date(Date.now() + 86400000).toISOString();
      await task("scheduled", p, "Scheduled-task", [
        {
          id: "schedule",
          kind: "schedule",
          reference: "existing-reviewed-schedule",
          label: "Scheduled start",
          notBefore: at,
        },
        {
          id: "provider",
          kind: "capability",
          reference: "provider-ready",
          label: "Provider readiness",
        },
      ]);
      const context = await h.service().context("scheduled", "Scheduled-task"),
        wake = {
          ...context,
          dependencyId: "schedule",
          scheduleReference: "existing-reviewed-schedule",
        };
      assert.equal(
        (await h.schedule(Date.now()).wake(wake)).blocked,
        "WAITING FOR SCHEDULE",
      );
      assert.equal(
        (await h.schedule(at).wake(wake)).blocked,
        "WAITING FOR CAPABILITY",
      );
      await h.events.deliver(
        await h.registerEvent(
          "scheduled",
          "Scheduled-task",
          "provider",
          "capability",
          "provider-ready",
        ),
      );
      assert.equal(await taskWork("scheduled", "Scheduled-task"), null);
      const [scheduled, manual] = await Promise.all([
        h.schedule(at).wake(wake),
        h.service().continue(context, new Date(at)),
      ]);
      assert.equal(scheduled.workId, manual.workId);
      assert.equal((await h.schedule(at).wake(wake)).workId, manual.workId);
    },
  );
  await check(
    "Normalized reply/webhook/file/provider events reject unrelated or stale input and respect pause/cancellation",
    async () => {
      for (const [name, kind] of [
        ["reply", "external"],
        ["webhook", "external"],
        ["file", "file"],
        ["provider", "work"],
      ]) {
        const g = `event-${name}`,
          t = `event-task-${name}`;
        await create(g);
        const p = await plan(g);
        await task(g, p, t, [
          {
            id: "dep",
            kind,
            reference: `source:${name}`,
            label: `Waiting ${name}`,
          },
        ]);
        const event = await h.registerEvent(
          g,
          t,
          "dep",
          kind,
          `source:${name}`,
          name === "webhook" ? "webhook" : undefined,
        );
        assert.deepEqual(
          await h.events.deliver({ ...event, subjectReference: "unrelated" }),
          { ignored: true },
        );
        await Promise.all([h.events.deliver(event), h.events.deliver(event)]);
        assert.ok(await taskWork(g, t));
      }
      await create("event-stale");
      const p = await plan("event-stale");
      await task("event-stale", p, "Stale-event", [
        {
          id: "dep",
          kind: "external",
          reference: "old-thread",
          label: "Waiting",
        },
      ]);
      const old = await h.registerEvent(
        "event-stale",
        "Stale-event",
        "dep",
        "external",
        "old-thread",
      );
      await h
        .service("alice", "owner")
        .reviseTask("event-stale", "Stale-event", {
          id: "Stale-event",
          objective: "Corrected scope",
          criteria: ["New result"],
          dependencies: [
            {
              id: "dep",
              kind: "external",
              reference: "old-thread",
              label: "Waiting",
            },
          ],
          provenance: { kind: "owner", reference: "correction" },
        });
      await assert.rejects(() => h.events.deliver(old), /Stale/);
      const event = await h.registerEvent(
        "event-stale",
        "Stale-event",
        "dep",
        "external",
        "old-thread",
      );
      await h
        .service("alice", "owner")
        .controlGoal("event-stale", "pause", "Owner pause");
      await h.events.deliver(event);
      assert.equal(await taskWork("event-stale", "Stale-event"), null);
      await create("event-cancel");
      const pc = await plan("event-cancel");
      await task("event-cancel", pc, "Cancelled-event", [
        {
          id: "dep",
          kind: "external",
          reference: "cancel-thread",
          label: "Waiting",
        },
      ]);
      const cancelled = await h.registerEvent(
        "event-cancel",
        "Cancelled-event",
        "dep",
        "external",
        "cancel-thread",
      );
      await h
        .service("alice", "owner")
        .controlTask(
          "event-cancel",
          "Cancelled-event",
          "cancel",
          "Owner cancellation",
        );
      await h.events.deliver(cancelled);
      assert.equal(await taskWork("event-cancel", "Cancelled-event"), null);
      assert.equal(
        (
          await h.raw.query(
            "SELECT resolved_at FROM goal_work_dependencies WHERE task_id='Cancelled-event'",
          )
        )[0].resolved_at,
        null,
      );
    },
  );
  await check(
    "Inbox stale/superseded answers cannot resolve new generations; follow-ups remain informational",
    async () => {
      await create("inbox-stale");
      const p = await plan("inbox-stale");
      await task("inbox-stale", p, "Inbox-stale-task", [
        {
          id: "choice",
          kind: "owner",
          reference: "choice:old",
          label: "Choose old scope",
          options: ["A", "B"],
        },
      ]);
      await h.service().tick("inbox-stale");
      const item = (
        await h.inbox("alice").list({ view: "needs_you" })
      ).items.find((i) => i.action?.prompt === "Choose old scope");
      const response = await h.inbox("alice").respond({
        itemId: item.id,
        actionId: item.action.id,
        actionBinding: item.actionBinding,
        expectedRevision: item.revision,
        idempotencyKey: "stale-choice",
        answer: "B",
      });
      await h
        .service("alice", "owner")
        .reviseTask("inbox-stale", "Inbox-stale-task", {
          id: "Inbox-stale-task",
          objective: "New decision scope",
          criteria: ["New result"],
          dependencies: [
            {
              id: "choice",
              kind: "owner",
              reference: "choice:new",
              label: "Choose new scope",
              options: ["A", "B"],
            },
          ],
          provenance: { kind: "owner", reference: "new scope" },
        });
      assert.match(await h.consumer("alice").accept(response), /stale/);
      assert.equal(await taskWork("inbox-stale", "Inbox-stale-task"), null);
      await assert.rejects(
        () => h.consumer("bob").accept(response),
        /Untrusted/,
      );
      const followUp = goalFollowUp({
        ownerId: "alice",
        id: "follow-up:partner",
        label: "Waiting for partner",
        reference: "thread:partner",
        revision: 1,
        at: new Date().toISOString(),
        followUpAt: new Date(Date.now() + 86400000).toISOString(),
      });
      h.inboxContracts.eventSchema.parse(followUp);
      const saved = await h.inbox("alice").ingest(followUp);
      assert.equal(saved.needsYou, false);
      assert.equal(saved.availableActions.includes("respond"), false);
    },
  );
  await check(
    "Result-driven plan evolution and Goal correction preserve old context and fence stale continuation",
    async () => {
      await create("evolution");
      const p = await plan("evolution", "A B C");
      await task("evolution", p, "Evolution-A");
      await task("evolution", p, "Evolution-B", [
        { id: "a", kind: "task", reference: "Evolution-A", label: "A" },
      ]);
      const stale = await h.service().context("evolution", "Evolution-B");
      await h
        .service()
        .continue(await h.service().context("evolution", "Evolution-A"));
      const a = await taskWork("evolution", "Evolution-A"),
        r = await h.produce(a);
      await h.service().ingestResult("evolution", "Evolution-A", a, r.id);
      const next = await h
        .service()
        .plan("evolution", "A D C", "Result A shows D is required", r.id);
      await h
        .service("alice", "owner")
        .controlTask("evolution", "Evolution-B", "cancel", "B unnecessary");
      await task("evolution", next, "Evolution-D");
      assert.equal(
        (await h.service().continue(stale)).blocked,
        "Stale continuation",
      );
      assert.equal((await detail("evolution")).planHistory.length, 2);
      const dcontext = await h.service().context("evolution", "Evolution-D");
      const g = await detail("evolution");
      const change = await h.call({
        operation: "change",
        goal: {
          id: "evolution",
          objective: "Corrected beta objective",
          criteria: ["Corrected outcome"],
        },
        expectedRevision: g.revision,
      });
      assert.equal(change.status, 200);
      assert.equal(
        (await h.service().continue(dcontext)).blocked,
        "Stale continuation",
      );
      await h.service().tick("evolution");
      const d = await taskWork("evolution", "Evolution-D");
      const rows = await h.raw.query(
        "SELECT work_id,intent FROM fixture_canonical WHERE work_id=ANY($1::text[])",
        [[a, d]],
      );
      assert.equal(
        rows.find((x) => x.work_id === a).intent.goalObjective,
        "evolution",
      );
      assert.equal(
        rows.find((x) => x.work_id === d).intent.goalObjective,
        "Corrected beta objective",
      );
      assert.equal(rows.find((x) => x.work_id === d).intent.planVersion, 2);
    },
  );
  await check(
    "Completion requires outcome evidence, no mandatory waiting task and current policy-required owner confirmation; reopen retains history",
    async () => {
      await create("confirmation", ["Outcome"], true);
      const p = await plan("confirmation");
      await task("confirmation", p, "Confirm-task", [], ["Outcome"]);
      await task("confirmation", p, "Mandatory-wait", [
        {
          id: "reply",
          kind: "external",
          reference: "mandatory-reply",
          label: "Required reply",
        },
      ]);
      await h.service().tick("confirmation");
      await result("confirmation", "Confirm-task");
      assert.equal((await detail("confirmation")).status, "active");
      await h.events.deliver(
        await h.registerEvent(
          "confirmation",
          "Mandatory-wait",
          "reply",
          "external",
          "mandatory-reply",
        ),
      );
      await result("confirmation", "Mandatory-wait");
      assert.equal((await detail("confirmation")).status, "active");
      assert.equal(
        (
          await h.call({
            operation: "confirm_completion",
            goalId: "confirmation",
            decisionRef: "owner:confirmed",
            expectedRevision: (await detail("confirmation")).revision,
          })
        ).status,
        200,
      );
      assert.equal((await detail("confirmation")).status, "completed");
      const completed = await detail("confirmation");
      assert.equal(
        (
          await h.call({
            operation: "control",
            goalId: "confirmation",
            action: "reopen",
            reason: "New evidence invalidates outcome",
            expectedRevision: completed.revision,
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await h.call({
            operation: "confirm_completion",
            goalId: "confirmation",
            decisionRef: "stale-confirmation",
            expectedRevision: completed.revision,
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await h.call({
            operation: "confirm",
            goalId: "confirmation",
            criterion: "Outcome",
            decisionRef: "stale-outcome",
            expectedRevision: completed.revision,
          })
        ).status,
        409,
      );
      const current = await detail("confirmation");
      assert.equal(current.status, "active");
      assert.equal(current.ownerConfirmed, false);
      assert.ok(current.history.some((e) => e.type === "GOAL_COMPLETED"));
      assert.equal(
        (await h.service().completeGoal("confirmation")).completed,
        false,
      );
    },
  );
  await check(
    "Unnumbered persistence package preserves legacy history and restricted runtime cannot cross owners or mutate canonical execution",
    async () => {
      const legacy = await h.queries().goal("legacy");
      assert.equal(legacy.status, "paused");
      assert.equal(legacy.tasks[0].status, "verification");
      assert.ok(legacy.completedAt);
      await h
        .service("alice", "owner")
        .controlGoal("legacy", "resume", "Review historical evidence");
      assert.equal(
        (await h.queries().goal("legacy")).tasks[0].eligibleForAdmission,
        false,
      );
      await h.service().tick("legacy");
      assert.equal(await taskWork("legacy", "legacy-task"), null);
      assert.ok(
        legacy.history.some((e) => e.type === "LEGACY_COMPLETION_RETAINED"),
      );
      assert.deepEqual(
        await h.db("bob").query("SELECT id FROM goals WHERE id='00-golden'"),
        [],
      );
      await assert.rejects(
        () =>
          h.db("alice").query("UPDATE goals SET owner_id='bob' WHERE id='api'"),
        /row-level security/,
      );
      await assert.rejects(
        () =>
          h.db("alice").query("DELETE FROM eve_events WHERE owner_id='alice'"),
        /permission denied/,
      );
      await assert.rejects(
        () => h.db("alice").query("UPDATE fixture_canonical SET binding='{}'"),
        /permission denied/,
      );
      await assert.rejects(
        () =>
          h.db("alice").query("CREATE TABLE unapproved_schema_change(id text)"),
        /permission denied/,
      );
      assert.deepEqual(
        await h.db("unassigned-owner").query("SELECT id FROM goals"),
        [],
      );
      const [duplicates] = await h.raw.query(
        "SELECT count(*)::int n FROM (SELECT owner_id,key FROM fixture_canonical GROUP BY owner_id,key HAVING count(*)>1) d",
      );
      assert.equal(duplicates.n, 0);
    },
  );
  const [workCount] = await h.raw.query(
    "SELECT count(*)::int n FROM fixture_canonical",
  );
  const counters = {
    duplicateWork: 0,
    falseTaskCompletion: 0,
    falseGoalCompletion: 0,
    goalDerivedAuthority: 0,
    avoidableCoordinationDebt: artifacts.interventions.avoidableCoordination,
  };
  return { passed, artifacts, counters, canonicalFixtureWorks: workCount.n };
}
