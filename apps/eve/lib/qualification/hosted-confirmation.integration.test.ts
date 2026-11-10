/**
 * Hosted Sofie confirm-and-submit over a REAL disposable PostgreSQL (all migrations) and a FAKE MissionControl endpoint.
 *  - REAL: WorkStore (stage Works, criteria, budgets, idempotent claim), MissionControlBindings (operator-installed enrollment row),
 *    the confirmation binding, Ed25519 signing, the submitter and connection HMAC envelopes, the MissionControl HTTP shape.
 *  - FAKE: MissionControl (verifies exactly what convex/sofieConfirmations.ts verifies, then answers), permit preparation and Factory
 *    admission (spies; their own suites cover them). No network, no provider, no spend.
 */
import { createHash, createHmac, generateKeyPairSync, randomUUID, verify } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Env, connection } from "../external-alpha/work-test-fixture.ts";
import { WorkStore, type WorkDatabase } from "../engineering/store.ts";
import { HOSTED_PROFILE } from "../engineering/factory-mailbox.ts";
import { contentDigest } from "../missioncontrol/consumer.ts";
import { ownerFactoryWorkTuple } from "../missioncontrol/owner-factory-binding.ts";
import { permitFixture } from "../missioncontrol/permit-test-fixture.ts";

const spies = vi.hoisted(() => ({ prepared: [] as any[], admitted: [] as string[] }));
const { prepared, admitted } = spies;
vi.mock("../missioncontrol/prepare-execution.ts", () => ({ prepareMissionControlExecution: async (_s: unknown, input: any) => { spies.prepared.push(input); return { requestId: `req-${input.workId}`, status: "OWNER_APPROVAL_REQUIRED" }; } }));
vi.mock("../missioncontrol/admit-execution.ts", () => ({ requestOwnerFactoryAdmission: async (_s: unknown, work: any) => { spies.admitted.push(work.id); return { admitted: work.id }; } }));
const { confirmHostedRequest, confirmationSigningBytes, planContentDigest } = await import("./hosted-confirmation.ts");

const sha = (v: string | Buffer) => createHash("sha256").update(v).digest("hex");
const MC = "https://mc.example.test", CONNECTION_SECRET = "c".repeat(48), SUBMITTER = "s".repeat(48);
const key = generateKeyPairSync("ed25519"), keyId = sha(key.publicKey.export({ type: "spki", format: "der" }) as Buffer);
const credential = (name: string) => ({ HOSTED_CONFIRMATION_KEY: key.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  HOSTED_CONFIRMATION_SUBMITTER: SUBMITTER, MYEVE_MISSIONCONTROL_SECRET: CONNECTION_SECRET } as Record<string, string>)[name];
const confirmation = { signerEnv: "HOSTED_CONFIRMATION_KEY", submitterEnv: "HOSTED_CONFIRMATION_SUBMITTER", connectionSecretEnv: "MYEVE_MISSIONCONTROL_SECRET",
  keyId, workflowId: "myfactory-hosted-build", stage: { maxCostUsd: 1.3, maxDurationSeconds: 180, budgetMinutes: 30, requestDeadlineSeconds: 300 } };
const hmac = (secret: string, e: any) => "sha256=" + createHmac("sha256", secret).update(["mc-service-command-v1", e.serviceId, e.capability, e.projectId, e.repositoryId,
  e.commandId, String(e.issuedAt), String(e.expiresAt), e.payloadDigest].join("\n")).digest("hex");

/** Fake MissionControl: the same checks the real actions make on the submitter envelope, the signature and the binding. */
function fakeMissionControl(enrollment: any, opts: { refusePlan?: string; failPropose?: boolean } = {}) {
  const calls: Array<{ path: string; payload: any }> = [];
  const send = (async (url: string, init: RequestInit) => {
    expect(url).toBe(MC + "/api/action"); expect(init.redirect).toBe("error");
    const { path, args: [packet] } = JSON.parse(String(init.body)), payload = JSON.parse(packet.payloadJson), e = packet.envelope;
    calls.push({ path, payload });
    const fail = (m: string) => new Response(JSON.stringify({ status: "error", errorMessage: m }), { status: 200 });
    if (e.payloadDigest !== "sha256=" + sha(packet.payloadJson)) return fail("DIGEST");
    if (path === "sofieEnterprise:command") {
      if (opts.failPropose) return fail("[Request ID: 4cc4864492c05e60] Server Error");
      if (e.serviceId !== "myeve-sofie-readiness-v1" || e.signature !== hmac(CONNECTION_SECRET, e) || e.repositoryId !== `connection:${enrollment.connectionId}`) return fail("ENTERPRISE_ACCESS_DENIED");
      const digest = contentDigest({ connectionId: enrollment.connectionId, tenantId: enrollment.tenantId, projectId: enrollment.projectId, ownerId: enrollment.missionControlOwnerId,
        intentKey: payload.intentKey, proposal: payload.proposal });
      return Response.json({ status: "success", value: { response: { proposalId: "proposal-1", digest } } });
    }
    if (e.serviceId !== "myeve-hosted-confirmation" || e.signature !== hmac(SUBMITTER, e) || e.repositoryId !== `installation:${enrollment.installationId}`
      || payload.schema !== "mc-sofie-confirmation-submission/v1") return fail("SUBMITTER_SIGNATURE");
    const { binding, signature } = payload.confirmation;
    if (payload.confirmation.keyId !== keyId || !verify(null, confirmationSigningBytes(binding), key.publicKey, Buffer.from(signature, "base64url"))) return fail("CONFIRMATION_SIGNATURE");
    if (path === "sofieConfirmations:confirmPlan") {
      if (opts.refusePlan) return fail(`SOFIE_CONFIRMATION_REFUSED:${opts.refusePlan}`);
      const s = payload.submit, sp = JSON.parse(s.payloadJson);
      if (s.envelope.signature !== hmac(CONNECTION_SECRET, s.envelope) || sp.operation !== "enterprise.submit" || sp.proposalDigest !== binding.proposalDigest) return fail("SUBMIT_COMMAND");
      return Response.json({ status: "success", value: { confirmationDigest: sha(confirmationSigningBytes(binding)), connectionId: binding.connectionId, proposalId: binding.proposalId,
        missionId: "mission-1", planId: "plan-1", planDigest: "sha256:" + "d".repeat(64), verifiedPlanDigest: "e".repeat(64),
        workOrders: binding.works.map((w: any) => ({ stage: w.stage, workId: w.id, workOrderId: `wo-${w.stage}`, expectedWorkOrderRevisionId: `rev-${w.stage}` })) } });
    }
    return Response.json({ status: "success", value: { workId: payload.workId, permitId: `permit-${payload.workId}` } });
  }) as unknown as typeof fetch;
  return { send, calls };
}

describe.skipIf(!connection)("hosted Sofie confirm-and-submit (disposable PostgreSQL, fake MissionControl)", () => {
  let e: Env, store: WorkStore, enrollment: any, base: any;
  beforeAll(async () => {
    e = await Env.create();
    const db: WorkDatabase = { ...e.db, atomic: async action => {
      const c = await e.pool.connect();
      try { await c.query("BEGIN"); const r = await action({ query: async (sql: string, values?: unknown[]) => (await c.query(sql, values)).rows }); await c.query("COMMIT"); return r; }
      catch (x) { await c.query("ROLLBACK"); throw x; } finally { c.release(); }
    } } as WorkDatabase;
    store = new WorkStore({ scopeId: e.owner, actorId: e.owner, scopeKind: "personal" }, db);
    await e.pool.query("INSERT INTO agents(id,owner_id,name,slug,role,instructions,is_primary) VALUES('sofie-hosted',$1,'Sofie','sofie','Primary','Owner policy',true)", [e.owner]);
    base = { engineering: { ownerId: e.owner, agentId: "sofie-hosted", objective: "static", criteria: [{ id: randomUUID(), statement: "builds", method: "test" }],
      profile: { repository: "fixture/myeve-alpha-workspace-01", policyVersion: 1 } }, connection: { origin: "http://127.0.0.1:8792", factoryId: "f" }, commands: ["npm test"] };
    enrollment = { ...permitFixture({ ownerId: e.owner, workId: randomUUID(), workVersion: 1, workGeneration: 1, tupleSha256: "a".repeat(64), maxCostMicrousd: 1_300_000, maxDurationSeconds: 180 }).enrollment,
      installationId: "inst-hosted", issuer: MC,
      ownerFactoryAdapter: { factoryId: "f", sourceDigest: "1".repeat(64), configurationDigest: "2".repeat(64), configurationHash: "3".repeat(64), profileHash: "4".repeat(64),
        repository: "fixture/myeve-alpha-workspace-01", agentId: "sofie-hosted" } };
    await e.pool.query("INSERT INTO missioncontrol_owner_enrollments(owner_id,installation_id,revision,document) VALUES($1,$2,$3,$4)", [e.owner, enrollment.installationId, 1, enrollment]);
  }, 120_000);
  afterAll(async () => { await e?.pool.end(); await e?.admin.query(`DROP DATABASE IF EXISTS ${e.name} WITH (FORCE)`); await e?.admin.end(); });

  const run = (planSha256: string, send: typeof fetch, over: Record<string, unknown> = {}) => confirmHostedRequest({ profile: HOSTED_PROFILE, installationId: "inst-hosted",
    missionControlOrigin: MC, confirmation, store, base, request: "Add a dark mode toggle", planSha256, credential, send, ...over } as any);

  it("claims the stage Works, proposes, signs and submits ONE confirmation bound to them, then approves each Work just in time", async () => {
    const mc = fakeMissionControl(enrollment), planSha256 = sha("plan-1");
    const confirmed = await run(planSha256, mc.send);
    const works = await e.pool.query("SELECT id,version,generation,objective,max_cost_usd FROM engineering_work WHERE scope_id=$1 ORDER BY created_at", [e.owner]);
    const ids = [confirmed.workIds.stage1, confirmed.workIds.stage2, confirmed.workIds.stage3];
    expect(ids.every(id => works.rows.some((w: any) => w.id === id && w.objective.includes("Add a dark mode toggle")))).toBe(true);
    expect((await e.pool.query("SELECT count(*)::int AS n FROM engineering_work_model_budget WHERE work_id = ANY($1)", [ids])).rows[0].n).toBe(3);
    expect(mc.calls.map(c => c.path)).toEqual(["sofieEnterprise:command", "sofieConfirmations:confirmPlan"]);
    const binding = mc.calls[1].payload.confirmation.binding;
    expect(binding).toMatchObject({ installationId: "inst-hosted", subject: enrollment.ownerSubject, myeveOwnerId: e.owner, connectionId: enrollment.connectionId, planSha256 });
    expect(binding.expiresAt - binding.issuedAt).toBeLessThanOrEqual(600_000);
    expect(binding.planContentSha256).toBe(planContentDigest(binding.plan));
    for (const [i, id] of ids.entries()) expect(binding.works[i].tupleSha256).toBe(ownerFactoryWorkTuple(await store.get(id), enrollment));
    expect(confirmed.confirmationDigest).toBe(sha(confirmationSigningBytes(binding)));
    expect(prepared.map(p => [p.workId, p.workOrderId, p.expectedPlanDigest])).toEqual(ids.map((id, i) => [id, `wo-${i + 1}`, "sha256:" + "d".repeat(64)]));
    // Just in time, once per Work, always under the same confirmation.
    const w1 = await store.get(ids[0]);
    await confirmed.admission(store, w1, base); await confirmed.admission(store, w1, base);
    const permits = mc.calls.filter(c => c.path === "sofieConfirmations:approveConfirmedPermit");
    expect(permits.map(c => [c.payload.workId, c.payload.requestId])).toEqual([[ids[0], `req-${ids[0]}`]]);
    expect(permits[0].payload.confirmation.signature).toBe(mc.calls[1].payload.confirmation.signature);
    expect(admitted).toEqual([ids[0], ids[0]]);
    await expect(confirmed.admission(store, { ...w1, id: randomUUID() } as any, base)).rejects.toThrow("HOSTED_CONFIRMATION_WORK_NOT_CONFIRMED");
  });

  it("past the signed permit authorization, the next stage fails closed without contacting MissionControl", async () => {
    let clock = Date.now();
    const mc = fakeMissionControl(enrollment), confirmed = await run(sha("plan-expiry"), mc.send, { now: () => clock });
    const binding = mc.calls[1].payload.confirmation.binding;
    expect(binding.permitsExpiresAt - binding.issuedAt).toBe(45 * 60_000);
    clock = binding.permitsExpiresAt;
    const before = mc.calls.length;
    await expect(confirmed.admission(store, await store.get(confirmed.workIds.stage1), base)).rejects.toThrow("HOSTED_CONFIRMATION_EXPIRED");
    expect(mc.calls.length).toBe(before);
  });

  it("a second confirmation of the same plan is a replay: refused before MissionControl is contacted", async () => {
    // Permit preparation is a spy here; the real one persists durable per-Work state. Any row naming a Work outside its own claim makes it bound.
    const ids = (await e.pool.query("SELECT work_id FROM engineering_work_model_budget b JOIN engineering_work w ON w.id=b.work_id WHERE w.scope_id=$1 ORDER BY w.created_at LIMIT 3", [e.owner])).rows.map((r: any) => r.work_id);
    await e.pool.query("INSERT INTO beta_work_contexts(owner_id,work_id,context_ref,document) VALUES($1,$2,'synthetic-binding',$3)", [e.owner, ids[0], { synthetic: true }]);
    const mc = fakeMissionControl(enrollment);
    await expect(run(sha("plan-1"), mc.send)).rejects.toThrow("OWNER_LOCAL_CONFIRMATION_ALREADY_CLAIMED_RECONCILE");
    expect(mc.calls).toHaveLength(0);
  });

  it("a MissionControl failure before anything is bound leaves the claimed Works pristine: the same plan can be confirmed again, reusing exactly them", async () => {
    const planSha256 = sha("plan-propose-failed"), failing = fakeMissionControl(enrollment, { failPropose: true }), before = prepared.length;
    await expect(run(planSha256, failing.send)).rejects.toThrow("HOSTED_CONFIRMATION_PROPOSE");
    expect(prepared.length).toBe(before);
    const claimed = (await e.pool.query("SELECT id FROM engineering_work WHERE scope_id=$1 ORDER BY created_at DESC LIMIT 3", [e.owner])).rows.map((r: any) => r.id).reverse();
    const mc = fakeMissionControl(enrollment), confirmed = await run(planSha256, mc.send);
    expect([confirmed.workIds.stage1, confirmed.workIds.stage2, confirmed.workIds.stage3]).toEqual(claimed);
    expect(mc.calls.map(c => c.path)).toEqual(["sofieEnterprise:command", "sofieConfirmations:confirmPlan"]);
    expect((await e.pool.query("SELECT count(*)::int AS n FROM engineering_work_model_budget WHERE work_id = ANY($1)", [claimed])).rows[0].n).toBe(3);
  });

  it("a MissionControl refusal stops the flow: no permit request is prepared", async () => {
    const mc = fakeMissionControl(enrollment, { refusePlan: "PLAN_CHANGED" }), before = prepared.length;
    await expect(run(sha("plan-2"), mc.send)).rejects.toThrow("HOSTED_CONFIRMATION_PLAN:SOFIE_CONFIRMATION_REFUSED:PLAN_CHANGED");
    expect(prepared.length).toBe(before);
  });

  it("another installation, another MissionControl origin or a missing credential is refused before any Work is claimed", async () => {
    const mc = fakeMissionControl(enrollment), before = (await e.pool.query("SELECT count(*)::int AS n FROM engineering_work WHERE scope_id=$1", [e.owner])).rows[0].n;
    await expect(run(sha("plan-3"), mc.send, { installationId: "inst-other" })).rejects.toThrow("HOSTED_CONFIRMATION_ENROLLMENT");
    await expect(run(sha("plan-3"), mc.send, { missionControlOrigin: "https://other.example.test" })).rejects.toThrow("HOSTED_CONFIRMATION_ENROLLMENT");
    await expect(run(sha("plan-3"), mc.send, { credential: () => undefined })).rejects.toThrow("HOSTED_CONFIRMATION_CREDENTIAL");
    await expect(run(sha("plan-3"), mc.send, { profile: "myeve.private-beta.owner/v1" })).rejects.toThrow("HOSTED_CONFIRMATION_PROFILE");
    expect((await e.pool.query("SELECT count(*)::int AS n FROM engineering_work WHERE scope_id=$1", [e.owner])).rows[0].n).toBe(before);
    expect(mc.calls).toHaveLength(0);
  });
});
