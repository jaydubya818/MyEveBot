import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { digest } from "../engineering/contract.ts";
import { ExternalAlphaAllowance } from "./allowance.ts";
import { SharedAlphaAccounting, sharedAlphaAccounting } from "./shared-accounting.ts";
import { connection, Env, files } from "./work-test-fixture.ts";

describe.skipIf(!connection)("authoritative accounting across two isolated app databases (real PostgreSQL)", () => {
  const envs: Env[] = [];
  afterEach(async () => {
    await Promise.all(envs.splice(0).map((e) => e.close()));
  }, 60000);
  async function make(activate = true) {
    const central = await Env.create(false, {}, false); envs.push(central);
    await central.pool.query(await readFile(new URL("./shared-accounting.sql", import.meta.url), "utf8"));
      await central.pool.query(await readFile(new URL("./shared-accounting-recovery.sql", import.meta.url), "utf8"));
    const cohortId = randomUUID();
    const a = await Env.create(true, { cohortId }); envs.push(a);
    const b = await Env.create(true, { cohortId, slot: "2", repository: a.policy.repository.slice(0, -1) + "2" }); envs.push(b);
    await central.pool.query("INSERT INTO external_alpha_cohort(id)VALUES($1)", [cohortId]);
    for (const [e, token] of [[a, "1".repeat(64)], [b, "2".repeat(64)]] as const) {
      await central.pool.query(`INSERT INTO external_alpha_cohort_member(cohort_id,slot,owner_id,policy_sha256,credential_sha256)
        VALUES($1,$2,$3,$4,encode(sha256(convert_to($5,'UTF8')),'hex'))`, [cohortId, e.policy.slot, e.owner, digest(e.policy), token]);
      e.db.externalAlphaAccounting = new SharedAlphaAccounting(central.db, token);
    }
    if (activate) await central.pool.query("UPDATE external_alpha_cohort SET activated_at=clock_timestamp() WHERE id=$1", [cohortId]);
    expect(new Set([central.name, a.name, b.name]).size).toBe(3);
    const budget = (e: Env) => new ExternalAlphaAllowance(e.db, e.policy);
    const chat = (e: Env, id: string) => budget(e).admit({ kind: "CHAT", bindingId: id, requestSha256: digest(id) });
    const amount = async () => Number((await central.pool.query("SELECT COALESCE(sum(ceiling_microusd),0)::bigint s FROM external_alpha_cohort_admission WHERE cohort_id=$1", [cohortId])).rows[0].s);
    return { central, cohortId, a, b, budget, chat, amount };
  }
  it("installing the shared schema creates no enrolled or activated spending authority", async () => {
    const central = await Env.create(false, {}, false); envs.push(central);
    await central.pool.query(await readFile(new URL("./shared-accounting.sql", import.meta.url), "utf8"));
      await central.pool.query(await readFile(new URL("./shared-accounting-recovery.sql", import.meta.url), "utf8"));
    for (const table of ["external_alpha_cohort", "external_alpha_cohort_member", "external_alpha_cohort_admission", "external_alpha_cohort_dispatch"])
      expect(await central.count(table)).toBe(0);
  });
  it("enrolled credentials cannot create allowance while the shared cohort is inactive", async () => {
    const { central, a, b, chat, amount } = await make(false);
    for (const e of [a, b]) await expect(chat(e, "inactive")).rejects.toThrow("EXTERNAL_ALPHA_SHARED_FENCED");
    expect(await amount()).toBe(0);
    expect(await a.count("external_alpha_allowance")).toBe(0);
    expect(await b.count("external_alpha_allowance")).toBe(0);
    expect((await central.pool.query("SELECT activated_at FROM external_alpha_cohort")).rows[0].activated_at).toBeNull();
  });
  it("a revoked cohort denies both owners and cannot recycle retained admissions", async () => {
    const { central, cohortId, a, b, chat, budget, amount } = await make();
    const allowance = await chat(a, "before-revocation");
    const operation = await budget(a).reserve({ allowanceId: allowance.id, stepKey: "revoked:0", requestSha256: digest("operation"), microusd: 80000 });
    await budget(a).claimDispatch(operation);
    await central.pool.query("UPDATE external_alpha_cohort SET revoked_at=clock_timestamp() WHERE id=$1", [cohortId]);
    for (const e of [a, b]) await expect(chat(e, "after-revocation")).rejects.toThrow("EXTERNAL_ALPHA_SHARED_FENCED");
    await expect(budget(a).assertActive(allowance.id)).rejects.toThrow("EXTERNAL_ALPHA_SHARED_FENCED");
    // Known usage can be recorded after revocation; it releases no allocation.
    await budget(a).settle(operation, 10000, { text: "retained" });
    expect((await central.pool.query("SELECT state FROM external_alpha_cohort_dispatch")).rows[0].state).toBe("SETTLED");
    expect(await amount()).toBe(100000);
    await expect(chat(b, "still-revoked")).rejects.toThrow("EXTERNAL_ALPHA_SHARED_FENCED");
    await expect(central.pool.query("UPDATE external_alpha_cohort SET revoked_at=NULL WHERE id=$1", [cohortId])).rejects.toThrow(/immutable/);
  });
  it("a lost pre-provider lease acknowledgment cancels the unsent operation without redispatch or refund", async () => {
    const { central, a, b, chat, budget, amount } = await make();
    const allowance = await chat(a, "dispatch-ack-loss");
    let lose = true;
    a.db.externalAlphaAccounting = new SharedAlphaAccounting({ query: async (q, p) => {
      const rows = await central.db.query(q, p);
      if (lose && JSON.parse(p![0] as string).mode === "dispatch") { lose = false; throw Error("lost commit acknowledgment"); }
      return rows;
    } }, "1".repeat(64));
    const input = { allowanceId: allowance.id, stepKey: "ambiguous:0", requestSha256: digest("operation"), microusd: 80000 };
    await expect(budget(a).reserve(input)).rejects.toThrow("EXTERNAL_ALPHA_SHARED_UNAVAILABLE");
    await expect(budget(a).reserve(input)).rejects.toThrow(/No replay of ambiguous|EXTERNAL_ALPHA_NO_REDISPATCH/);
    await a.db.externalAlphaAccounting.reconcile(a.db, a.policy);
    expect(await a.count("external_alpha_operation")).toBe(1);
    expect((await central.pool.query("SELECT state FROM external_alpha_cohort_dispatch")).rows).toEqual([{ state: "NOT_DISPATCHED" }]);
    expect(await amount()).toBe(100000);
    await expect(chat(b, "after-no-send")).resolves.toBeTruthy();
    expect(await amount()).toBe(200000);
  });
  it("UNKNOWN is irrevocable even with an authenticated late settlement and retained known response", async () => {
    const { central, a, b, budget, chat, amount } = await make();
    const allowance = await chat(a, "irreversible-unknown");
    const operation = await budget(a).reserve({ allowanceId: allowance.id, stepKey: "unknown:0", requestSha256: digest("operation"), microusd: 80000 });
    await budget(a).claimDispatch(operation);
    await budget(a).unknown(operation);
    await expect(a.db.externalAlphaAccounting!.settle(a.db, a.policy, allowance.id, "sofie:unknown:0")).rejects.toThrow("EXTERNAL_ALPHA_SHARED_DENIED");
    await expect(budget(a).settle(operation, 10000, { text: "late" })).rejects.toThrow();
    await a.db.externalAlphaAccounting!.reconcile(a.db, a.policy);
    await expect(chat(b, "after-late-settle")).rejects.toThrow("EXTERNAL_ALPHA_SHARED_FENCED");
    expect((await central.pool.query("SELECT state FROM external_alpha_cohort_dispatch")).rows).toEqual([{ state: "UNKNOWN" }]);
    expect(await amount()).toBe(100000);
  });
  it("fails closed without a separate accounting configuration and never leaks credentials in errors", async () => {
    expect(() => sharedAlphaAccounting({ query: async () => [] }, { NODE_ENV: "test" })).toThrow("EXTERNAL_ALPHA_SHARED_CONFIGURATION_REQUIRED");
    const { a } = await make();
    const unavailable = new SharedAlphaAccounting({ query: async () => { throw Error("token=secret postgres://secret"); } }, "secret");
    await expect(unavailable.reserve(a.policy, { kind: "CHAT", bindingId: "x", requestSha256: digest("x") })).rejects.toThrow(/^EXTERNAL_ALPHA_SHARED_UNAVAILABLE$/);
  });
  it("serializes concurrent chat plus Work admissions from both app DBs at the $4.60 daily ceiling", async () => {
    const { a, b, chat, amount, central, cohortId } = await make();
    const wa = await a.seedWork(), wb = await b.seedWork();
    const outcomes = await Promise.allSettled([
      ...Array.from({ length: 24 }, (_, i) => chat(i % 2 ? a : b, `turn:${i}`)),
      a.svc.issue(wa, files), b.svc.issue(wb, files),
    ]);
    expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(22);
    expect(await amount()).toBe(4600000);
    const rows = (await central.pool.query("SELECT owner_id,sum(ceiling_microusd)::bigint amount FROM external_alpha_cohort_admission WHERE cohort_id=$1 GROUP BY owner_id", [cohortId])).rows;
    expect(rows.map((r: any) => r.amount)).toEqual(["2300000", "2300000"]);
    await expect(chat(a, "over:a")).rejects.toThrow("EXTERNAL_ALPHA_SHARED_EXHAUSTED");
    await expect(chat(b, "over:b")).rejects.toThrow("EXTERNAL_ALPHA_SHARED_EXHAUSTED");
  });
  it("retains one charge across duplicate delivery, lost central commit acknowledgment and lost local mirror acknowledgment", async () => {
    const { central, a, chat, amount } = await make();
    let lose = true;
    a.db.externalAlphaAccounting = new SharedAlphaAccounting({ query: async (q, p) => {
      const rows = await central.db.query(q, p);
      if (lose && JSON.parse(p![0] as string).mode === "reserve") { lose = false; throw Error("socket lost"); }
      return rows;
    } }, "1".repeat(64));
    await expect(chat(a, "same")).rejects.toThrow("EXTERNAL_ALPHA_SHARED_UNAVAILABLE");
    expect(await amount()).toBe(100000);
    expect(await a.count("external_alpha_allowance")).toBe(0);
    const ordinary = a.db;
    let loseMirror = true;
    const lossy = { externalAlphaAccounting: ordinary.externalAlphaAccounting, query: async (q: string, p?: unknown[]) => {
      const rows = await ordinary.query(q, p);
      if (loseMirror && /INSERT INTO external_alpha_shared_binding/.test(q)) { loseMirror = false; throw Error("mirror acknowledgment lost"); }
      return rows;
    } };
    const budget = new ExternalAlphaAllowance(lossy, a.policy);
    const input = { kind: "CHAT" as const, bindingId: "same", requestSha256: digest("same") };
    await expect(budget.admit(input)).rejects.toThrow("mirror acknowledgment lost");
    const replay = await Promise.all(Array.from({ length: 16 }, () => budget.admit(input)));
    expect(new Set(replay.map((r) => r.id)).size).toBe(1);
    expect(await amount()).toBe(100000);
    expect(await a.count("external_alpha_allowance")).toBe(1);
    expect(await a.count("external_alpha_shared_binding")).toBe(1);
  });
  it("keeps UNKNOWN exposed and fences the other owner even when the central UNKNOWN acknowledgment fails", async () => {
    const { central, a, b, budget, chat, amount } = await make();
    const allowance = await chat(a, "unknown");
    const op = await budget(a).reserve({ allowanceId: allowance.id, stepKey: "unknown:0", requestSha256: digest("op"), microusd: 80000 });
    await budget(a).claimDispatch(op);
    a.db.externalAlphaAccounting = new SharedAlphaAccounting({ query: async (q, p) => {
      if (JSON.parse(p![0] as string).mode === "fence") throw Error("unreachable");
      return central.db.query(q, p);
    } }, "1".repeat(64));
    await expect(budget(a).unknown(op)).rejects.toThrow("EXTERNAL_ALPHA_SHARED_UNAVAILABLE");
    expect((await a.pool.query("SELECT state,spent_microusd,reserved_microusd FROM external_alpha_operation")).rows[0]).toEqual({ state: "UNKNOWN", spent_microusd: null, reserved_microusd: "80000" });
    await expect(chat(b, "blocked")).rejects.toThrow("EXTERNAL_ALPHA_SHARED_FENCED");
    a.db.externalAlphaAccounting = new SharedAlphaAccounting(central.db, "1".repeat(64));
    await a.db.externalAlphaAccounting.reconcile(a.db, a.policy);
    await expect(chat(b, "still-blocked")).rejects.toThrow("EXTERNAL_ALPHA_SHARED_FENCED");
    expect(await amount()).toBe(100000);
    expect((await central.pool.query("SELECT state FROM external_alpha_cohort_dispatch")).rows[0].state).toBe("UNKNOWN");
  });
  it("recovers lost settlement after restart from durable local usage without redispatch or refund", async () => {
    const { central, a, b, budget, chat, amount } = await make();
    const allowance = await chat(a, "settled");
    const op = await budget(a).reserve({ allowanceId: allowance.id, stepKey: "settled:0", requestSha256: digest("op"), microusd: 80000 });
    await budget(a).claimDispatch(op);
    a.db.externalAlphaAccounting = new SharedAlphaAccounting({ query: async (q, p) => {
      if (JSON.parse(p![0] as string).mode === "settle") throw Error("unreachable");
      return central.db.query(q, p);
    } }, "1".repeat(64));
    await expect(budget(a).settle(op, 10000, { text: "retained" })).rejects.toThrow("EXTERNAL_ALPHA_SHARED_UNAVAILABLE");
    await expect(chat(b, "before-repair")).rejects.toThrow("EXTERNAL_ALPHA_SHARED_FENCED");
    a.db.externalAlphaAccounting = new SharedAlphaAccounting(central.db, "1".repeat(64));
    await a.db.externalAlphaAccounting.reconcile(a.db, a.policy);
    await chat(b, "after-repair");
    expect(await amount()).toBe(200000);
    const replay = await budget(a).reserve({ allowanceId: allowance.id, stepKey: "settled:0", requestSha256: digest("op"), microusd: 80000 });
    expect(replay.state).toBe("SETTLED");
    expect(replay.result).toEqual({ text: "retained" });
    expect(await a.count("external_alpha_operation")).toBe(1);
  });
  it("rejects cross-owner, wrong-policy, third-slot and changed-request reservations without borrowing", async () => {
    const { central, a, b, chat } = await make();
    const ledger = a.db.externalAlphaAccounting!;
    await expect(ledger.reserve(b.policy, { kind: "CHAT", bindingId: "cross", requestSha256: digest("x") })).rejects.toThrow("EXTERNAL_ALPHA_SHARED_DENIED");
    await expect(ledger.reserve({ ...a.policy, slot: "2" }, { kind: "CHAT", bindingId: "cross", requestSha256: digest("x") })).rejects.toThrow("EXTERNAL_ALPHA_SHARED_DENIED");
    await expect(central.pool.query("INSERT INTO external_alpha_cohort_member(cohort_id,slot,owner_id,policy_sha256,credential_sha256)VALUES($1,'3',$2,$3,$4)", [a.policy.cohortId, randomUUID(), digest("x"), digest("y")])).rejects.toThrow(/check constraint/);
    await chat(a, "fixed");
    await expect(ledger.reserve(a.policy, { kind: "CHAT", bindingId: "fixed", requestSha256: digest("changed") })).rejects.toThrow("EXTERNAL_ALPHA_SHARED_BINDING_CHANGED");
    await expect(central.pool.query("INSERT INTO external_alpha_cohort(id)VALUES($1)", [randomUUID()])).rejects.toThrow(/unique constraint/);
  });
  it("allows restricted accounting callers only the authenticated function and denies raw tables or schema creation", async () => {
    const { central, a } = await make();
    const role = "ea_accounting_" + randomUUID().replaceAll("-", "");
    await central.pool.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
    await central.pool.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
    await central.pool.query(`GRANT EXECUTE ON FUNCTION external_alpha_cohort_call(jsonb) TO ${role}`);
    const restricted = {
      query: async (q: string, p?: unknown[]) => {
        const client = await central.pool.connect();
        try {
          await client.query("BEGIN"); await client.query(`SET LOCAL ROLE ${role}`);
          const rows = (await client.query(q, p)).rows;
          await client.query("COMMIT"); return rows;
        } catch (error) { await client.query("ROLLBACK"); throw error; }
        finally { client.release(); }
      },
    };
    try {
      const ledger = new SharedAlphaAccounting(restricted, "1".repeat(64));
      await expect(ledger.reserve(a.policy, { kind: "CHAT", bindingId: "restricted", requestSha256: digest("restricted") })).resolves.toMatchObject({ state: "RESERVED" });
      await expect(restricted.query("SELECT * FROM external_alpha_cohort_member")).rejects.toThrow(/permission denied/);
      await expect(restricted.query("UPDATE external_alpha_cohort_admission SET state='BOUND'")).rejects.toThrow(/permission denied/);
      await expect(restricted.query("CREATE TABLE forbidden() ")).rejects.toThrow(/permission denied/);
      await expect(new SharedAlphaAccounting(restricted, "f".repeat(64)).reserve(a.policy, { kind: "CHAT", bindingId: "bad-token", requestSha256: digest("bad-token") })).rejects.toThrow("EXTERNAL_ALPHA_SHARED_DENIED");
    } finally {
      await central.pool.query(`REVOKE ALL ON FUNCTION external_alpha_cohort_call(jsonb) FROM ${role}`);
      await central.pool.query(`REVOKE ALL ON SCHEMA public FROM ${role}`);
      await central.pool.query(`DROP ROLE ${role}`);
    }
  });
  it("preserves cancelled and expired reservations across UTC rollover and enforces the $23 trial cap", async () => {
    const { central, cohortId, a, b, chat, amount } = await make();
    const today = Math.floor(Date.now() / 86400000);
    // Historical whole reservations remain charged regardless of whether an
    // operation ever started. Yesterday does not count against today's quota.
    for (const e of [a, b]) {
      for (let day = today - 4; day < today; day++) {
        for (const kind of ["CHAT", "WORK"] as const) {
          const count = kind === "CHAT" ? 10 : 1;
          for (let i = 0; i < count; i++) await central.pool.query(`INSERT INTO external_alpha_cohort_admission(id,cohort_id,owner_id,policy_sha256,kind,binding_sha256,request_sha256,day_index,ceiling_microusd,deadline)
            VALUES($1,$2,$3,$4,$5,$6,$6,$7,$8,clock_timestamp()-interval '1 day')`, [randomUUID(), cohortId, e.owner, digest(e.policy), kind, digest(`${e.owner}:${day}:${kind}:${i}`), day, kind === "CHAT" ? 100000 : 1300000]);
        }
      }
    }
    expect(await amount()).toBe(18400000);
    await Promise.all([a, b].flatMap((e) => Array.from({ length: 10 }, (_, i) => chat(e, `last:${i}`))));
    const wa = await a.svc.issue(await a.seedWork(), files), wb = await b.svc.issue(await b.seedWork(), files);
    await a.svc.finish(wa.id, "CANCELLED"); await b.svc.finish(wb.id, "EXPIRED");
    expect(await amount()).toBe(23000000);
    // Simulated next UTC day in disposable data: the lifetime ceiling still
    // denies after daily counters have rolled over. This cannot run in runtime.
    await central.pool.query("ALTER TABLE external_alpha_cohort_admission DISABLE TRIGGER external_alpha_cohort_admission_guard");
    await central.pool.query("UPDATE external_alpha_cohort_admission SET day_index=day_index-1");
    await central.pool.query("ALTER TABLE external_alpha_cohort_admission ENABLE TRIGGER external_alpha_cohort_admission_guard");
    await expect(chat(a, "after-trial")).rejects.toThrow("EXTERNAL_ALPHA_SHARED_EXHAUSTED");
    await expect(chat(b, "after-trial")).rejects.toThrow("EXTERNAL_ALPHA_SHARED_EXHAUSTED");
    expect(await amount()).toBe(23000000);
  });
});
