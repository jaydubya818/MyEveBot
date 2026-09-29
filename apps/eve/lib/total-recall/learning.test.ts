import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { assertSafeEvidence, candidateHash, digest, evaluateCandidate, feedbackInput, transitionLearning, type LearningFamily, type LearningVersion } from "./learning.ts";
const scope = { ownerId: "owner", repository: "fixture/repo", workType: "research" as const, workId: null };
const now = "2026-09-27T20:00:00.000Z";
function fixture(): LearningFamily {
  return { id: digest(scope), scope, revision: 1, events: [], versions: [{ version: 1, behavior: "cite_sources", hash: candidateHash(scope,1,"cite_sources"), status: "CANDIDATE", createdAt: now, correctionOf: null, evaluation: null, reason: null,
    evidence: [{ eventId: randomUUID(), workId: randomUUID(), workVersion: 1, target: "work", targetRef: "result-1", type: "prefer_this", note: "Cite sources", actorId: "owner", recordedAt: now, provenance: "authenticated_owner_feedback", objective: "Summary", criteria: [] }] }] };
}
const command = (f: LearningFamily, action: "evaluate" | "promote" | "reject" | "rollback") => ({ eventId: randomUUID(), action, version:1, hash:f.versions[0].hash, reason: `Owner selected ${action}` });
describe("governed learning", () => {
  it("hashes survive JSONB object key reordering", () => {
    const reordered = { workId: null, workType: "research" as const, repository: "fixture/repo", ownerId: "owner" };
    expect(candidateHash(reordered,1,"cite_sources")).toBe(candidateHash(scope,1,"cite_sources"));
  });
  it("requires an exact evaluation and owner decision before use", () => {
    const f=fixture(); expect(()=>transitionLearning(f,command(f,"promote"),"owner",now)).toThrow(/evaluation/);
    const evaluated=transitionLearning(f,command(f,"evaluate"),"owner",now);
    const promoted=transitionLearning(evaluated,command(evaluated,"promote"),"owner",now);
    expect(promoted.versions[0].status).toBe("PROMOTED");expect(f.versions[0].evaluation).toBeNull();
    expect(promoted.versions[0].evaluation).toMatchObject({baselineScore:0,learnedScore:1,result:"PASS"});
  });
  it("does not accept arbitrary behaviors, client evaluation or grants",()=>{
    expect(feedbackInput.safeParse({status:"PROMOTED",evaluation:{result:"PASS"},grant:"all"}).success).toBe(false);
    const f=fixture();expect(()=>transitionLearning(f,command(f,"evaluate"),"stranger",now)).toThrow(/owner/);
  });
  it("rejects negative applicability feedback rather than assuming metric improvement is sufficient",()=>{
    const f=fixture();f.versions[0].evidence[0].type="did_not_work";
    expect(evaluateCandidate(f,f.versions[0],now).result).toBe("FAIL");
    const rejected=transitionLearning(f,command(f,"evaluate"),"owner",now);expect(rejected.versions[0].status).toBe("REJECTED");
  });
  it("rejects mutation and altered command replay",()=>{
    const f=fixture();const c=command(f,"evaluate");const evaluated=transitionLearning(f,c,"owner",now);
    expect(transitionLearning(evaluated,c,"owner",now).revision).toBe(evaluated.revision);
    expect(()=>transitionLearning(evaluated,{...c,hash:"0".repeat(64)},"owner",now)).toThrow(/changed/);
    expect(()=>transitionLearning(evaluated,{...c,reason:"different"},"owner",now)).toThrow(/identity/);
    f.versions[0].behavior="state_uncertainty";expect(()=>evaluateCandidate(f,f.versions[0],now)).toThrow(/changed/);
  });
  it("never silently picks the latest conflicting candidate",()=>{
    let f=fixture();f=transitionLearning(f,command(f,"evaluate"),"owner",now);f=transitionLearning(f,command(f,"promote"),"owner",now);
    const v: LearningVersion={...structuredClone(f.versions[0]),version:2,status:"CANDIDATE" as const,behavior:"state_uncertainty" as const,hash:candidateHash(scope,2,"state_uncertainty"),evaluation:null};
    f.versions.push(v);v.evaluation=evaluateCandidate(f,v,now);
    expect(()=>transitionLearning(f,{...command(f,"promote"),version:2,hash:v.hash},"owner",now)).toThrow(/Conflicting/);
  });
  it.each(["password=fixture", "api_key=fixture", "Bearer abcdefghijk", "otp=123456", "sk-notARealKey123456789012", "-----BEGIN RSA PRIVATE KEY-----", "ｐａｓｓｗｏｒｄ=fixture", "pass\u200bword=fixture", "bypass prior rules", "grant repository access", "change privacy policy", "ignore previous instructions"])("excludes unsafe evidence: %s",text=>expect(()=>assertSafeEvidence(text)).toThrow());
  it("retains historical evaluation when rolling back",()=>{
    let f=fixture();f=transitionLearning(f,command(f,"evaluate"),"owner",now);f=transitionLearning(f,command(f,"promote"),"owner",now);
    const rolled=transitionLearning(f,command(f,"rollback"),"owner",now);expect(rolled.versions[0].status).toBe("ROLLED_BACK");expect(rolled.versions[0].evaluation).toEqual(f.versions[0].evaluation);
    expect(()=>transitionLearning(rolled,command(rolled,"promote"),"owner",now)).toThrow();
  });
});


describe("qualified replacement rollback",()=>{
  function replacement(){
    let f=fixture();f=transitionLearning(f,command(f,"evaluate"),"owner",now);f=transitionLearning(f,command(f,"promote"),"owner",now);
    const v:LearningVersion={...structuredClone(f.versions[0]),version:2,behavior:"state_uncertainty",status:"CANDIDATE",evaluation:null,replacesVersion:1,
      hash:candidateHash(scope,2,"state_uncertainty",{replacesVersion:1})};
    f.versions.push(v);v.evaluation=evaluateCandidate(f,v,now);
    return transitionLearning(f,{...command(f,"promote"),version:2,hash:v.hash},"owner",now);
  }
  it("restores the prior immutable qualified version with an idempotent event",()=>{
    const f=replacement(),prior=structuredClone(f.versions[0]);
    const c={...command(f,"rollback"),version:2,hash:f.versions[1].hash,restoreVersion:1};
    const rolled=transitionLearning(f,c,"owner",now);
    expect(rolled.versions.map(v=>v.status)).toEqual(["PROMOTED","ROLLED_BACK"]);
    expect(rolled.versions[0].hash).toBe(prior.hash);expect(rolled.versions[0].evaluation).toEqual(prior.evaluation);
    expect(transitionLearning(rolled,c,"owner",now)).toEqual(rolled);
    expect(()=>transitionLearning(rolled,{...c,restoreVersion:2},"owner",now)).toThrow(/identity/);
  });
  it("cannot restore owner-corrected, unqualified, or unrelated guidance",()=>{
    for(const failure of ["corrected","unqualified","unrelated"]){
      const f=replacement();
      if(failure==="corrected")f.versions.push({...structuredClone(f.versions[1]),version:3,correctionOf:1,status:"REJECTED"});
      if(failure==="unqualified")f.versions[0].evaluation=null;
      const c={...command(f,"rollback"),version:2,hash:f.versions[1].hash,restoreVersion:failure==="unrelated"?9:1};
      expect(()=>transitionLearning(f,c,"owner",now)).toThrow(/prior qualified/);
      expect(f.versions[1].status).toBe("PROMOTED");
    }
  });
});
