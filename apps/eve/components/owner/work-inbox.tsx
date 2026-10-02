"use client";
import {useEffect,useState} from 'react';
import Link from 'next/link';
import type {WorkInboxView} from '@/lib/product/work-inbox';
import type {WorkLane} from '@/lib/product/work-state';
import {Card,Empty} from './primitives';
const lanes:WorkLane[]=['Needs You','Working','Monitoring','Completed','Waiting'];
export function WorkInbox(){
 const [data,setData]=useState<WorkInboxView|null>(null),[error,setError]=useState(false),[revision,setRevision]=useState(0),[offset,setOffset]=useState(0),[lane,setLane]=useState<WorkLane>('Needs You');
 useEffect(()=>{
  const controller=new AbortController();let busy=false;
  async function load(){if(busy)return;busy=true;try{
   const response=await fetch('/api/work-inbox?offset='+offset,{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])});
   if(!response.ok)throw Error();const next=await response.json();if(!controller.signal.aborted){setData(next);setError(false);}
  }catch{if(!controller.signal.aborted){setData(null);setError(true);}}finally{busy=false;}}
  const refresh=()=>{if(document.visibilityState==='visible')void load();};
  void load();const timer=setInterval(refresh,10000);window.addEventListener('online',refresh);document.addEventListener('visibilitychange',refresh);
  return()=>{controller.abort();clearInterval(timer);window.removeEventListener('online',refresh);document.removeEventListener('visibilitychange',refresh);};
 },[offset,revision]);
 return <Card title="Work Inbox"><section aria-label="Work Inbox" data-work-inbox>
  <p className="owner-muted">Work settles here from its current state. Conversations stay open.</p>
  {error?<div role="alert"><p>Work could not be refreshed.</p><button onClick={()=>setRevision(v=>v+1)}>Retry Work Inbox</button></div>:!data?<p role="status">Checking current Work…</p>:<>
   <div className="owner-actions" role="group" aria-label="Filter Work by state">{lanes.map(value=><button key={value} type="button" aria-pressed={lane===value} onClick={()=>setLane(value)}>{value} ({data.counts[value]})</button>)}</div>
   <ul className="owner-list">{data.works.filter(w=>w.lane===lane).map(w=><li key={w.id} data-work-id={w.id} data-work-state={w.lane}>
    <h3>{w.title}</h3>{w.agentName&&<p className="owner-muted">{w.agentName}</p>}<p>{w.detail}</p>{w.result&&<p>{w.result}</p>}
    <Link href={w.threadId?`/chat?thread=${encodeURIComponent(w.threadId)}`:`/work?kind=work&id=${encodeURIComponent(w.id)}`}>{w.threadId?'Continue conversation':'Open Work'}</Link>
   </li>)}</ul>
   {!data.counts[lane]&&<Empty title={`No ${lane.toLowerCase()} Work on this page`}>Work moves here automatically when its saved state changes.</Empty>}
   <p className="owner-muted">Counts cover this page of up to 20 recent Work records. Waiting includes paused or unqualified execution; it is not active monitoring.</p>
   <nav className="owner-actions" aria-label="Work Inbox pages">{offset>0&&<button onClick={()=>{setData(null);setOffset(Math.max(0,offset-20));}}>Newer Work</button>}{data.nextOffset!==null&&<button onClick={()=>{setData(null);setOffset(data.nextOffset!);}}>Older Work</button>}</nav>
  </>}
 </section></Card>;
}
