"use client";
import {useEffect,useState} from 'react';
import Link from 'next/link';
import type {ResponsibilitiesView} from '@/lib/product/responsibilities';
import {Card,Empty,State,date} from './primitives';

function scheduledDate(value:string,timezone:string|null){
 try{return new Date(value).toLocaleString(undefined,{timeZone:timezone??undefined,month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});}
 catch{return 'Time unavailable';}
}
export function Responsibilities({view='today'}:{view?:'today'|'inbox'}){
 const [data,setData]=useState<ResponsibilitiesView|null>(null),[error,setError]=useState(false),[revision,setRevision]=useState(0);
 useEffect(()=>{
  const controller=new AbortController();let pending=false;
  async function load(){
   if(pending)return;pending=true;
   try{const response=await fetch('/api/responsibilities',{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])});
    if(!response.ok)throw Error();const next=await response.json();if(!controller.signal.aborted){setData(next);setError(false);}
   }catch{if(!controller.signal.aborted){setData(null);setError(true);}}finally{pending=false;}
  }
  const refresh=()=>{if(document.visibilityState==='visible')void load();};
  void load();const timer=setInterval(refresh,30000);window.addEventListener('online',refresh);document.addEventListener('visibilitychange',refresh);
  return()=>{controller.abort();clearInterval(timer);window.removeEventListener('online',refresh);document.removeEventListener('visibilitychange',refresh);};
 },[revision]);
 return <Card title={view==='today'?'Ongoing responsibilities':'Results from your agents'}>
  <div data-responsibilities={view}>
   {error?<div role="alert"><p>Responsibilities could not be refreshed.</p><button onClick={()=>setRevision(v=>v+1)}>Retry responsibilities</button></div>:!data?<p role="status">Checking responsibilities…</p>:view==='today'?<>
    {!data.executionQualified&&<p className="owner-muted">Background execution is not qualified. Scheduled responsibilities are waiting.</p>}
    <ul className="owner-list">{data.routines.map(r=><li key={r.id}>
     <h3>{r.name}</h3><p><Link href={`/agents?agent=${encodeURIComponent(r.agentId)}`}>{r.agentName}</Link> · <State value={r.state}/></p>
     <p>{r.lastRun?`Last check: ${date(r.lastRun)} · ${r.lastStatus?.replaceAll('_',' ')}`:'No checks recorded yet.'}</p>
     {r.nextRun&&<p>Scheduled next: {scheduledDate(r.nextRun,r.timezone)}{r.timezone?` (${r.timezone})`:''}</p>}
     {r.summary&&<p>{r.summary}</p>}
     <Link href={r.threadId?`/chat?thread=${encodeURIComponent(r.threadId)}`:'/manage/routines'}>{r.threadId?'Open conversation':'Review responsibility'}</Link>
    </li>)}</ul>
    {!data.routines.length&&<Empty title="No ongoing responsibilities">Create a Routine from work you want an agent to own, then review its capabilities.</Empty>}
   </>:<>
    <ul className="owner-list">{data.results.map(r=><li key={r.occurrenceId}>
     <h3>{r.name}</h3><p>{r.summary??'A completed result is available.'}</p>
     <p className="owner-muted">{r.agentName}{r.completedAt?` · ${date(r.completedAt)}`:''}</p>
     <Link href={r.threadId?`/chat?thread=${encodeURIComponent(r.threadId)}`:`/agents?agent=${encodeURIComponent(r.agentId)}`}>{r.threadId?'Open conversation':'Open responsible agent'}</Link>
    </li>)}</ul>
    {!data.results.length&&<Empty title="No Routine notifications">Quiet checks remain in the responsible agent’s history.</Empty>}
   </>}
   <p className="owner-muted">Recent records only. <Link href="/manage/routines">Manage routines</Link></p>
  </div>
 </Card>;
}
