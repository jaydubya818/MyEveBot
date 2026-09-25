"use client";
import { useState } from "react";
import type { Execution } from "../../lib/engineering/execution";
import type { manifest } from "../../lib/engineering/execution";
type Manifest=ReturnType<typeof manifest>;
const button="min-h-11 rounded-lg border border-kumo-line px-4 py-2 text-sm font-medium disabled:opacity-50";
export function ExecutionDetail({state,current,onReload}:{state:Execution;current:Manifest;onReload:()=>Promise<void>}) {
  const [tab,setTab]=useState("Overview"),[busy,setBusy]=useState(false),[error,setError]=useState(""),[updates,setUpdates]=useState(false);
  async function command(value:unknown) {
    setBusy(true);setError("");
    try {const response=await fetch(`/api/engineering/work/${current.workId}/execution`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(value)});
      const body=await response.json();if(!response.ok)throw new Error(body.error);await onReload();
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  return <section className="grid min-w-0 gap-5 border-t border-kumo-line pt-6" aria-label="Engineering execution">
    {state.qualificationMode==="simulation"&&<p role="note" className="rounded-lg border border-amber-500 p-3 text-sm">Qualification simulation: GitHub and executor events are fixtures. This is not live provider evidence.</p>}
    <div><p className="text-xs uppercase tracking-wide text-kumo-subtle">Internal engineering work</p><h3 className="mt-2 text-xl font-semibold">{current.status}</h3>
      <p className="mt-2 text-sm text-kumo-subtle">{current.readiness.ready?"The current candidate matches the draft PR head and all required evidence is current.":current.readiness.reasons[0]}</p></div>
    <nav aria-label="Work detail sections" className="flex flex-wrap gap-2">{["Overview","Changes","Evidence","Activity","Decisions","Results"].map(name=><button key={name} className={button} aria-pressed={tab===name} onClick={()=>setTab(name)}>{name}{name==="Decisions"&&current.pendingDecisions.length?` (${current.pendingDecisions.length})`:""}</button>)}</nav>
    {error&&<p role="alert" className="text-sm text-red-600">{error}</p>}
    {tab==="Overview"&&<div className="grid gap-4 text-sm">
      <dl className="grid gap-3"><div><dt className="text-kumo-subtle">Source issue</dt><dd><a className="underline" href={state.contract.issueUrl}>Issue #{state.contract.issue}</a></dd></div>
        <div><dt className="text-kumo-subtle">Candidate</dt><dd className="break-all font-mono">{current.candidateSha??"No candidate yet"}</dd></div>
        <div><dt className="text-kumo-subtle">Budget</dt><dd>${current.budget.reservedUsd.toFixed(4)} reserved of ${current.budget.limitUsd.toFixed(2)}. {current.budget.coverage}.</dd></div>
        <div><dt className="text-kumo-subtle">Executor / Runs</dt><dd>{state.contract.executor} · {state.runs.length} of {state.contract.limits.maxRuns}</dd></div></dl>
      <h4 className="font-semibold">{current.readiness.ready?"Why ready?":"Why not ready?"}</h4>
      {current.readiness.ready?<p>Current protected verification and CI pass. Publication is confirmed and no required decision remains.</p>:<ul className="list-disc space-y-2 pl-5">{current.readiness.reasons.map(reason=><li key={reason}>{reason}</li>)}</ul>}
      {state.truth?.pr&&<a href={state.truth.pr.url} className="underline">Open draft PR #{state.truth.pr.number}</a>}
    </div>}
    {tab==="Changes"&&<div className="grid gap-4 text-sm">{state.candidates.length?state.candidates.map(candidate=><details key={candidate.id} className="rounded-lg border border-kumo-line p-4"><summary className="cursor-pointer break-all">{candidate.sha.slice(0,12)} · {candidate.changedPaths.join(", ")}</summary><p className="my-3">Candidate retained independently of executor attempt {candidate.attemptId}.</p><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(JSON.parse(candidate.patch),null,2)}</pre></details>):<p>No candidate has been retained yet.</p>}</div>}
    {tab==="Evidence"&&<div className="grid gap-3 text-sm">{state.evidence.length?state.evidence.map(e=><details key={e.id} className="rounded-lg border border-kumo-line p-4"><summary className="cursor-pointer">{e.result} · {e.check} · {e.candidate.slice(0,10)}</summary><dl className="mt-3 grid gap-2"><div>Producer: {e.producer}</div><div>Criteria version: {e.criteriaVersion}</div><div>Observed: {e.observedAt}</div><div className="break-all">Artifact: {e.artifactHash}</div></dl><pre className="mt-3 overflow-auto whitespace-pre-wrap break-all text-xs">{e.artifact}</pre></details>):<p>Verification has not run. No passing evidence is claimed.</p>}
      <h4 className="font-semibold">GitHub CI</h4>{state.truth?.checks.length?state.truth.checks.map(c=><p key={c.id}>{c.result} · {c.name} · {c.sha.slice(0,10)}</p>):<p>Current CI evidence is unavailable.</p>}</div>}
    {tab==="Activity"&&<div className="grid gap-4 text-sm">{state.runs.map((run,index)=><div key={run.id} className="rounded-lg border border-kumo-line p-4"><h4 className="font-semibold">Run {index+1} · {run.status}</h4><p className="mt-2 whitespace-pre-wrap break-words">{run.reason}</p><p className="mt-2 text-kumo-subtle">{run.startedAt}</p></div>)}<p>Coordination Debt Events: {state.interventions.filter(i=>i.kind==="coordination_debt").length}</p><p>Human judgment events: {state.interventions.filter(i=>i.kind==="judgment").length}</p></div>}
    {tab==="Decisions"&&<div className="grid gap-4 text-sm">
      {state.phase==="approval"?<><h4 className="font-semibold">Approve draft PR publication</h4><p>This publishes candidate <span className="break-all font-mono">{current.candidateSha}</span> to {state.contract.repository}. The publisher may create a dedicated Work branch and draft PR. Merge and deployment remain denied.</p>
        <label className="flex items-start gap-3"><input type="checkbox" checked={updates} onChange={e=>setUpdates(e.target.checked)} className="mt-1"/><span>Also authorize bounded updates to this same PR for current CI failures and explicit in-scope review checks, within the existing criteria, paths, budget and deadline.</span></label>
        <button disabled={busy} className={button} onClick={()=>command({operation:"approve",revision:state.revision,candidate:current.candidateSha,boundedUpdates:updates})}>{busy?"Saving decision…":"Approve this candidate"}</button></>:
        state.phase==="needs_you"?<><h4 className="font-semibold">Human decision needed</h4>{state.blockers.map(b=><p key={b}>{b}</p>)}<p>Continue reconciles the branch and creates a fresh instance of the same executor. Existing evidence becomes stale and publication needs a new approval.</p><button className={button} disabled={busy||current.control!=="agent"||current.unknownEffects.length>0} onClick={()=>command({operation:"continue",revision:state.revision})}>Continue with fresh attempt</button></>:<p>No publication decision is pending.</p>}
      {current.unknownEffects.map(e=><p role="alert" key={e.id}>EXTERNAL STATE UNKNOWN · Action {e.id}. No blind retry is permitted.</p>)}
    </div>}
    {tab==="Results"&&<div className="grid gap-4 text-sm">{state.results.length?state.results.map(result=><article key={result.id} className="grid gap-3 rounded-lg border border-kumo-line p-4"><h4 className="font-semibold">Proof of Work · Result version {result.version}</h4><p>{result.summary}</p><p>{result.objective}</p><p className="break-all">Candidate {result.candidate}</p><p>Changed: {result.changes.join(", ")}</p><p>Why: {result.why}</p><p>{result.runs.length} Runs · {result.elapsedSeconds}s · ${result.reservedUsd.toFixed(4)} reserved</p><p>{result.costCoverage}</p><p>Limitations: {result.limitations.join("; ")}</p><p>Open risks: {result.risks.join("; ")||"No additional risks recorded; human review remains required."}</p><a className="underline" href={result.github.pr?.url}>Review draft PR</a><details><summary>Immutable Result data</summary><pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(result,null,2)}</pre></details></article>):<p>No Result has been issued. A Result requires current evidence-backed readiness.</p>}</div>}
  </section>;
}
