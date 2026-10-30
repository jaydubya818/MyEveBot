// The improvement recorder over the REAL owner Work frontdoor and tables (disposable local PostgreSQL). No provider, ledger, Relay or Factory call.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Env, connection } from "../external-alpha/work-test-fixture.ts";
import { WorkStore } from "../engineering/store.ts";
import { createImprovementRecorder, MAX_IMPROVEMENTS_PER_BASELINE } from "./improvement.ts";
import { InMemoryJournal, type JournalEvent } from "./journal.ts";
import { projectProgress } from "./progress.ts";

const hex = (c: string) => c.repeat(64);
const events: JournalEvent[] = [
  ...[1, 2, 3, 4].map(stage => ({ kind: "STAGE_ACCEPTED", stage, digest: hex("d"), candidate: { commit: String(stage).repeat(40), tree: "a".repeat(40) },
    ...(stage === 3 ? { buildArtifactSha256: hex("e") } : {}) }) as JournalEvent),
  { kind: "DELIVERY_ACCEPTED", stage: 4, digest: hex("f"), verdictSha256: hex("c") },
];

describe.skipIf(!connection)("post-delivery improvement proposals over the real Work frontdoor", () => {
  let env: Env;
  beforeEach(async () => { env = await Env.create(); });
  afterEach(async () => { await env?.close(); });

  it("records one paused, active, minimum-cost Work per request, idempotently, in the owner's scope only", async () => {
    const journal = new InMemoryJournal(); for (const event of events) await journal.append(event);
    const baseline = projectProgress(await journal.read()).baseline!;
    const recorder = createImprovementRecorder({ ownerId: env.owner, store: env.store });
    const first = await recorder.propose({ baseline, request: "Add a dark mode toggle" });
    expect(first.created).toBe(true);
    const again = await recorder.propose({ baseline, request: "  Add a dark   mode toggle " });
    expect(again).toEqual({ workId: first.workId, created: false });
    const work = await env.store.get(first.workId);
    expect(work).toMatchObject({ lifecycle: "active", control: "paused", maxCostUsd: 0.01, repository: "jaydubya818/myeve-beta-dashboard" });
    expect(work.objective).toContain("NOT STARTED, UNFUNDED"); expect(work.objective).toContain("3".repeat(40));
    expect(work.title.startsWith("Improvement proposal (unfunded) [" + baseline.deliverySha256.slice(0, 12) + "]")).toBe(true);
    expect((await env.store.list()).filter(w => w.title.startsWith("Improvement proposal"))).toHaveLength(1);
    const foreign = new WorkStore({ scopeId: "someone-else", actorId: "someone-else", scopeKind: "personal" }, env.db as any);
    expect(await foreign.list()).toHaveLength(0);
    await expect(foreign.get(first.workId)).rejects.toThrow("Work was not found");
    // Nothing was funded, started or retained as execution state by the proposal.
    const rows = await env.pool.query("SELECT count(*)::int AS n FROM engineering_execution WHERE work_id=$1", [first.workId]);
    expect(rows.rows[0].n).toBe(0);
  });

  it("enforces the per-candidate cap on the real table and leaves earlier proposals untouched", async () => {
    const baseline = projectProgress(events).baseline!, recorder = createImprovementRecorder({ ownerId: env.owner, store: env.store });
    for (let i = 0; i < MAX_IMPROVEMENTS_PER_BASELINE; i++) await recorder.propose({ baseline, request: `Improvement number ${i}` });
    await expect(recorder.propose({ baseline, request: "A sixth different improvement" })).rejects.toMatchObject({ code: "QDEV_IMPROVEMENT_LIMIT" });
    expect((await env.store.list()).filter(w => w.title.startsWith("Improvement proposal"))).toHaveLength(MAX_IMPROVEMENTS_PER_BASELINE);
    await expect(recorder.propose({ baseline, request: "Improvement number 2" })).resolves.toMatchObject({ created: false });
  });
});
