'use client';
import { useEffect,useRef,useState,type FormEvent } from 'react';
import Link from 'next/link';
import { ProductShell,ResourceState } from './product-shell';
import { Card,Empty,date } from './primitives';
import type { BetaFeedbackInput,BetaFeedbackReport } from '@/lib/beta-feedback';

const platforms:BetaFeedbackInput['platform'][]=['MyEve / Sofie','MyApps','Relay','MyFactory','MissionControl','Capability controls'];
export function BetaFeedbackPanel({workId=null}:{workId?:string|null}) {
  const [linkedWork,setLinkedWork]=useState(workId);
  const [platform,setPlatform]=useState<BetaFeedbackInput['platform']>('MyEve / Sofie'),[impact,setImpact]=useState<BetaFeedbackInput['impact']>('IMPAIRED');
  const [title,setTitle]=useState(''),[details,setDetails]=useState(''),[saving,setSaving]=useState(false),[saveError,setSaveError]=useState<string|null>(null);
  const [saved,setSaved]=useState<BetaFeedbackReport|null>(null),[reports,setReports]=useState<BetaFeedbackReport[]>([]),[next,setNext]=useState<string|null>(null);
  const [loading,setLoading]=useState(true),[error,setError]=useState<string|null>(null),[reload,setReload]=useState(0),[loadingMore,setLoadingMore]=useState(false);
  const pending=useRef<BetaFeedbackInput|null>(null),inFlight=useRef(false),mounted=useRef(true),listRequest=useRef(0);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{
    const abort=new AbortController(),revision=++listRequest.current;setLoading(true);setError(null);
    fetch('/api/beta/issues',{signal:abort.signal,cache:'no-store'}).then(async response=>{const value=await response.json();if(!response.ok)throw Error(value.error??'Could not load reports.');return value;})
      .then(value=>{if(revision===listRequest.current){setReports(value.reports);setNext(value.next);}})
      .catch(failure=>{if(!abort.signal.aborted)setError(failure instanceof Error?failure.message:'Could not load reports.');})
      .finally(()=>{if(!abort.signal.aborted)setLoading(false);});
    return()=>abort.abort();
  },[reload]);
  async function submit(event:FormEvent) {
    event.preventDefault();if(inFlight.current)return;
    if(!pending.current)pending.current={id:crypto.randomUUID(),platform,impact,title:title.trim(),details:details.trim(),workId:linkedWork};
    inFlight.current=true;setSaving(true);setSaveError(null);
    try{
      const response=await fetch('/api/beta/issues',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(pending.current),signal:AbortSignal.timeout(15000)});
      const value=await response.json();if(!response.ok){if([400,404,409].includes(response.status))pending.current=null;throw Error(value.error??'Could not confirm this report. Retry the same report.');}
      if(mounted.current){setSaved(value.report);setTitle('');setDetails('');pending.current=null;setReload(n=>n+1);}
    }catch(failure){if(mounted.current)setSaveError(failure instanceof Error?failure.message:'Could not confirm this report. Retry the same report.');}
    finally{inFlight.current=false;if(mounted.current)setSaving(false);}
  }
  async function more(){
    if(!next||loadingMore)return;setLoadingMore(true);setError(null);const revision=listRequest.current;
    try{const response=await fetch('/api/beta/issues?before='+encodeURIComponent(next),{cache:'no-store',signal:AbortSignal.timeout(15000)});
      const value=await response.json();if(!response.ok)throw Error(value.error??'Could not load more reports.');
      if(mounted.current&&revision===listRequest.current){setReports(current=>[...current,...value.reports]);setNext(value.next);}
    }catch(failure){if(mounted.current)setError(failure instanceof Error?failure.message:'Could not load more reports.');}
    finally{if(mounted.current)setLoadingMore(false);}
  }
  const locked=saving||pending.current!==null;
  return <ProductShell title="Beta feedback" description="Tell us what happened and what you expected. Reports stay in your workspace.">
    <div className="owner-stack">
      <Card title="Report a problem">
        {linkedWork&&<p>Linked to <Link href={'/work?kind=work&id='+encodeURIComponent(linkedWork)}>your Work</Link>. <button disabled={locked} onClick={()=>setLinkedWork(null)}>Remove link</button></p>}
        {saved&&<p role="status">Report saved. Reference {saved.id.slice(0,8)}. It is awaiting review.</p>}
        <form onSubmit={submit} className="owner-stack">
          <label>Where did this happen?<select value={platform} disabled={locked} onChange={e=>setPlatform(e.target.value as BetaFeedbackInput['platform'])}>{platforms.map(name=><option key={name}>{name}</option>)}</select></label>
          <label>Impact<select value={impact} disabled={locked} onChange={e=>setImpact(e.target.value as BetaFeedbackInput['impact'])}>
            <option value="BLOCKED">I cannot continue</option><option value="IMPAIRED">Something is not working correctly</option><option value="MINOR">Small issue or suggestion</option>
          </select></label>
          <label>Summary<input required maxLength={160} value={title} disabled={locked} onChange={e=>{setTitle(e.target.value);setSaved(null);}}/></label>
          <label>What happened?<textarea required maxLength={4000} rows={6} value={details} disabled={locked} onChange={e=>setDetails(e.target.value)} aria-describedby="feedback-details-help"/></label>
          <p id="feedback-details-help" className="owner-muted">Include the steps you took and what you expected to happen.</p>
          {saveError&&<div role="alert"><p>{saveError}</p><p>{pending.current?'Your original report is kept for a safe retry.':'Your details are preserved. Correct the report and try again.'}</p></div>}
          <div><button type="submit" disabled={saving||(!pending.current&&(!title.trim()||!details.trim()))}>{saving?'Saving report…':pending.current?'Retry report':'Save report'}</button></div>
        </form>
      </Card>
      <Card title="Your reports">
        <ResourceState loading={loading} error={error} refresh={()=>setReload(n=>n+1)}/>
        {!loading&&!error&&reports.length===0&&<Empty title="No reports yet">Saved reports and review notes will appear here.</Empty>}
        {!loading&&reports.map(item=><article key={item.id} className="owner-card"><h3>{item.title}</h3>
          <p className="owner-muted">{item.platform} · {date(item.createdAt)} · {item.status==='REPORTED'?'Awaiting review':item.status==='TRIAGED'?'Reviewed':item.status==='RESOLVED'?'Resolved':'Status unavailable'}</p>
          <p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{item.details}</p>
          {item.triageNote&&<p>Review note: {item.triageNote}</p>}
          {item.workId&&<Link href={'/work?kind=work&id='+encodeURIComponent(item.workId)}>Open linked Work</Link>}
        </article>)}
        {next&&<button onClick={()=>void more()} disabled={loadingMore}>{loadingMore?'Loading reports…':'Load earlier reports'}</button>}
      </Card>
    </div>
  </ProductShell>;
}
