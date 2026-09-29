import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { approvalItem, externalMessage, relayMessage, reminderOccurrence, workEvent } from "./adapters.ts";
import { approvalConsumer } from "./approval-consumer.ts";
import { createInboxApi } from "./api.ts";
import { eventSchema } from "./contracts.ts";
import { FixtureAttentionRepository } from "./fixture-repository.ts";
import { UniversalInbox } from "./service.ts";
import { FIXTURE_NOW, answerFor, decisionEvent, fixtureApproval, fixtureContext, fixtureDecision, fixtureRelay } from "./fixtures.ts";

const stores: FixtureAttentionRepository[] = [];
const dirs: string[] = [];
function setup(owner = "owner-a", path = ":memory:") {
  const repository = new FixtureAttentionRepository(path); stores.push(repository);
  return { repository, inbox: new UniversalInbox(owner, repository, () => FIXTURE_NOW) };
}
function directory() { const path = mkdtempSync(join(tmpdir(), "attention-test-")); dirs.push(path); return path; }
afterEach(() => { for (const store of stores.splice(0)) { try { store.close(); } catch {} } for (const path of dirs.splice(0)) rmSync(path, { recursive: true, force: true }); });

it("runs the multi-source Golden Journey with one correlated item and no coordination debt", async () => {
  const { inbox, repository } = setup();
  const received = await inbox.ingest(relayMessage(fixtureRelay, fixtureContext));
  expect(received.needsYou).toBe(false);
  for (let sequence = 2; sequence < 8; sequence++) expect(workEvent({ id: `internal-${sequence}`, state: "internal", title: "Verification started", summary: "", at: FIXTURE_NOW }, { ...fixtureContext, sequence })).toBeNull();
  expect((await inbox.list({ view: "needs_you" })).items).toHaveLength(0);
  const decision = await inbox.ingest(decisionEvent(8));
  expect(decision.id).toBe(received.id);
  expect((await inbox.list({ view: "needs_you" })).items).toHaveLength(1);
  const answer = await inbox.respond(answerFor(decision));
  const work = { accept: vi.fn(async () => "work-continued-once") };
  await inbox.deliver(work);
  const result = await inbox.ingest(workEvent({ id: "result-1", state: "completed", title: "Work completed", summary: "Saved result", at: FIXTURE_NOW }, { ...fixtureContext, sequence: 9 })!);
  expect(result.id).toBe(received.id); expect(result.kind).toBe("RESULT"); expect(result.needsYou).toBe(false);
  expect((await inbox.list()).items).toHaveLength(1);
  expect((await inbox.list({ view: "needs_you" })).items).toHaveLength(0);
  expect(work.accept).toHaveBeenCalledWith(expect.objectContaining({ id: answer.id, workId: "fixture-work", answer: "A", ownerId: "owner-a" }));
  expect(await repository.metrics("owner-a")).toEqual({ necessaryInterventions: 1, avoidableCoordinationRequests: 0 });
  expect(await repository.evidence("owner-a", result.id)).toHaveLength(3);
});

it.each(["relay", "email", "slack", "webhook", "notification", "reminder"] as const)("dedupes %s deliveries, retaining evidence counts", async system => {
  const { inbox, repository } = setup();
  const event = eventSchema.parse({ ...decisionEvent(), action: null, kind: "MESSAGE", source: { ...decisionEvent().source, system } });
  const results = await Promise.all(Array.from({ length: 12 }, () => inbox.ingest(event)));
  expect(new Set(results.map(result => result.id)).size).toBe(1);
  expect((await inbox.list()).items).toHaveLength(1);
  expect((await repository.evidence("owner-a", results[0]!.id))[0]!.deliveries).toBe(12);
  await expect(inbox.ingest({ ...event, summary: "changed under same source id" })).rejects.toThrow("SOURCE_EVENT_ID_CONFLICT");
});

it("keeps account and owner identities separate even for identical source IDs", async () => {
  const { inbox, repository } = setup();
  const a = await inbox.ingest(decisionEvent());
  const other = new UniversalInbox("owner-b", repository, () => FIXTURE_NOW);
  const b = await other.ingest(decisionEvent());
  expect(a.id).not.toBe(b.id);
  await expect(other.get(a.id)).rejects.toThrow("NOT_FOUND");
  await expect(other.respond(answerFor(a))).rejects.toThrow("NOT_FOUND");
  await expect(other.mark(a.id, "mark_read", a.revision)).rejects.toThrow("NOT_FOUND");
  expect(await repository.evidence("owner-b", a.id)).toEqual([]);
  expect((await other.list()).items.map(item => item.ownerId)).toEqual(["owner-b"]);
  const c = await inbox.ingest({ ...decisionEvent(), correlationId: "account-b:work", source: { ...decisionEvent().source, accountId: "account-b" } });
  expect(c.id).not.toBe(a.id);
});

it("preserves stale source evidence without resurrecting or clearing owner attention", async () => {
  const { inbox, repository } = setup();
  const action = await inbox.ingest(decisionEvent(10));
  const earlier = eventSchema.parse({ ...decisionEvent(1), action: null, kind: "MESSAGE" });
  expect((await inbox.ingest(earlier)).actionBinding).toBe(action.actionBinding);
  const informational = { ...earlier, sequence: 11, source: { ...earlier.source, eventId: "info-11" } };
  expect((await inbox.ingest(informational)).needsYou).toBe(true);
  const settled = await inbox.ingest({ ...earlier, sequence: 12, disposition: "supersede", source: { ...earlier.source, eventId: "settled" } });
  expect(settled.status).toBe("SUPERSEDED");
  await expect(inbox.respond(answerFor(action))).rejects.toThrow("STALE_ACTION");
  expect((await inbox.ingest(decisionEvent(13))).needsYou).toBe(false);
  expect(await repository.evidence("owner-a", action.id)).toHaveLength(5);
});

it("cancels pending response on supersession and never calls Work", async () => {
  const { inbox, repository } = setup();
  const action = await inbox.ingest(decisionEvent());
  await inbox.respond(answerFor(action));
  await inbox.ingest({ ...decisionEvent(3), action: null, disposition: "supersede" });
  const consumer = { accept: vi.fn(async () => "unexpected") };
  expect(await inbox.deliver(consumer)).toBe(0);
  expect(await repository.pending("owner-a", 10)).toEqual([]);
  expect(consumer.accept).not.toHaveBeenCalled();
});

it("requires a new episode for a changed action and never silently changes Work", async () => {
  const { inbox } = setup(); await inbox.ingest(decisionEvent());
  await expect(inbox.ingest({ ...decisionEvent(3), action: { ...fixtureDecision, options: ["C", "D"] } })).rejects.toThrow("ACTION_REQUIRES_NEW_EPISODE");
  await expect(inbox.ingest({ ...decisionEvent(3), workId: "other-work" })).rejects.toThrow("WORK_LINK_CHANGED");
  const next = await inbox.ingest({ ...decisionEvent(3), episode: 2, action: { ...fixtureDecision, id: "next-choice" } });
  expect(next.needsYou).toBe(true);
});

it("records answers atomically, rejects stale/changed answers, and dedupes double submission", async () => {
  const { inbox } = setup(); const action = await inbox.ingest(decisionEvent());
  await expect(inbox.respond({ ...answerFor(action), answer: "invalid" })).rejects.toThrow("INVALID_CHOICE");
  const [a, b] = await Promise.all([inbox.respond(answerFor(action)), inbox.respond(answerFor(action))]);
  expect(a.id).toBe(b.id); expect((await inbox.get(action.id)).status).toBe("WAITING");
  await expect(inbox.respond({ ...answerFor(action), answer: "B" })).rejects.toThrow("RESPONSE_ID_CONFLICT");
  await expect(inbox.respond(answerFor(action, "different-key"))).rejects.toThrow("STALE_ACTION");
});

it("keeps read state independent from action state and refuses dismissal of required action", async () => {
  const { inbox } = setup(); const action = await inbox.ingest(decisionEvent());
  await expect(inbox.mark(action.id, "dismiss", action.revision)).rejects.toThrow("ACTION_NOT_AVAILABLE");
  const read = await inbox.mark(action.id, "mark_read", action.revision);
  expect(read.needsYou).toBe(true); expect(read.notification).toBe("READ");
  const unread = await inbox.mark(read.id, "mark_unread", read.revision);
  expect(unread.needsYou).toBe(true); expect(unread.notification).toBe("UNREAD");
  await expect(inbox.respond(answerFor(action))).rejects.toThrow("STALE_ACTION");
});

it("filters expired actions without relying on a sweeper", async () => {
  const { inbox } = setup();
  const item = await inbox.ingest({ ...decisionEvent(), action: { ...fixtureDecision, expiresAt: "2026-09-26T12:00:00.000Z" } });
  expect(item.needsYou).toBe(false);
  expect((await inbox.list({ view: "needs_you" })).items).toEqual([]);
  await expect(inbox.respond(answerFor(item))).rejects.toThrow("STALE_ACTION");
});

it("measures avoidable coordination requests while excluding them from Needs You", async () => {
  const { inbox, repository } = setup();
  const item = await inbox.ingest({ ...decisionEvent(), action: { ...fixtureDecision, reason: "internal_coordination", involvement: "AVOIDABLE_COORDINATION" } });
  expect(item.needsYou).toBe(false);
  expect(await repository.metrics("owner-a")).toEqual({ necessaryInterventions: 0, avoidableCoordinationRequests: 1 });
});

it("orders by transparent priority and uses bounded stable pages", async () => {
  const { inbox } = setup();
  for (let n = 0; n < 6; n++) await inbox.ingest({ ...decisionEvent(n), correlationId: `item-${n}`, priority: { blockingActiveWork: n === 4, ownerRequested: n === 2 } });
  const first = await inbox.list({ limit: 2 }); expect(first.items[0]!.correlationId).toBe("item-4"); expect(first.items[1]!.correlationId).toBe("item-2");
  const second = await inbox.list({ limit: 2, cursor: first.nextCursor! });
  const third = await inbox.list({ limit: 2, cursor: second.nextCursor! });
  expect(new Set([...first.items, ...second.items, ...third.items].map(item => item.id)).size).toBe(6);
  expect(third.nextCursor).toBeNull();
  await expect(inbox.list({ limit: 101 })).rejects.toThrow();
  await expect(inbox.list({ cursor: "malformed" })).rejects.toThrow();
});

it("normalizes messages and reminder occurrences without new provider authority or schedules", async () => {
  const relay = relayMessage(fixtureRelay, fixtureContext);
  expect(relay.action).toBeNull(); expect(relay.source.grantId).toBe("peer-grant");
  const external = externalMessage({ provider: "email", id: "1", sender: "sender", threadId: "thread", timestamp: FIXTURE_NOW, subject: "Subject", text: "Body", reference: "provider:1", attachments: [{ id: "a", name: "file", reference: "provider:a" }] }, fixtureContext);
  expect(external.source.attachments).toHaveLength(1);
  expect(reminderOccurrence({ id: "r", prompt: "Follow up", scheduledFor: "2026-10-01T00:00:00Z", now: FIXTURE_NOW }, fixtureContext)).toBeNull();
  const due = reminderOccurrence({ id: "r", prompt: "Follow up", scheduledFor: FIXTURE_NOW, now: FIXTURE_NOW }, fixtureContext)!;
  expect(due.kind).toBe("REMINDER"); expect(due.action).toBeNull();
  expect(workEvent({ id: "retry", state: "retryable_failure", title: "Retrying", summary: "", at: FIXTURE_NOW }, fixtureContext)).toBeNull();
});

it("delegates approval to canonical authority and reconciles an interrupted canonical write", async () => {
  const { inbox } = setup(); const item = await inbox.ingest(approvalItem(fixtureApproval, fixtureContext));
  let canonical = { ...fixtureApproval };
  const authority = { get: vi.fn(async () => canonical), decide: vi.fn(async () => { canonical = { ...canonical, status: "approved", decision: "approved" }; throw new Error("connection lost after commit"); }) };
  const work = { accept: vi.fn(async () => "canonical-work-receipt") };
  await inbox.respond({ ...answerFor(item), answer: "approved" });
  expect(authority.decide).not.toHaveBeenCalled(); // Saving an answer grants nothing.
  await inbox.deliver(approvalConsumer(authority, work));
  expect(authority.decide).toHaveBeenCalledWith(expect.objectContaining({ ownerId: "owner-a", id: fixtureApproval.id, bindingHash: fixtureApproval.bindingHash, decision: "approved" }));
  expect(work.accept).toHaveBeenCalledTimes(1);
});

it.each(["expired", "invalidated", "denied"] as const)("fails closed for canonical approval status %s", async status => {
  const { inbox } = setup(); const item = await inbox.ingest(approvalItem(fixtureApproval, fixtureContext));
  await inbox.respond({ ...answerFor(item), answer: "approved" });
  const authority = { get: vi.fn(async () => ({ ...fixtureApproval, status })), decide: vi.fn() };
  const work = { accept: vi.fn() };
  await expect(inbox.deliver(approvalConsumer(authority, work))).rejects.toThrow("CANONICAL_APPROVAL_NOT_APPLIED");
  expect(authority.decide).not.toHaveBeenCalled(); expect(work.accept).not.toHaveBeenCalled();
});

it("exposes an owner-scoped API with no arbitrary source ingestion or authority endpoint", async () => {
  const { inbox, repository } = setup(); const item = await inbox.ingest(decisionEvent());
  const api = createInboxApi({ sourceAuthority: { admit: async () => null, canRead: async () => true }, repository, authenticate: async request => request.headers.get("authorization") === "owner-a" ? { id: "owner-a" } : null, clock: () => FIXTURE_NOW });
  const request = (body?: unknown, headers = {}) => new Request("https://myeve.test/api/inbox", { method: body ? "POST" : "GET", headers: { authorization: "owner-a", origin: "https://myeve.test", ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
  expect((await api(request(undefined, { authorization: "unknown" }))).status).toBe(401);
  expect((await api(request(answerFor(item), { origin: "https://evil.test" }))).status).toBe(403);
  expect((await api(request({ ...answerFor(item), ownerId: "owner-b" }))).status).toBe(400);
  expect((await api(request(answerFor(item)))).status).toBe(202);
  expect((await api(request())).headers.get("cache-control")).toBe("no-store");
  expect((await api(request({ source: "forged" }))).status).toBe(400);
});

it.each(["creation", "deduplication", "response", "settlement"])("recovers from actual process death during %s transaction", async stage => {
  const path = join(directory(), "fixture.sqlite");
  const initial = setup("owner-a", path); const item = await initial.inbox.ingest(decisionEvent()); initial.repository.close();
  const moduleUrl = (name: string) => pathToFileURL(join(process.cwd(), "lib/universal-inbox", name)).href;
  const child = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
    import { FixtureAttentionRepository } from ${JSON.stringify(moduleUrl("fixture-repository.ts"))};
    import { UniversalInbox } from ${JSON.stringify(moduleUrl("service.ts"))};
    import { decisionEvent, answerFor, FIXTURE_NOW } from ${JSON.stringify(moduleUrl("fixtures.ts"))};
    const repo = new FixtureAttentionRepository(${JSON.stringify(path)});
    const original = repo.transaction.bind(repo);
    repo.transaction = fn => original(tx => fn(new Proxy(tx, { get(target, key) {
      if (key === ${JSON.stringify((stage === "creation" || stage === "deduplication") ? "saveEvidence" : "saveItem")}) return async (...args) => { await target[key](...args); process.exit(73); };
      return target[key];
    }})));
    const inbox = new UniversalInbox('owner-a', repo, () => FIXTURE_NOW);
    if (${JSON.stringify(stage)} === 'creation') await inbox.ingest({...decisionEvent(3), correlationId:'new-item'});
    else if (${JSON.stringify(stage)} === 'deduplication') await inbox.ingest(decisionEvent());
    else if (${JSON.stringify(stage)} === 'response') await inbox.respond(answerFor(await inbox.get(${JSON.stringify(item.id)})));
    else await inbox.ingest({...decisionEvent(3), action:null, disposition:'resolve'});
  `], { cwd: process.cwd(), encoding: "utf8" });
  expect(child.status, child.stderr).toBe(73);
  const restarted = setup("owner-a", path);
  expect((await restarted.inbox.list({ view: "needs_you" })).items).toHaveLength(1);
  expect((await restarted.inbox.get(item.id)).status).toBe("NEEDS_ACTION");
  expect(await restarted.repository.pending("owner-a", 10)).toEqual([]);
  const replay = await restarted.inbox.ingest(decisionEvent()); expect(replay.id).toBe(item.id);
  const response = await restarted.inbox.respond(answerFor(replay)); expect(response.status).toBe("PENDING");
});

it("replays Work continuation after crash without duplicating its consequential action", async () => {
  const directoryPath = directory(); const path = join(directoryPath, "attention.sqlite"); const workPath = join(directoryPath, "canonical-fixture.sqlite");
  const { inbox, repository } = setup("owner-a", path); const item = await inbox.ingest(decisionEvent()); const response = await inbox.respond(answerFor(item)); repository.close();
  const moduleUrl = (name: string) => pathToFileURL(join(process.cwd(), "lib/universal-inbox", name)).href;
  const child = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
    import { DatabaseSync } from 'node:sqlite';
    import { FixtureAttentionRepository } from ${JSON.stringify(moduleUrl("fixture-repository.ts"))};
    import { UniversalInbox } from ${JSON.stringify(moduleUrl("service.ts"))};
    const repo = new FixtureAttentionRepository(${JSON.stringify(path)});
    const work = new DatabaseSync(${JSON.stringify(workPath)});
    work.exec('CREATE TABLE receipts(id TEXT PRIMARY KEY, answer TEXT NOT NULL)');
    await new UniversalInbox('owner-a',repo).deliver({accept:async r=>{work.prepare('INSERT INTO receipts VALUES (?,?)').run(r.id,r.answer);process.exit(74);}});
  `], { cwd: process.cwd(), encoding: "utf8" });
  expect(child.status, child.stderr).toBe(74);
  const restarted = setup("owner-a", path); const work = new DatabaseSync(workPath);
  await restarted.inbox.deliver({ accept: async answer => { work.prepare("INSERT INTO receipts VALUES (?,?) ON CONFLICT(id) DO NOTHING").run(answer.id, answer.answer); return answer.id; } });
  expect(work.prepare("SELECT count(*) AS n FROM receipts").get()!.n).toBe(1);
  expect(work.prepare("SELECT answer FROM receipts WHERE id=?").get(response.id)!.answer).toBe("A"); work.close();
  expect((await restarted.inbox.get(item.id)).status).toBe("RESOLVED");
  expect((await restarted.inbox.ingest(decisionEvent(20))).needsYou).toBe(false);
});

it("attaches later canonical Work without splitting the thread or losing the link", async () => {
  const { inbox } = setup();
  const first = await inbox.ingest(relayMessage(fixtureRelay, { ...fixtureContext, workId: null }));
  const linked = await inbox.ingest(decisionEvent());
  expect(linked.id).toBe(first.id); expect(linked.workId).toBe("fixture-work");
  const later = await inbox.ingest({ ...decisionEvent(3), workId: null, action: null, kind: "MESSAGE" });
  expect(later.workId).toBe("fixture-work"); expect(later.needsYou).toBe(true);
});

it("rolls back a response if persisting its item fails", async () => {
  const { inbox, repository } = setup(); const item = await inbox.ingest(decisionEvent());
  const original = repository.transaction.bind(repository);
  const mock = vi.spyOn(repository, "transaction").mockImplementationOnce(run => original(tx => run({ ...tx, saveItem: async () => { throw new Error("disk failure"); } })));
  await expect(inbox.respond(answerFor(item))).rejects.toThrow("disk failure"); mock.mockRestore();
  expect(await repository.pending("owner-a", 10)).toEqual([]);
  expect((await inbox.get(item.id)).needsYou).toBe(true);
});

it("leaves pending answers durable through downstream outage and rejects forged approval hashes", async () => {
  const { inbox, repository } = setup(); const item = await inbox.ingest(approvalItem(fixtureApproval, fixtureContext));
  const answer = await inbox.respond({ ...answerFor(item), answer: "approved" });
  const work = { accept: vi.fn(async () => "receipt") };
  const authority = { get: vi.fn(async () => ({ ...fixtureApproval, bindingHash: "b".repeat(64) })), decide: vi.fn() };
  await expect(inbox.deliver(approvalConsumer(authority, work))).rejects.toThrow("CANONICAL_APPROVAL_CHANGED");
  expect((await repository.pending("owner-a", 10))[0]!.id).toBe(answer.id);
  expect(authority.decide).not.toHaveBeenCalled(); expect(work.accept).not.toHaveBeenCalled();
});

it("rejects oversized streamed API writes and returns a bounded storage failure", async () => {
  const { repository } = setup();
  const api = createInboxApi({ sourceAuthority: { admit: async () => null, canRead: async () => true }, repository, authenticate: async () => ({ id: "owner-a" }) });
  const response = await api(new Request("https://myeve.test/api/inbox", { method: "POST", headers: { origin: "https://myeve.test" }, body: "x".repeat(20_000) }));
  expect(response.status).toBe(413);
  const failed = createInboxApi({ sourceAuthority: { admit: async () => null, canRead: async () => true }, repository, authenticate: async () => { throw new Error("sensitive backend details"); } });
  const unavailable = await failed(new Request("https://myeve.test/api/inbox"));
  expect(unavailable.status).toBe(503); expect(await unavailable.json()).toEqual({ error: "inbox_unavailable" });
});


it("freezes response Work context so a later source cannot redirect an accepted answer", async () => {
  const { inbox } = setup();
  const item = await inbox.ingest({ ...decisionEvent(), workId: null });
  await inbox.respond(answerFor(item));
  await expect(inbox.ingest({ ...decisionEvent(3), action: null, kind: "MESSAGE" })).rejects.toThrow("RESPONSE_WORK_LINK_FROZEN");
});
