// QE-014 regression (independent verifier). Drop-in path: apps/eve/lib/external-alpha/qe-014-context-limitations.test.ts
// Decision B (release authority): keep the 32,000-byte hard limit; compacted Work data must retain bounded Proof
// limitations, canonical Work/Result references and mandatory policy; target assembled input below 28,000 bytes where feasible.
// Expected at c640f255/572053a9: the two "limitations" tests and the 28,000 target test FAIL; the fail-closed and
// "mandatory content between 28,000 and 32,000 still succeeds" guards PASS.
import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { compactWorkData } from "./bounded-context.ts";
import { externalAlphaPrompt } from "./model.ts";
import { EXTERNAL_ALPHA_CONTEXT_BYTES } from "./context.ts";

const TARGET = 28000;              // Decision B soft target
const LIMITATIONS_BUDGET = 2000;   // verifier-proposed bound for the compact limitations (bytes, JSON)
const VERDICT = "Independent verifier verdict: PARTIAL. The signed Result does not establish every required acceptance criterion.";
const SCOPE = "Factory-produced candidate and independent cloud verification only. GitHub publication, CI, review and owner acceptance have not been established; this Result is never final completion.";
function workRecord(limitations: string[]) {
  return {
    work: { id: "work-a", scopeId: "owner-a", title: "Add Priority", objective: "Add a priority field", version: 3, generation: 1, criteriaVersion: 1 },
    projection: { title: "Add Priority", status: "Completed", lifecycle: "accepted",
      nativeResult: { id: "result-a", contentHash: "sha256:" + "c".repeat(64),
        proof: { workId: "work-a", workVersion: 3, criteriaVersion: 1, outcome: "PARTIAL", resultRevision: "a".repeat(40),
          evidence: Array.from({ length: 10 }, (_, i) => ({ criterionId: `criterion-${i + 1}`, state: i === 9 ? "FAIL" : "PASS", contentHash: "sha256:" + "b".repeat(64) })),
          artifactRefs: ["factory-manifest:sha256:" + "d".repeat(64), "changed-source:src/tasks.ts"], limitations } } },
    events: Array.from({ length: 200 }, (_, i) => ({ text: `event ${i}` })),
  };
}

describe("QE-014 compacted Work data keeps Proof limitations", () => {
  it("retains every canonical limitation (verdict and scope) in the compact view", () => {
    const view = JSON.stringify(compactWorkData(workRecord([VERDICT, SCOPE])));
    expect(view).toContain("result-a");                 // canonical Result reference kept (already true)
    expect(view).toContain("Independent verifier verdict: PARTIAL");
    expect(view).toContain("owner acceptance have not been established");
  });
  it("bounds limitations: long or many limitations are truncated, never dropped, within a fixed budget", () => {
    const many = Array.from({ length: 12 }, (_, i) => `Limitation ${i + 1}: ` + "x".repeat(3000));
    const compact = compactWorkData(workRecord(many)) as any;
    const kept = compact?.projection?.nativeResult?.proof?.limitations;
    expect(Array.isArray(kept)).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(kept))).toBeLessThanOrEqual(LIMITATIONS_BUDGET);
    for (const i of [1, 2, 3]) expect(JSON.stringify(kept)).toContain(`Limitation ${i}:`); // earliest (most canonical) kept
    expect(JSON.stringify(compact)).toMatch(/truncat|omitted|more limitation/i);           // truncation is disclosed
  });
});

const tool = (name: string) => ({ type: "function" as const, name, description: "x", inputSchema: { type: "object", properties: {} } });
const tools = [tool("engineering_work"), tool("engineering_factory"), tool("ask_question")];
type Options = Parameters<typeof externalAlphaPrompt>[0];
function exchange(i: number, limitations = [VERDICT, SCOPE]) {
  const id = randomUUID();
  return [
    { role: "user" as const, content: [{ type: "text" as const, text: `Question ${i}: what is the state of the Work?` }] },
    { role: "assistant" as const, content: [{ type: "tool-call" as const, toolCallId: id, toolName: "engineering_work", input: { operation: "get" } }] },
    { role: "tool" as const, content: [{ type: "tool-result" as const, toolCallId: id, toolName: "engineering_work", output: { type: "json" as const, value: workRecord(limitations) } }] },
    { role: "assistant" as const, content: [{ type: "text" as const, text: `Answer ${i}: ` + "a".repeat(1200) }] },
  ];
}
const opts = (system: string, history: unknown[], current: string) =>
  ({ prompt: [{ role: "system", content: system }, ...history, { role: "user", content: [{ type: "text", text: current }] }], tools } as unknown as Options);
const bytes = (o: { prompt: unknown; tools?: unknown }) => Buffer.byteLength(JSON.stringify({ prompt: o.prompt, tools: o.tools }));

describe("QE-014 context headroom", () => {
  const policy = "MANDATORY ALPHA POLICY " + "p".repeat(16000); // ~ the mandatory share observed in production-mode journeys
  it("targets < 28,000 bytes for a long natural conversation when mandatory + current fit", () => {
    const out = externalAlphaPrompt(opts(policy, Array.from({ length: 12 }, (_, i) => exchange(i)).flat(), "Are there any limitations I should know about?"));
    expect(bytes(out)).toBeLessThan(TARGET);
    expect(JSON.stringify(out.prompt[0])).toContain("MANDATORY ALPHA POLICY");
    expect(JSON.stringify(out.prompt.at(-1))).toContain("limitations I should know about");
    expect(JSON.stringify(out.prompt)).toContain("owner acceptance have not been established"); // limitation survives windowing
  });
  it("guard: mandatory + current between 28,000 and 32,000 bytes still succeeds (target is soft, limit is hard)", () => {
    const big = "MANDATORY ALPHA POLICY " + "p".repeat(29000);
    const out = externalAlphaPrompt(opts(big, exchange(0), "What changed?"));
    expect(bytes(out)).toBeLessThanOrEqual(EXTERNAL_ALPHA_CONTEXT_BYTES);
  });
  it("guard: the 32,000-byte hard limit still fails closed", () => {
    expect(() => externalAlphaPrompt(opts("MANDATORY " + "p".repeat(EXTERNAL_ALPHA_CONTEXT_BYTES), [], "x"))).toThrow(/EXTERNAL_ALPHA_CONTEXT_BOUND/);
  });
});
