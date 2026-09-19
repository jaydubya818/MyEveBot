"use client";
import { useCallback,useEffect,useState } from "react";
import { Button,Loader } from "@cloudflare/kumo";

interface ActionRow {
  id:string;run_id:string;run_title:string;run_status:string;capability_id:string;action_class:string;
  status:string;decision:string;reason_code:string;authority_source:string;approval_id:string|null;
  target:{provider?:string;account?:string;resource?:string};executor:{kind?:string;agentId?:string};
  trigger:{kind?:string};provider_receipt:Record<string,unknown>|null;
}
const reasons:Record<string,string>={
  capability_allowed:"Allowed by capability policy.",approval_required:"This exact action needs owner approval.",
  capability_denied:"The executor or routine does not permit this action.",target_unresolved:"The account or target could not be resolved safely.",
  authority_unavailable:"Authority could not be verified.",execution_precondition_failed:"The run, approval, routine or computer authority changed.",
};
export function ActionAuthorityPanel() {
  const [actions,setActions]=useState<ActionRow[]|null>(null);
  const [error,setError]=useState(false);
  const load=useCallback(async(signal?:AbortSignal)=>{
    try {const response=await fetch("/api/actions",{cache:"no-store",signal});if(!response.ok)throw new Error();
      const body=await response.json();if(!signal?.aborted){setActions(body.actions);setError(false);}}
    catch {if(!signal?.aborted)setError(true);}
  },[]);
  useEffect(()=>{const controller=new AbortController();void load(controller.signal);return()=>controller.abort();},[load]);
  return <section className="mb-8" aria-labelledby="action-authority-title">
    <div className="flex items-center justify-between gap-3"><h3 id="action-authority-title" className="text-base font-semibold">Action authority</h3>
      <Button size="sm" variant="secondary" onClick={()=>void load()}>Refresh</Button></div>
    <p className="mt-1 text-sm text-kumo-subtle">See what was allowed, blocked, or left uncertain. Completed work is preserved when a later action cannot finish.</p>
    {error?<p role="alert" className="mt-3 text-sm">Action history could not be loaded. Refresh to retry.</p>:!actions?<div role="status" aria-label="Loading actions" className="py-4"><Loader size={18}/></div>:
      actions.length===0?<p className="mt-3 text-sm text-kumo-subtle">No governed actions have been requested yet.</p>:
      <ul className="mt-4 space-y-3">{actions.map(action=><li key={action.id} className="rounded-xl border border-kumo-hairline p-4">
        <div className="flex flex-wrap justify-between gap-2"><h4 className="font-medium">{action.capability_id}</h4><span className="text-sm">{action.status.replaceAll("_"," ")}</span></div>
        <p className="mt-1 text-sm">{action.run_title} · {action.executor.kind} · {action.trigger.kind}</p>
        <p className="mt-2 break-words text-sm text-kumo-subtle">{action.target.provider} / {action.target.account} / {action.target.resource}</p>
        <p className="mt-2 text-sm">{action.status==="result_unknown"?"The result needs verification. This action will not be sent again automatically.":reasons[action.reason_code]??"Review the recorded authority and result."}</p>
        {action.approval_id&&action.status==="awaiting_approval"&&<a className="mt-2 inline-block text-sm underline" href="/manage/approvals">Review in Approval Center</a>}
        {action.provider_receipt&&<details className="mt-3 text-xs"><summary className="cursor-pointer">Receipt and evidence</summary><pre className="mt-2 whitespace-pre-wrap break-words">{JSON.stringify(action.provider_receipt,null,2)}</pre></details>}
      </li>)}</ul>}
  </section>;
}
