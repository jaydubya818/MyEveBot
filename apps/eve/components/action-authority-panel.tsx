"use client";
import { useCallback,useEffect,useState } from "react";
import { Button,Loader } from "@cloudflare/kumo";

interface ActionRow {
  capability_name?:string;executor_name?:string;routine_id?:string;routine_version?:number;
  attempt_count:number;recovery_result:Record<string,unknown>|null;history:unknown[];updated_at:string;
  id:string;run_id:string;run_title:string;run_status:string;capability_id:string;action_class:string;
  status:string;decision:string;reason_code:string;authority_source:string;approval_id:string|null;
  target:{provider?:string;account?:string;resource?:string};executor:{kind?:string;agentId?:string};
  trigger:{kind?:string};provider_receipt:Record<string,unknown>|null;
}
const reasons:Record<string,string>={
  unqualified_executor:"This write path has not yet been qualified for autonomous execution.",
  capability_allowed:"Allowed by capability policy.",approval_required:"This exact action needs owner approval.",
  capability_denied:"The executor or routine does not permit this action.",target_unresolved:"The account or target could not be resolved safely.",
  authority_unavailable:"Authority could not be verified.",execution_precondition_failed:"The run, approval, routine or computer authority changed.",
};
const triggerNames:Record<string,string>={owner_chat:"Owner request",scheduled_occurrence:"Scheduled routine",system:"Result delivery",delegation:"Delegated work",webhook:"Webhook"};
const statuses:Record<string,string>={planned:"Authorized request",awaiting_approval:"Needs approval",authorized:"Authorized",executing:"Running",verifying:"Verifying",completed:"Completed",denied:"Blocked",failed:"Failed",result_unknown:"Result unknown",recovering:"Recovering",needs_you:"Needs you",retryable:"Retry eligible",cancelled:"Cancelled"};
export function ActionAuthorityPanel() {
  const [actions,setActions]=useState<ActionRow[]|null>(null);
  const [error,setError]=useState(false);
  const [recovering,setRecovering]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);
  const load=useCallback(async(signal?:AbortSignal)=>{
    try {const response=await fetch("/api/actions",{cache:"no-store",signal});if(!response.ok)throw new Error();
      const body=await response.json();if(!signal?.aborted){setActions(body.actions);setError(false);}}
    catch {if(!signal?.aborted)setError(true);}
  },[]);
  const recover=async(id:string)=>{
    setRecovering(id);setNotice(null);
    try {const response=await fetch(`/api/actions/${encodeURIComponent(id)}/recover`,{method:"POST"});const body=await response.json();
      if(!response.ok)throw new Error(body.error?.message??"Recovery is unavailable. No action was resent.");
      setNotice(body.status==="completed"?"Provider evidence confirmed completion. Nothing was resent.":body.status==="retryable"?"The provider proved this attempt did not execute. Submit the original request again for fresh authorization.":"Provider state is still uncertain. Review it manually; do not resend.");await load();
    }catch(error){setNotice(error instanceof Error?error.message:"Recovery failed. Nothing was resent.");}finally{setRecovering(null);}
  };
  useEffect(()=>{const controller=new AbortController();void load(controller.signal);return()=>controller.abort();},[load]);
  return <section className="mb-8" aria-labelledby="action-authority-title">
    <div className="flex items-center justify-between gap-3"><h3 id="action-authority-title" className="text-base font-semibold">Action authority</h3>
      <Button size="sm" variant="secondary" onClick={()=>void load()}>Refresh</Button></div>
    <p className="mt-1 text-sm text-kumo-subtle">See what was allowed, blocked, or left uncertain. Completed work is preserved when a later action cannot finish.</p>
    {notice&&<p role="status" className="mt-3 text-sm">{notice}</p>}
    {error?<p role="alert" className="mt-3 text-sm">Action history could not be loaded. Refresh to retry.</p>:!actions?<div role="status" aria-label="Loading actions" className="py-4"><Loader size={18}/></div>:
      actions.length===0?<p className="mt-3 text-sm text-kumo-subtle">No governed actions have been requested yet.</p>:
      <ul className="mt-4 space-y-3">{actions.map(action=><li key={action.id} className="rounded-xl border border-kumo-hairline p-4">
        <div className="flex flex-wrap justify-between gap-2"><h4 className="font-medium">{action.capability_name??action.capability_id}</h4><span className="text-sm">{statuses[action.status]??action.status}</span></div>
        <p className="mt-1 text-sm">{action.run_title} · {action.executor_name??action.executor.kind} · {triggerNames[action.trigger.kind??""]??action.trigger.kind}{action.routine_version?` · Routine v${action.routine_version}`:""}</p>
        <p className="mt-2 break-words text-sm text-kumo-subtle">{action.target.provider} / {action.target.account} / {action.target.resource}</p>
        <p className="mt-2 text-sm">{action.status==="completed"?"Provider evidence confirmed this action completed.":action.status==="retryable"?"The provider proved this attempt did not execute.":["result_unknown","needs_you","recovering"].includes(action.status)?"The result needs verification. This action will not be sent again automatically.":reasons[action.reason_code]??"Review the recorded authority and result."}</p>
        {(["result_unknown","needs_you"].includes(action.status) || (["executing","verifying"].includes(action.status)&&Date.now()-Date.parse(action.updated_at)>120_000))&&<div className="mt-3"><Button size="sm" variant="secondary" disabled={recovering!==null} onClick={()=>void recover(action.id)}>{recovering===action.id?"Inspecting provider…":"Recover"}</Button><p className="mt-1 text-xs text-kumo-subtle">Inspect provider state. This does not send the action again.</p></div>}
        {action.status==="retryable"&&<p className="mt-3 text-sm">The provider confirmed this attempt did not execute. To retry, submit the original request again. Current authority and any required approval will be checked again.</p>}
        {action.approval_id&&action.status==="awaiting_approval"&&<a className="mt-2 inline-block text-sm underline" href="/manage/approvals">Review in Approval Center</a>}
        {<details className="mt-3 text-xs"><summary className="cursor-pointer">Authority, attempts and evidence</summary><pre className="mt-2 whitespace-pre-wrap break-words">{JSON.stringify({authority:action.authority_source,decision:action.decision,approval:action.approval_id,attempt:action.attempt_count,receipt:action.provider_receipt,recovery:action.recovery_result,history:action.history},null,2)}</pre></details>}
      </li>)}</ul>}
  </section>;
}
