// QE-014 Decision C (2026-10-10): <= 28,000 bytes per evaluated turn where feasible, by removing only
// selected-Work content PROVABLY duplicated in the mandatory context. Mandatory policy, identity, state,
// outcomes and references are never removed; the 32,000-byte hard limit still fails closed.
import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { compactProofData, compactWorkData, withoutMandatoryDuplicates, EXTERNAL_ALPHA_CONTEXT_TARGET_BYTES } from "./bounded-context.ts";
import { externalAlphaPrompt } from "./model.ts";
import { EXTERNAL_ALPHA_CONTEXT_BYTES } from "./context.ts";

const id = "6f1c8a52-1d3e-4b7a-9c2d-0e8f7a6b5c4d";
const criteria = Array.from({ length: 10 }, (_, i) => ({ id: `alpha-tasks-criterion-${i + 1}`, statement: `Criterion statement ${i + 1}: ` + "s".repeat(180), method: "test" }));
const proof = { workId: id, workVersion: 3, criteriaVersion: 1, outcome: "PARTIAL", resultRevision: "a".repeat(40),
  evidence: criteria.map((c, i) => ({ criterionId: c.id, state: i === 9 ? "FAIL" : "PASS", producer: "trusted-verifier", resultRevision: "a".repeat(40), contentHash: "sha256:" + String(i).repeat(64).slice(0, 64), observedAt: "2026-10-10T00:00:00Z" })),
  artifactRefs: ["factory-manifest:sha256:" + "d".repeat(64), "changed-source:src/tasks.ts"],
  limitations: ["Independent verifier verdict: PARTIAL.", "Factory-produced candidate and independent cloud verification only. GitHub publication, CI, review and owner acceptance have not been established; this Result is never final completion."] };
const record = (p = proof, crit = criteria) => ({ work: { id, title: "Add Priority", objective: "Add a priority field to Alpha Tasks.", version: 3, generation: 1, criteriaVersion: 1, criteria: crit },
  projection: { status: "Completed", lifecycle: "accepted", nativeResult: { id: "result-1", contentHash: "sha256:" + "c".repeat(64), proof: p } } });
/** Same rendering as agent/lib/context-assembly.ts engineeringWorkItem for the selected Work. */
const mandatory = (p = proof) => [`Work ${id} · Add Priority`, "Objective: Add a priority field to Alpha Tasks.", ...criteria.map(c => `Criterion ${c.id}: ${c.statement.slice(0, 300)} [${c.method}]`),
  `Native immutable Proof of Work result-1: ${JSON.stringify(compactProofData(p))}. Hash sha256:${"c".repeat(64)}.`].join("\n");

describe("QE-014 Decision C: proven-duplicate removal", () => {
  it("removes criteria, objective and Proof only when identical to the mandatory selected Work, keeping identity, state and outcome", () => {
    const out = withoutMandatoryDuplicates(compactWorkData(record()), mandatory()) as any;
    expect(out.work.criteria).toBeUndefined(); expect(out.work.objective).toBeUndefined();
    expect(out.work).toMatchObject({ id, title: "Add Priority", version: 3, generation: 1, criteriaVersion: 1 });
    expect(out.projection).toMatchObject({ status: "Completed", lifecycle: "accepted" });
    expect(out.projection.nativeResult).toMatchObject({ id: "result-1", proof: { sameAsMandatoryContext: true, outcome: "PARTIAL" } });
    expect(out.projection.nativeResult.proof.contentHash).toBe((compactProofData(proof) as any).contentHash);
    expect(out.mandatoryContextDuplicates.removed).toEqual(["work.criteria", "work.objective", "projection.nativeResult.proof"]);
  });
  it("keeps the Proof when the mandatory context carries a different Proof (hash mismatch)", () => {
    const other = { ...proof, outcome: "FAILED" };
    const out = withoutMandatoryDuplicates(compactWorkData(record()), mandatory(other)) as any;
    expect(out.projection.nativeResult.proof.sameAsMandatoryContext).toBeUndefined();
    expect(out.projection.nativeResult.proof.limitations).toBeDefined();
  });
  it("keeps criteria when any statement differs or exceeds the mandatory 300-character rendering", () => {
    const changed = criteria.map((c, i) => i === 4 ? { ...c, statement: c.statement + " (amended)" } : c);
    expect((withoutMandatoryDuplicates(compactWorkData(record(proof, changed)), mandatory()) as any).work.criteria).toHaveLength(10);
    const long = criteria.map((c, i) => i === 0 ? { ...c, statement: "x".repeat(400) } : c);
    expect((withoutMandatoryDuplicates(compactWorkData(record(proof, long)), mandatory()) as any).work.criteria).toHaveLength(10);
  });
  it("leaves a different Work (or no selected Work) untouched", () => {
    const value = compactWorkData(record());
    expect(withoutMandatoryDuplicates(value, mandatory().replace(`Work ${id} · `, "Work 00000000-0000-4000-8000-000000000000 · "))).toEqual(value);
    expect(withoutMandatoryDuplicates(value, "MANDATORY ALPHA POLICY")).toEqual(value);
  });
});

const tool = (name: string) => ({ type: "function" as const, name, description: "d".repeat(1400), inputSchema: { type: "object", properties: { operation: { type: "string" } } } });
const tools = [tool("engineering_work"), tool("engineering_factory"), tool("ask_question")];
type Options = Parameters<typeof externalAlphaPrompt>[0];
const bytes = (o: { prompt: unknown; tools: unknown }) => Buffer.byteLength(JSON.stringify({ prompt: o.prompt, tools: o.tools }));
function currentTurnWithWorkFetch(question: string, policy: string, selected: string) {
  const call = randomUUID();
  const full = { ...record(), events: Array.from({ length: 40 }, (_, i) => ({ at: `t${i}`, text: "Saved progress event " + "e".repeat(80) })) };
  return { prompt: [{ role: "system", content: policy }, { role: "system", content: selected },
    { role: "user", content: [{ type: "text", text: question }] },
    { role: "assistant", content: [{ type: "tool-call", toolCallId: call, toolName: "engineering_work", input: { operation: "get" } }] },
    { role: "tool", content: [{ type: "tool-result", toolCallId: call, toolName: "engineering_work", output: { type: "json", value: full } }] }], tools } as unknown as Options;
}

describe("QE-014 Decision C: context target", () => {
  const policy = "MANDATORY ALPHA POLICY " + "p".repeat(9900);
  const selected = mandatory() + "\n" + "Mandatory selected-Work context lines ".repeat(150);
  it("a no-history turn that fetches the selected Work drops proven duplicates to meet 28,000 bytes", () => {
    const options = currentTurnWithWorkFetch("Are there any limitations I should know about?", policy, selected);
    expect(bytes(options)).toBeGreaterThanOrEqual(EXTERNAL_ALPHA_CONTEXT_TARGET_BYTES);
    const out = externalAlphaPrompt(options);
    expect(bytes(out)).toBeLessThan(EXTERNAL_ALPHA_CONTEXT_TARGET_BYTES);
    const text = JSON.stringify(out.prompt);
    expect(text).toContain("MANDATORY ALPHA POLICY");                         // policy kept
    expect(text).toContain("owner acceptance have not been established");   // limitation kept (mandatory copy)
    expect(text).toContain("sameAsMandatoryContext");                         // removal disclosed
    expect(JSON.stringify(out.prompt.at(-1))).toContain(id);                  // identity kept in the tool result
  });
  it("guard: the 32,000-byte hard limit still fails closed when mandatory content alone exceeds it", () => {
    expect(() => externalAlphaPrompt(currentTurnWithWorkFetch("x", "P".repeat(EXTERNAL_ALPHA_CONTEXT_BYTES), selected))).toThrow(/EXTERNAL_ALPHA_CONTEXT_BOUND/);
  });
});
