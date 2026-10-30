// Post-delivery UX: retained progress projection, read-only status replies, and inert unfunded improvement proposals.
import { afterEach, expect, it, vi } from "vitest";
import { qualificationConversation } from "./conversation-model.ts";
import { createImprovementRecorder, ImprovementRefused, MAX_IMPROVEMENTS_PER_BASELINE } from "./improvement.ts";
import type { JournalEvent } from "./journal.ts";
import { describeProgress, projectProgress } from "./progress.ts";

const request = "Run the approved dashboard qualification";
const hex = (c: string) => c.repeat(64);
const candidate = (c: string) => ({ commit: c.repeat(40), tree: (c === "a" ? "b" : "a").repeat(40) });
const accepted = (stage: number, c: string): JournalEvent => ({ kind: "STAGE_ACCEPTED", stage, digest: hex("d"), candidate: candidate(c), ...(stage === 3 ? { buildArtifactSha256: hex("e") } : {}) });
const delivered: JournalEvent[] = [
  { kind: "STAGE_BOUND", stage: 1, workId: "w1", allowanceId: "a1" }, { kind: "OP_CLAIMED", stage: 1, key: "k1" }, { kind: "OP_SETTLED", stage: 1, key: "k1" },
  accepted(1, "1"), accepted(2, "2"), accepted(3, "3"), accepted(4, "4"),
  { kind: "DELIVERY_ACCEPTED", stage: 4, digest: hex("f"), verdictSha256: hex("c") },
];
const user = (text: string) => ({ role: "user", content: [{ type: "text", text }] });
const options = (text: string) => ({ prompt: [user(text)], tools: [{ type: "function", name: "qualification_journey", inputSchema: { type: "object", properties: {} } }] }) as any;
const text = (result: any) => result.content.map((p: any) => p.text ?? "").join("");
function converse(events: JournalEvent[] | Error, extra: Record<string, unknown> = {}) {
  const retained = vi.fn(async () => { if (events instanceof Error) throw events; return events; });
  const propose = vi.fn(async () => ({ workId: "00000000-0000-4000-8000-000000000001", created: true }));
  const conversation = qualificationConversation({ ownerId: "owner:Q1", approvedRequest: request, deliveryUrl: "https://dashboard.example.test/app",
    revalidate: async () => true, retained, improvements: { propose }, ...extra });
  return { retained, propose, model: conversation.model({ sessionId: "s", stepKey: "s:0" }) };
}
afterEach(() => vi.unstubAllGlobals());

it("projects retained facts only: empty, in flight with an unconfirmed operation, halted, verified-not-delivered and delivered", () => {
  expect(projectProgress([]).state).toBe("NOT_STARTED");
  const inFlight = projectProgress([{ kind: "STAGE_BOUND", stage: 1, workId: "w", allowanceId: "a" }, { kind: "OP_CLAIMED", stage: 1, key: "k" }]);
  expect(inFlight.state).toBe("IN_PROGRESS"); expect(inFlight.stages[0]).toMatchObject({ state: "IN_PROGRESS", uncertainOperations: 1 });
  expect(describeProgress(inFlight)).toContain("started but not confirmed; nothing is resent automatically");
  const halted = projectProgress([accepted(1, "1"), { kind: "OP_CLAIMED", stage: 2, key: "k" }, { kind: "HALTED", stage: 2, code: "QDEV_EXPOSURE_UNKNOWN" }]);
  expect(halted).toMatchObject({ state: "HALTED", haltedAt: 2, code: "QDEV_EXPOSURE_UNKNOWN" });
  expect(halted.stages.map(s => s.state)).toEqual(["ACCEPTED", "HALTED", "PENDING", "PENDING"]); expect(halted.baseline).toBeUndefined();
  const unlinked = projectProgress(delivered.filter(e => e.kind !== "DELIVERY_ACCEPTED"));
  expect(unlinked.state).toBe("VERIFIED_NOT_DELIVERED"); expect(unlinked.baseline).toBeUndefined();
  const done = projectProgress(delivered);
  expect(done.state).toBe("DELIVERED");
  expect(done.baseline).toEqual({ commit: "3".repeat(40), tree: "a".repeat(40), buildArtifactSha256: hex("e"), verdictSha256: hex("c"), deliverySha256: hex("f") });
});

it("a halt code that is not a safe code is never echoed", () => {
  expect(projectProgress([{ kind: "HALTED", stage: 1, code: "secret token abc" }]).code).toBe("QDEV_HALTED");
});

it("a status question returns retained progress with no execution tool call, no provider and no recorded proposal", async () => {
  const fetch = vi.fn(() => { throw Error("PROVIDER_REACHED"); }); vi.stubGlobal("fetch", fetch);
  const { model, propose } = converse(delivered);
  const result = await model.doGenerate(options("What is the status?"));
  expect(result.finishReason.unified).toBe("stop"); expect(result.content.some((p: any) => p.type === "tool-call")).toBe(false);
  expect(text(result)).toContain("delivery was confirmed"); expect(text(result)).toContain("https://dashboard.example.test/app");
  expect(text(result)).toContain("new funded scope"); expect(text(result)).toContain("still require their own authorization");
  expect(result.usage.outputTokens.total).toBe(0); expect(propose).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
});

it("an improvement request after confirmed delivery records one unfunded proposal bound to the accepted candidate", async () => {
  const { model, propose } = converse(delivered);
  const result = await model.doGenerate(options("Add a dark mode toggle to the dashboard"));
  expect(propose).toHaveBeenCalledTimes(1);
  expect(propose).toHaveBeenCalledWith({ request: "Add a dark mode toggle to the dashboard", baseline: expect.objectContaining({ commit: "3".repeat(40), deliverySha256: hex("f") }) });
  expect(result.finishReason.unified).toBe("stop"); expect(result.content.some((p: any) => p.type === "tool-call")).toBe(false);
  expect(text(result)).toContain("paused, unfunded improvement proposal"); expect(text(result)).toContain("Nothing was started");
  expect(text(result)).toContain("spent charter is not reused"); expect(text(result)).toContain("new funded scope");
});

it("improvement requests before confirmed delivery, or with no recorder, record nothing", async () => {
  for (const events of [[], delivered.slice(0, 4), delivered.filter(e => e.kind !== "DELIVERY_ACCEPTED")]) {
    const { model, propose } = converse(events);
    expect(text(await model.doGenerate(options("Add a dark mode toggle")))).toContain("only after this journey's delivery is confirmed");
    expect(propose).not.toHaveBeenCalled();
  }
  const { model } = converse(delivered, { improvements: undefined });
  expect(text(await model.doGenerate(options("Add a dark mode toggle")))).toContain("not enabled");
});

it("recorder refusals and failures are reported as not recorded without leaking internals", async () => {
  for (const [error, expected] of [[new ImprovementRefused("QDEV_IMPROVEMENT_LIMIT"), "maximum number"], [new ImprovementRefused("QDEV_IMPROVEMENT_STATE"), "not reported as recorded"],
    [Error("PRIVATE_DIAGNOSTIC postgres://secret"), "Nothing was started"]] as const) {
    const { model } = converse(delivered, { improvements: { propose: async () => { throw error; } } });
    const reply = text(await model.doGenerate(options("Fix the chart labels")));
    expect(reply).toContain(expected); expect(reply).not.toContain("PRIVATE_DIAGNOSTIC");
  }
});

it("an unreadable journal fails closed: nothing is recorded and the approved request is still the only execution path", async () => {
  const { model, propose } = converse(Error("PRIVATE_DIAGNOSTIC"));
  const reply = text(await model.doGenerate(options("Add dark mode")));
  expect(reply).toContain("unavailable"); expect(reply).not.toContain("PRIVATE_DIAGNOSTIC"); expect(propose).not.toHaveBeenCalled();
  const approved = await model.doGenerate(options(request));
  expect(approved.content).toEqual([expect.objectContaining({ type: "tool-call", toolName: "qualification_journey" })]);
});

it("the approved request still selects only the journey tool, even after delivery, and unrelated chat never records a proposal", async () => {
  const { model, propose } = converse(delivered);
  expect((await model.doGenerate(options(request))).content[0]).toMatchObject({ type: "tool-call", toolName: "qualification_journey" });
  expect(text(await model.doGenerate(options("hello there")))).toContain("delivery was confirmed"); expect(propose).not.toHaveBeenCalled();
});

it("without retained dependencies the conversation is exactly the prior single-request behavior", async () => {
  const model = qualificationConversation({ ownerId: "owner:Q1", approvedRequest: request, revalidate: async () => true }).model({ sessionId: "s", stepKey: "s:0" });
  expect(text(await model.doGenerate(options("Add dark mode")))).toBe(`This installation runs only its approved journey. Send: ${request}`);
});

// --- recorder over a faithful in-memory Work frontdoor (idempotent create, paused default) ---
function memoryStore() {
  const rows = new Map<string, any>(); const creates: any[] = [];
  return { creates, rows, async list() { return [...rows.values()]; },
    async create(value: any) {
      creates.push(value);
      const found = [...rows.values()].find(w => w.key === value.idempotencyKey);
      if (found) return { work: found, created: false };
      const work = { id: crypto.randomUUID(), key: value.idempotencyKey, title: value.title, objective: value.objective, lifecycle: "active", control: "paused", version: 1, maxCostUsd: value.maxCostUsd };
      rows.set(work.id, work); return { work, created: true };
    },
    async change(id: string, value: any) { const w = rows.get(id); w.control = "paused"; w.version++; return w; } };
}
const baseline = projectProgress(delivered).baseline!;
/** Storage-frontdoor stand-in: runs the action serialized (like the advisory-locked transaction) over a store with exact counts. */
function frontdoor(store: any) {
  let tail: Promise<unknown> = Promise.resolve();
  return { exclusive: <T>(_key: string, action: (s: any) => Promise<T>) => { const run = tail.then(() => action({
    has: async (key: string) => [...(store.rows?.values() ?? [])].some((w: any) => w.key === key),
    count: async (marker: string) => [...(store.rows?.values() ?? [])].filter((w: any) => w.objective.includes(marker)).length,
    create: (v: unknown) => store.create(v), change: (id: string, v: unknown) => store.change(id, v) })); tail = run.catch(() => undefined); return run; } };
}

it("the recorder creates a paused, minimum-cost Work whose objective binds the exact candidate and states nothing started", async () => {
  const store = memoryStore(), recorder = createImprovementRecorder({ ownerId: "owner:Q1", frontdoor: frontdoor(store) });
  const first = await recorder.propose({ baseline, request: "  Add   dark mode\n toggle " }), again = await recorder.propose({ baseline, request: "Add dark mode toggle" });
  expect(first.created).toBe(true); expect(again).toEqual({ workId: first.workId, created: false }); expect(store.rows.size).toBe(1);
  const created = store.creates[0];
  expect(created.maxCostUsd).toBe(0.01); expect(created.maxDurationSeconds).toBe(60); expect(created.repository).toBe("jaydubya818/myeve-beta-dashboard");
  for (const part of ["NOT STARTED, UNFUNDED", "3".repeat(40), baseline.buildArtifactSha256, baseline.verdictSha256, baseline.deliverySha256, "spent qualification charter is not reused", "new funded scope"])
    expect(created.objective).toContain(part);
  expect(created.idempotencyKey).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(created.criteria).toHaveLength(1); expect(created.criteria[0].method).toBe("human");
});

it("the recorder caps proposals per delivered candidate, rejects empty and oversized requests, and re-pauses a running Work", async () => {
  const store = memoryStore(), recorder = createImprovementRecorder({ ownerId: "owner:Q1", frontdoor: frontdoor(store) });
  for (let i = 0; i < MAX_IMPROVEMENTS_PER_BASELINE; i++) await recorder.propose({ baseline, request: `Improvement number ${i}` });
  await expect(recorder.propose({ baseline, request: "One more different improvement" })).rejects.toMatchObject({ code: "QDEV_IMPROVEMENT_LIMIT" });
  await expect(recorder.propose({ baseline, request: "Improvement number 0" })).resolves.toMatchObject({ created: false });
  for (const bad of ["   ", "x".repeat(2001)]) await expect(recorder.propose({ baseline, request: bad })).rejects.toMatchObject({ code: "QDEV_IMPROVEMENT_REQUEST" });
  const running = { ...memoryStore(), async create(value: any) { return { work: { id: "w", title: value.title, lifecycle: "active", control: "agent", version: 3 }, created: true }; },
    changed: [] as unknown[], async change(id: string, value: any) { this.changed.push(value); return { id, lifecycle: "active", control: "paused", version: 4 }; } };
  await createImprovementRecorder({ ownerId: "owner:Q1", frontdoor: frontdoor(running) }).propose({ baseline, request: "Another" });
  expect(running.changed).toEqual([{ operation: "pause", expectedVersion: 3 }]);
  const stuck = { ...memoryStore(), async create() { return { work: { id: "w", title: "t", lifecycle: "active", control: "agent", version: 1 }, created: true }; },
    async change(id: string) { return { id, lifecycle: "active", control: "agent", version: 2 }; } };
  await expect(createImprovementRecorder({ ownerId: "owner:Q1", frontdoor: frontdoor(stuck) }).propose({ baseline, request: "Another" })).rejects.toBeInstanceOf(ImprovementRefused);
});
