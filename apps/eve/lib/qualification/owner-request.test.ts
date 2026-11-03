import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { canonical } from "../engineering/factory-producer-protocol.ts";
import { digest } from "../engineering/contract.ts";
import { QDEV_BASELINE } from "../external-alpha/qualification-accounting.ts";
import { qualificationConversation } from "./conversation-model.ts";
import { qdevJourneyId } from "./custody-profile.ts";
import { journeyBinding, journeyProfile, privateBetaInstallationSchema, stageBindingId } from "./journey-profile.ts";
import { assertPlanBindsProject, deriveOwnerJourney, normalizeOwnerRequest } from "./owner-request.ts";
import { QualificationRoot, QualificationRootRefused } from "./root.ts";
import { verifyVerdict } from "./verdict.ts";

const h = (c: string) => c.repeat(64);
const OWNER = "3f0c8f7e-6a0e-4c1e-9a55-0d4b3a2f1e10";
const installation = { profile: "myeve.private-beta.owner/v1", environment: "myeve-pb-owner-local", repository: "jaydubya818/sofie-dashboards",
  inputCommit: "1".repeat(40), inputTree: "2".repeat(40), outputBranch: "sofie/owner-requests", operatingProfileSha256: h("3"), factoryVersionSha256: h("4"),
  sources: { myeve: "5".repeat(40), factory: "6".repeat(40), relay: "7".repeat(40), missioncontrol: "8".repeat(40) } } as const;
const stage = (n: 1 | 2 | 3 | 4, purposes: Array<"SOFIE" | "CODING" | "FACTORY" | "VERIFIER">) =>
  ({ stage: n, workCeilingMicrousd: 1_300_000, operations: purposes.map((purpose, i) => ({ key: `s${n}-${i}`, purpose, reserveMicrousd: 600_000 })) });
const template = { installation, plan: { slot: "Q1", stages: [stage(1, ["SOFIE", "CODING"]), stage(2, ["CODING"]), stage(3, ["FACTORY"]), stage(4, ["VERIFIER"])] } } as const;
const REQUEST = "Build me a React dashboard showing GitHub repository health and failing CI pipelines.";
const derive = (request: string) => deriveOwnerJourney({ ownerId: OWNER, template: template as never, request });

it("derives a deterministic four-stage plan whose digest binds the request text, project and repository", () => {
  const a = derive(REQUEST), again = derive(`  ${REQUEST}\r\n`), b = derive(REQUEST.replace("React", "Vue"));
  expect(again.planSha256).toBe(a.planSha256);
  expect(a.plan.stages.map(s => s.stage)).toEqual([1, 2, 3, 4]);
  expect(a.plan.binds).toEqual({ profile: "myeve.private-beta.owner/v1", requestSha256: a.requestSha256, repository: installation.repository,
    inputCommit: installation.inputCommit, outputBranch: installation.outputBranch, environment: installation.environment });
  for (const key of ["planSha256", "requestSha256"] as const) expect(b[key]).not.toBe(a[key]);
  expect(b.project.protectedSpecificationSha256).not.toBe(a.project.protectedSpecificationSha256);
  expect(b.binding.projectSha256).not.toBe(a.binding.projectSha256);
  expect(b.policy.cohortId).not.toBe(a.policy.cohortId);
  expect(qdevJourneyId(OWNER, b.project, b.policy, b.plan)).not.toBe(qdevJourneyId(OWNER, a.project, a.policy, a.plan));
  expect(stageBindingId(a.project, a.planSha256, 1)).toBe(`myeve.private-beta.owner/v1:${a.planSha256}:stage:1`);
  // A different repository changes every identity even for the same text.
  const other = deriveOwnerJourney({ ownerId: OWNER, template: { ...template, installation: { ...installation, repository: "jaydubya818/other" } } as never, request: REQUEST });
  expect(other.planSha256).not.toBe(a.planSha256); expect(other.binding.projectSha256).not.toBe(a.binding.projectSha256);
  // No frozen qualification identity leaks into the private-beta profile.
  expect(JSON.stringify([a.plan, a.project, a.policy, journeyProfile(a.project), stageBindingId(a.project, a.planSha256, 3)])).not.toMatch(/qdev-20261029/);
  expect(journeyProfile(a.project)).toMatchObject({ environment: "myeve-pb-owner-local", assurance: "PRIVATE_BETA_LOCAL" });
});

it("refuses empty, oversized and control-character requests, the frozen environment and a protected branch", () => {
  for (const bad of ["", "short", "x".repeat(2001), "Build\u0000 me a thing please"]) expect(normalizeOwnerRequest(bad)).toBeNull();
  expect(() => derive("   ")).toThrow(/QDEV_OWNER_REQUEST_INVALID/);
  expect(privateBetaInstallationSchema.safeParse({ ...installation, environment: "myeve-qdev-20261029" }).success).toBe(false);
  expect(privateBetaInstallationSchema.safeParse({ ...installation, outputBranch: "main" }).success).toBe(false);
  expect(privateBetaInstallationSchema.safeParse({ ...installation, inputCommit: "0".repeat(40) }).success).toBe(false);
});

it("binds plan and project both ways and keeps the frozen qdev formulas unchanged", () => {
  const a = derive(REQUEST), b = derive(REQUEST + " With dark mode.");
  expect(() => assertPlanBindsProject(a.plan, a.project)).not.toThrow();
  expect(() => assertPlanBindsProject(b.plan, a.project)).toThrow(/QDEV_PLAN_REQUEST_BINDING/);
  const { binds: _binds, ...unbound } = a.plan;
  expect(() => assertPlanBindsProject(unbound as never, a.project)).toThrow(/QDEV_PLAN_PROFILE_MISMATCH/);
  const qdev = { ...QDEV_BASELINE, operatingProfileSha256: h("1"), factoryVersionSha256: h("2"), protectedSpecificationSha256: h("3"),
    sources: { myeve: "a".repeat(40), factory: "b".repeat(40), relay: "c".repeat(40), missioncontrol: "d".repeat(40) } };
  expect(() => assertPlanBindsProject(a.plan, qdev as never)).toThrow(/QDEV_PLAN_PROFILE_MISMATCH/);
  expect(stageBindingId(qdev as never, a.planSha256, 2)).toBe("qdev-20261029-01:stage:2");
  expect(journeyProfile(qdev as never)).toMatchObject({ id: "qdev-20261029-01", environment: "myeve-qdev-20261029", assurance: "INDEPENDENT" });
  expect(journeyBinding(qdev as never).projectSha256).toMatch(/^[a-f0-9]{64}$/);
});

it("a verdict's signed assurance must be exactly the one the profile accepts; a local verifier never passes as independent", () => {
  const pair = generateKeyPairSync("ed25519"), key = { keyId: "local-verifier", publicKeyPem: pair.publicKey.export({ type: "spki", format: "pem" }).toString(),
    activeFrom: "2020-01-01T00:00:00Z", notAfter: "2099-01-01T00:00:00Z" };
  const a = derive(REQUEST);
  const body = { schema: "myeve.qualification-verdict/v1", assurance: "PRIVATE_BETA_LOCAL", verifierKeyId: key.keyId, ...a.binding,
    protectedSpecificationSha256: a.project.protectedSpecificationSha256, candidateCommit: "9".repeat(40), candidateTree: "8".repeat(40), buildArtifactSha256: h("7"),
    outcome: "PASS", issuedAt: "2026-11-03T00:00:00.000Z" } as const;
  const signed = (v: object) => ({ verdict: v as never, signatureBase64: sign(null, Buffer.from(canonical(v)), pair.privateKey).toString("base64") });
  const expected = { ...a.binding, protectedSpecificationSha256: a.project.protectedSpecificationSha256, candidateCommit: body.candidateCommit, candidateTree: body.candidateTree, buildArtifactSha256: body.buildArtifactSha256 };
  const run = (v: object, assurance: unknown) => verifyVerdict({ signed: signed(v), verifierKeys: [key], producerKeyIds: [], producerPublicKeysPem: [], expected: { ...expected, assurance } as never });
  expect(run(body, "PRIVATE_BETA_LOCAL").assurance).toBe("PRIVATE_BETA_LOCAL");
  expect(() => run(body, "INDEPENDENT")).toThrow(/QDEV_VERDICT_ASSURANCE/);
  expect(() => run({ ...body, assurance: "INDEPENDENT" }, "PRIVATE_BETA_LOCAL")).toThrow(/QDEV_VERDICT_ASSURANCE/);
  expect(() => run(body, undefined)).toThrow(/QDEV_VERDICT_ASSURANCE_UNSPECIFIED/);
  const { assurance: _a, ...unlabelled } = body;
  expect(() => run(unlabelled, "PRIVATE_BETA_LOCAL")).toThrow(/QDEV_VERDICT_INVALID/);
  // Relabelling after signing breaks the signature: assurance is signed.
  expect(() => verifyVerdict({ signed: { ...signed(body), verdict: { ...body, assurance: "INDEPENDENT" } as never }, verifierKeys: [key], producerKeyIds: [], producerPublicKeysPem: [],
    expected: { ...expected, assurance: "INDEPENDENT" } })).toThrow(/QDEV_VERDICT_SIGNATURE/);
  expect(() => run({ ...body, outcome: "FAIL" }, "PRIVATE_BETA_LOCAL")).toThrow(/QDEV_VERDICT_FAIL/);
});

// ---- Owner-request conversation ----
const tools = [{ type: "function", name: "qualification_journey", inputSchema: { type: "object", properties: {} } }];
const userMsg = (text: string) => ({ role: "user", content: [{ type: "text", text }] });
const assistantMsg = (text: string) => ({ role: "assistant", content: [{ type: "text", text }] });
const opts = (prompt: unknown[]) => ({ prompt, tools }) as any;
const textOf = (r: any) => r.content.map((p: any) => p.text ?? "").join("");
function conversation() {
  const derivation = (text: string) => { const d = derive(text); return { request: d.request, requestSha256: d.requestSha256, planSha256: d.planSha256,
    repository: installation.repository, environment: installation.environment, cohortId: d.policy.cohortId }; };
  return qualificationConversation({ ownerId: OWNER, revalidate: async () => true, ownerRequest: { derive: derivation }, deliveryUrl: "https://owner.example.test/app" })
    .model({ sessionId: "s", stepKey: "s:0" });
}
afterEach(() => vi.unstubAllGlobals());

it("an owner request is only proposed (full plan digest, local assurance); a matching confirmation selects the journey tool with exactly that request", async () => {
  const fetch = vi.fn(() => { throw Error("PROVIDER_REACHED"); }); vi.stubGlobal("fetch", fetch);
  const model = conversation(), d = derive(REQUEST);
  const proposal = await model.doGenerate(opts([userMsg(REQUEST)]));
  expect(proposal.content.every((p: any) => p.type === "text")).toBe(true);
  const proposed = textOf(proposal);
  expect(proposed).toContain(`[plan ${d.planSha256}]`); expect(proposed).toContain(`confirm ${d.planSha256.slice(0, 12)}`);
  expect(proposed).toContain("PRIVATE_BETA_LOCAL"); expect(proposed).toContain("Nothing has started");
  const history = [userMsg(REQUEST), assistantMsg(proposed), userMsg(`confirm ${d.planSha256.slice(0, 12).toUpperCase()}`)];
  const started = await model.doGenerate(opts(history));
  expect(started.content).toEqual([{ type: "tool-call", toolName: "qualification_journey", toolCallId: expect.stringMatching(/^qdev-[a-f0-9]{32}$/),
    input: JSON.stringify({ request: d.request, planSha256: d.planSha256 }) }]);
  const call = { role: "assistant", content: [started.content[0]] };
  const value = { status: "COMPLETED_UNCLAIMED", readiness: "NOT_CLAIMED", authority: "NONE", stages: [1, 2, 3, 4].map(stage => ({ stage })),
    verdictSha256: h("a"), deliverySha256: h("b"), assurance: "PRIVATE_BETA_LOCAL" };
  const out = (v: unknown) => ({ role: "tool", content: [{ type: "tool-result", toolCallId: started.content[0].toolCallId, toolName: "qualification_journey", output: { type: "json", value: v } }] });
  const done = textOf(await model.doGenerate(opts([...history, call, out(value)])));
  expect(done).toContain("The confirmed request completed all four stages.");
  expect(done).toContain("NOT independent custody"); expect(done).not.toContain("Independent verdict");
  expect(done).toContain("[Open the delivered application](https://owner.example.test/app)");
  // An owner-local result that claims independent custody, or any unlabelled completion, is never presented as verified.
  expect(textOf(await model.doGenerate(opts([...history, call, out({ ...value, assurance: "INDEPENDENT" })])))).toMatch(/could not be verified/);
  const { assurance: _x, ...unlabelled } = value;
  expect(textOf(await model.doGenerate(opts([...history, call, out(unlabelled)])))).toMatch(/could not be verified/);
  // Halts are reported, never as a PASS.
  expect(textOf(await model.doGenerate(opts([...history, call, out({ status: "HALTED", readiness: "NOT_CLAIMED", authority: "NONE", stages: [], haltedAt: 1, code: "QDEV_FENCED" })]))))
    .toContain("The confirmed request stopped at stage 1 (QDEV_FENCED)");
  // A tampered call (different request text) is refused.
  const forged = { role: "assistant", content: [{ ...started.content[0], input: JSON.stringify({ request: REQUEST + "!", planSha256: d.planSha256 }) }] };
  expect(textOf(await model.doGenerate(opts([...history, forged, out(value)])))).toMatch(/could not be verified/);
  expect(fetch).not.toHaveBeenCalled();
  expect(proposal.usage.outputTokens.total).toBe(0);
});

it("a confirmation that does not match the immediately preceding proposal starts nothing", async () => {
  const model = conversation(), d = derive(REQUEST), other = derive(REQUEST + " Add dark mode.");
  const proposed = textOf(await model.doGenerate(opts([userMsg(REQUEST)])));
  const cases = [
    [userMsg(`confirm ${d.planSha256.slice(0, 12)}`)],                                                                  // no proposal at all
    [userMsg(REQUEST), assistantMsg(proposed), userMsg(`confirm ${other.planSha256.slice(0, 12)}`)],                    // wrong code
    [userMsg(REQUEST + " Add dark mode."), assistantMsg(proposed), userMsg(`confirm ${d.planSha256.slice(0, 12)}`)],    // request edited under the proposal
    [userMsg(REQUEST), assistantMsg(proposed.replace(d.planSha256, other.planSha256)), userMsg(`confirm ${other.planSha256.slice(0, 12)}`)], // forged proposal
    [userMsg(REQUEST), assistantMsg(proposed), userMsg("something else"), assistantMsg(proposed), userMsg(`confirm ${d.planSha256.slice(0, 12)}`)], // stale
  ];
  for (const prompt of cases) {
    const r = await model.doGenerate(opts(prompt));
    expect(r.content.every((p: any) => p.type === "text")).toBe(true);
  }
  expect(textOf(await model.doGenerate(opts(cases[1])))).toMatch(/does not match/);
  expect(textOf(await model.doGenerate(opts([userMsg("status")])))).toMatch(/Nothing was started/);
  expect(textOf(await model.doGenerate(opts([userMsg("hi")])))).toMatch(/Nothing was started/);
});

it("the web channel's Client context marker between the proposal and the confirmation is skipped as metadata, never treated as the owner's turn", async () => {
  const model = conversation(), d = derive(REQUEST);
  const marker = userMsg('Client context:\n{"eveWebModel":"anthropic/claude-sonnet-5","webThreadId":"t-1","clientTime":"Nov 3, 2026, 1:16 p.m. PST"}');
  // Exactly the prompt shape the real web UI sends on the second owner turn.
  const proposed = textOf(await model.doGenerate(opts([marker, userMsg(REQUEST), marker])));
  expect(proposed).toContain(`[plan ${d.planSha256}]`);
  const started = await model.doGenerate(opts([{ role: "system", content: "s" }, userMsg(REQUEST), assistantMsg(proposed), marker, userMsg(`confirm ${d.planSha256.slice(0, 12)}`), marker]));
  expect(started.content).toEqual([expect.objectContaining({ type: "tool-call", input: JSON.stringify({ request: d.request, planSha256: d.planSha256 }) })]);
  // Only a well-formed marker is metadata: a malformed one, or a marker mixed with owner text, still breaks adjacency.
  for (const between of [userMsg("Client context:\nnot json"), { role: "user", content: [marker.content[0], { type: "text", text: "and also" }] }]) {
    const r = await model.doGenerate(opts([userMsg(REQUEST), assistantMsg(proposed), between, userMsg(`confirm ${d.planSha256.slice(0, 12)}`)]));
    expect(textOf(r)).toMatch(/does not match/);
  }
  // A marker is never proposed as a request.
  expect(textOf(await model.doGenerate(opts([marker])))).not.toContain("[plan ");
});

it("the conversation needs exactly one of approvedRequest and ownerRequest", () => {
  const revalidate = async () => true;
  expect(() => qualificationConversation({ ownerId: OWNER, revalidate } as never)).toThrow(/QDEV_CONVERSATION_CONFIGURATION/);
  expect(() => qualificationConversation({ ownerId: OWNER, revalidate, approvedRequest: "x", ownerRequest: { derive: () => null } })).toThrow(/QDEV_CONVERSATION_CONFIGURATION/);
});

// ---- Root ----
it("the root runs an owner-request installation only for a confirmed request whose plan digest it re-derives", async () => {
  const d = derive(REQUEST), deriveConfig = vi.fn(async (request: string, expected: string) => ({ planSha256: derive(request).planSha256, config: null }));
  const host = { enabled: () => true, config: async (ownerId: string) => ({ ownerId, ownerRequest: { derive: deriveConfig } }) };
  const root = new QualificationRoot(host as never), owner = { ownerId: OWNER, kind: "human" };
  const code = (p: Promise<unknown>, c: string) => expect(p).rejects.toSatisfy((e: unknown) => e instanceof QualificationRootRefused && e.code === c);
  await code(root.run(owner), "QDEV_ROOT_REQUEST_REQUIRED");
  await code(root.run(owner, {}), "QDEV_ROOT_REQUEST_REQUIRED");
  await code(root.run(owner, { request: REQUEST }), "QDEV_ROOT_REQUEST_INVALID");
  await code(root.run(owner, { request: REQUEST, planSha256: d.planSha256, extra: 1 }), "QDEV_ROOT_REQUEST_INVALID");
  await code(root.run(owner, { request: REQUEST, planSha256: derive(REQUEST + " v2").planSha256 }), "QDEV_ROOT_REQUEST_MISMATCH");
  await code(root.run({ ownerId: OWNER, kind: "human", guest: true }, { request: REQUEST, planSha256: d.planSha256 }), "QDEV_ROOT_PRINCIPAL");
  const frozen = new QualificationRoot({ enabled: () => true, config: async (ownerId: string) => ({ ownerId }) } as never);
  await code(frozen.run(owner, { request: REQUEST, planSha256: d.planSha256 }), "QDEV_ROOT_REQUEST_UNEXPECTED");
  expect(deriveConfig).toHaveBeenCalledTimes(1);
  expect(deriveConfig.mock.calls[0][1]).toBe(derive(REQUEST + " v2").planSha256);
  // The confirmed digest with no buildable configuration is UNCONFIGURED, never run.
  await code(root.run(owner, { request: REQUEST, planSha256: d.planSha256 }), "QDEV_ROOT_UNCONFIGURED");
  expect(digest(d.plan)).toBe(d.planSha256);
});

it("the committed owner-local bundle template parses once its placeholders are filled, and carries no secret value", async () => {
  const { readFileSync } = await import("node:fs");
  const { ownerLocalBundleSchema } = await import("./host-source.ts");
  const raw = readFileSync(new URL("../../scripts/private-beta/owner-local.host-bundle.template.json", import.meta.url), "utf8");
  expect(raw).not.toMatch(/BEGIN [A-Z ]*PRIVATE KEY|postgres:\/\/|Bearer /);
  const t = JSON.parse(raw);
  const filled = { ...t, ownerId: OWNER, notAfter: "2099-01-01T00:00:00.000Z", assembly: undefined,
    template: { ...t.template, installation: { ...installation } },
    relay: { origin: "https://relay.example.test", grant: { ...t.relay.grant, connectionId: "c", repository: installation.repository, baseCommit: installation.inputCommit, outputBranch: installation.outputBranch } } };
  delete filled.assembly;
  const parsed = ownerLocalBundleSchema.parse(filled);
  expect(parsed.template.plan.stages).toHaveLength(4);
  expect(ownerLocalBundleSchema.safeParse({ ...filled, testers: [] }).success).toBe(false);
  expect(ownerLocalBundleSchema.safeParse({ ...filled, installation: "tester" }).success).toBe(false);
});
