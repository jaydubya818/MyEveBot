"use client";
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import type {EngineeringWorkerProjection} from '@/lib/engineering/worker-projection';
import {ownerWorkPresentation} from '@/lib/product/owner-work';
import {ownerRequest} from './data';

/** Owner intent only. Existing server CAS and effect fences remain authoritative. */
export function WorkControls({work,onRefresh}:{work:EngineeringWorkerProjection;onRefresh:()=>void}) {
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const lock=useRef(false),freshRead=useRef<EngineeringWorkerProjection|null>(null);
 useEffect(()=>{if(freshRead.current&&freshRead.current!==work){freshRead.current=null;lock.current=false;setBusy(false);setError('');}},[work]);
 const view=ownerWorkPresentation(work);
 const operation=work.lifecycle==='active'&&!work.externalAlpha&&view.status!=='Outcome unconfirmed'&&!view.currentResult&&!work.attention&&!work.pendingDecisions.length
  ? work.control==='paused'?'resume':work.control==='agent'?'pause':null:null;
 async function change(){
  if(!operation||lock.current)return;
  lock.current=true;setBusy(true);setError('');setMessage('');
  try{
   await ownerRequest('/api/beta/work',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({workId:work.workId,expectedVersion:work.workVersion,expectedGeneration:work.workGeneration,operation})});
   setMessage(operation==='pause'?'Your pause is saved.':'Your resume request is saved. Select this Work in Sofie to continue.');
   // A confirmed write stays locked until the new version is read. An uncertain
   // response always needs a fresh read before another owner action.
   onRefresh();
  }catch{setError('The change was not confirmed. Refresh Work before trying again.');}
 }
 return <section aria-label="Work actions" className="owner-card">
  {message&&<p role="status">{message}</p>}
  {error&&<div role="alert"><p>{error}</p><button onClick={()=>{freshRead.current=work;onRefresh();}}>Refresh Work</button></div>}
  <div className="owner-actions">{operation&&<button disabled={busy} onClick={()=>void change()}>{busy?'Saving…':operation==='resume'?'Resume Work':'Pause Work'}</button>}<Link href={`/chat?work=${encodeURIComponent(work.workId)}`}>Discuss with Sofie →</Link></div>
  <p className="owner-muted">{work.externalAlpha || view.currentResult ? 'Open a conversation about this Work to review the outcome and next steps.' : 'Open a conversation about this Work to review the outcome or ask Sofie to continue.'}</p>
 </section>;
}
