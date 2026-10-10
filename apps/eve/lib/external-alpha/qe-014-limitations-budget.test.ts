// QE-014 Decision B (2026-10-10): <= 2,000 serialized UTF-8 bytes for compacted Proof limitations INCLUDING the omission/truncation disclosure,
// meaningful limitations and canonical evidence references preserved, no SILENT omission (disclosed omission allowed),
// 32,000 hard limit, < 28,000 target where feasible. Independent verifier; harness-only.
import { describe, expect, it } from "vitest";
import { compactWorkData } from "./bounded-context.ts";
const VERDICT = "Independent verifier verdict: PARTIAL. " + "The signed Result does not establish every required acceptance criterion. ".repeat(14); // ~1,000 chars (ingestion caps at 1,000)
const SCOPE = "Factory-produced candidate and independent cloud verification only. GitHub publication, CI, review and owner acceptance have not been established; this Result is never final completion.";
const rec = (limitations: unknown) => ({ work: { id: "w" }, projection: { nativeResult: { id: "result-a", proof: { workId: "w", outcome: "PARTIAL",
  evidence: [{ criterionId: "c1", state: "PASS", contentHash: "sha256:" + "b".repeat(64) }], artifactRefs: ["factory-manifest:sha256:" + "d".repeat(64)], limitations } } } });
const allocation = (c: any) => { const p = c.projection.nativeResult.proof; return Buffer.byteLength(JSON.stringify({ limitations: p.limitations, limitationsReadback: p.limitationsReadback })); };
describe("QE-014 Decision 2", () => {
  it("canonical limitations (verdict up to 1,000 chars + scope) are retained whole", () => {
    const p = (compactWorkData(rec([VERDICT.slice(0, 1000), SCOPE])) as any).projection.nativeResult.proof;
    expect(p.limitations).toEqual([VERDICT.slice(0, 1000), SCOPE]);
    expect(p.limitationsReadback.status).toBe("COMPLETE");
  });
  it("the compacted limitations allocation never exceeds 2,000 bytes (limitations + readback disclosure)", () => {
    for (const set of [[VERDICT.slice(0, 1000), SCOPE], Array.from({ length: 20 }, (_, i) => `L${i} ` + "x".repeat(240)), [VERDICT.slice(0, 1000), "y".repeat(990)], ["z".repeat(1990)]]) {
      const c = compactWorkData(rec(set)) as any;
      expect(allocation(c), `set of ${set.length}`).toBeLessThanOrEqual(2000);
    }
  });
  it("any omission is disclosed (status INCOMPLETE + count), never silent", () => {
    const c = compactWorkData(rec(Array.from({ length: 20 }, (_, i) => `L${i} ` + "x".repeat(240)))) as any;
    const p = c.projection.nativeResult.proof;
    expect(p.limitationsReadback.status).toBe("INCOMPLETE");
    expect(p.limitations.length + p.limitationsReadback.omittedCount).toBe(20);
  });
  it("canonical evidence references survive compaction", () => {
    const s = JSON.stringify(compactWorkData(rec([SCOPE])));
    for (const needle of ["result-a", "factory-manifest:sha256:", "c1", "sha256:" + "b".repeat(64)]) expect(s).toContain(needle);
  });
});

describe("QE-014 Decision B hard 2,000-byte limitations allocation (matrix)", () => {
  const SUFFIX = "… [truncated excerpt]";
  const proofOf = (limitations: unknown) => (compactWorkData(rec(limitations)) as any).projection.nativeResult.proof;
  const check = (input: string[]) => {
    const p = proofOf(input);
    expect(allocation({ projection: { nativeResult: { proof: p } } })).toBeLessThanOrEqual(2000);
    // Order preserved; every kept entry is the original or a code-point prefix of it plus the disclosed suffix.
    const uniq = [...new Set(input)];
    let cursor = 0;
    for (const kept of p.limitations as string[]) {
      while (cursor < uniq.length && !(kept === uniq[cursor] || (kept.endsWith(SUFFIX) && uniq[cursor].startsWith(kept.slice(0, -SUFFIX.length))))) cursor++;
      expect(cursor).toBeLessThan(uniq.length); cursor++;
      expect(kept).not.toContain("�");
    }
    const rb = p.limitationsReadback;
    expect(p.limitations.length + rb.omittedCount).toBe(uniq.length);
    expect(rb.duplicateCount).toBe(input.length - uniq.length);
    expect(rb.status).toBe(rb.omittedCount || rb.truncatedCount ? "INCOMPLETE" : "COMPLETE");
    if (rb.status === "INCOMPLETE") expect(rb.note).toMatch(/not verification/);
    return p;
  };
  it("empty and small limitations are COMPLETE and unchanged", () => {
    expect(check([]).limitations).toEqual([]);
    expect(check(["One small restriction."]).limitations).toEqual(["One small restriction."]);
  });
  it("mandatory canonical limitations stay whole even beside many oversized ones", () => {
    const p = check([VERDICT.slice(0, 1000), SCOPE, ...Array.from({ length: 30 }, (_, i) => `Extra ${i} ` + "z".repeat(2000))]);
    expect(p.limitations[0]).toBe(VERDICT.slice(0, 1000));
    expect(p.limitations[1]).toBe(SCOPE);
  });
  it("exact-fit and one-byte-over inputs respect the cap", () => {
    for (let n = 1700; n <= 2100; n += 7) check(["a".repeat(n)]);
  });
  it("Unicode, multibyte, escapes and nested serialized JSON never split a code point or exceed the cap", () => {
    check(Array.from({ length: 12 }, (_, i) => `${i} ` + "🙂é中\\u0000\"\n\t".repeat(120)));
    check([JSON.stringify({ nested: { limitations: ["inner \"quoted\" restriction"], bytes: "x".repeat(900) } }), "short"]);
  });
  it("duplicates are removed before any truncation and disclosed", () => {
    const p = check(Array.from({ length: 40 }, () => "Same restriction repeated."));
    expect(p.limitations).toEqual(["Same restriction repeated."]);
    expect(p.limitationsReadback).toMatchObject({ status: "COMPLETE", duplicateCount: 39 });
  });
  it("randomized: 2,000 inputs always within 2,000 bytes with exact accounting", () => {
    let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const alphabet = ["a", " ", "é", "🙂", "中", "\"", "\\", "\n", "x", "."];
    for (let t = 0; t < 2000; t++) {
      const count = Math.floor(rnd() * 45);
      check(Array.from({ length: count }, () => Array.from({ length: Math.floor(rnd() * 900) }, () => alphabet[Math.floor(rnd() * alphabet.length)]).join("")));
    }
  });
});
