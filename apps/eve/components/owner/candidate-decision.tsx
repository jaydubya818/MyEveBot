"use client";
import { useCallback,useEffect,useState } from "react";
import Link from "next/link";
import type { OwnerPublication } from "@/lib/engineering/owner-publication";
import type { OwnerAction } from "@/lib/engineering/publication-contract";
import { OwnerNavigation } from "./navigation";
import "./owner.css";
type View=Awaited<ReturnType<OwnerPublication['view']>>;
const choices:{id:OwnerAction;label:string;effect:string}[]=[
 {id:'open_pr',label:'Open a pull request',effect:'Publish this exact candidate to one branch and open one draft pull request. CI and independent review follow. No merge, deployment or owner acceptance.'},
 {id:'push_branch',label:'Push branch only',effect:'Publish this exact candidate to one branch. No pull request, merge, deployment or owner acceptance.'},
 {id:'keep_private',label:'Keep private',effect:'Retain the candidate privately. No GitHub writes.'},
 {id:'reject',label:'Reject candidate',effect:'Mark this candidate rejected for publication. Preserve its evidence. No GitHub writes; publication needs a new explicit decision.'},
];
const money=(v:number)=>`$${(v/1000000).toFixed(6)}`;
export function OwnerCandidateDecision({workId}:{workId:string}){
 const [data,setData]=useState<View|null>(null),[error,setError]=useState(''),[choice,setChoice]=useState<OwnerAction|null>(null),[confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[saved,setSaved]=useState(false);
 const load=useCallback(async()=>{const r=await fetch(`/api/beta/owner-decision?workId=${encodeURIComponent(workId)}`,{cache:'no-store'});const body=await r.json();if(!r.ok)throw Error(body.error);setData(body);return body as View;},[workId]);
 useEffect(()=>{load().catch(e=>setError(e.message));},[load]);
 useEffect(()=>{if(!data?.publication||!['APPROVED','PUBLISHING'].includes(data.publication.state))return;const timer=setInterval(()=>load().catch(e=>setError(e.message)),4000);return()=>clearInterval(timer);},[data?.publication,load]);
 const selected=choices.find(c=>c.id===choice);
 async function decide(){if(!data||!choice||busy)return;setBusy(true);setError('');try{
  const response=await fetch('/api/beta/owner-decision',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({workId,bindingHash:data.bindingHash,previousId:data.decision?.id??null,action:choice,confirmed:true})});
  const body=await response.json();if(!response.ok)throw Error(body.error);await load();setConfirm(false);setSaved(true);
 }catch(e){setError(e instanceof Error?e.message:'Decision unavailable.');}finally{setBusy(false);}}
 return <div className="owner-shell"><OwnerNavigation/><main id="owner-content" className="owner-content" style={{maxWidth:850,margin:'auto',padding:24,overflowWrap:'anywhere'}}>
 <Link href="/results">Results</Link><h1>{data?'Sofie finished the work':'Owner decision'}</h1>
 {error&&<p role="alert">{error}</p>}{!data&&!error&&<p role="status">Loading retained Result…</p>}
 {data&&<>
 <p>{data.binding.allowedPaths.join(', ')} was implemented and independently verified.</p>
 <p>Implementation checks: <strong>{data.implementation.passed}/{data.implementation.total}</strong><br/>Independent verification: <strong>{data.verification.passed}/{data.verification.total}</strong></p>
 <p>Total journey model cost: <strong>{money(data.accounting.settledMicrousd)}</strong></p>
 <details><summary>Proof of Work</summary>
 <p>Candidate: {data.binding.candidate}<br/>Verified tree: {data.binding.verifiedTree}</p>
 <p>Sofie: {money(data.accounting.sofieMicrousd)} · Factory: {money(data.accounting.factoryMicrousd)}</p>
 <p>Historical Result: {data.proof.outcome}. Owner acceptance: NOT_RUN.</p>
 {data.readback&&<section aria-label="Current publication evidence"><p>Publication readback ({data.readback.observedAt}): PASS · GitHub CI: {data.readback.ci.status} · Independent review: {data.readback.review.status}</p><p>{data.readback.review.summary}</p><p>Current Result: PARTIAL. Owner acceptance remains NOT_RUN.</p><a href={data.readback.ci.url}>GitHub CI for this candidate</a></section>}
 <p>The historical Proof is an immutable snapshot. Current accounting above includes the final explanation.</p>
 <ul>{data.proof.evidence.map(e=><li key={e.criterionId}>{e.state} — {e.producer}: {e.sourceRef}</li>)}</ul>
 <details><summary>Canonical evidence references</summary><ul>{[...new Set(data.proof.artifactRefs)].map(s=><li key={s}>{s}{data.proof.artifactRefs.filter(ref=>ref===s).length>1?` — referenced by ${data.proof.artifactRefs.filter(ref=>ref===s).length} checks`:''}</li>)}</ul></details>
 </details>
 <section aria-labelledby="owner-decision-title"><h2 id="owner-decision-title">Needs You — owner decision</h2>
 {data.decision&&<p role="status">{data.decision.action==='reject'?'Candidate rejected.':data.decision.action==='keep_private'?'Kept private.':`Decision recorded: ${choices.find(c=>c.id===data.decision.action)?.label}.`} {data.publication?`Publication: ${data.publication.state}.`:'No GitHub writes.'}</p>}
 {data.publication?.remote?.pr&&<p><a href={data.publication.remote.pr.url}>Open draft pull request</a></p>}
 {data.publication?.state==='BRANCH_PUBLISHED'&&<p>Exact candidate branch published. No pull request created.</p>}
 {saved&&<p role="status">Your decision was saved. Owner acceptance remains separate.</p>}
 {!data.publication&&<>
 {!confirm?<form onSubmit={e=>{e.preventDefault();if(choice)setConfirm(true);}}>
 <fieldset><legend>Choose what happens to this candidate</legend>{choices.map(c=><label key={c.id} style={{display:'flex',alignItems:'center',gap:12,minHeight:52,padding:'12px 0'}}><input style={{width:20,height:20,minHeight:20,padding:0,margin:0,flex:"0 0 20px"}} type="radio" name="candidate-action" value={c.id} checked={choice===c.id} onChange={()=>{setChoice(c.id);setSaved(false);}}/> {c.label}</label>)}</fieldset>
 <button type="submit" disabled={!choice}>Review decision</button>
 </form>:<section aria-label="Confirm owner decision"><h3>Confirm: {selected?.label}</h3><p>{selected?.effect}</p>
 <dl><dt>Repository</dt><dd>{data.binding.repository}</dd><dt>Base</dt><dd>{data.binding.baseRef} at {data.binding.expectedBaseSha}</dd><dt>Candidate branch</dt><dd>{data.binding.branch}</dd><dt>Exact candidate</dt><dd>{data.binding.candidate}</dd></dl>
 {choice==='open_pr'&&<details><summary>Pull request details</summary><p>{data.binding.title}</p><pre style={{whiteSpace:'pre-wrap'}}>{data.binding.body}</pre></details>}
 <p>Approval applies only to this Work, Result, revision {data.binding.version}, generation {data.binding.generation}, candidate and verified tree.</p>
 <button type="button" disabled={busy} onClick={decide}>{busy?'Saving…':'Confirm decision'}</button>{' '}<button type="button" disabled={busy} onClick={()=>setConfirm(false)}>Back</button>
 </section>}
 </>}
 </section></>}
 </main></div>;
}
