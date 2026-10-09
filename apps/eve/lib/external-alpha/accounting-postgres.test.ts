import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { digest } from "../engineering/contract.ts";
import { ExternalAlphaAllowance } from "./allowance.ts";
import { connection, Env, files } from "./work-test-fixture.ts";

const h = (s: string) => digest(s);
const today = () => Math.floor(Date.now() / 86400000);

describe.skipIf(!connection)("external alpha shared accounting limits (real PostgreSQL)", () => {
  const envs: Env[] = [];
  const make = async () => {
    const e = await Env.create(true);
    envs.push(e);
    return { e, budget: new ExternalAlphaAllowance(e.db, e.policy) };
  };
  afterEach(async () => {
    await Promise.all(envs.splice(0).map((e) => e.close()));
  }, 60000);
  const chat = (b: ExternalAlphaAllowance, n: number) => b.admit({ kind: "CHAT", bindingId: `s:${n}`, requestSha256: h("t" + n) });
  const history = async (e: Env, days: number[], kinds: Array<"CHAT" | "WORK">) => {
    for (const d of days)
      for (const kind of kinds) {
        const n = kind === "CHAT" ? 10 : 1;
        for (let i = 0; i < n; i++)
          await e.pool.query(
            `INSERT INTO external_alpha_allowance(id,owner_id,policy_sha256,kind,binding_id,request_sha256,work_id,work_version,work_generation,day_index,ceiling_microusd,max_operations,state,deadline)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,$10,$11,'COMPLETED',now())`,
            [randomUUID(), e.owner, digest(e.policy), kind, `hist:${d}:${kind}:${i}`, "a".repeat(64), kind === "WORK" ? randomUUID() : null, kind === "WORK" ? 1 : null, d, kind === "CHAT" ? 100000 : 1300000, kind === "CHAT" ? 2 : 5],
          );
      }
  };

  it("allows exactly ten chat turns plus one Work per owner per UTC day ($2.30) and nothing more", async () => {
    const { e, budget } = await make();
    for (let i = 0; i < 10; i++) await chat(budget, i);
    const a = await e.svc.issue(await e.seedWork(), files);
    expect(a.state).toBe("ISSUED");
    await expect(chat(budget, 11)).rejects.toThrow(/exhausted|EXTERNAL_ALPHA_SHARED_EXHAUSTED/);
    expect((await e.pool.query("SELECT sum(ceiling_microusd)::bigint s FROM external_alpha_allowance")).rows[0].s).toBe("2300000");
    // A second Work the same day is refused even with an untouched, otherwise free Work row.
    await expect(e.svc.issue(await e.seedWork(), files)).rejects.toThrow(/exhausted|One active Work|EXTERNAL_ALPHA_SHARED_EXHAUSTED/);
  });

  it("Work first, then ten chats: same ceiling", async () => {
    const { e, budget } = await make();
    await e.svc.issue(await e.seedWork(), files);
    for (let i = 0; i < 10; i++) await chat(budget, i);
    await expect(chat(budget, 99)).rejects.toThrow(/exhausted|EXTERNAL_ALPHA_SHARED_EXHAUSTED/);
  });

  it("bounds each chat turn at two operations and $0.10 of reserved exposure", async () => {
    const { budget } = await make();
    const a = await chat(budget, 1);
    const first = await budget.reserve({ allowanceId: a.id, stepKey: "s:1", requestSha256: h("a"), microusd: 50000 });
    await budget.claimDispatch(first);
    await budget.settle(first, 10000, { ok: 1 });
    const second = await budget.reserve({ allowanceId: a.id, stepKey: "s:2", requestSha256: h("b"), microusd: 90000 });
    await budget.claimDispatch(second);
    await budget.settle(second, 90000, { ok: 2 });
    await expect(budget.reserve({ allowanceId: a.id, stepKey: "s:3", requestSha256: h("c"), microusd: 1000 })).rejects.toThrow(/budget exhausted/);
    const b = await chat(budget, 2);
    await expect(budget.reserve({ allowanceId: b.id, stepKey: "s:1", requestSha256: h("d"), microusd: 100001 })).rejects.toThrow(/budget exhausted/);
    await expect(budget.reserve({ allowanceId: b.id, stepKey: "s:1", requestSha256: h("d"), microusd: 150001 })).rejects.toThrow(/OPERATION_BOUND/);
  });

  it("serializes 30 concurrent reservations: one dispatch at a time, never more exposure than the allowance", async () => {
    const { e, budget } = await make();
    const a = await chat(budget, 1);
    const results = await Promise.allSettled(
      Array.from({ length: 30 }, (_, i) => budget.reserve({ allowanceId: a.id, stepKey: `s:${i}`, requestSha256: h("r" + i), microusd: 60000 })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const exposure = (await e.pool.query("SELECT sum(COALESCE(spent_microusd,reserved_microusd))::bigint s FROM external_alpha_operation")).rows[0].s;
    expect(Number(exposure)).toBeLessThanOrEqual(100000);
  });

  it("settles exactly once and refuses to release or reuse UNKNOWN exposure", async () => {
    const { e, budget } = await make();
    const a = await chat(budget, 1);
    const op = await budget.reserve({ allowanceId: a.id, stepKey: "s:1", requestSha256: h("x"), microusd: 40000 });
    await budget.claimDispatch(op);
    const settled = await Promise.allSettled([budget.settle(op, 30000, { r: 1 }), budget.settle(op, 20000, { r: 2 })]);
    expect(settled.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const row = (await e.pool.query("SELECT spent_microusd,result FROM external_alpha_operation WHERE id=$1", [op.id])).rows[0];
    expect([30000, 20000]).toContain(Number(row.spent_microusd));
    // Replaying the same request returns the retained response and charges nothing more.
    const replay = await budget.reserve({ allowanceId: a.id, stepKey: "s:1", requestSha256: h("x"), microusd: 40000 });
    expect(replay.state).toBe("SETTLED");
    // UNKNOWN: stays charged at its reservation; settle cannot revive it; the cohort is fenced.
    const b = await chat(budget, 2);
    const unknownOp = await budget.reserve({ allowanceId: b.id, stepKey: "s:1", requestSha256: h("y"), microusd: 70000 });
    await budget.claimDispatch(unknownOp);
    await budget.unknown(unknownOp);
    await expect(budget.settle(unknownOp, 0, {})).rejects.toThrow(/incremental settlement/);
    await expect(budget.reserve({ allowanceId: b.id, stepKey: "s:2", requestSha256: h("z"), microusd: 10 })).rejects.toThrow(/fenced|EXTERNAL_ALPHA_SHARED_FENCED/);
    await expect(chat(budget, 3)).rejects.toThrow(/fences|EXTERNAL_ALPHA_SHARED_FENCED/);
    await expect(budget.reserve({ allowanceId: b.id, stepKey: "s:1", requestSha256: h("y"), microusd: 70000 })).rejects.toThrow(/No replay of ambiguous|EXTERNAL_ALPHA_SHARED_FENCED/);
    const kept = (await e.pool.query("SELECT state,reserved_microusd,spent_microusd FROM external_alpha_operation WHERE id=$1", [unknownOp.id])).rows[0];
    expect(kept).toMatchObject({ state: "UNKNOWN", reserved_microusd: "70000", spent_microusd: null });
  });

  it("enforces the five-day owner allocation ($11.50) independently of the daily counters", async () => {
    const { e, budget } = await make();
    const d = today();
    await history(e, [d - 5, d - 4, d - 3, d - 2, d - 1], ["CHAT", "WORK"]);
    expect((await e.pool.query("SELECT sum(ceiling_microusd)::bigint s FROM external_alpha_allowance")).rows[0].s).toBe("11500000");
    await expect(chat(budget, 1)).rejects.toThrow(/exhausted|EXTERNAL_ALPHA_SHARED_EXHAUSTED/);
    await expect(e.svc.issue(await e.seedWork(), files)).rejects.toThrow(/exhausted|EXTERNAL_ALPHA_SHARED_EXHAUSTED/);
  });

  it("allows today's full $2.30 after four spent days and then exactly reaches $11.50", async () => {
    const { e, budget } = await make();
    const d = today();
    await history(e, [d - 4, d - 3, d - 2, d - 1], ["CHAT", "WORK"]);
    for (let i = 0; i < 10; i++) await chat(budget, i);
    await e.svc.issue(await e.seedWork(), files);
    expect((await e.pool.query("SELECT sum(ceiling_microusd)::bigint s FROM external_alpha_allowance")).rows[0].s).toBe("11500000");
    await expect(chat(budget, 50)).rejects.toThrow(/exhausted|EXTERNAL_ALPHA_SHARED_EXHAUSTED/);
  });

  it("counts days at UTC midnight boundaries, not local time", async () => {
    const { e, budget } = await make();
    for (let i = 0; i < 10; i++) await chat(budget, i);
    await expect(chat(budget, 20)).rejects.toThrow(/exhausted|EXTERNAL_ALPHA_SHARED_EXHAUSTED/);
    const idx = (await e.pool.query("SELECT DISTINCT day_index FROM external_alpha_allowance")).rows;
    expect(idx).toHaveLength(1);
    expect(Math.abs(idx[0].day_index - today())).toBeLessThanOrEqual(1); // equals today unless the run straddles midnight
    // The next UTC day: yesterday's rows stop counting toward the daily limit but still count toward the lifetime cap.
    await e.pool.query("UPDATE external_alpha_allowance SET day_index=day_index-1");
    await e.pool.query("ALTER TABLE external_alpha_cohort_admission DISABLE TRIGGER external_alpha_cohort_admission_guard");
    await e.pool.query("UPDATE external_alpha_cohort_admission SET day_index=day_index-1");
    await e.pool.query("ALTER TABLE external_alpha_cohort_admission ENABLE TRIGGER external_alpha_cohort_admission_guard");
    await chat(budget, 21);
  });

  it("keeps isolated local owner allocations non-transferable; shared cohort ceilings are qualified separately", async () => {
    const a = await make(), b = await make();
    for (let i = 0; i < 10; i++) await chat(a.budget, i);
    await a.e.svc.issue(await a.e.seedWork(), files);
    await expect(chat(a.budget, 30)).rejects.toThrow(/exhausted|EXTERNAL_ALPHA_SHARED_EXHAUSTED/);
    // B is untouched by A's exhaustion and cannot borrow from it either.
    for (let i = 0; i < 10; i++) await chat(b.budget, i);
    await b.e.svc.issue(await b.e.seedWork(), files);
    await expect(chat(b.budget, 30)).rejects.toThrow(/exhausted|EXTERNAL_ALPHA_SHARED_EXHAUSTED/);
    const total = async (e: Env) => Number((await e.pool.query("SELECT sum(ceiling_microusd)::bigint s FROM external_alpha_allowance")).rows[0].s);
    expect((await total(a.e)) + (await total(b.e))).toBe(4_600_000);
  });
});
