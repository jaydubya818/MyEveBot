import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { digest } from "../engineering/contract.ts";
import { connection, Env } from "./work-test-fixture.ts";

/** Migration qualification for the standalone accounting upgrade shared-accounting-zero-gap.sql:
 * fresh install, upgrade over live pre-upgrade state, idempotent re-apply, history preservation,
 * behaviour switch, documented rollback, and restricted-role privileges. SQL-only (no app databases). */
const sql = (name: string) => readFile(new URL(`./${name}`, import.meta.url), "utf8");
const TOKEN_A = "a".repeat(64), TOKEN_B = "b".repeat(64);

describe.skipIf(!connection)("shared accounting zero-gap upgrade (real PostgreSQL migration qualification)", () => {
  const envs: Env[] = [];
  afterEach(async () => { await Promise.all(envs.splice(0).map(e => e.close())); }, 60000);

  async function central(stage: "pre" | "full") {
    const db = await Env.create(false, {}, false); envs.push(db);
    await db.pool.query(await sql("shared-accounting.sql"));
    await db.pool.query(await sql("shared-accounting-recovery.sql"));
    if (stage === "full") await db.pool.query(await sql("shared-accounting-zero-gap.sql"));
    const cohort = randomUUID(), ownerA = randomUUID(), ownerB = randomUUID(), policyA = "1".repeat(64), policyB = "2".repeat(64);
    await db.pool.query("INSERT INTO external_alpha_cohort(id) VALUES($1)", [cohort]);
    for (const [slot, owner, policy, token] of [["1", ownerA, policyA, TOKEN_A], ["2", ownerB, policyB, TOKEN_B]])
      await db.pool.query(`INSERT INTO external_alpha_cohort_member(cohort_id,slot,owner_id,policy_sha256,credential_sha256)
        VALUES($1,$2,$3,$4,encode(sha256(convert_to($5,'UTF8')),'hex'))`, [cohort, slot, owner, policy, token]);
    await db.pool.query("UPDATE external_alpha_cohort SET activated_at=clock_timestamp() WHERE id=$1", [cohort]);
    const call = async (who: "A" | "B", p: Record<string, unknown>) => (await db.pool.query("SELECT external_alpha_cohort_call($1::jsonb) AS r", [JSON.stringify({
      ...p, cohortId: cohort, ownerId: who === "A" ? ownerA : ownerB, slot: who === "A" ? "1" : "2",
      policySha256: who === "A" ? policyA : policyB, credential: who === "A" ? TOKEN_A : TOKEN_B })])).rows[0].r;
    const reserve = (who: "A" | "B", kind: "CHAT" | "WORK", binding: string) =>
      call(who, { mode: "reserve", id: randomUUID(), kind, bindingSha256: digest(binding), requestSha256: digest("req:" + binding) });
    const runningWork = async () => {
      const admission = await reserve("A", "WORK", "work-a");
      const allowanceId = randomUUID(), op = digest("work:authority-a");
      await call("A", { mode: "bind", id: admission.id, allowanceId });
      await call("A", { mode: "dispatch", id: admission.id, allowanceId, operationSha256: op });
      await call("A", { mode: "running_work", id: admission.id, allowanceId, operationSha256: op });
      return { admission, allowanceId, op };
    };
    const snapshot = async () => ({
      admissions: (await db.pool.query("SELECT * FROM external_alpha_cohort_admission ORDER BY id")).rows,
      dispatches: (await db.pool.query("SELECT * FROM external_alpha_cohort_dispatch ORDER BY admission_id,operation_sha256")).rows,
      members: (await db.pool.query("SELECT * FROM external_alpha_cohort_member ORDER BY slot")).rows,
      cohort: (await db.pool.query("SELECT * FROM external_alpha_cohort")).rows,
    });
    const functionSource = async () => (await db.pool.query("SELECT md5(prosrc) h FROM pg_proc WHERE proname='external_alpha_cohort_call'")).rows[0].h as string;
    return { db, call, reserve, runningWork, snapshot, functionSource };
  }

  it("fresh install (schema → recovery → zero-gap): RUNNING fences and a second Work hits capacity", async () => {
    const c = await central("full");
    await c.runningWork();
    await expect(c.reserve("B", "CHAT", "chat-b")).rejects.toThrow(/EXTERNAL_ALPHA_SHARED_FENCED/);
    await expect(c.reserve("B", "WORK", "work-b")).rejects.toThrow(/EXTERNAL_ALPHA_SHARED_CAPACITY/);
  });

  it("upgrade over live pre-upgrade state preserves every row, switches behaviour, and is idempotent", async () => {
    const c = await central("pre");
    const { admission, allowanceId } = await c.runningWork();
    // Pre-upgrade (unsafe) behaviour: RUNNING admits another owner's chat.
    await expect(c.reserve("B", "CHAT", "pre-upgrade-chat")).resolves.toMatchObject({ kind: "CHAT" });
    const before = await c.snapshot();
    await c.db.pool.query(await sql("shared-accounting-zero-gap.sql"));
    expect(await c.snapshot()).toEqual(before);                         // no history, row or reservation changed
    const upgraded = await c.functionSource();
    await c.db.pool.query(await sql("shared-accounting-zero-gap.sql"));  // re-apply is a no-op
    expect(await c.functionSource()).toBe(upgraded);
    expect(await c.snapshot()).toEqual(before);
    await expect(c.reserve("B", "CHAT", "post-upgrade-chat")).rejects.toThrow(/EXTERNAL_ALPHA_SHARED_FENCED/);
    await expect(c.reserve("B", "WORK", "post-upgrade-work")).rejects.toThrow(/EXTERNAL_ALPHA_SHARED_CAPACITY/);
    // The pre-upgrade chat admission keeps its full charge and cannot dispatch while the Work is RUNNING.
    const chat = before.admissions.find((a: { kind: string }) => a.kind === "CHAT");
    const chatAllowance = randomUUID();
    await c.call("B", { mode: "bind", id: chat.id, allowanceId: chatAllowance });
    await expect(c.call("B", { mode: "dispatch", id: chat.id, allowanceId: chatAllowance, operationSha256: digest("sofie:turn:1") })).rejects.toThrow(/EXTERNAL_ALPHA_SHARED_FENCED/);
    // Settling the Work lease releases the fence (capacity still held until its deadline).
    await c.call("A", { mode: "settle", id: admission.id, allowanceId, operationSha256: digest("work:authority-a") });
    await expect(c.reserve("B", "CHAT", "after-settle")).resolves.toMatchObject({ kind: "CHAT" });
  });

  it("documented rollback (re-apply recovery function) restores the pre-upgrade function without touching history", async () => {
    const c = await central("full");
    await c.runningWork();
    const before = await c.snapshot();
    await c.db.pool.query(await sql("shared-accounting-recovery.sql"));
    expect(await c.snapshot()).toEqual(before);
    await expect(c.reserve("B", "CHAT", "after-rollback")).resolves.toMatchObject({ kind: "CHAT" }); // the unsafe exemption returns
    await c.db.pool.query(await sql("shared-accounting-zero-gap.sql"));                               // forward recovery
    await expect(c.reserve("B", "CHAT", "after-forward")).rejects.toThrow(/EXTERNAL_ALPHA_SHARED_FENCED/);
  });

  it("the replaced function keeps SECURITY DEFINER, a pinned search_path and no public execute grant", async () => {
    const c = await central("full");
    const [fn] = (await c.db.pool.query(`SELECT p.prosecdef, p.proconfig, has_function_privilege('public','external_alpha_cohort_call(jsonb)','EXECUTE') AS public_exec
      FROM pg_proc p WHERE p.proname='external_alpha_cohort_call'`)).rows;
    expect(fn.prosecdef).toBe(true);
    expect(fn.proconfig).toEqual(["search_path=pg_catalog, public, pg_temp"]);
    expect(fn.public_exec).toBe(false);
  });
});
