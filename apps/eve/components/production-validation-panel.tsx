"use client";
import {useEffect,useState,useRef} from 'react';
import {Button} from '@cloudflare/kumo';
import {z} from 'zod';
import {productionValidationReportSchema as reportSchema} from '@/lib/engineering/production-validation-report';
export function ProductionValidationPanel(){
 const [report,setReport]=useState<z.infer<typeof reportSchema>|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(false),pending=useRef(false);
 async function check(start=false){
  if(pending.current)return;pending.current=true;setBusy(true);setError(false);
  try{
   const response=await fetch('/api/production-validation',{method:start?'POST':'GET',credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(30000)});
   if(response.status===404){setReport(null);return;}
   if(![200,503].includes(response.status))throw Error();
   setReport(reportSchema.parse(await response.json()));
  }catch{setError(true);}finally{pending.current=false;setBusy(false);}
 }
 useEffect(()=>{void check();},[]);
 if(!report)return null;
 return <section aria-labelledby="production-validation-heading" className="mb-5 rounded-2xl border border-kumo-hairline p-5">
  <h3 id="production-validation-heading" className="text-sm font-semibold">Production evidence validation</h3>
  <p className="mt-2 text-sm text-kumo-subtle">Run the approved release check and read its retained Proof. This uses one fixed candidate, with no model call or publication.</p>
  <div className="mt-4 flex gap-2"><Button size="sm" variant="secondary" disabled={busy||report.state==='PASS'} onClick={()=>void check(true)}>Run approved validation</Button><Button size="sm" variant="secondary" disabled={busy} onClick={()=>void check()}>Read validation Proof</Button></div>
  <div className="mt-3 text-sm" role="status" aria-live="polite" aria-busy={busy}>
   {busy?'Checking…':error?'Validation could not be read. Retry the same check.':report.state==='PASS'?'Test and Diff evidence are verified in your durable Proof.':report.state==='BLOCKED'?'Validation needs reconciliation. The same Work and candidate are retained.':report.state==='QUEUED'?'Validation queued. Read the Proof when it finishes.':'Validation has not yet produced Proof.'}
   {report.evidence?.map(e=><p key={e.kind}>{e.kind}: {e.sha256}</p>)}
   {report.resultId&&<p>Result: {report.resultId}</p>}
   <p className="mt-2 text-kumo-subtle">Model execution and publication remain disabled.</p>
  </div>
 </section>;
}
