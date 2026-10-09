import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { dataset } from "../../../../apps/eve/lib/decision-intelligence/dataset.ts";
import { providerState, leakageIssues, validateChallengeRows, type ChallengeAuthor } from "../../../../apps/eve/lib/decision-intelligence/challenge-cohorts.ts";
const dir=import.meta.dirname;
const read=(path:string)=>JSON.parse(readFileSync(resolve(dir,path),"utf8"));
const rows:ChallengeAuthor[]=read("authored.json");
validateChallengeRows(rows);
const original=read("../authored.json") as {id:string;candidate:string;context:string}[];
const normalize=(s:string)=>s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu,"");
const tokenize=(s:string)=>new Set(s.toLowerCase().match(/[a-z]+/g)??[]);
const score=(a:string,b:string)=>{const x=tokenize(a),y=tokenize(b);return [...x].filter(t=>y.has(t)).length/new Set([...x,...y]).size;};
const compare=(other:{id:string;candidate:string;context?:string}[], name:string)=>rows.map(row=>{
 const candidates=other.map(old=>({source:name,id:old.id,jaccard:score(row.candidate,old.candidate),candidateExact:row.candidate===old.candidate,candidateNormalized:normalize(row.candidate)===normalize(old.candidate)})).sort((a,b)=>b.jaccard-a.jaccard);
 return {id:row.id,nearest:candidates[0]!,flagged:candidates.filter(c=>c.jaccard>=0.60||c.candidateNormalized)};
});
const v0=compare(dataset.map(r=>({id:r.id,candidate:r.text})),"V0");
const draft=compare(original,"REJECTED_DRAFT_01");
const within=rows.flatMap((a,i)=>rows.slice(i+1).flatMap(b=>{
 const s=score(a.candidate,b.candidate);
 return s>=0.65?[{a:a.id,b:b.id,jaccard:s,sameFamily:a.familyId===b.familyId,contextSame:a.context===b.context,candidateSame:normalize(a.candidate)===normalize(b.candidate)}]:[];
}));
const hints=rows.filter(r=>/\b(?:fact|observation|hypothesis|insight|preference|commitment|decision)\b|\b(?:I am describing|not a |rather than|only (?:reports?|describes?))\b/i.test(r.context)).map(r=>({id:r.id,candidate:r.candidate,context:r.context}));
const report={status:"AUTOMATED_SCREEN_COMPLETE_SEMANTIC_REVIEW_REQUIRED",thresholds:{crossDatasetJaccard:0.60,withinJaccard:0.65},v0,draft,within,contextInspection:hints,serialized:rows.length,leakageFindings:rows.flatMap(r=>leakageIssues(r).map(reason=>({id:r.id,reason}))),serializationKeysOnly:rows.every(r=>JSON.stringify(Object.keys(JSON.parse(providerState(r))))===JSON.stringify(["context","candidate"])),limitations:"Token Jaccard detects lexical proximity, not semantic paraphrases. Contrastive family matches are expected and require context/meaning inspection; numeric similarity alone does not reject them."};
const contents=JSON.stringify(report,null,2)+"\n",target=resolve(dir,"novelty-screen.json");
if(existsSync(target)&&readFileSync(target,"utf8")!==contents)throw new Error("Preserved novelty screen differs");
if(!existsSync(target))writeFileSync(target,contents,{flag:"wx"});
console.log(JSON.stringify({crossV0:v0.filter(r=>r.flagged.length),crossDraft:draft.filter(r=>r.flagged.length),withinCount:within.length,unrelatedWithin:within.filter(r=>!r.sameFamily),contextInspection:hints},null,2));
