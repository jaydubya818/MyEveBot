import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error Optional integration driver has no workspace declaration package.
import { Client, Pool } from "pg";
import { loadMigrations, runMigrations } from "../scripts/migration-runner.ts";
const state = vi.hoisted(() => ({ database: null as any }));
vi.mock("../agent/lib/receipts-db.ts", () => ({ db: () => state.database }));
import { createDelegatedTask, completeDelegatedTask } from "./task-runs.ts";

const suite = process.env.MYEVE_TASK_LIFECYCLE_TESTS === "1" ? describe : describe.skip;
suite("owner task lifecycle in real PostgreSQL", () => {
  const options = { host: "127.0.0.1", port: 55439, database: "postgres", user: process.env.USER };
  const databaseName = `task_lifecycle_${process.pid}_${Date.now()}`;
  let admin: any, pool: any;
  const query = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows;
  const recover = (session = "session", id = `action_run_${crypto.randomUUID()}`, fresh = true) =>
    query("SELECT owner_chat_run('owner',$1,'agent',$2,$3,true) AS id", [session, id, fresh]).then(rows => rows[0].id);
  const start = (callId = "call-1", sessionId = "session") => createDelegatedTask({
    ownerId: "owner", agentId: "agent", sessionId, title: "README review", objective: "Read the README", expectedOutput: "A factual review",
    maxDurationSeconds: 600, maxModelSteps: 30, maxEstimatedCostUsd: 1,
    ownerChat: { callId },
  } as Parameters<typeof createDelegatedTask>[0]);
  beforeAll(async () => {
    admin = new Client(options); await admin.connect(); await admin.query(`CREATE DATABASE ${databaseName}`);
    pool = new Pool({ ...options, database: databaseName });
    state.database = { query, transaction: async (build: any) => {
      const c = await pool.connect(); try {
        await c.query("BEGIN");
        const statements = build((strings: TemplateStringsArray, ...params: unknown[]) => ({ sql: strings.reduce((s, part, i) => s + (i ? `$${i}` : "") + part, ""), params }));
        for (const s of statements) await c.query(s.sql, s.params);
        await c.query("COMMIT");
      } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
    }};
    await runMigrations({ query, transaction: async statements => {
      const c = await pool.connect(); try { await c.query("BEGIN"); for (const s of statements) await c.query(s.sql, s.params); await c.query("COMMIT"); }
      catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
    }}, await loadMigrations(), () => {});
    await query("INSERT INTO agents(id,owner_id,slug,name,role,instructions,is_primary,status,max_steps,max_runtime_seconds,max_estimated_cost_usd) VALUES('agent','owner','fixture','Fixture','Test','Test',true,'active',30,900,2)");
  });
  beforeEach(async () => { await query("TRUNCATE task_runs CASCADE"); });
  afterAll(async () => { await pool?.end(); if (admin) { await admin.query(`DROP DATABASE ${databaseName}`); await admin.end(); } });

  it("production regression: expiry → fresh owner message → start_task preserves history and one current binding", async () => {
    const old = await recover();
    await query("UPDATE task_runs SET status='awaiting_approval',deadline_at=now()-interval '1 second' WHERE id=$1", [old]);
    const before = (await query("SELECT row_to_json(r) AS value FROM task_runs r WHERE id=$1", [old]))[0].value;
    const fresh = await recover();
    const task = await start();
    expect(task.id).toMatch(/^task_/);
    expect((await query("SELECT task_id FROM task_run_sessions WHERE session_id='session' AND is_current"))).toEqual([{task_id:task.id}]);
    expect((await query("SELECT row_to_json(r) AS value FROM task_runs r WHERE id=$1", [old]))[0].value).toEqual(before);
    expect((await query("SELECT count(*)::int n FROM task_run_sessions WHERE session_id='session'"))[0].n).toBe(3);
    expect((await query("SELECT status FROM task_runs WHERE id=$1", [fresh]))[0].status).toBe("cancelled");
  });

  it("completed standalone task permits a fresh owner request without reviving the old task", async () => {
    const task = await start();
    await completeDelegatedTask({ ownerId: "owner", taskId: task.id, summary: "Reviewed", evidenceSummary: "Actual fixture read" });
    const before = (await query("SELECT row_to_json(r) value FROM task_runs r WHERE id=$1", [task.id]))[0].value;
    await recover(); const next = await start("call-2");
    expect(next.id).not.toBe(task.id);
    expect((await query("SELECT row_to_json(r) value FROM task_runs r WHERE id=$1", [task.id]))[0].value).toEqual(before);
    expect((await query("SELECT is_current FROM task_run_sessions WHERE task_id=$1", [task.id]))[0].is_current).toBe(false);
  });
  it("expired standalone task recovers after process reconnect only on fresh input", async () => {
    const task = await start(); await query("UPDATE task_runs SET deadline_at=now()-interval '1 second' WHERE id=$1", [task.id]);
    await expect(start("tool-retry")).rejects.toThrow("RUN_EXPIRED");
    await expect(recover("session", "action_run_not_fresh", false)).rejects.toThrow("RUN_EXPIRED");
    const restarted = new Client({ ...options, database: databaseName }); await restarted.connect();
    try { await restarted.query("SELECT owner_chat_run('owner','session','agent','action_run_restarted',true,true)"); }
    finally { await restarted.end(); }
    expect((await start("new-owner-call")).id).not.toBe(task.id);
  });
  it.each(["failed", "cancelled", "paused"])("does not revive %s workflows", async status => {
    const old = await recover(); await query("UPDATE task_runs SET status=$2,deadline_at=now()-interval '1 second' WHERE id=$1", [old, status]);
    await expect(recover()).rejects.toThrow("RUN_RECOVERY_REQUIRES_OWNER_REVIEW");
    expect((await query("SELECT task_id FROM task_run_sessions WHERE is_current"))[0].task_id).toBe(old);
  });
  it.each(["model_steps=max_model_steps", "estimated_cost_usd=max_estimated_cost_usd"])("cannot reset exhausted %s", async mutation => {
    const old = await recover(); await query(`UPDATE task_runs SET ${mutation},deadline_at=now()-interval '1 second' WHERE id=$1`, [old]);
    await expect(recover()).rejects.toThrow("RUN_RECOVERY_REQUIRES_OWNER_REVIEW");
  });
  it.each(["parent_task_id=id", "source_task_id=id", "role_id='role-fixture'"])("preserves delegated lineage: %s", async mutation => {
    const task = await start(); await query(`UPDATE task_runs SET ${mutation},deadline_at=now()-interval '1 second' WHERE id=$1`, [task.id]);
    await expect(recover()).rejects.toThrow("RUN_RECOVERY_REQUIRES_OWNER_REVIEW");
  });
  it("preserves goal-derived Work", async () => {
    const task = await start(); await query("INSERT INTO goals(id,owner_id,title) VALUES('goal_fixture','owner','Goal') ON CONFLICT DO NOTHING");
    await query("UPDATE task_runs SET goal_id='goal_fixture',deadline_at=now()-interval '1 second' WHERE id=$1", [task.id]);
    await expect(recover()).rejects.toThrow("RUN_RECOVERY_REQUIRES_OWNER_REVIEW");
  });
  it("preserves scheduled/event Work", async () => {
    const task = await start();
    await query("INSERT INTO execution_routines(id,owner_id,source_kind,source_id,name,agent_id,configuration) VALUES('routine-fixture','owner','webhook','event-fixture','Fixture','agent','{}') ON CONFLICT DO NOTHING");
    await query("INSERT INTO execution_routine_versions(owner_id,routine_id,version,configuration,changed_by) VALUES('owner','routine-fixture',1,'{}','owner') ON CONFLICT DO NOTHING");
    await query("INSERT INTO execution_occurrences(id,owner_id,routine_id,routine_version,occurrence_key,scheduled_for,run_id) VALUES('occ-fixture','owner','routine-fixture',1,'event-1',now(),$1)", [task.id]);
    await query("UPDATE task_runs SET deadline_at=now()-interval '1 second' WHERE id=$1", [task.id]);
    await expect(recover()).rejects.toThrow("RUN_RECOVERY_REQUIRES_OWNER_REVIEW");
  });
  it("active Work cannot be detached by an unrelated new task", async () => {
    const task = await start(); await expect(start("different-call")).rejects.toThrow("RUN_ACTIVE_OR_REVIEW_REQUIRED");
    expect(await recover()).toBe(task.id);
    expect((await query("SELECT count(*)::int n FROM task_runs"))[0].n).toBe(1);
  });
  it("two concurrent owner messages create exactly one new active task", async () => {
    const old = await recover(); await query("UPDATE task_runs SET deadline_at=now()-interval '1 second' WHERE id=$1", [old]);
    const results = await Promise.allSettled(["one", "two"].map(async call => { await recover(); return start(call); }));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
    expect((await query("SELECT count(*)::int n FROM task_run_sessions WHERE is_current"))[0].n).toBe(1);
    expect((await query("SELECT count(*)::int n FROM task_runs WHERE id LIKE 'task_%'"))[0].n).toBe(1);
    expect((await query("SELECT count(*)::int n FROM task_run_sessions WHERE task_id=$1", [old]))[0].n).toBe(1);
  });
  it("concurrent creation retries and stale response replays resolve the original task only", async () => {
    const results = await Promise.all([start(), start(), start()]);
    expect(new Set(results.map(r => r.id)).size).toBe(1);
    const old = results[0];
    await completeDelegatedTask({ ownerId: "owner", taskId: old.id, summary: "Done", evidenceSummary: "Verified" });
    await recover(); const next = await start("next-call");
    expect((await start()).id).toBe(old.id);
    expect((await start()).status).toBe("completed");
    expect((await query("SELECT task_id FROM task_run_sessions WHERE is_current"))[0].task_id).toBe(next.id);
    expect((await query("SELECT count(*)::int n FROM task_runs WHERE id LIKE 'task_%'"))[0].n).toBe(2);
  });
  it("pending/approved decisions and Actions remain historical and cannot transfer", async () => {
    const old = await recover();
    for (const status of ["pending", "approved"]) await query("INSERT INTO task_approval_decisions(id,task_id,owner_id,requested_by,prompt,action,action_class,binding_hash,risk,status,decision,expires_at) VALUES($1,$2,'owner','agent','Fixture','execute','execute','hash','high',$3,$4,now()+interval '1 hour')", [status, old, status, status === "approved" ? status : null]);
    await query("INSERT INTO action_requests(id,owner_id,run_id,action_key,executor,trigger,capability_id,action_class,target,parameter_hash,decision,authority_source,approval_id,status) VALUES('action-fixture','owner',$1,'fixture','{}','{}','computer.local.shell','execute','{}','hash','REQUIRE_APPROVAL','local','pending','awaiting_approval')", [old]);
    await expect(start()).rejects.toThrow("RUN_ACTIVE_OR_REVIEW_REQUIRED");
    await query("UPDATE task_runs SET deadline_at=now()-interval '1 second' WHERE id=$1", [old]);
    const history = await query("SELECT row_to_json(a) value FROM action_requests a UNION ALL SELECT row_to_json(p) FROM task_approval_decisions p");
    await recover(); const task = await start();
    expect(await query("SELECT row_to_json(a) value FROM action_requests a UNION ALL SELECT row_to_json(p) FROM task_approval_decisions p")).toEqual(history);
    expect((await query("SELECT count(*)::int n FROM task_approval_decisions WHERE task_id=$1", [task.id]))[0].n).toBe(0);
    expect((await query("SELECT count(*)::int n FROM action_requests a JOIN task_runs r ON r.id=a.run_id JOIN task_run_sessions s ON s.task_id=r.id WHERE a.id='action-fixture' AND s.is_current AND r.deadline_at>now()"))[0].n).toBe(0);
  });
  it("placeholder conversion cannot extend limits or deadline", async () => {
    const old = await recover();
    await query("UPDATE task_runs SET max_model_steps=3,max_estimated_cost_usd=0.03,deadline_at=now()+interval '90 seconds' WHERE id=$1", [old]);
    const before = (await query("SELECT deadline_at FROM task_runs WHERE id=$1", [old]))[0];
    const task = await start();
    const after = (await query("SELECT max_model_steps,max_estimated_cost_usd,deadline_at FROM task_runs WHERE id=$1", [task.id]))[0];
    expect(after.max_model_steps).toBe(3); expect(Number(after.max_estimated_cost_usd)).toBe(0.03); expect(after.deadline_at).toEqual(before.deadline_at);
  });
  it("model-only preparation transfers spent usage without resetting the deadline or budget", async () => {
    const old = await recover();
    await query("UPDATE task_runs SET model_steps=2,estimated_cost_usd=0.05 WHERE id=$1", [old]);
    const task = await start();
    expect((await query("SELECT model_steps,estimated_cost_usd::float8 cost FROM task_runs WHERE id=$1", [task.id]))[0]).toEqual({model_steps:2,cost:0.05});
    expect((await query("SELECT status FROM task_runs WHERE id=$1", [old]))[0].status).toBe("cancelled");
  });
  it("owner/agent mismatches fail closed and the unique index still rejects a second current binding", async () => {
    const old = await recover(); const task = await start();
    for (const [owner, agent] of [["other", "agent"], ["owner", "other"]]) await expect(query("SELECT start_owner_task($1,'session',$2,'call-other','task_other','{}')", [owner, agent])).rejects.toThrow("RUN_BINDING_INVALID");
    await expect(query("UPDATE task_run_sessions SET is_current=true WHERE task_id=$1", [old])).rejects.toThrow("task_run_sessions_current");
    expect((await query("SELECT task_id FROM task_run_sessions WHERE is_current"))[0].task_id).toBe(task.id);
  });
  it("process death between retirement and new binding rolls back every write; restart retries safely", async () => {
    const old = await recover();
    const before = await query("SELECT row_to_json(r) value FROM task_runs r");
    await query("CREATE FUNCTION pause_binding_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.call_id='crash-call' THEN PERFORM pg_sleep(30); END IF; RETURN NEW; END $$");
    await query("CREATE TRIGGER pause_binding_fixture BEFORE INSERT ON task_run_sessions FOR EACH ROW EXECUTE FUNCTION pause_binding_fixture()");
    const c = new Client({ ...options, database: databaseName }); c.on("error", () => {}); await c.connect();
    const pid = (await c.query("SELECT pg_backend_pid() pid")).rows[0].pid;
    const inflight = c.query("SELECT start_owner_task('owner','session','agent','crash-call','task_crash',$1)", [JSON.stringify({title:"Crash fixture",objective:"Read",expectedOutput:"Review",maxDurationSeconds:60,maxModelSteps:3,maxEstimatedCostUsd:0.1,maxWorkers:1})]).catch((e: Error) => e);
    try {
      let paused = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        paused = (await query("SELECT wait_event='PgSleep' paused FROM pg_stat_activity WHERE pid=$1", [pid]))[0]?.paused;
        if (paused) break; await new Promise(resolve => setTimeout(resolve, 20));
      }
      expect(paused).toBe(true);
      expect((await query("SELECT task_id FROM task_run_sessions WHERE is_current"))[0].task_id).toBe(old);
      await query("SELECT pg_terminate_backend($1)", [pid]); expect(await inflight).toBeInstanceOf(Error);
    } finally { await c.end(); await query("DROP TRIGGER pause_binding_fixture ON task_run_sessions; DROP FUNCTION pause_binding_fixture()"); }
    expect(await query("SELECT row_to_json(r) value FROM task_runs r")).toEqual(before);
    const task = await start("crash-call"); expect(task.id).toMatch(/^task_/);
    expect((await query("SELECT count(*)::int n FROM task_run_sessions WHERE is_current"))[0].n).toBe(1);
    expect((await query("SELECT count(*)::int n FROM task_run_sessions WHERE task_id=$1", [old]))[0].n).toBe(1);
  });
});
