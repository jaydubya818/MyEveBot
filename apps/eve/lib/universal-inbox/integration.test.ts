import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { hash } from "./domain.ts";
import { eventSchema, type AttentionEvent } from "./contracts.ts";
import { FixtureAttentionRepository } from "./fixture-repository.ts";
import { UniversalInbox } from "./service.ts";
import { FIXTURE_NOW, answerFor, decisionEvent, fixtureApproval, fixtureContext, fixtureDecision, fixtureRelay } from "./fixtures.ts";
import { approvalItem, reminderOccurrence, workEvent } from "./adapters.ts";
import { gmailMessage, slackMessage, webhookEvent, relayPeerEvent, replySettlement, requestOwnerDecision } from "./source-adapters.ts";
import { ingestAuthorized, authorizedItem, authorizedPage, type Admission, type SourceAuthority } from "./admission.ts";
import { continuationConsumer, continuationInput, goalDependencySignal } from "./continuation.ts";
import { FixtureContinuationAuthority } from "./continuation-fixture.ts";
import { goalBlocker } from "./goals-adapter.ts";
import { dailyBriefContribution, todayContribution, followUpIntent, notificationPolicy } from "./feeds.ts";
import { betaApproval, betaAttention } from "./beta-crosswalk.ts";

const cleanup: Array<() => void> = [];
afterEach(() => { for (const fn of cleanup.splice(0).reverse()) fn(); });
function setup() { const repository = new FixtureAttentionRepository(); cleanup.push(() => repository.close()); return { repository, inbox: new UniversalInbox("owner-a", repository, () => FIXTURE_NOW) }; }
const context = { ...fixtureContext, workGeneration: 3, workVersion: 7 };
const boundDecision = (n = 2) => eventSchema.parse({ ...decisionEvent(n), workGeneration: 3, workVersion: 7 });
const email = { id: "email-1", threadId: "email-thread", snippet: "Please choose a delivery date", internalDate: String(Date.parse(FIXTURE_NOW)), payload: { headers: [{ name: "From", value: "partner@example.test" }, { name: "Subject", value: "Delivery" }] } };
const hook = { id: "hook-1", type: "request", sender: "provider", timestamp: FIXTURE_NOW, threadId: "provider-thread", title: "Provider request", text: "Choose a delivery date" };
function authority(event: AttentionEvent, override: Partial<Admission> = {}): SourceAuthority {
  return { admit: async () => ({ projectionHash: hash(event), ...context, ownerId: "owner-a", audienceOwnerId: "owner-a", visible: true, grantActive: true,
    grantId: event.source.grantId, system: event.source.system, eventId: event.source.eventId, accountId: event.source.accountId,
    correlationId: event.correlationId, sequence: event.sequence, episode: event.episode, workId: event.workId,
    workGeneration: event.workGeneration, workVersion: event.workVersion, ...override }), canRead: async () => true };
}

it.each([
  ["Gmail", () => gmailMessage(email, context)],
  ["Slack", () => slackMessage({ type: "message", user: "U1", channel: "C1", ts: "1790510400.000001", text: "Options ready" }, context)],
  ["webhook", () => webhookEvent(hook, context)],
  ["Relay", () => relayPeerEvent(fixtureRelay, context)],
  ["reminder", () => reminderOccurrence({ id: "schedule-1", prompt: "Check provider", scheduledFor: FIXTURE_NOW, now: FIXTURE_NOW }, context)!],
] as const)("%s replay produces zero duplicate consequential items", async (_, make) => {
  const { inbox, repository } = setup(); const event = make();
  for (let n = 0; n < 20; n++) await ingestAuthorized(inbox, event, authority(event));
  expect((await inbox.list()).items).toHaveLength(1); expect((await inbox.list({ view: "needs_you" })).items).toHaveLength(0);
  expect((await repository.evidence("owner-a", (await inbox.list()).items[0]!.id))[0]!.deliveries).toBe(20);
});

it.each([{ ownerId: "other" }, { audienceOwnerId: "other" }, { accountId: "other" }, { visible: false }, { grantActive: false }, { grantId: "revoked" }])("denies invalid source admission %j", async override => {
  const { inbox } = setup(); const event = relayPeerEvent(fixtureRelay, context);
  await expect(ingestAuthorized(inbox, event, authority(event, override))).rejects.toThrow("SOURCE_NOT_ADMITTED");
  expect((await inbox.list()).items).toEqual([]);
});

it.each([{ workId: "forged" }, { workGeneration: 4 }, { correlationId: "forged" }, { sequence: 9 }])("rejects forged canonical linkage %j", async override => {
  const { inbox } = setup(); const event = boundDecision();
  await expect(ingestAuthorized(inbox, event, authority(event, override))).rejects.toThrow("FORGED_SOURCE_LINKAGE");
});

it("retains private Relay evidence without disclosing it after grant revocation, including after a public update", async () => {
  const { inbox } = setup(); const event = relayPeerEvent(fixtureRelay, context); const auth = authority(event);
  const item = await ingestAuthorized(inbox, event, auth);
  await inbox.ingest(boundDecision(2));
  auth.canRead = async (_owner, source) => source.system !== "relay";
  expect((await authorizedPage(inbox, {}, auth)).items).toEqual([]);
  await expect(authorizedItem(inbox, item.id, auth)).rejects.toThrow("NOT_FOUND");
});

it("correlates request → reply → owner decision → continuation → Result without spam", async () => {
  const { inbox, repository } = setup(); const receiver = new FixtureContinuationAuthority(); cleanup.push(() => receiver.close());
  const request = webhookEvent(hook, context); const first = await inbox.ingest(request);
  const reply = webhookEvent({ ...hook, id: "reply-2", type: "reply" }, { ...context, sequence: 2 }); await inbox.ingest(reply);
  const decision = await inbox.ingest(boundDecision(3)); const response = await inbox.respond(answerFor(decision));
  receiver.put({ ...continuationInput(response), active: true });
  await inbox.deliver(continuationConsumer(receiver));
  await inbox.ingest(workEvent({ id: "result-5", state: "completed", title: "Done", summary: "Verified result", at: FIXTURE_NOW }, { ...context, sequence: 5 })!);
  expect((await inbox.list()).items.map(i => i.id)).toEqual([first.id]);
  expect(receiver.receipts("owner-a")).toHaveLength(1);
  expect((await inbox.list({ view: "needs_you" })).items).toEqual([]);
  expect(await repository.metrics("owner-a")).toEqual({ necessaryInterventions: 1, avoidableCoordinationRequests: 0 });
});

it("generation 3 answer arriving at generation 4 is retained but cannot continue Work", async () => {
  const { inbox, repository } = setup(); const receiver = new FixtureContinuationAuthority(); cleanup.push(() => receiver.close());
  const item = await inbox.ingest(boundDecision());
  const response = await inbox.respond(answerFor(item));
  const input = continuationInput(response); receiver.put({ ...input, workGeneration: 4, active: true });
  await inbox.deliver(continuationConsumer(receiver));
  expect(receiver.receipts("owner-a")[0]!.result.status).toBe("stale");
  expect(receiver.receipts("owner-a")[0]!.input.answer).toBe("A");
  expect((await inbox.get(item.id)).status).toBe("SUPERSEDED"); expect(await repository.pending("owner-a", 10)).toEqual([]);
});

it.each(["blocker", "work_completed", "approval_expired", "reply_clears_reminder"])("settles %s before owner action without losing evidence", async reason => {
  const { inbox, repository } = setup();
  const initial = reason === "approval_expired" ? approvalItem(fixtureApproval, context) : boundDecision();
  const item = await inbox.ingest(initial);
  const settled = reason === "approval_expired" ? approvalItem({ ...fixtureApproval, status: "expired" }, { ...context, sequence: 9 })
    : eventSchema.parse({ ...initial, sequence: 9, action: null, disposition: reason === "work_completed" ? "resolve" : "supersede", source: { ...initial.source, eventId: `${reason}-9` } });
  await inbox.ingest(settled);
  expect((await inbox.get(item.id)).needsYou).toBe(false); expect(await repository.evidence("owner-a", item.id)).toHaveLength(2);
  await expect(inbox.respond(answerFor(item))).rejects.toThrow("STALE_ACTION");
});

it("atomically replaces a decision and rolls back the supersession if the replacement conflicts", async () => {
  const { inbox } = setup(); const first = await inbox.ingest(boundDecision());
  const replacement = eventSchema.parse({ ...boundDecision(4), episode: 2, action: { ...fixtureDecision, id: "new-decision" } });
  const supersede = eventSchema.parse({ ...boundDecision(3), action: null, disposition: "supersede" });
  await inbox.replace(supersede, replacement);
  expect((await inbox.list({ view: "needs_you" })).items).toHaveLength(1); expect((await inbox.get(first.id)).status).toBe("SUPERSEDED");
  await inbox.replace(supersede, replacement); expect((await inbox.list({ view: "needs_you" })).items).toHaveLength(1);
});

it("reordered events do not resurrect a closed episode", async () => {
  const { inbox } = setup(); const item = await inbox.ingest({ ...boundDecision(9), action: null, disposition: "resolve" });
  await inbox.ingest(boundDecision(2)); expect((await inbox.get(item.id)).status).toBe("RESOLVED");
});

it("clarification and Goal decisions bypass approval authority and bind exact dependency generations", async () => {
  const { inbox } = setup(); const receiver = new FixtureContinuationAuthority(); cleanup.push(() => receiver.close());
  const event = goalBlocker("owner-a", { ownerId: "owner-a", id: "needs-goal-1", source: "goal-task", goalId: "goal-1", taskId: "task-1", goalGeneration: 2,
    taskGeneration: 3, dependencyId: "dependency-1", reference: "choice:provider", title: "Choose provider", options: ["A", "B"], revision: 2, updatedAt: FIXTURE_NOW });
  const item = await inbox.ingest(event); const response = await inbox.respond(answerFor(item)); const input = continuationInput(response);
  expect(input.decisionClass).toBe("DECISION"); expect(input.canonicalApproval).toBeNull();
  expect(goalDependencySignal(input)).toMatchObject({ kind: "owner", dependencyId: "dependency-1", goalGeneration: 2, taskGeneration: 3, evidenceRef: response.id });
  receiver.put({ ...input, active: true }); await inbox.deliver(continuationConsumer(receiver));
  expect(receiver.receipts("owner-a")[0]!.result.status).toBe("accepted");
});

it("bounds Today, Brief and Work-thread queries without promoting routine events", async () => {
  const { inbox, repository } = setup();
  for (let n = 0; n < 25; n++) await inbox.ingest({ ...boundDecision(n), correlationId: `decision-${n}`, priority: { blockingActiveWork: true } });
  for (let n = 0; n < 20; n++) expect(workEvent({ id: `internal-${n}`, state: "internal", title: "Polling", summary: "", at: FIXTURE_NOW }, context)).toBeNull();
  const today = await todayContribution(inbox, "2026-09-26T00:00:00.000Z", FIXTURE_NOW);
  expect(today.needsYouCount).toEqual({ value: 25, capped: false }); expect(today.needsYou.items).toHaveLength(20); expect(today.needsYou.nextCursor).not.toBeNull();
  const brief = await dailyBriefContribution(inbox, "2026-09-26T00:00:00.000Z", FIXTURE_NOW); expect(brief.newNeedsYou.items).toHaveLength(20);
  expect((await inbox.list({ view: "thread", workId: "fixture-work", limit: 10 })).items).toHaveLength(10);
  await expect(inbox.list({ view: "thread" })).rejects.toThrow();
  expect((await repository.metrics("owner-a")).avoidableCoordinationRequests).toBe(0);
});

it("external replies settle a scheduled follow-up and retain a Brief contribution", async () => {
  const { inbox } = setup();
  const waiting = await inbox.ingest({ ...boundDecision(1), kind: "FOLLOW_UP", action: null, disposition: "waiting", waitingFor: "external", followUpAt: FIXTURE_NOW });
  expect(followUpIntent(waiting)?.requiresExistingScheduler).toBe(true);
  const reply = webhookEvent({ ...hook, id: "reply", type: "reply" }, { ...context, sequence: 2 });
  await inbox.ingest(replySettlement(reply));
  const brief = await dailyBriefContribution(inbox, "2026-09-26T00:00:00.000Z", FIXTURE_NOW);
  expect(brief.externalReplies.items).toHaveLength(1); expect(brief.resolved.items).toHaveLength(1); expect(brief.followUpsDue.items).toHaveLength(0);
});

it("notification policy defaults to no push and never creates notification execution authority", async () => {
  const { inbox } = setup(); const item = await inbox.ingest({ ...boundDecision(), priority: { urgency: "urgent" } });
  expect(notificationPolicy(item, FIXTURE_NOW).push).toBe(false);
  expect(notificationPolicy(item, FIXTURE_NOW, { pushSupported: true, ownerOptedIn: true }).push).toBe(true);
  const info = await inbox.ingest({ ...boundDecision(4), action: null, disposition: "resolve" });
  expect(notificationPolicy(info, FIXTURE_NOW, { pushSupported: true, ownerOptedIn: true }).push).toBe(false);
});

it("Beta crosswalk preserves canonical approval detail and does not fabricate task/approval records", async () => {
  const { inbox } = setup(); const approval = await inbox.ingest(approvalItem(fixtureApproval, context));
  expect(betaApproval(approval, fixtureApproval)).toEqual(fixtureApproval);
  expect(() => betaApproval(approval, { ...fixtureApproval, bindingHash: "b".repeat(64) })).toThrow();
  const decision = await inbox.ingest({ ...boundDecision(), correlationId: "decision-only", source: { ...boundDecision().source, eventId: "decision-only" } });
  expect(betaAttention(decision).responseBinding?.options).toEqual(["A", "B"]);
  expect(() => betaApproval(decision, fixtureApproval)).toThrow();
});

it.each([null, {}, { ...email, internalDate: "NaN" }])("rejects malformed Gmail event %j", raw => { expect(() => gmailMessage(raw, context)).toThrow(); });
it("rejects unsupported Slack events and source-provided owner action fields", () => {
  expect(() => slackMessage({ type: "message", subtype: "message_deleted" }, context)).toThrow();
  expect(() => webhookEvent({ ...hook, workId: "forged" }, context)).toThrow();
  const request = requestOwnerDecision(webhookEvent(hook, context), fixtureDecision); expect(request.action?.kind).toBe("decision");
});

it.each(["before_write", "after_item", "after_ingestion", "after_response", "after_resolution"])("reconnect/replay after process loss at %s is safe", async stage => {
  const dir = mkdtempSync(join(tmpdir(), "inbox-integration-")); cleanup.push(() => rmSync(dir, { recursive: true, force: true })); const path = join(dir, "db.sqlite");
  const url = (name: string) => pathToFileURL(join(process.cwd(), "lib/universal-inbox", name)).href;
  const child = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
    import { FixtureAttentionRepository } from ${JSON.stringify(url("fixture-repository.ts"))};
    import { UniversalInbox } from ${JSON.stringify(url("service.ts"))};
    import { decisionEvent, answerFor, FIXTURE_NOW } from ${JSON.stringify(url("fixtures.ts"))};
    const repo=new FixtureAttentionRepository(${JSON.stringify(path)});const inbox=new UniversalInbox('owner-a',repo,()=>FIXTURE_NOW);
    if(${JSON.stringify(stage)}==='before_write')process.exit(81);
    if(${JSON.stringify(stage)}==='after_item'){const original=repo.transaction.bind(repo);repo.transaction=fn=>original(tx=>fn({...tx,saveItem:async item=>{await tx.saveItem(item);process.exit(81);}}));}
    const item=await inbox.ingest(decisionEvent());
    if(${JSON.stringify(stage)}==='after_ingestion')process.exit(81);
    await inbox.respond(answerFor(item));
    if(${JSON.stringify(stage)}==='after_response')process.exit(81);
    await inbox.deliver({accept:async()=> 'fixture-receipt'});process.exit(81);
  `], { cwd: process.cwd(), encoding: "utf8" });
  expect(child.status, child.stderr).toBe(81);
  const repo = new FixtureAttentionRepository(path); cleanup.push(() => repo.close()); const inbox = new UniversalInbox("owner-a", repo, () => FIXTURE_NOW);
  const replay = await inbox.ingest(decisionEvent()); expect((await inbox.list({ view: "thread", workId: "fixture-work" })).items).toHaveLength(1);
  if (stage === "after_resolution") { expect(replay.status).toBe("RESOLVED"); const consumer = { accept: vi.fn() }; await inbox.deliver(consumer); expect(consumer.accept).not.toHaveBeenCalled(); }
  else if (stage === "after_response") expect((await repo.pending("owner-a", 10))).toHaveLength(1);
  else expect(replay.needsYou).toBe(true);
});

it("unauthorized canonical approval response records no continuation", async () => {
  const { approvalConsumer } = await import("./approval-consumer.ts");
  const { inbox, repository } = setup(); const item = await inbox.ingest(approvalItem(fixtureApproval, context));
  await inbox.respond({ ...answerFor(item), answer: "approved" });
  const canonical = { get: vi.fn(async () => fixtureApproval), decide: vi.fn(async () => { throw new Error("CANONICAL_OWNER_DENIED"); }) };
  const receiver = { accept: vi.fn() };
  await expect(inbox.deliver(approvalConsumer(canonical, receiver))).rejects.toThrow("CANONICAL_OWNER_DENIED");
  expect(receiver.accept).not.toHaveBeenCalled(); expect(await repository.pending("owner-a", 10)).toHaveLength(1);
});

it("preserves the prior request if atomic replacement fails", async () => {
  const { inbox } = setup(); const initial = await inbox.ingest(boundDecision());
  const conflicting = eventSchema.parse({ ...boundDecision(4), episode: 2, correlationId: "other" }); await inbox.ingest(conflicting);
  await expect(inbox.replace({ ...boundDecision(3), action: null, disposition: "supersede" },
    { ...boundDecision(4), episode: 2 })).rejects.toThrow("SOURCE_EVENT_ID_CONFLICT");
  expect((await inbox.get(initial.id)).needsYou).toBe(true);
});

it("ordinary clarification carries provenance without a formal approval object", async () => {
  const { inbox } = setup(); const item = await inbox.ingest({ ...boundDecision(), action: { ...fixtureDecision, reason: "missing_information" } });
  const input = continuationInput(await inbox.respond(answerFor(item)));
  expect(input.decisionClass).toBe("CLARIFICATION"); expect(input.canonicalApproval).toBeNull(); expect(input.evidenceRef).toMatch(/^response_/);
});

it("Today/Brief preserve an old unresolved urgent item and distinguish new requests", async () => {
  const { inbox } = setup(); const item = await inbox.ingest({ ...boundDecision(), priority: { urgency: "urgent" } });
  const brief = await dailyBriefContribution(inbox, "2026-09-27T12:01:00.000Z", "2026-09-27T13:00:00.000Z");
  expect(brief.newNeedsYou.items).toHaveLength(0); expect(brief.unresolvedImportant.items[0]?.id).toBe(item.id);
});

it("revoked source rights deny API reads and responses before serializing private content", async () => {
  const { createInboxApi } = await import("./api.ts");
  const { inbox, repository } = setup(); const item = await inbox.ingest(boundDecision());
  const auth = authority(boundDecision()); auth.canRead = async () => false;
  const api = createInboxApi({ repository, sourceAuthority: auth, authenticate: async () => ({ id: "owner-a" }), clock: () => FIXTURE_NOW });
  const read = await api(new Request("https://inbox.test/api/inbox")); expect((await read.json()).items).toEqual([]);
  const answer = await api(new Request("https://inbox.test/api/inbox", { method: "POST", headers: { origin: "https://inbox.test" }, body: JSON.stringify(answerFor(item)) }));
  expect(answer.status).toBe(404); expect(await repository.pending("owner-a", 10)).toHaveLength(0);
});


it("binds the admitted projection so authenticated metadata cannot carry a forged action", async () => {
  const { inbox } = setup(); const event = boundDecision(); const auth = authority(event);
  await expect(ingestAuthorized(inbox, { ...event, action: { ...event.action!, prompt: "Forged instruction" } }, auth)).rejects.toThrow("FORGED_SOURCE_PROJECTION");
});

it("preserves AgentMail references and rejects an unrelated inbox account", async () => {
  const { agentMailMessage } = await import("./source-adapters.ts");
  const message = { inbox_id: context.accountId, thread_id: "thread", message_id: "mail-message", labels: [], timestamp: FIXTURE_NOW,
    from: "sender@example.test", updated_at: FIXTURE_NOW, created_at: FIXTURE_NOW, text: "Attached proposal", in_reply_to: "earlier-message",
    attachments: [{ attachment_id: "file-1", filename: "proposal.pdf", size: 64 }] };
  const event = agentMailMessage(message, context); expect(event.relation).toBe("reply"); expect(event.source.attachments[0]!.reference).toBe("file-1");
  expect(() => agentMailMessage({ ...message, inbox_id: "other-account" }, context)).toThrow("SOURCE_ACCOUNT_MISMATCH");
});

it("Relay peer Work requests and replies carry provenance without local authority", () => {
  const request = relayPeerEvent({ ...fixtureRelay, capability: "work.request", payload: { task: "Prepare proposal" } }, context);
  const reply = relayPeerEvent({ ...fixtureRelay, payload: { body: "Proposal ready", replyTo: "prior-request" } }, context);
  expect(request.kind).toBe("REQUEST"); expect(request.action).toBeNull(); expect(reply.relation).toBe("reply"); expect(reply.action).toBeNull();
  expect(reply.source.grantId).toBe(fixtureRelay.authorizationContext.grantId);
});


it("a formal approval continuation needs canonical authority independently of an Inbox answer", async () => {
  const { inbox } = setup(); const receiver = new FixtureContinuationAuthority(); cleanup.push(() => receiver.close());
  const item = await inbox.ingest(approvalItem(fixtureApproval, context));
  const input = continuationInput(await inbox.respond({ ...answerFor(item), answer: "approved" }));
  receiver.put({ ...input, canonicalApproval: null, active: true });
  expect((await receiver.record(input)).status).toBe("stale");
});


it("distinguishes an automatically handled Work blocker from one needing owner judgment", async () => {
  const { inbox } = setup();
  const blocked = { id: "blocked-1", state: "blocked" as const, title: "Provider blocked", summary: "Waiting for provider", at: FIXTURE_NOW };
  const informational = await inbox.ingest(workEvent(blocked, context)!);
  expect(informational.kind).toBe("BLOCKER"); expect(informational.needsYou).toBe(false);
  const actionable = await inbox.ingest(workEvent({ ...blocked, id: "blocked-2", action: fixtureDecision }, { ...context, sequence: 2 })!);
  expect(actionable.needsYou).toBe(true); expect(actionable.priority.blockingActiveWork).toBe(true);
  await inbox.ingest(workEvent({ ...blocked, id: "work-finished", state: "completed" }, { ...context, sequence: 3 })!);
  expect((await inbox.get(actionable.id)).needsYou).toBe(false);
});
