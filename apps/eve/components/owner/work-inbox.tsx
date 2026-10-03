"use client";
import {useEffect,useState} from 'react';
import Link from 'next/link';
import type {WorkInboxView} from '@/lib/product/work-inbox';
import type {WorkLane} from '@/lib/product/work-state';
import {Card,Empty} from './primitives';
const lanes:WorkLane[]=['Needs You','Working','Monitoring','Completed','Waiting'];
export function WorkInbox({overview=false}:{overview?:boolean}){
 const [data,setData]=useState<WorkInboxView|null>(null),[error,setError]=useState(false),[revision,setRevision]=useState(0),[offset,setOffset]=useState(0),[lane,setLane]=useState<WorkLane>('Needs You');
 useEffect(()=>{const requested=new URLSearchParams(window.location.search).get('state');if(lanes.includes(requested as WorkLane))setLane(requested as WorkLane);},[]);
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
 return <Card title={overview?"Your Work today":"Work Inbox"}><section id="work-inbox" aria-label="Work Inbox" data-work-inbox>
  <p className="owner-muted">Work settles here from its current state. Conversations stay open.</p>
  {error?<div role="alert"><p>Work could not be refreshed.</p><button onClick={()=>setRevision(v=>v+1)}>Retry Work Inbox</button></div>:!data?<p role="status">Checking current Work…</p>:<>
   {overview?<div className="owner-work-overview">{lanes.map(value=><section key={value} aria-label={value} className="owner-work-lane"><h3>{value==='Completed'?'Recently completed':value} <span className="owner-muted">{data.counts[value]}</span></h3><ul className="owner-list">{data.works.filter(w=>w.lane===value).slice(0,3).map(w=><li key={w.id}><a href={w.threadId?`/chat?thread=${encodeURIComponent(w.threadId)}`:`/work?kind=work&id=${encodeURIComponent(w.id)}`}>{w.title}</a><p className="owner-muted">{w.detail}</p></li>)}</ul>{!data.counts[value]&&<p className="owner-muted">Nothing here on this page.</p>}<a href={`/inbox?state=${encodeURIComponent(value)}#work-inbox`}>View {value.toLowerCase()}</a></section>)}</div>:<>
   <div className="owner-actions" role="group" aria-label="Filter Work by state">{lanes.map(value=><button key={value} type="button" aria-pressed={lane===value} onClick={()=>setLane(value)}>{value} ({data.counts[value]})</button>)}</div>
   <ul className="owner-list">{data.works.filter(w=>w.lane===lane).map(w=><li key={w.id} data-work-id={w.id} data-work-state={w.lane}>
    <h3>{w.title}</h3>{w.agentName&&<p className="owner-muted">{w.agentName}</p>}<p>{w.detail}</p>{w.result&&<p>{w.result}</p>}
    <Link href={w.threadId?`/chat?thread=${encodeURIComponent(w.threadId)}`:`/work?kind=work&id=${encodeURIComponent(w.id)}`}>{w.threadId?'Continue conversation':'Open Work'}</Link>
   </li>)}</ul>
   {!data.counts[lane]&&<Empty title={`No ${lane.toLowerCase()} Work on this page`}>Work moves here automatically when its saved state changes.</Empty>}
   </>}
   <p className="owner-muted">Counts cover this page of up to 20 recent Work records. Waiting includes paused or unqualified execution; it is not active monitoring.</p>
   <nav className="owner-actions" aria-label="Work Inbox pages">{offset>0&&<button onClick={()=>{setData(null);setOffset(Math.max(0,offset-20));}}>Newer Work</button>}{data.nextOffset!==null&&<button onClick={()=>{setData(null);setOffset(data.nextOffset!);}}>Older Work</button>}</nav>
  </>}
 </section></Card>;
}
