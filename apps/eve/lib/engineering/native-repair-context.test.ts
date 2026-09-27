import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { completionModelOptions } from "./native-model.ts";
import { repairContextBytes, RepairContextTooLarge } from "./native-repair-context.ts";
import { digest } from "./contract.ts";
const fixture=JSON.parse(readFileSync(new URL("../../test/fixtures/repair-context/inputs.json",import.meta.url),"utf8"));
const old=JSON.parse(readFileSync(new URL("../../test/fixtures/repair-context/legacy-payload.json",import.meta.url),"utf8"));
function assemble(a=structuredClone(fixture)) {
  const options=completionModelOptions(a.options,a.config,a.state,a.truth,a.metadata);
  const capsule=JSON.parse((options.prompt[1].content as any)[0].text.split("\n").slice(1).join("\n"));
  return {options,capsule,size:repairContextBytes(options)};
}
function evidence(a:any,text:string) {const hash=digest(text);for(const e of a.state.workspace.evidence){e.artifact=text;e.artifactHash=hash;}return hash;}
describe("exact live repair context and adversarial bounds",()=>{
  it("replaces the exact 16040-byte failure with a sufficient capsule and practical headroom",()=>{
    expect(repairContextBytes(old)).toBe(16040);
    const {size,capsule:c,options}=assemble();expect(size).toBeLessThanOrEqual(13000);expect(size).toBeLessThan(14336);
    expect(c.draftChanges).toEqual({"quantity.mjs":fixture.state.workspace.draft_files["quantity.mjs"]});
    expect(c.ownerIntent).toBe(fixture.options.prompt.at(-1).content[0].text);expect(c.criteria).toEqual(fixture.config.criteria);expect(c.candidate.sha).toBe(fixture.metadata.executionController.candidate);
    expect(c.nativeExecution).toMatchObject({runId:fixture.metadata.executionController.runId,writerSessionId:fixture.metadata.executionController.writer,admissionRequired:false});
    expect(c.executionController).toMatchObject({phase:"REPAIR",nextOperation:"inspect",budget:{repairRemaining:1}});
    expect(c.failure.checks).toHaveLength(10);
    for(const e of fixture.state.workspace.evidence) {
      const check=c.failure.checks.find((x:any)=>x.check===e.check),diagnostic=c.failure.diagnostics[check.diagnostic];
      expect(diagnostic).toMatchObject({text:e.artifact,truncated:false,originalBytes:Buffer.byteLength(e.artifact),includedBytes:Buffer.byteLength(e.artifact),reference:`protected-evidence:sha256:${e.artifactHash}`});
      expect(c.failure.verifiers[check.verifier]).toMatchObject({producer:e.producer,environment:e.environment,profileHash:e.profileHash,attemptId:e.attemptId});
    }
    expect(c.failure.candidate).toBe(c.candidate.sha);
    expect(options.prompt).toHaveLength(2);expect(JSON.stringify(options.tools)).not.toContain('"const":"admit"');
  });
  it("ignores repeated history and duplicate Current Truth, deterministically",()=>{
    const a=structuredClone(fixture);a.options.prompt.unshift(...Array(100).fill({role:"user",content:[{type:"text",text:"OLD PRIVATE HISTORY".repeat(500)}]}));a.truth.push(...Array(100).fill(a.truth.join("\n")));
    expect(assemble(a).options).toEqual(assemble().options);
  });
  it("discloses byte-accurate Unicode diagnostic truncation with durable references",()=>{
    const a=structuredClone(fixture),text="Error: "+"🙂 fractional diagnostic\n".repeat(1500),hash=evidence(a,text);
    const {size,capsule:c}=assemble(a);expect(size).toBeLessThanOrEqual(13000);expect(c.failure.checks).toHaveLength(10);
    expect(c.failure.diagnostics).toHaveLength(1);const d=c.failure.diagnostics[0];expect(d.truncated).toBe(true);expect(d.originalBytes).toBe(Buffer.byteLength(text));expect(d.includedBytes).toBe(Buffer.byteLength(d.text));expect(d.text).not.toContain("�");expect(d.reference).toContain(hash);
  });
  it.each(["large diff","multiple changed files","long criteria","many failures","long owner intent"])("fails closed without hiding essential data: %s",kind=>{
    const a=structuredClone(fixture);
    if(kind==="large diff")a.state.workspace.draft_files["quantity.mjs"]="x".repeat(20000);
    if(kind==="multiple changed files")for(let i=0;i<20;i++)a.state.workspace.draft_files["file"+i]="source".repeat(300);
    if(kind==="long owner intent")a.options.prompt.at(-1).content[0].text="Current owner restriction ".repeat(1000);
    if(kind==="long criteria")a.config.criteria[0].statement="mandatory acceptance ".repeat(1500);
    if(kind==="many failures")a.state.workspace.evidence=Array.from({length:100},(_,i)=>({...a.state.workspace.evidence[0],check:"check-"+i}));
    try{assemble(a);throw Error("Expected size rejection");}catch(e){expect(e).toBeInstanceOf(RepairContextTooLarge);expect((e as RepairContextTooLarge).details).toMatchObject({limit:13000,admittedLimit:14336});expect((e as RepairContextTooLarge).details.evidenceReferences.length).toBeGreaterThan(0);expect((e as RepairContextTooLarge).details.requiredCategories).toContain("failure");}
  });
  it("keeps multiple small changed files intact",()=>{const a=structuredClone(fixture);a.state.workspace.draft_files["helper.mjs"]="export const x=1;";expect(assemble(a).capsule.draftChanges["helper.mjs"]).toBe("export const x=1;");});
  it("rejects mismatched evidence hashes or candidate/revision bindings",()=>{
    const a=structuredClone(fixture);a.state.workspace.evidence[0].artifact="tampered";expect(()=>assemble(a)).toThrow(/digest mismatch/);
    const b=structuredClone(fixture);b.metadata.executionController.candidate="other";expect(()=>assemble(b)).toThrow(/exact failed candidate/);
  });
});
