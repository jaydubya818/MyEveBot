"use client";

import { useCallback,useEffect,useState } from "react";
import { Button,Loader } from "@cloudflare/kumo";
import type { RoutineConfiguration } from "@/lib/execution-types";

interface RoutineRow {
  id:number;routine_name:string|null;prompt:string;cron:string|null;timezone:string;status:string;
  configuration_version:number;reviewed_version:number|null;next_fire_at:string;
  execution_status:string|null;consecutive_failures:number|null;last_failure:string|null;
}
interface AgentOption {id:string;name:string;status:string;limits:{maxSteps:number;maxRuntimeSeconds:number;maxEstimatedCostUsd:number}}
interface RoutineData {executionReady:boolean;routines:RoutineRow[];agents:AgentOption[];capabilities:{id:string;name:string;risk:"low"|"medium"|"high"|"critical"}[]}
const field="mt-1 w-full rounded-lg border border-kumo-line bg-kumo-base px-3 py-2 text-sm";

function RoutineReview({routine,data,onSaved,onClose}:{routine:RoutineRow;data:RoutineData;onSaved:()=>void;onClose:()=>void}) {
  const [agentId,setAgentId]=useState(data.agents.find(a=>a.status==="active")?.id??"");
  const [capabilities,setCapabilities]=useState<string[]>([]);
  const [channel,setChannel]=useState<RoutineConfiguration["deliveryChannel"]>("in_app");
  const [confirmed,setConfirmed]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const agent=data.agents.find(a=>a.id===agentId);
  const [steps,setSteps]=useState(Math.min(20,agent?.limits.maxSteps??20));
  const [seconds,setSeconds]=useState(Math.min(300,agent?.limits.maxRuntimeSeconds??300));
  const [cost,setCost]=useState(Math.min(1,agent?.limits.maxEstimatedCostUsd??1));
  async function save(event:React.FormEvent) {
    event.preventDefault();if(!confirmed || !agent)return;
    setBusy(true);setError(null);
    const riskOrder=["low","medium","high","critical"] as const;
    const maximumRisk=riskOrder[Math.max(0,...data.capabilities.filter(c=>capabilities.includes(c.id)).map(c=>riskOrder.indexOf(c.risk)))];
    const configuration:RoutineConfiguration={instructions:routine.prompt,authority:{allowedCapabilities:capabilities,allowedTargets:[],maximumRisk,requiresApprovalFor:capabilities.includes("tool.send_email")?["tool.send_email"]:[]},
      limits:{maxSteps:steps,maxRuntimeSeconds:seconds,maxCostUsd:cost},
      retry:{maxAttempts:3,backoffSeconds:[60,300,900]},missedPolicy:"run_latest",deliveryChannel:channel};
    try {
      const response=await fetch("/api/routines",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({reminderId:routine.id,expectedVersion:routine.configuration_version,agentId,configuration,confirm:true})});
      if(!response.ok) {
        const body=await response.json().catch(()=>null);
        throw new Error(body?.error?.message??"The routine changed. Reload and review it again.");
      }
      onSaved();
    } catch(cause) {setError(cause instanceof Error?cause.message:"Review could not be saved.");}
    finally {setBusy(false);}
  }
  return <form onSubmit={save} className="mt-4 space-y-4 border-t border-kumo-hairline pt-4" aria-label={`Review ${routine.routine_name??"reminder"}`}>
    <div><h5 className="text-sm font-semibold">What will run</h5><p className="mt-2 whitespace-pre-wrap break-words text-sm">{routine.prompt}</p></div>
    <p className="text-sm text-kumo-subtle">{routine.cron?`${routine.cron} · ${routine.timezone}. Starts at the next future scheduled time; missed runs are skipped.`:"Runs once after approval if its scheduled time has passed."}</p>
    <label className="block text-sm">Agent<select className={field} value={agentId} onChange={e=>setAgentId(e.target.value)} required>
      <option value="" disabled>Choose an Agent</option>{data.agents.filter(a=>a.status==="active").map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
    </select></label>
    <fieldset><legend className="text-sm font-medium">Allowed capabilities</legend>
      <p className="mt-1 text-xs text-kumo-subtle">Only selected capabilities are permitted. Knowledge observations use standing authority. Email sends always pause for exact approval; drafts stay in MyEve. Browser, file access, messaging and delegation are blocked.</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">{data.capabilities.map(c=><label key={c.id} className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={capabilities.includes(c.id)} onChange={e=>setCapabilities(current=>e.target.checked?[...current,c.id]:current.filter(id=>id!==c.id))}/>{c.name}
      </label>)}</div>
    </fieldset>
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="text-sm">Model steps<input className={field} type="number" min={1} max={agent?.limits.maxSteps??200} value={steps} onChange={e=>setSteps(Number(e.target.value))} required/></label>
      <label className="text-sm">Time limit (seconds)<input className={field} type="number" min={30} max={agent?.limits.maxRuntimeSeconds??3600} value={seconds} onChange={e=>setSeconds(Number(e.target.value))} required/></label>
      <label className="text-sm">Cost limit (USD)<input className={field} type="number" min={0.01} step={0.01} max={agent?.limits.maxEstimatedCostUsd??100} value={cost} onChange={e=>setCost(Number(e.target.value))} required/></label>
    </div>
    <label className="block text-sm">Result notification<select className={field} value={channel} onChange={e=>setChannel(e.target.value as typeof channel)}>
      <option value="in_app">In MyEve</option><option value="push" disabled>Web push — unavailable</option><option value="telegram">Telegram to my configured account</option>
    </select></label>
    <p className="text-xs text-kumo-subtle">Up to 3 attempts for safe temporary failures. Pauses after 3 failed occurrences. An uncertain result requires verification. Notification retries do not repeat the work.</p>
    <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} required/>
      I reviewed these instructions, capabilities, limits and delivery settings, and authorize this routine to run once execution is available.</label>
    {error && <p role="alert" className="text-sm text-kumo-danger">{error}</p>}
    <div className="flex gap-2"><Button type="submit" disabled={busy||!confirmed||!agentId}>{busy?"Saving…":data.executionReady?"Approve and activate":"Save owner review"}</Button><Button type="button" variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button></div>
  </form>;
}

export function RoutinesPanel() {
  const [data,setData]=useState<RoutineData|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [reviewing,setReviewing]=useState<number|null>(null);
  const [notice,setNotice]=useState<string|null>(null);
  const load=useCallback(async(signal?:AbortSignal)=>{
    try {const response=await fetch("/api/routines",{cache:"no-store",signal});if(!response.ok)throw new Error();setData(await response.json());setError(null);}
    catch {if(!signal?.aborted)setError("Routines could not be loaded. Check the connection and retry.");}
  },[]);
  useEffect(()=>{const controller=new AbortController();void load(controller.signal);return()=>controller.abort();},[load]);
  return <section className="mb-8" aria-labelledby="routines-title">
    <h3 id="routines-title" className="text-base font-semibold">Routines</h3>
    <p className="mt-1 text-sm text-kumo-subtle">Existing reminders wait for your review before their next execution. Changes to instructions or schedules require another review.</p>
    {data&&!data.executionReady&&<p className="mt-3 text-sm text-kumo-subtle">Unattended execution is blocked until final provider qualification is complete. You can save your review now; no routine will run yet.</p>}
    {notice && <p role="status" className="mt-3 text-sm">{notice}</p>}
    {error?<div role="alert" className="mt-3 text-sm">{error}<Button className="ml-3" size="sm" variant="secondary" onClick={()=>void load()}>Retry</Button></div>:!data?<div className="py-6" role="status" aria-label="Loading routines"><Loader size={18}/></div>:data.routines.length===0?
      <p className="mt-4 rounded-xl border border-dashed border-kumo-hairline p-5 text-sm text-kumo-subtle">No routines yet. Ask your Agent to schedule a reminder, then review it here.</p>:
      <ul className="mt-4 space-y-3">{data.routines.map(r=>{
        const needsReview=r.reviewed_version!==r.configuration_version||!r.execution_status;
        const canReview=needsReview||r.execution_status==="paused"||r.execution_status==="auto_paused";
        return <li key={r.id} className="rounded-xl border border-kumo-hairline p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="font-medium">{r.routine_name??`Reminder ${r.id}`}</h4>
            <p className="mt-1 text-sm text-kumo-subtle">{needsReview?"Waiting for your review — will not run":r.execution_status==="auto_paused"?"Paused after repeated failures":r.execution_status==="paused"?"Paused":data.executionReady?"Approved":"Review saved — execution blocked"}</p>
            {!!r.consecutive_failures&&<p className="mt-1 text-sm">{r.consecutive_failures} consecutive failures</p>}
          </div>{canReview&&<Button size="sm" variant="secondary" onClick={()=>setReviewing(r.id)}>Review</Button>}</div>
          {reviewing===r.id&&<RoutineReview routine={r} data={data} onClose={()=>setReviewing(null)} onSaved={()=>{setReviewing(null);setNotice(data.executionReady?"Routine approved. Missed recurring runs will not be replayed.":"Owner review saved. Execution remains blocked until final qualification is complete.");void load();}}/>}
        </li>;
      })}</ul>}
  </section>;
}
