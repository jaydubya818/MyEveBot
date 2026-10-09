import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { admit, datasetQuality, reconcileBatch, reviewerInput, providerState, leakageIssues, type ChallengeAuthor, type CohortRecord } from "../../../../apps/eve/lib/decision-intelligence/challenge-cohorts.ts";
import { hashValue } from "../../../../apps/eve/lib/decision-intelligence/challenge-review.ts";
const dir=import.meta.dirname;
const read=(file:string)=>JSON.parse(readFileSync(resolve(dir,file),"utf8"));
function preserve(file:string,data:unknown){const text=JSON.stringify(data,null,2)+"\n",path=resolve(dir,file);if(existsSync(path)){if(readFileSync(path,"utf8")!==text)throw new Error(`Preserved artifact differs: ${file}`);return;}writeFileSync(path,text,{flag:"wx"});}
const authored:ChallengeAuthor[]=read("authored.json");
const manifest=read("review-manifest.json");
const byId=new Map(authored.map(r=>[r.id,r]));
const reviewed:CohortRecord[]=manifest.batches.flatMap((batch:{batch:number;ids:string[];file:string;blindedInputHash:string})=>{
 const rows=batch.ids.map(id=>byId.get(id)!);
 if(hashValue(reviewerInput(rows))!==batch.blindedInputHash || JSON.stringify(reviewerInput(rows))!==JSON.stringify(read(batch.file)))throw new Error("Review partition changed");
 const result=read(`review/results-${batch.batch}.json`);
 return reconcileBatch(rows,result,["reauthor_evidence","reauthor_intent","reauthor_state"]);
});
const preRejected=read("pre-review-rejections.json") as {id:string;state:CohortRecord['state'];reasons:string[]}[];
for(const rejection of preRejected) reviewed.push({...admit(byId.get(rejection.id)!,null),...rejection,expected:null});
if(reviewed.length!==authored.length||new Set(reviewed.map(r=>r.id)).size!==authored.length)throw new Error("Unaccounted authored rows");
const qualityAudit=read("construction-quality-audit.json");
for(const row of reviewed){const audit=qualityAudit.rejected[row.id];if(audit){row.state=audit.state;row.expected=null;row.reasons=[audit.reason,...row.reasons];}}
const legacyAudit=new Map<string,{disposition:string;reason:string}>(read("legacy-admission-audit.json").cases.map((r:{originalId:string;disposition:string;reason:string})=>[r.originalId,r]));
const legacy:CohortRecord[]=read("../reviewed.json").map((r:any,index:number)=>{
 const row:ChallengeAuthor={id:`standard_${r.id.slice(1).padStart(4,"0")}`,familyId:`family_${1001+index}`,candidate:r.candidate,context:r.context,label:r.label,confidence:r.confidence,ambiguous:r.label===null,defensible:r.groundTruthStatus==="AGREED",difficulty:r.difficulty,boundaries:r.boundaries,rationale:r.rationale,difficultyRationale:"Preserved first-draft author assessment; no post-review difficulty change.",surfaceLure:null,domain:"arts-heritage-and-fieldwork",speaker:/\bowner\b/i.test(r.context)?"owner":"unspecified",construction:"STANDARD"};
 const assessment={...r.review,id:row.id,defensible:r.review.label!==null&&!r.review.ambiguous&&r.review.confidence!=="LOW",rubricSensitive:false};
 const result=admit(row,assessment);
 const audit=legacyAudit.get(r.id)!;
 if(audit.disposition!=="CANDIDATE_STANDARD"){
  result.state=audit.disposition==="REJECTED_LEAKAGE"?"REJECTED_LEAKAGE":"REJECTED_INVALID";result.expected=null;result.reasons=[audit.reason];
 }
 return {...result,originalId:r.id};
});
const rows=[...legacy,...reviewed].sort((a,b)=>a.id.localeCompare(b.id));
const primary=rows.filter(r=>r.state==="STANDARD"||r.state==="CHALLENGE");
const stress=rows.filter(r=>r.state==="TAXONOMY_STRESS");
const challenge=rows.filter(r=>r.state==="CHALLENGE");
const lengthStats=(items:CohortRecord[],key:"candidate"|"context")=>{const n=items.map(r=>r[key].length).sort((a,b)=>a-b);return {count:n.length,min:n[0]??null,median:n.length?n[Math.floor(n.length/2)]:null,p95:n.length?n[Math.ceil(n.length*.95)-1]:null,max:n.at(-1)??null};};
const histogram=(items:CohortRecord[],key:"domain"|"speaker")=>Object.fromEntries([...new Set(items.map(r=>r[key]))].sort().map(value=>[value,items.filter(r=>r[key]===value).length]));
const cohortSummary=Object.fromEntries(["STANDARD","CHALLENGE","TAXONOMY_STRESS"].map(cohort=>{const items=rows.filter(r=>r.state===cohort);return [cohort,{count:items.length,candidateLength:lengthStats(items,"candidate"),contextLength:lengthStats(items,"context"),domains:histogram(items,"domain"),speakers:histogram(items,"speaker"),temporal:{past:items.filter(r=>/\b(was|were|had|yesterday|last|did)\b/i.test(r.candidate)).length,future:items.filter(r=>/\b(will|tomorrow|next|going to)\b/i.test(r.candidate)).length,conditional:items.filter(r=>/\b(if|unless|would)\b/i.test(r.candidate)).length,corrected:items.filter(r=>r.boundaries.includes("CORRECTION")||r.boundaries.includes("TEMPORAL_CHANGE")).length},temporalNote:"Rough non-exclusive lexical/tag diagnostics, not semantic labels."}];}));
const cuePattern=/\b(decid\w*|decision\w*|promis\w*|commit\w*|prefer\w*|hypothes\w*|observ\w*|insight\w*|fact\w*)\b/gi;
const cueRows=challenge.flatMap(r=>{const words=r.candidate.match(cuePattern);return words?[{id:r.id,label:r.expected,words}]:[];});
const quality={allAuthored:datasetQuality(rows),revision:datasetQuality(reviewed),legacy:datasetQuality(legacy),cohorts:cohortSummary,challengeDifficulty:datasetQuality(challenge).byDifficulty,cueDiagnostic:{matchedExamples:cueRows.length,total:challenge.length,rows:cueRows,note:"Diagnostic only. No model was trained; contextual/discourse shortcuts still require interpretation."},reviewActivity:{newAuthorAgents:3,newReviewAgents:manifest.batches.length,previousReviewAgents:3,reviewInputTokens:null,reviewOutputTokens:null,reviewCostUsd:null,jevCalls:0,note:"Agent invocations counted; underlying model-request/token/cost telemetry unavailable. No separately invoked external review API."}};
const included=[...primary,...stress];
const leakage=included.flatMap(r=>leakageIssues(r).map(reason=>({id:r.id,reason})));
const gates={accounted:quality.allAuthored.accounted,leakage:leakage.length===0,neutralIds:rows.every(r=>/^(standard|challenge)_\d{4}$/.test(r.id)),reviewComplete:included.every(r=>r.reviewStatus==="VALID"),adversarial:challenge.filter(r=>r.difficulty==="ADVERSARIAL").length>=60,substantialChallenge:challenge.length>=180,insightAgreed:primary.filter(r=>r.expected==="insight").length>=40,insightChallenge:challenge.filter(r=>r.expected==="insight").length>=20,boundaryDiversity:["FACT_OBSERVATION","OBSERVATION_INSIGHT","OBSERVATION_HYPOTHESIS","INSIGHT_HYPOTHESIS","DECISION_COMMITMENT","PREFERENCE_DECISION","INTENT_COMMITMENT"].every(b=>challenge.filter(r=>r.boundaries.includes(b as any)).length>=10),classCoverage:["fact","observation","hypothesis","decision","commitment","preference","insight"].every(c=>challenge.filter(r=>r.expected===c).length>=10),nearDuplicateScreen:read("novelty-screen.json").v0.every((r:any)=>r.flagged.length===0)&&read("novelty-screen.json").draft.every((r:any)=>r.flagged.length===0)};
const states={rows,quality,gates,datasetQualityPass:Object.values(gates).every(Boolean),note:"Dataset quality gates only; not Stage 1 harness/UI/regression qualification."};
preserve("cohort-records.json",rows);preserve("quality.json",quality);preserve("dataset-gates.json",{...gates,datasetQualityPass:states.datasetQualityPass,note:states.note});preserve("human-review.json",stress);
for(const cohort of ["STANDARD","CHALLENGE","TAXONOMY_STRESS"])preserve(`${cohort.toLowerCase()}.json`,rows.filter(r=>r.state===cohort));
preserve("cohort-hashes.json",Object.fromEntries(["STANDARD","CHALLENGE","TAXONOMY_STRESS"].map(cohort=>{const selected=rows.filter(r=>r.state===cohort);return [cohort,{count:selected.length,metadataHash:hashValue(selected),providerInputHash:hashValue(selected.map(r=>JSON.parse(providerState(r))))}];})));
console.log(JSON.stringify({states:quality.allAuthored.counts,newDifficulty:quality.revision.byDifficulty,challengeDifficulty:quality.challengeDifficulty,classes:datasetQuality(challenge).byClass,gates},null,2));
