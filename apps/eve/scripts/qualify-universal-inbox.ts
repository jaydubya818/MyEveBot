/** Local-only fixture/performance evidence. No network, credentials or production writes. */
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { createFixtureInbox, FIXTURE_NOW, answerFor, decisionEvent } from "../lib/universal-inbox/fixtures.ts";
import { FixtureAttentionRepository } from "../lib/universal-inbox/fixture-repository.ts";
import { UniversalInbox } from "../lib/universal-inbox/service.ts";

const output = resolve(process.argv[2] ?? "../../docs/verification/beta-integration/regressions/inbox");
const fixture = await createFixtureInbox();
const ready = await fixture.inbox.list();
const needsYou = await fixture.inbox.list({ view: "needs_you" });
const waiting = await fixture.inbox.list({ view: "waiting" });
await writeFile(join(output, "beta-fixtures.json"), JSON.stringify({ mode: "fixture", version: ready.version, now: FIXTURE_NOW,
  productionReady: false, inbox: ready, needsYou, waiting, empty: { version: ready.version, items: [], nextCursor: null },
  errors: [{ status: 401, error: "unauthorized" }, { status: 409, error: "stale_action" }, { status: 503, error: "inbox_unavailable" }],
}, null, 2) + "\n");
fixture.repository.close();
const temp = await mkdtemp(join(tmpdir(), "inbox-perf-"));
const repository = new FixtureAttentionRepository(join(temp, "attention.sqlite"));
const inbox = new UniversalInbox("benchmark-owner", repository, () => FIXTURE_NOW);
const samples: Record<string, number[]> = {};
async function measure<T>(name: string, run: () => Promise<T>): Promise<T> {
  const start = performance.now(); const value = await run();
  (samples[name] ??= []).push(performance.now() - start); return value;
}
try {
  for (let n = 0; n < 2000; n++) await inbox.ingest({ ...decisionEvent(n), correlationId: `benchmark-${n}`,
    source: { ...decisionEvent(n).source, eventId: `benchmark-${n}` } });
  for (let n = 0; n < 100; n++) {
    const event = { ...decisionEvent(3000 + n), correlationId: `sample-${n}` };
    const item = await measure("creation", () => inbox.ingest(event));
    await measure("dedupe", () => inbox.ingest(event));
    await measure("inboxLoad", () => inbox.list({ limit: 50 }));
    await measure("needsYouQuery", () => inbox.list({ view: "needs_you", limit: 50 }));
    await measure("ownerResponse", () => inbox.respond(answerFor(item, `response-${n}`)));
    await measure("resolution", () => inbox.deliver({ accept: async response => `fixture-work:${response.id}` }));
  }
  const metrics = await repository.metrics("benchmark-owner");
  assert.equal(metrics.avoidableCoordinationRequests, 0);
  assert.equal((await repository.list("unrelated-owner", {}, FIXTURE_NOW)).items.length, 0);
  const timings = Object.fromEntries(Object.entries(samples).map(([name, values]) => {
    values.sort((a, b) => a - b);
    return [name, { samples: values.length, p50Ms: +values[49]!.toFixed(3), p95Ms: +values[94]!.toFixed(3), maxMs: +values.at(-1)!.toFixed(3) }];
  }));
  await writeFile(join(output, "performance.json"), JSON.stringify({ qualification: "local SQLite fixture only; not Neon or production latency", node: process.version,
    recordedAt: new Date().toISOString(), seededItems: 2000, sampledAdditionalItems: 100, pageLimit: 50, crossOwnerDisclosures: 0, metrics, timings }, null, 2) + "\n");
  console.log(JSON.stringify({ metrics, timings }));
} finally { repository.close(); await rm(temp, { recursive: true, force: true }); }
