import { afterEach, describe, expect, it } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { digest } from "../engineering/contract.ts";
import { loadMigrations, runMigrations } from "../../scripts/migration-runner.ts";
import { ExternalAlphaAllowance } from "./allowance.ts";
import { SharedAlphaAccounting } from "./shared-accounting.ts";
import { readAlphaChatUsage } from "./usage.ts";
import { connection, Env } from "./work-test-fixture.ts";

// Pin for the NEW shared-accounting file only. The earlier shared-accounting*.sql files stay byte-identical.
export const SHARED_ACCESS_EXTENSION_SHA256 = "f10452663849d83106f259a5f5c78b087a4b646d5a8197755428da79140e53bf";
const sharedFiles = ["shared-accounting.sql", "shared-accounting-recovery.sql", "shared-accounting-zero-gap.sql", "shared-accounting-chat-only.sql"];
const extensionFile = "shared-accounting-access-extension.sql";
const sql = (file: string) => readFile(new URL(file, import.meta.url), "utf8");
const REASON = "T-1: owner-approved tester access extension";

describe("pinned shared-accounting access extension", () => {
  it("adds a new pinned file and leaves the hash-pinned chat-only file unchanged", async () => {
    expect(createHash("sha256").update(await sql(extensionFile)).digest("hex")).toBe(SHARED_ACCESS_EXTENSION_SHA256);
    expect(createHash("sha256").update(await sql("shared-accounting-chat-only.sql")).digest("hex")).toBe("c1ee56e72f20fae8e277a2bcada1644583dd3de0e9c69114f5d2b20eaca3cb14");
  });
});

describe.skipIf(!connection)("owner-approved external alpha access extension (default off, +14 days cap)", () => {
  const envs: Env[] = [];
  afterEach(async () => { await Promise.all(envs.splice(0).map(e => e.close())); }, 60000);
  async function fixtureChange(e: Env, text: string) {
    const c = await e.pool.connect();
    try { await c.query("BEGIN"); await c.query("SET LOCAL session_replication_role=replica"); await c.query(text); await c.query("COMMIT"); }
    catch (error) { await c.query("ROLLBACK"); throw error; } finally { c.release(); }
  }
  async function make() {
    const central = await Env.create(false, {}, false); envs.push(central);
    for (const file of sharedFiles) await central.pool.query(await sql(file));
    await central.pool.query(await sql(extensionFile));
    const cohortId = randomUUID();
    const a = await Env.create(true, { cohortId }); envs.push(a);
    const b = await Env.create(true, { cohortId, slot: "2", repository: a.policy.repository.slice(0, -1) + "2" }); envs.push(b);
    await central.pool.query("INSERT INTO external_alpha_cohort(id) VALUES($1)", [cohortId]);
    for (const e of [a, b]) {
      const token = e.policy.slot.repeat(64);
      await central.pool.query("INSERT INTO external_alpha_cohort_member(cohort_id,slot,owner_id,policy_sha256,credential_sha256) VALUES($1,$2,$3,$4,encode(sha256(convert_to($5,'UTF8')),'hex'))", [cohortId, e.policy.slot, e.owner, digest(e.policy), token]);
      e.db.externalAlphaAccounting = new SharedAlphaAccounting(central.db, token);
      await e.pool.query("INSERT INTO external_alpha_chat_only(owner_id,policy_sha256) VALUES($1,$2)", [e.owner, digest(e.policy)]);
    }
    await central.pool.query("UPDATE external_alpha_cohort SET activated_at=clock_timestamp()");
    const chat = (e: Env, id: string = randomUUID()) => new ExternalAlphaAllowance(e.db, e.policy).admit({ kind: "CHAT", bindingId: id, requestSha256: digest(id) });
    // Testers activated more than 120 hours ago (the T-1 situation). Fixture-only clock change.
    const expire = async () => {
      for (const e of [a, b]) await fixtureChange(e, "UPDATE external_alpha_policy SET created_at=clock_timestamp()-interval '130 hours',activated_at=clock_timestamp()-interval '121 hours'");
      await fixtureChange(central, "UPDATE external_alpha_cohort SET activated_at=clock_timestamp()-interval '121 hours'");
    };
    // Bounds computed in SQL so microsecond precision is exact.
    const at = async (e: Env, offset: string) => (await e.pool.query(`SELECT (activated_at+interval '120 hours'+interval '${offset}')::text AS t FROM external_alpha_policy`)).rows[0].t as string;
    const atCentral = async (offset: string) => (await central.pool.query(`SELECT (activated_at+interval '120 hours'+interval '${offset}')::text AS t FROM external_alpha_cohort`)).rows[0].t as string;
    const approve = async (e: Env, extendedUntil: string, over: Record<string, unknown> = {}) => (await e.pool.query("SELECT external_alpha_approve_access_extension($1::jsonb) AS r",
      [JSON.stringify({ approvalId: randomUUID(), ownerId: e.owner, policySha256: digest(e.policy), extendedUntil, approvedBy: "jay", reason: REASON, ...over })])).rows[0].r;
    const approveCentral = async (extendedUntil: string, over: Record<string, unknown> = {}) => (await central.pool.query("SELECT external_alpha_cohort_approve_access_extension($1::jsonb) AS r",
      [JSON.stringify({ approvalId: randomUUID(), cohortId, extendedUntil, approvedBy: "jay", reason: REASON, ...over })])).rows[0].r;
    const rows = async (e: Env, table: string) => (await e.pool.query(`SELECT row_to_json(t)::text AS r FROM ${table} t ORDER BY 1`)).rows.map((r: any) => r.r);
    const usageRows = async () => ({ allowance: await rows(a, "external_alpha_allowance"), operation: await rows(a, "external_alpha_operation"),
      admission: await rows(central, "external_alpha_cohort_admission"), dispatch: await rows(central, "external_alpha_cohort_dispatch") });
    return { central, cohortId, a, b, chat, expire, at, atCentral, approve, approveCentral, usageRows };
  }

  it("is off by default: NULL extension, unchanged 120-hour deadline, expiry and refusal", async () => {
    const { central, a, chat, expire } = await make();
    expect((await a.pool.query("SELECT extended_until FROM external_alpha_policy")).rows[0].extended_until).toBeNull();
    expect((await central.pool.query("SELECT extended_until FROM external_alpha_cohort")).rows[0].extended_until).toBeNull();
    const [{ local }] = (await a.pool.query("SELECT activated_at+interval '120 hours' AS local FROM external_alpha_policy")).rows;
    const [{ shared }] = (await central.pool.query("SELECT activated_at+interval '120 hours' AS shared FROM external_alpha_cohort")).rows;
    const allowance = await chat(a);
    expect(new Date(allowance.deadline).getTime()).toBeLessThanOrEqual(local.getTime());
    expect((await readAlphaChatUsage(a.db, a.policy)).expiresAt).toBe(new Date(Math.min(local.getTime(), shared.getTime())).toISOString());
    await expire();
    await expect(chat(a)).rejects.toThrow();
    expect((await readAlphaChatUsage(a.db, a.policy)).state).toBe("expired");
    // Every admission path now goes through the helper; only the helper/approval keep the literal.
    expect((await a.pool.query("SELECT proname FROM pg_proc WHERE prosrc LIKE '%120 hours%' AND proname LIKE 'external_alpha%' AND proname NOT LIKE 'external_alpha_cohort%' ORDER BY 1")).rows.map((r: any) => r.proname))
      .toEqual(["external_alpha_access_until", "external_alpha_approve_access_extension"]);
    expect((await central.pool.query("SELECT proname FROM pg_proc WHERE prosrc LIKE '%120 hours%' AND proname LIKE 'external_alpha_cohort%' ORDER BY 1")).rows.map((r: any) => r.proname))
      .toEqual(["external_alpha_cohort_access_until", "external_alpha_cohort_approve_access_extension"]);
  });

  it("honors an approved extension per tester only when both the app DB and the shared cohort are extended", async () => {
    const { a, b, chat, expire, at, atCentral, approve, approveCentral } = await make();
    await expire();
    await expect(chat(a)).rejects.toThrow();
    const untilA = await at(a, "7 days"), untilC = await atCentral("10 days");
    const approved = await approve(a, untilA);
    expect(approved).toMatchObject({ replayed: false, approved_by: "jay", reason: REASON, previous_extended_until: null });
    await expect(chat(a)).rejects.toThrow("SHARED_FENCED");
    await approveCentral(untilC);
    const allowance = await chat(a);
    expect(new Date(allowance.deadline).getTime()).toBeLessThanOrEqual(new Date(approved.accessUntil).getTime());
    const usage = await readAlphaChatUsage(a.db, a.policy);
    expect(usage.state).toBe("active");
    expect(usage.expiresAt).toBe(new Date(approved.accessUntil).toISOString());
    await expect(chat(b)).rejects.toThrow(); // Tester 2's app DB was not extended.
  });

  it("enforces the +14 day cap, forward-only moves and recorded owner approval on both databases", async () => {
    const { central, a, expire, at, atCentral, approve, approveCentral } = await make();
    await expire();
    await expect(a.pool.query("UPDATE external_alpha_policy SET extended_until=activated_at+interval '121 hours'")).rejects.toThrow("REQUIRES_OWNER_APPROVAL");
    await expect(central.pool.query("UPDATE external_alpha_cohort SET extended_until=activated_at+interval '121 hours'")).rejects.toThrow("REQUIRES_OWNER_APPROVAL");
    for (const offset of ["14 days 0.000001 seconds", "0 seconds", "30 minutes"]) {
      await expect(approve(a, await at(a, offset))).rejects.toThrow("OUT_OF_BOUNDS");
      await expect(approveCentral(await atCentral(offset))).rejects.toThrow("OUT_OF_BOUNDS");
    }
    await expect(approve(a, await at(a, "7 days"), { ownerId: randomUUID() })).rejects.toThrow("WRONG_OWNER");
    await expect(approve(a, await at(a, "7 days"), { reason: "short" })).rejects.toThrow("check constraint");
    expect((await approve(a, await at(a, "7 days"))).replayed).toBe(false);
    expect((await approve(a, await at(a, "14 days"))).previous_extended_until).not.toBeNull();
    expect((await approveCentral(await atCentral("14 days"))).replayed).toBe(false);
    await expect(approve(a, await at(a, "10 days"))).rejects.toThrow("OUT_OF_BOUNDS");
    await expect(a.pool.query("UPDATE external_alpha_policy SET extended_until=NULL")).rejects.toThrow("REQUIRES_OWNER_APPROVAL");
    // Even with triggers bypassed, the CHECK constraint caps the column.
    await expect(fixtureChange(a, "UPDATE external_alpha_policy SET extended_until=activated_at+interval '120 hours'+interval '14 days 1 second'")).rejects.toThrow("external_alpha_policy_extension_cap");
    await expect(fixtureChange(central, "UPDATE external_alpha_cohort SET extended_until=activated_at+interval '120 hours'+interval '14 days 1 second'")).rejects.toThrow("external_alpha_cohort_extension_cap");
    await a.pool.query("UPDATE external_alpha_policy SET revoked_at=clock_timestamp()");
    await expect(approve(a, await at(a, "14 days"))).rejects.toThrow("NOT_ACTIVE");
  });

  it("never changes activated_at and keeps the approval audit append-only", async () => {
    const { central, a, expire, at, atCentral, approve, approveCentral } = await make();
    await expire();
    const before = (await a.pool.query("SELECT activated_at::text AS t FROM external_alpha_policy")).rows[0].t;
    const beforeC = (await central.pool.query("SELECT activated_at::text AS t FROM external_alpha_cohort")).rows[0].t;
    await approve(a, await at(a, "3 days")); await approveCentral(await atCentral("3 days"));
    await expect(a.pool.query("UPDATE external_alpha_policy SET activated_at=clock_timestamp()")).rejects.toThrow("cannot be replaced or reset");
    await expect(central.pool.query("UPDATE external_alpha_cohort SET activated_at=clock_timestamp()")).rejects.toThrow("activation is immutable");
    expect((await a.pool.query("SELECT activated_at::text AS t FROM external_alpha_policy")).rows[0].t).toBe(before);
    expect((await central.pool.query("SELECT activated_at::text AS t FROM external_alpha_cohort")).rows[0].t).toBe(beforeC);
    for (const q of ["UPDATE external_alpha_access_extension SET reason='changed later by someone'", "DELETE FROM external_alpha_access_extension", "TRUNCATE external_alpha_access_extension"])
      await expect(a.pool.query(q)).rejects.toThrow("IMMUTABLE");
    for (const q of ["UPDATE external_alpha_cohort_access_extension SET reason='changed later by someone'", "DELETE FROM external_alpha_cohort_access_extension"])
      await expect(central.pool.query(q)).rejects.toThrow("IMMUTABLE");
  });

  it("leaves usage history and daily/lifetime charges untouched", async () => {
    const { a, chat, expire, at, atCentral, approve, approveCentral, usageRows } = await make();
    for (let i = 0; i < 10; i++) await chat(a);
    const before = await usageRows();
    expect(before.allowance).toHaveLength(10);
    await expire();
    await approve(a, await at(a, "5 days")); await approveCentral(await atCentral("5 days"));
    expect(await usageRows()).toEqual(before);
    await expect(chat(a)).rejects.toThrow("EXHAUSTED"); // Same UTC day: the 10-turn cap is not reset.
    expect(await usageRows()).toEqual(before);
  }, 60000);

  it("is idempotent: exact approval replay, reused ids refused, file re-apply and migration re-run are no-ops", async () => {
    const { central, a, chat, expire, at, atCentral, approve, approveCentral } = await make();
    await expire();
    const approvalId = randomUUID(), centralId = randomUUID(), until = await at(a, "4 days"), untilC = await atCentral("4 days");
    const first = await approve(a, until, { approvalId });
    expect(await approve(a, until, { approvalId })).toEqual({ ...first, replayed: true });
    await expect(approve(a, until, { approvalId, reason: "a different stated reason" })).rejects.toThrow("APPROVAL_REUSED");
    await approveCentral(untilC, { approvalId: centralId });
    expect((await approveCentral(untilC, { approvalId: centralId })).replayed).toBe(true);
    expect(await a.count("external_alpha_access_extension")).toBe(1);
    expect(await central.count("external_alpha_cohort_access_extension")).toBe(1);
    await central.pool.query(await sql(extensionFile));
    expect((await central.pool.query("SELECT extended_until::text AS t FROM external_alpha_cohort")).rows[0].t).toBe((await central.pool.query("SELECT extended_until::text AS t FROM external_alpha_cohort_access_extension")).rows[0].t);
    expect(await central.count("external_alpha_cohort_access_extension")).toBe(1);
    const ledger = await a.count("sofie_schema_migrations");
    await runMigrations({ query: async (q: string, p: unknown[]) => (await a.pool.query(q, p)).rows, transaction: async () => { throw Error("nothing should be pending"); } } as any, await loadMigrations(), () => {});
    expect(await a.count("sofie_schema_migrations")).toBe(ledger);
    await chat(a);
  });
});
