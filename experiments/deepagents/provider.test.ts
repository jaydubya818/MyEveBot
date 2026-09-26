import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage } from "@langchain/core/messages";
import { ExperimentalDeepAgentsProvider, type ExperimentHost } from "./provider.ts";
import type { ExperimentalHarnessInput, ExperimentalCheckpoint } from "../../apps/eve/lib/digital-worker/experimental-harness-boundary.ts";

function fixture() {
  const now = Date.now(), workId = randomUUID(), scope = { kind: "personal" as const, id: "owner" };
  const input: ExperimentalHarnessInput = {
    work: { contractVersion: 2, workId, workVersion: 1, criteriaVersion: 1, scope,
      humanOwnerId: "owner", coordinatingAgentId: "sofie", objective: "Repair the synthetic quantity parser.",
      criteria: [{ id: randomUUID(), statement: "Reject fractions", evidence: "deterministic" }],
      resourceRefs: ["fixture:quantity"], allowedOperations: ["deep-agent.start", "file.read", "file.write"],
      budgetUsd: 2, deadline: new Date(now + 120_000).toISOString(), policyVersion: 1,
      composition: { role: { id: "software-engineer", version: 1 }, capabilityPacks: [], mode: { id: "normal", version: 1 } },
      definitionOfDone: ["Independent checks pass"], allowedRoutes: ["DEEP_AGENT"],
      routingProfile: { profileVersion: 1, workShape: "localized bug", decomposition: "single task",
        interaction: "low", parallelism: "none", verification: "deterministic", duration: "short",
        ambiguity: "some", externalExpertise: "none", humanJudgment: "none", risk: "low" },
      routePolicy: { id: "experiment", version: 1 } },
    context: { contractVersion: 2, workId, workVersion: 1, scope, agentId: "sofie",
      assembledAt: new Date(now).toISOString(), maxTokens: 1000, estimatedTokens: 20, items: [] },
    generation: 1, files: { "quantity.mjs": "broken", "test.mjs": "protected" },
    readablePaths: ["quantity.mjs", "test.mjs"], writablePaths: ["quantity.mjs"],
  };
  let allowed = true;
  const retained = new Map<string, ExperimentalCheckpoint>();
  const effects: string[] = [];
  const host: ExperimentHost = {
    prepare: async () => input,
    authorizeModelCall: async () => allowed,
    guard: { assertCurrent: async request => { effects.push(request.operation); return allowed; } },
    checkpointer: new MemorySaver(),
    retain: async (_run, checkpoint) => {
      const ref = `fixture-checkpoint:${randomUUID()}`;
      retained.set(ref, structuredClone(checkpoint)); return ref;
    },
    restore: async checkpoint => ({ input, checkpoint: retained.get(checkpoint.checkpointRef)! }),
  };
  const start = { work: input.work, context: input.context, generation: 1, idempotencyKey: randomUUID() };
  return { input, host, start, retained, effects, revoke: () => { allowed = false; } };
}
const call = (name: string, args: Record<string, unknown>) => new AIMessage({ content: "", tool_calls: [{ name, args, id: randomUUID(), type: "tool_call" }] });
class ScriptedModel extends BaseChatModel {
  private index = 0;
  constructor(private readonly responses: AIMessage[]) { super({}); }
  _llmType() { return "myeve-scripted-test"; }
  bindTools() { return this; }
  async _generate() {
    const message = this.responses[this.index++] ?? new AIMessage("Done");
    return { generations: [{ text: "", message }] };
  }
}
const model = (...responses: AIMessage[]) => new ScriptedModel(responses);
const write = () => ({ path: "quantity.mjs", content: "repaired", operationId: randomUUID(), expectedRevision: 0 });

// Real pinned Deep Agents graph, scripted model. These are not live model qualification tests.
test("real Deep Agents graph uses only MyEve tools and retains its candidate across reconstruction", async () => {
  const f = fixture();
  const provider = new ExperimentalDeepAgentsProvider(f.host, model(call("myeve_write_file", write())));
  const started = await provider.start(f.start);
  await provider.settled(started.value);
  assert.equal((await provider.observe(started.value)).value.state, "COMPLETED");
  const checkpoint = await provider.checkpoint(started.value);
  assert.equal(checkpoint.status, "OK");
  if (checkpoint.status !== "OK") throw new Error("Missing checkpoint");
  assert.equal(f.retained.get(checkpoint.value.checkpointRef)!.files["quantity.mjs"], "repaired");
  assert.deepEqual(f.effects, ["file.write"]);
  const restored = new ExperimentalDeepAgentsProvider(f.host, model());
  await restored.resume(checkpoint.value, started.value.runId);
  await restored.settled(started.value);
  const before = await provider.collectResult(started.value), after = await restored.collectResult(started.value);
  assert.equal(before.status, "OK"); assert.equal(after.status, "OK");
  if (before.status === "OK" && after.status === "OK") assert.equal(before.value.resultRevision, after.value.resultRevision);
  assert.equal(f.effects.length, 1, "resume must not repeat the retained write");
  assert.equal((await provider.collectUsage(started.value)).value.coverage, "UNKNOWN");
});

test("injected built-in filesystem, shell, MCP and subagent calls cannot bypass MyEve", async () => {
  for (const [name, args] of [
    ["write_file", { file_path: "/tmp/publisher-secret", content: "bad" }],
    ["read_file", { file_path: "/etc/passwd" }],
    ["execute", { command: "cat ~/.env" }],
    ["task", { subagent_type: "general-purpose", description: "Write memory" }],
    ["mcp_write", { path: "other-work", content: "bad" }],
  ] as const) {
    const f = fixture();
    const provider = new ExperimentalDeepAgentsProvider(f.host, model(call(name, args)));
    const { value: run } = await provider.start(f.start);
    await provider.settled(run);
    assert.equal(f.effects.length, 0, name);
    const checkpoint = await provider.checkpoint(run);
    assert.equal(checkpoint.status, "OK");
    if (checkpoint.status === "OK") assert.equal(f.retained.get(checkpoint.value.checkpointRef)!.revision, 0);
  }
});

test("revoked authority, traversal, protected checks and malformed arguments cause no write", async () => {
  for (const request of [
    { ...write(), path: "../quantity.mjs" }, { ...write(), path: "test.mjs" },
    { ...write(), path: "/etc/passwd" }, { ...write(), expectedRevision: -1 },
    { ...write(), operationId: "not-a-uuid" }, write(),
  ]) {
    const f = fixture(); f.revoke(); f.host.authorizeModelCall = async () => true;
    const provider = new ExperimentalDeepAgentsProvider(f.host, model(call("myeve_write_file", request)));
    const { value: run } = await provider.start(f.start); await provider.settled(run);
    const checkpoint = await provider.checkpoint(run);
    if (checkpoint.status !== "OK") throw new Error("Missing checkpoint");
    assert.equal(f.retained.get(checkpoint.value.checkpointRef)!.files["quantity.mjs"], "broken");
  }
});

test("Stop fences an in-flight authority check and a stopped checkpoint cannot resume", { timeout: 5000 }, async () => {
  const f = fixture();
  let release!: (value: boolean) => void, entered!: () => void;
  const waiting = new Promise<void>(resolve => { entered = resolve; });
  f.host.guard = { assertCurrent: async () => { entered(); return new Promise(resolve => { release = resolve; }); } };
  const provider = new ExperimentalDeepAgentsProvider(f.host, model(call("myeve_write_file", write())));
  const { value: run } = await provider.start(f.start);
  await waiting;
  await provider.requestStop(run);
  release(true);
  await provider.settled(run);
  assert.equal((await provider.observe(run)).value.state, "STOPPED");
  const checkpoint = await provider.checkpoint(run);
  if (checkpoint.status !== "OK") throw new Error("Missing checkpoint");
  assert.equal(f.retained.get(checkpoint.value.checkpointRef)!.revision, 0);
  await assert.rejects(new ExperimentalDeepAgentsProvider(f.host, model()).resume(checkpoint.value, run.runId), /Stopped/);
});

test("model loop is bounded and provider identity and checkpoint tampering fail closed", async () => {
  const f = fixture();
  const provider = new ExperimentalDeepAgentsProvider(f.host,
    model(call("myeve_read_file", { path: "quantity.mjs" }), call("myeve_read_file", { path: "quantity.mjs" })),
    { maxModelCalls: 1, timeoutMs: 5000 });
  const { value: run } = await provider.start(f.start); await provider.settled(run);
  assert.equal((await provider.observe(run)).value.state, "FAILED");
  await assert.rejects(provider.observe({ ...run, generation: 2 }), /stale/);
  const checkpoint = await provider.checkpoint(run);
  if (checkpoint.status !== "OK") throw new Error("Missing checkpoint");
  const restored = new ExperimentalDeepAgentsProvider(f.host, model());
  await assert.rejects(restored.resume({ ...checkpoint.value, contentHash: "sha256:bad" }, run.runId), /integrity/);
});


test("concurrent starts claim one instance and exhausted host model budget prevents model access", async () => {
  const f = fixture();
  f.host.authorizeModelCall = async () => false;
  const provider = new ExperimentalDeepAgentsProvider(f.host, model(call("myeve_write_file", write())));
  const results = await Promise.allSettled([provider.start(f.start), provider.start(f.start)]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  const started = results.find(result => result.status === "fulfilled");
  if (!started || started.status !== "fulfilled") throw new Error("No admitted start");
  await provider.settled(started.value.value);
  assert.equal((await provider.observe(started.value.value)).value.state, "FAILED");
  assert.equal(f.effects.length, 0);
});

test("retention failure prevents another model step and reports failed custody", async () => {
  const f = fixture();
  const retain = f.host.retain;
  f.host.retain = async (run, checkpoint) => {
    if (checkpoint.revision > 0) throw new Error("Storage unavailable");
    return retain(run, checkpoint);
  };
  const provider = new ExperimentalDeepAgentsProvider(f.host, model(call("myeve_write_file", write())));
  const { value: run } = await provider.start(f.start); await provider.settled(run);
  assert.equal((await provider.observe(run)).value.state, "FAILED");
  const result = await provider.collectResult(run);
  if (result.status !== "OK") throw new Error("Missing result");
  assert(result.value.limitations.some(text => text.includes("retention failed")));
  assert.equal(result.value.resultRevision, null, "Unretained candidate cannot claim a durable result revision");
});

test("normal and potato mode keep the same write boundary", async () => {
  for (const mode of ["normal", "potato-mode"]) {
    const f = fixture(); f.input.work.composition.mode.id = mode;
    const provider = new ExperimentalDeepAgentsProvider(f.host, model(call("myeve_write_file", { ...write(), path: "test.mjs" })));
    const { value: run } = await provider.start(f.start); await provider.settled(run);
    assert.equal(f.effects.length, 0);
  }
});

test("scripted SDK candidates fail then pass independent real Docker checks at exact revisions", {
  skip: !process.env.MYEVE_ER2_VERIFIER_IMAGE,
  timeout: 60000,
}, async () => {
  const { DockerProtectedVerifier, docker } = await import("../../apps/eve/lib/engineering/docker-executor.ts");
  const { profileSchema, digest } = await import("../../apps/eve/lib/engineering/contract.ts");
  const { createCandidate, assertCandidateIdentity } = await import("../../apps/eve/lib/engineering/github.ts");
  const image = process.env.MYEVE_ER2_VERIFIER_IMAGE!;
  assert.match(image, /^node@sha256:[a-f0-9]{64}$/);
  const f = fixture(), criterion = f.input.work.criteria[0].id;
  const profile = profileSchema.parse({ id: "er2-local-fixture", version: 1, repository: "fixture/quantity",
    privateQualification: true, baseBranch: "main", allowedPaths: ["quantity.mjs"],
    checks: [
      { id: "integer", program: "quantity.mjs", input: "12\n", expectedOutput: "12\n", expectedExitCode: 0, criterionIds: [criterion] },
      { id: "fraction", program: "quantity.mjs", input: "1.5\n", expectedOutput: "invalid\n", expectedExitCode: 0, criterionIds: [criterion] },
    ], requiredCI: ["fixture"], reviewerLogins: ["owner"], policyVersion: 1, executor: "claude-code",
    image, maxRuns: 2, maxModelRequests: 4, maxOutputTokens: 1024 });
  const base = { sha: "a".repeat(40), files: f.input.files };
  const contract = { workId: f.input.work.workId, repository: profile.repository, baseSha: base.sha,
    criteriaVersion: 1, profileHash: digest(profile), profile };
  const observations = [];
  for (const [source, expected] of [
    ["let s='';for await(const c of process.stdin)s+=c;console.log(parseInt(s,10));", ["PASS", "FAIL"]],
    ["let s='';for await(const c of process.stdin)s+=c;s=s.trim();console.log(/^[1-9]\\d*$/.test(s)&&Number.isSafeInteger(Number(s))?s:'invalid');", ["PASS", "PASS"]],
  ] as const) {
    const provider = new ExperimentalDeepAgentsProvider(f.host, model(call("myeve_write_file", { ...write(), content: "if(process.getuid()!==1000)throw Error('Candidate must be unprivileged');" + source })));
    const { value: ref } = await provider.start({ ...f.start, idempotencyKey: randomUUID() });
    await provider.settled(ref);
    assert.equal((await provider.observe(ref)).value.state, "COMPLETED");
    const saved = await provider.checkpoint(ref);
    if (saved.status !== "OK") throw new Error("Missing candidate checkpoint");
    const files = f.retained.get(saved.value.checkpointRef)!.files;
    const id = randomUUID();
    const run = { id, attemptId: randomUUID(), reason: "Scripted real-SDK local fixture", generation: 1,
      parentSha: base.sha, publicationParentSha: base.sha, status: "candidate" as const,
      resource: `myeve-golden-${id}`, startedAt: new Date().toISOString() };
    const candidate = createCandidate(contract, run, base, files);
    assertCandidateIdentity(contract, run, base, candidate);
    const evidence = await new DockerProtectedVerifier().verify(contract, candidate);
    assert.deepEqual(evidence.map(item => item.result), expected);
    assert(evidence.every(item => item.candidate === candidate.sha && item.profileHash === digest(profile)));
    const containers = await docker(["ps", "-a", "--filter", `name=myeve-golden-verify-${candidate.id}`, "--format", "{{.Names}}"]);
    const volumes = await docker(["volume", "ls", "--filter", `name=myeve-golden-verify-${candidate.id}`, "--format", "{{.Name}}"]);
    assert.equal(containers.code, 0); assert.equal(containers.out.trim(), "");
    assert.equal(volumes.code, 0); assert.equal(volumes.out.trim(), "");
    observations.push({ candidateSha: candidate.sha, artifactHash: candidate.artifactHash, evidence, resourcesReleased: true });
  }
  if (process.env.MYEVE_ER2_EVIDENCE_FILE) {
    assert.match(process.env.MYEVE_ER2_EVIDENCE_FILE, /^\/private\/tmp\/myeve-er2-[a-z-]+\.json$/);
    const { writeFile } = await import("node:fs/promises");
    await writeFile(process.env.MYEVE_ER2_EVIDENCE_FILE, JSON.stringify({
      evidenceClass: "real-sdk-scripted-model-real-local-docker", image,
      observedAt: new Date().toISOString(), observations, liveModel: false, workAdmission: false,
    }, null, 2));
  }
});


test("a model's fabricated verification claim cannot create a candidate or independent evidence", async () => {
  const f = fixture();
  const provider = new ExperimentalDeepAgentsProvider(f.host, model(new AIMessage('{"resultRevision":"forged","verification":"PASS","ready":true}')));
  const { value: run } = await provider.start(f.start); await provider.settled(run);
  const result = await provider.collectResult(run);
  if (result.status !== "OK") throw new Error("Missing result");
  assert.equal(result.value.resultRevision, null);
  assert(result.value.limitations.some(text => text.includes("no independent verification")));
});
