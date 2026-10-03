"use client";
import {useEffect,useState} from 'react';
import type {AgentHomeView} from '@/lib/product/agent-home';

export function useAgentCurrentTruth(agentId:string){
 const [data,setData]=useState<AgentHomeView|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{
  let disposed=false,timer:ReturnType<typeof setTimeout>;let controller:AbortController|undefined;
  setData(null);setError('');
  async function load(){controller?.abort();const current=new AbortController();controller=current;
   try{const r=await fetch(`/api/agents/${encodeURIComponent(agentId)}/home`,{cache:'no-store',signal:AbortSignal.any([current.signal,AbortSignal.timeout(15000)])});if(!r.ok)throw Error('Agent activity could not be refreshed.');const body=await r.json();if(!disposed&&!current.signal.aborted){setData(body);setError('');}}
   catch(e){if(!disposed&&!current.signal.aborted){setData(null);setError(e instanceof Error?e.message:'Activity unavailable.');}}
   finally{if(!disposed&&!current.signal.aborted)timer=setTimeout(()=>{if(document.visibilityState==='visible')void load();},15000);}}
  function refresh(){clearTimeout(timer);void load();}function visible(){if(document.visibilityState==='visible')refresh();}
  void load();window.addEventListener('online',refresh);document.addEventListener('visibilitychange',visible);
  return()=>{disposed=true;controller?.abort();clearTimeout(timer);window.removeEventListener('online',refresh);document.removeEventListener('visibilitychange',visible);};
 },[agentId,retry]);
 return {data,error,retry:()=>setRetry(n=>n+1)};
}
export function AgentLook({name,look}:{name:string;look:Record<string,unknown>}){
 const tone=look.tone==='clay'?'bg-orange-100 text-orange-950':look.tone==='slate'?'bg-slate-200 text-slate-950':'bg-lime-100 text-green-950';
 return <span aria-hidden className={`inline-grid size-12 shrink-0 place-items-center rounded-2xl text-lg font-semibold ${tone}`}>{look.style==='robot'?'✦':name.trim().slice(0,2).toUpperCase()}</span>;
}
export const approvalText={none:'No standing approval requirement',always:'Approval required',conditional:'Approval depends on the action',owner_policy:'Owner policy applies'};
export function LiveAgentCard({data,compact=false}:{data:AgentHomeView;compact?:boolean}){
 const working=data.works.filter(w=>w.state.lane==='Working'),needs=data.works.filter(w=>w.needsDecision);
 const state=needs.length?'Needs You':working.length?'Working':data.agent.configurationStatus!=='active'?data.agent.configurationStatus:data.works.some(w=>w.state.lane==='Monitoring')||data.routineExecutionQualified&&data.routines.some(r=>r.status==='active'&&r.nextRun)?'Monitoring':data.works.some(w=>w.state.lane==='Waiting')||data.routines.some(r=>r.status==='active')?'Waiting':'Idle';
 const active=needs[0]??working[0]??data.works.find(w=>w.state.lane==='Monitoring'||w.state.lane==='Waiting');
 return <section aria-label={`Live Agent Card: ${data.agent.name}`} data-live-agent-card className="rounded-2xl border border-kumo-hairline bg-kumo-tint/30 p-4 text-sm [overflow-wrap:anywhere]">
  <div className="flex items-start gap-3"><AgentLook name={data.agent.name} look={data.agent.avatarConfig??{}}/><div className="min-w-0 flex-1"><h3 className="text-lg font-semibold">{data.agent.name}</h3><p className="text-kumo-subtle">@{data.agent.handle}</p></div><span role="status" className="rounded-full border border-kumo-hairline px-2 py-1 text-xs capitalize">{state}</span></div>
  <p className="mt-3">{data.agent.purpose}</p>
  {active&&<p className="mt-3"><a className="underline" href={`/work?kind=work&id=${encodeURIComponent(active.projection.workId)}`}>{active.projection.title}</a><span className="block text-kumo-subtle">{active.state.detail}</span></p>}
  {!active&&data.routines[0]&&<p className="mt-3">Responsibility: {data.routines[0].name}</p>}
  <details className="mt-3" open={!compact}><summary className="min-h-11 cursor-pointer py-2 font-medium">Capabilities & authority</summary>
   <p className="mb-2 text-xs text-kumo-subtle">Availability, agent access and action approval are separate. Every action still checks current scope and policy.</p>
   {data.authority?.length?<ul className="grid gap-2">{data.authority.map(c=><li key={c.id} className="rounded-xl border border-kumo-hairline p-3"><strong>{c.name}</strong><p className="mt-1 text-xs text-kumo-subtle">{c.description}</p><dl className="mt-1 grid gap-1 text-xs"><div><dt className="inline">Availability: </dt><dd className="inline">{c.availability}</dd></div><div><dt className="inline">Agent policy: </dt><dd className="inline">{c.allowed?'Allowed by agent policy':'Not allowed'}</dd></div><div><dt className="inline">Action approval: </dt><dd className="inline">{approvalText[c.approval]}</dd></div></dl>{c.reason&&<p className="mt-1 text-xs text-kumo-subtle">{c.reason}</p>}</li>)}</ul>:<p className="text-kumo-subtle">No assigned capability policy is available here. Review access before assigning Work.</p>}
   <a className="mt-2 inline-block min-h-11 py-2 underline" href="/apps">Review connections and governed access</a>
  </details>
 </section>;
}
export function LiveAgentTile({agentId}:{agentId:string}){
 const {data,error,retry}=useAgentCurrentTruth(agentId);
 return <div>{error?<div role="alert"><p>{error}</p><button onClick={retry}>Retry agent card</button></div>:data?<><LiveAgentCard data={data} compact/><a className="inline-block min-h-11 py-2 underline" href={`/agents?agent=${encodeURIComponent(agentId)}`}>Open {data.agent.name}</a></>:<p role="status">Refreshing agent…</p>}</div>;
}
