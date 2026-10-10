import { expect, it } from "vitest";
import { boundedAlphaHistory, compactWorkData, compactProofData, EXTERNAL_ALPHA_CONTEXT_TARGET_BYTES } from "./bounded-context.ts";
import { digest } from "../engineering/contract.ts";
const system = {role: "system", content: "Mandatory: owner isolation, UNKNOWN denial, no publication, exact Work authority."};
const user = (text: string) => ({role:"user",content:[{type:"text",text}]});
const data = (id="a", version=1, limitations: unknown=["No publication or owner acceptance has been established."]) => ({
 work:{id:`work-${id}`,scopeId:"owner-a",version,generation:1,criteriaVersion:1},
 projection:{nativeResult:{id:`result-${id}-${version}`,candidateSha:"c".repeat(40),proof:{workId:`work-${id}`,workVersion:version,outcome:"PARTIAL",resultRevision:"c".repeat(40),limitations,evidence:[{criterionId:"criterion-1",state:"FAIL"},{criterionId:"criterion-2",state:"PASS"}]}}},
 events:Array.from({length:1000},()=>({text:"Historical event repeated"})),
});
const exchange = (id: string, value: unknown) => [
 {role:"assistant",content:[{type:"tool-call",toolCallId:id,toolName:"engineering_work",input:{operation:"get"}}]},
 {role:"tool",content:[{type:"tool-result",toolCallId:id,toolName:"engineering_work",output:{type:"json",value}}]},
];
const bytes = (prompt: unknown, tools: unknown=[]) => Buffer.byteLength(JSON.stringify({prompt,tools}));
it("retains exact mixed outcomes, identity and accurate Proof limitations without changing canonical data",()=>{
 const original=data(); const before=structuredClone(original);
 const compact=compactWorkData(original) as any;
 expect(compact.projection.nativeResult.proof.limitations).toEqual(original.projection.nativeResult.proof.limitations);
 expect(compact.projection.nativeResult.proof.limitationsReadback.status).toBe("COMPLETE");
 expect(compact.projection.nativeResult.proof.evidence.map((e:any)=>e.state)).toEqual(["FAIL","PASS"]);
 expect(compact.projection.nativeResult.id).toBe("result-a-1");
 expect(compact.projection.nativeResult.proof.contentHash).toBe(digest(original.projection.nativeResult.proof));
 expect(original).toEqual(before);
});
it("bounds Unicode and escaped limitations while disclosing incomplete excerpts",()=>{
 const retained="🙂 Independent verifier unavailable; this is not verified.";
 const original=data("a",1,[...Array.from({length:20},(_,i)=>`${i}:`+'🙂"\n'.repeat(1500)),retained,...Array.from({length:10},(_,i)=>`Limitation ${i}.`)]);
 const proof=(compactWorkData(original) as any).projection.nativeResult.proof;
 expect(proof.limitations).toHaveLength(31);
 expect(Buffer.byteLength(JSON.stringify(proof.limitations))).toBeLessThanOrEqual(2000);
 expect(proof.limitationsReadback).toMatchObject({status:"INCOMPLETE",omittedCount:0,truncatedCount:20});
 expect(proof.limitations[0]).not.toContain("\uFFFD");
 expect(proof.limitations[20]).toBe(retained);
 expect(proof.limitationsReadback.note).toContain("not verification");
 expect(proof.limitationsReadback.note).toContain("negation");
});
it("discloses a bounded omitted count for pathological arrays and never changes the retained Proof",()=>{
 const original=data("a",1,Array.from({length:100},(_,i)=>`Limitation ${i}: `+"x".repeat(1000)+"; not verified."));
 const before=structuredClone(original);
 const proof=(compactWorkData(original) as any).projection.nativeResult.proof;
 expect(proof.limitations).toHaveLength(32);
 expect(Buffer.byteLength(JSON.stringify(proof.limitations))).toBeLessThanOrEqual(2000);
 expect(proof.limitationsReadback).toMatchObject({status:"INCOMPLETE",omittedCount:68,truncatedCount:32});
 expect(proof.limitations[0]).toContain("[truncated excerpt]");
 expect(proof.contentHash).toBe(digest(original.projection.nativeResult.proof));
 expect(original).toEqual(before);
});
it.each([undefined,null,"unavailable",["valid",null]])("reports absent or malformed limitations as UNAVAILABLE (%j)",limitations=>{
 const raw=data("a",1,limitations);
 raw.projection.nativeResult.proof.limitations=limitations;
 const proof=(compactWorkData(raw) as any).projection.nativeResult.proof;
 expect(proof.limitations).toEqual([]);
 expect(proof.limitationsReadback.status).toBe("UNAVAILABLE");
});
it("does not manufacture unavailable Proof or verified outcomes",()=>{
 const out=compactWorkData({work:{id:"work-a"},projection:{nativeResult:{id:"result-a"}}}) as any;
 expect(out.projection.nativeResult.proof).toBeUndefined();
});
it("windows long conversations as whole turns, preserves policies and current exchanges",()=>{
 const prompt=[system,...Array.from({length:20},(_,i)=>[user(`old-${i} `+"history ".repeat(900)),...exchange(`call-${i}`,data("a",i))]).flat(),user("Can you explain the result?"),...exchange("latest",data("a",21))];
 const out=boundedAlphaHistory(prompt as any,[]) as any[];
 expect(bytes(out)).toBeLessThan(EXTERNAL_ALPHA_CONTEXT_TARGET_BYTES);
 expect(out[0]).toEqual(system);
 expect(JSON.stringify(out)).toContain("Can you explain the result?");
 expect(JSON.stringify(out)).toContain("result-a-21");
 const calls=new Set(out.flatMap(m=>m.role==="assistant"?m.content.map((c:any)=>c.toolCallId):[]));
 for(const m of out.filter(m=>m.role==="tool")) for(const part of m.content) expect(calls.has(part.toolCallId)).toBe(true);
});
it.each(["What changed?","Is anything else needed?","Can you explain the result?","Thanks — anything else to review?"])("retains recent multiple Work updates and limitations on subsequent turn %s",followup=>{
 const prompt=[system,user("Update Work A"),...exchange("a",data("a",2)),user("Read Work B"),...exchange("b",data("b",3)),user(followup)];
 const out=boundedAlphaHistory(prompt as any,[]);
 const text=JSON.stringify(out);
 expect(bytes(out)).toBeLessThan(28000);
 for(const identity of ["work-a","work-b","result-a-2","result-b-3"])expect(text).toContain(identity);
 expect(text).toContain("No publication or owner acceptance has been established.");
 expect(out.at(-1)).toEqual(user(followup));
});
it("targets headroom below the hard cap, but preserves an indivisible mandatory request up to 32,000 bytes",()=>{
 const old=user("old"+"x".repeat(29000));const latest=user("Read the saved Proof");
 expect(bytes(boundedAlphaHistory([system,old,latest] as any,[]))).toBeLessThan(28000);
 const mandatory=[system,user("x".repeat(29000))];
 expect(boundedAlphaHistory(mandatory as any,[])).toEqual(mandatory);
 expect(()=>boundedAlphaHistory([system,user("x".repeat(32000))] as any,[])).toThrow("CONTEXT_BOUND");
 expect(()=>boundedAlphaHistory([system,latest] as any,[{type:"function",name:"engineering_work",inputSchema:{description:"x".repeat(32000)}}] as any)).toThrow("CONTEXT_BOUND");
});

it("factors identical evidence bindings without losing mixed criterion outcomes or distinct signed hashes",()=>{
 const entries=Array.from({length:10},(_,i)=>({criterionId:`criterion-${i}`,resultRevision:"r".repeat(40),state:i===9?"FAIL":"PASS",producer:"trusted-verifier",contentHash:`hash-${i}`,observedAt:"2026-10-10T00:00:00Z"}));
 const original={workId:"work-a",workVersion:2,criteriaVersion:1,resultRevision:"r".repeat(40),outcome:"PARTIAL",limitations:["One criterion failed; this Result is not accepted."],evidence:entries};
 const before=structuredClone(original),compact=compactProofData(original) as any;
 expect(compact.evidence.map((e:any)=>({...compact.commonEvidenceBinding,...e}))).toEqual(entries);
 expect(compact.evidence.map((e:any)=>e.state)).toEqual([...Array(9).fill("PASS"),"FAIL"]);
 expect(new Set(compact.evidence.map((e:any)=>e.contentHash)).size).toBe(10);
 expect(compact.contentHash).toBe(digest(original));expect(original).toEqual(before);
});
it("keeps distinct evidence producer, timestamp and revision bindings explicit",()=>{
 const entries=[{criterionId:"a",state:"PASS",resultRevision:"r1",producer:"verifier-1",observedAt:"2026-10-10T00:00:00Z",contentHash:"h1"},{criterionId:"b",state:"FAIL",resultRevision:"r2",producer:"verifier-2",observedAt:"2026-10-10T00:01:00Z",contentHash:"h2"}];
 const compact=compactProofData({limitations:["Distinct verifier observations."],evidence:entries}) as any;
 expect(compact.commonEvidenceBinding).toBeUndefined();expect(compact.evidence).toEqual(entries);
});
