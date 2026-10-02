"use client";
import {useEffect,useState} from 'react';
import type {AgentHomeView} from '@/lib/product/agent-home';

export function AgentHome({agentId}:{agentId:string}) {
 const [data,setData]=useState<AgentHomeView|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{
  let disposed=false,timer:ReturnType<typeof setTimeout>;let controller:AbortController|undefined;
  async function load(){controller?.abort();const current=new AbortController();controller=current;
   try{const r=await fetch(`/api/agents/${encodeURIComponent(agentId)}/home`,{cache:'no-store',signal:current.signal});if(!r.ok)throw Error('Agent activity could not be refreshed.');const body=await r.json();if(!disposed&&!current.signal.aborted){setData(body);setError('');}}
   catch(e){if(!disposed&&!current.signal.aborted)setError(e instanceof Error?e.message:'Activity unavailable.');}
   finally{if(!disposed&&!current.signal.aborted)timer=setTimeout(load,15000);}}
  function refresh(){clearTimeout(timer);void load();}function visible(){if(document.visibilityState==='visible')refresh();}
  void load();window.addEventListener('online',refresh);document.addEventListener('visibilitychange',visible);
  return()=>{disposed=true;controller?.abort();clearTimeout(timer);window.removeEventListener('online',refresh);document.removeEventListener('visibilitychange',visible);};
 },[agentId,retry]);
 if(error)return <section className="mt-5" aria-label="Agent activity"><p role="alert">{error}</p><button className="min-h-11 underline" onClick={()=>setRetry(n=>n+1)}>Retry agent activity</button></section>;
 if(!data)return <p role="status" className="mt-5 text-sm text-kumo-subtle">Loading responsibilities and recent Work…</p>;
 const working=data.works.filter(w=>w.state.lane==='Working'),needsYou=data.works.filter(w=>w.needsDecision);
 const state=data.agent.configurationStatus!=='active'?'Unavailable':needsYou.length?'Needs You':working.length?'Working':(data.works.some(w=>w.state.lane==='Monitoring')||data.routineExecutionQualified&&data.routines.some(r=>r.status==='active'&&r.nextRun))?'Monitoring':data.works.some(w=>w.projection.lifecycle==='active'&&!w.projection.latestResult)||data.routines.some(r=>r.status==='active')?'Waiting':'Idle';
 return <section aria-label="Agent activity" data-agent-id={agentId} className="mt-6 grid gap-5 text-sm [overflow-wrap:anywhere]">
  <p role="status"><strong>{state}</strong>{working.length?` · ${working.length} active Work`:''}</p>
  <section><h3 className="font-semibold">Work and Results</h3>{data.works.length?<ul className="mt-2 grid gap-3">{data.works.map(({projection:w,needsDecision,state})=><li key={w.workId} className="rounded-xl border border-kumo-hairline p-3"><a className="font-medium underline" href={`/work?kind=work&id=${encodeURIComponent(w.workId)}`}>{w.title}</a><p>{state.lane} — {state.detail}</p>{w.latestResult&&<p className="mt-1 text-kumo-subtle">{w.latestResult.summary}</p>}{needsDecision&&<a className="mt-2 inline-block underline" href={`/work/${encodeURIComponent(w.workId)}/decision`}>Review owner decision</a>}</li>)}</ul>:<p className="mt-1 text-kumo-subtle">No canonical Work is associated with this agent yet.</p>}</section>
  <section><h3 className="font-semibold">Responsibilities</h3>{data.routines.length?<ul className="mt-2 grid gap-3">{data.routines.map(r=><li key={r.id} className="rounded-xl border border-kumo-hairline p-3"><p className="font-medium">{r.name}</p><p>{r.status==='active'?(data.routineExecutionQualified&&r.nextRun?'Monitoring':'Waiting — background execution is not qualified'):r.status.replaceAll('_',' ')}</p><p className="text-kumo-subtle">Scheduled: {r.nextRun?new Date(r.nextRun).toLocaleString(undefined,{timeZone:r.timezone??undefined}):'No next check'} {r.timezone}</p></li>)}</ul>:<p className="mt-1 text-kumo-subtle">No routines assigned. Ask this agent to own a recurring responsibility; execution requires qualification.</p>}<a href="/manage" className="mt-2 inline-block underline">Review routine configuration</a></section>
  {data.runs.length>0&&<section><h3 className="font-semibold">Recent tasks</h3><ul className="mt-2 grid gap-2">{data.runs.map(r=><li key={r.id}><a className="underline" href={r.threadId?`/chat?thread=${encodeURIComponent(r.threadId)}`:`/manage/activity?task=${encodeURIComponent(r.id)}`}>{r.title}</a> · {r.status.replaceAll('_',' ')}{r.summary&&<p className="text-kumo-subtle">{r.summary}</p>}</li>)}</ul></section>}
  <section><h3 className="font-semibold">Conversations</h3>{data.threads.length?<ul className="mt-2 grid gap-1">{data.threads.map(t=><li key={t.id}><a className="inline-block min-h-11 py-2 underline" href={`/chat?thread=${encodeURIComponent(t.id)}`}>{t.title}</a></li>)}</ul>:<p className="mt-1 text-kumo-subtle">Start a conversation to give this agent an outcome.</p>}<p className="mt-2 text-xs text-kumo-subtle">Most recent 20 conversations. Use conversation search for older history.</p></section>
 </section>;
}
