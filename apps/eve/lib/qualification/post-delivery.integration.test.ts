// The improvement recorder over the REAL owner Work frontdoor and tables (disposable local PostgreSQL). No provider, ledger, Relay or Factory call.
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Env, connection } from "../external-alpha/work-test-fixture.ts";
import { WorkStore, type WorkDatabase } from "../engineering/store.ts";
import { createImprovementRecorder, MAX_IMPROVEMENTS_PER_BASELINE } from "./improvement.ts";
import { workImprovementFrontdoor } from "./improvement-store.ts";
import { InMemoryJournal, type JournalEvent } from "./journal.ts";
import { projectProgress } from "./progress.ts";

const hex = (c: string) => c.repeat(64);
const events: JournalEvent[] = [
  ...[1, 2, 3, 4].map(stage => ({ kind: "STAGE_ACCEPTED", stage, digest: hex("d"), candidate: { commit: String(stage).repeat(40), tree: "a".repeat(40) },
    ...(stage === 3 ? { buildArtifactSha256: hex("e") } : {}) }) as JournalEvent),
  { kind: "DELIVERY_ACCEPTED", stage: 4, digest: hex("f"), verdictSha256: hex("c") },
];
const baseline = projectProgress(events).baseline!;
const otherBaseline = { ...baseline, deliverySha256: hex("9") };
const count = (works: Array<{ title: string }>) => works.filter(w => w.title.startsWith("Improvement proposal")).length;

describe.skipIf(!connection)("post-delivery improvement proposals over the real Work frontdoor", () => {
  let env: Env, database: WorkDatabase, recorder: ReturnType<typeof createImprovementRecorder>;
  beforeEach(async () => {
    env = await Env.create();
    // A pinned-connection transaction, as the production capability Work database provides.
    database = { ...env.db, atomic: async action => {
      const client = await env.pool.connect();
      try { await client.query("BEGIN"); const result = await action({ query: async (sql, values) => (await client.query(sql, values)).rows }); await client.query("COMMIT"); return result; }
      catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
    } };
    recorder = createImprovementRecorder({ ownerId: env.owner, frontdoor: workImprovementFrontdoor(env.owner, database) });
  });
  afterEach(async () => { await env?.close(); });

  it("records one paused, active, minimum-cost Work per request, idempotently, in the owner's scope only", async () => {
    const first = await recorder.propose({ baseline, request: "Add a dark mode toggle" });
    expect(first.created).toBe(true);
    expect(await recorder.propose({ baseline, request: "  Add a dark   mode toggle " })).toEqual({ workId: first.workId, created: false });
    const work = await env.store.get(first.workId);
    expect(work).toMatchObject({ lifecycle: "active", control: "paused", maxCostUsd: 0.01, repository: "jaydubya818/myeve-beta-dashboard" });
    expect(work.objective).toContain("NOT STARTED, UNFUNDED"); expect(work.objective).toContain("3".repeat(40)); expect(work.objective).toContain(`delivery ${baseline.deliverySha256}`);
    expect(count(await env.store.list())).toBe(1);
    const foreign = new WorkStore({ scopeId: "someone-else", actorId: "someone-else", scopeKind: "personal" }, env.db as any);
    expect(await foreign.list()).toHaveLength(0);
    await expect(foreign.get(first.workId)).rejects.toThrow("Work was not found");
    expect((await env.pool.query("SELECT count(*)::int AS n FROM engineering_execution WHERE work_id=$1", [first.workId])).rows[0].n).toBe(0);
  });

  it("serial cap: the sixth distinct request for one candidate is refused; repeats and other candidates are unaffected", async () => {
    for (let i = 0; i < MAX_IMPROVEMENTS_PER_BASELINE; i++) await recorder.propose({ baseline, request: `Improvement number ${i}` });
    await expect(recorder.propose({ baseline, request: "A sixth different improvement" })).rejects.toMatchObject({ code: "QDEV_IMPROVEMENT_LIMIT" });
    expect(count(await env.store.list())).toBe(MAX_IMPROVEMENTS_PER_BASELINE);
    await expect(recorder.propose({ baseline, request: "Improvement number 2" })).resolves.toMatchObject({ created: false });
    await expect(recorder.propose({ baseline: otherBaseline, request: "Improvement number 0" })).resolves.toMatchObject({ created: true });
  });

  it("concurrent distinct requests cannot exceed the cap, and concurrent identical requests collapse to one Work", async () => {
    const results = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => recorder.propose({ baseline, request: `Concurrent improvement ${i}` })));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(MAX_IMPROVEMENTS_PER_BASELINE);
    expect(results.filter(r => r.status === "rejected").map(r => (r as PromiseRejectedResult).reason.code)).toEqual(Array(3).fill("QDEV_IMPROVEMENT_LIMIT"));
    expect((await env.pool.query("SELECT count(*)::int AS n FROM engineering_work WHERE title LIKE 'Improvement proposal%'")).rows[0].n).toBe(MAX_IMPROVEMENTS_PER_BASELINE);
    const same = await Promise.all(Array.from({ length: 5 }, () => recorder.propose({ baseline: otherBaseline, request: "One identical request" })));
    expect(new Set(same.map(r => r.workId)).size).toBe(1); expect(same.filter(r => r.created)).toHaveLength(1);
  });

  it("the cap is exact over the whole owner history, not the 100 most recently updated Works", async () => {
    for (let i = 0; i < MAX_IMPROVEMENTS_PER_BASELINE; i++) await recorder.propose({ baseline, request: `Old improvement ${i}` });
    // 105 newer unrelated Works push every proposal out of WorkStore.list()'s 100-row window.
    for (let i = 0; i < 105; i++) await env.store.create({ title: `Other ${i}`, objective: "unrelated", repository: "fixture/repo", maxCostUsd: 1, maxDurationSeconds: 60, idempotencyKey: randomUUID(),
      criteria: [{ id: randomUUID(), statement: "x", method: "human" }] });
    expect(count(await env.store.list())).toBe(0);
    await expect(recorder.propose({ baseline, request: "Beyond the old history" })).rejects.toMatchObject({ code: "QDEV_IMPROVEMENT_LIMIT" });
    await expect(recorder.propose({ baseline, request: "Old improvement 1" })).resolves.toMatchObject({ created: false });
  });

  it("fails closed when the Work database cannot provide a pinned transaction", async () => {
    const plain = createImprovementRecorder({ ownerId: env.owner, frontdoor: workImprovementFrontdoor(env.owner, env.db as any) });
    await expect(plain.propose({ baseline, request: "Add dark mode" })).rejects.toMatchObject({ code: "QDEV_IMPROVEMENT_STATE" });
    expect(count(await env.store.list())).toBe(0);
  });
});
