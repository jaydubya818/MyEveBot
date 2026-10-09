import { z } from "zod";
import { digest } from "./contract.ts";
import type { WorkStore } from "./store.ts";
import { WorkError } from "./types.ts";

/** A bounded native-engineering intent, not a new authority or workflow contract. */
export const nativePlanSchema = z.object({
  files: z.array(z.string().min(1).max(240)).min(1).max(8),
  change: z.string().trim().min(1).max(1200),
  verification: z.string().trim().min(1).max(600),
  assumptions: z.string().max(400),
  blockers: z.array(z.string().min(1).max(240)).max(4),
}).strict();
export type NativeOperation = "admit" | "open" | "read" | "inspect" | "plan" | "write" | "submit";
type Phase = "ORIENT" | "PLAN" | "IMPLEMENT" | "VERIFY" | "REPAIR" | "COMPLETE" | "BLOCKED";
type Event = { operation: NativeOperation; path?: string; inspected?: {path:string;hash:string}; diagnosed?:string;
  phaseBefore:Phase; phaseAfter:Phase; productive:boolean; fingerprint:string; callId:string; modelCallId?:string; at?:string };
export type NativeExecutionCapsule = {
  phase:Phase; nextOperation:NativeOperation|null; allowedOperations:NativeOperation[];
  runId:string; writer:string|null; version:number; generation:number; base:string|null;
  revision:number|null; candidate:string|null; targets:string[];
  known:{opened:boolean; inspected:{path:string;hash:string}[]; requiredReads:string[]; absentTargets:string[];
    plan:z.infer<typeof nativePlanSchema>|null; diagnosed:string|null};
  budget:{callsRemaining:number;stageCallsRemaining:number;repairRemaining:number;heldMicrousd:number;spentMicrousd:number};
  progress:{fingerprint:string;consecutiveNoProgress:number;recovery:"NONE"|"NO_PROGRESS"|"STOP"};
  metrics:{modelCalls:number;productiveCalls:number;coordinationCalls:number;noProgressCalls:number;
    operations:number;candidateRevisions:number;verificationAttempts:number;repairAttempts:number;humanInterventions:number;
    phaseTransitions:Phase[]};
};
function planValue(value:unknown) {
  try {return nativePlanSchema.safeParse(typeof value==="string" ? JSON.parse(value) : value);} catch {return nativePlanSchema.safeParse(null);}
}

/** Derived exclusively from retained workspace, scoped tool observations and accounting.
 * No projection read acquires custody, updates state, or trusts a model's progress claim. */
export async function nativeExecutionCapsule(store:WorkStore,workId:string):Promise<NativeExecutionCapsule|null> {
  const work=await store.get(workId),scope=[store.principal.scopeId,store.principal.scopeKind,workId];
  const [row]=await store.database.query(`SELECT r.id AS run_id,r.work_version,r.work_generation,
      d.admission_authority_snapshot->'completion' AS completion,
      n.session_id,w.base_sha,w.revision,w.plan,w.phase,w.source_files,w.draft_files,w.candidates,w.evidence,
      b.max_calls,b.calls_admitted,b.spent_microusd,
      (SELECT count(*)::int FROM engineering_direct_verification_jobs j WHERE j.scope_id=r.scope_id AND j.scope_kind=r.scope_kind AND j.work_id=r.work_id) AS verification_attempts,
      (SELECT count(*)::int FROM engineering_work_events e WHERE e.scope_id=r.scope_id AND e.scope_kind=r.scope_kind AND e.work_id=r.work_id AND e.version>r.work_version) AS interventions,
      EXISTS(SELECT 1 FROM engineering_native_results p WHERE p.scope_id=r.scope_id AND p.scope_kind=r.scope_kind AND p.work_id=r.work_id
        AND p.candidate_sha=w.candidates->-1->>'sha' AND p.proof->>'outcome'='PARTIAL') AS partial_result
    FROM engineering_route_runs r JOIN engineering_routing_decisions d ON d.id=r.decision_id AND d.scope_id=r.scope_id AND d.scope_kind=r.scope_kind AND d.work_id=r.work_id
    LEFT JOIN engineering_native_runtime n ON n.scope_id=r.scope_id AND n.scope_kind=r.scope_kind AND n.work_id=r.work_id AND n.route_run_id=r.id
    LEFT JOIN engineering_direct_workspaces w ON w.scope_id=r.scope_id AND w.scope_kind=r.scope_kind AND w.work_id=r.work_id AND w.route_run_id=r.id
    LEFT JOIN engineering_work_model_budget b ON b.scope_id=r.scope_id AND b.scope_kind=r.scope_kind AND b.work_id=r.work_id
    WHERE r.scope_id=$1 AND r.scope_kind=$2 AND r.work_id=$3 AND d.admission_authority_snapshot ? 'completion'
    ORDER BY d.admitted_at DESC,r.id DESC LIMIT 1`,scope);
  if(!row?.completion)return null;
  const [events,calls]=await Promise.all([
    store.database.query(`SELECT payload,occurred_at FROM eve_events WHERE owner_id=$1 AND source_type='native-engineering'
      AND source_id=$2 AND run_id=$3 AND type='NATIVE_OPERATION' ORDER BY occurred_at,id LIMIT 100`,[scope[0],workId,row.run_id]),
    store.database.query(`SELECT id,result,bounds,status FROM engineering_work_model_calls WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3
      ORDER BY created_at,id LIMIT 100`,scope),
  ]);
  if(events.length>=100 || calls.length>=100)throw new WorkError("native_progress_bound","Native progress exceeds the bounded contract; stop and inspect retained evidence.");
  const observations:Event[]=events.map(e=>e.payload);
  const files:Record<string,string>=row.draft_files??{},source:Record<string,string>=row.source_files??{};
  // Editable targets are recorded by the trusted tool host from its already
  // qualified profile. They are observations; effect services retain their allowlist.
  const recordedTargets=events.map(e=>e.payload.targets).find(Array.isArray) as string[]|undefined;
  const approvedTargets=recordedTargets??[];
  const inspected=observations.flatMap(e=>e.inspected?[e.inspected]:[]).filter((entry,index,all)=>
    Object.hasOwn(files,entry.path)&&digest(files[entry.path])===entry.hash&&all.findLastIndex(x=>x.path===entry.path)===index);
  const requiredReads=[...new Set([...(Object.hasOwn(files,"README.md")?["README.md"]:[]),...approvedTargets.filter(p=>Object.hasOwn(source,p))])];
  const oriented=!!row.revision&&requiredReads.length>0&&requiredReads.every(p=>inspected.some(i=>i.path===p))&&!!work.objective&&work.criteria.length>0&&!!row.base_sha;
  const parsedPlan=planValue(row.plan),plan=parsedPlan.success?parsedPlan.data:null;
  const candidates=row.candidates??[],candidate=candidates.at(-1),failed=(row.evidence??[]).some((e:any)=>e.candidate===candidate?.sha&&e.result==='FAIL');
  const diagnosed=observations.findLast(e=>e.diagnosed===candidate?.sha)?.diagnosed??null;
  const changed=digest(files)!==digest(candidate?.files??source);
  const current=work.control==='agent'&&work.lifecycle==='active'&&work.version===Number(row.work_version)&&work.generation===Number(row.work_generation);
  let phase:Phase=!current?'BLOCKED':row.phase==='VERIFICATION_REQUESTED'?'VERIFY'
    :row.phase==='VERIFICATION_PASSED'?(row.partial_result?'COMPLETE':'VERIFY')
    :candidates.length>=2&&failed?'BLOCKED':candidates.length&&failed?'REPAIR'
    :plan?(plan.blockers.length?'BLOCKED':'IMPLEMENT'):!oriented?'ORIENT':'PLAN';
  let next:NativeOperation|null=phase==='ORIENT'?(!row.revision?'open':'read'):phase==='PLAN'?'plan'
    :phase==='IMPLEMENT'?(changed?'submit':'write'):phase==='REPAIR'?(!diagnosed?'inspect':changed?'submit':'write'):null;
  let consecutive=0;for(const e of [...observations].reverse()){if(e.productive)break;consecutive++;}
  const recovery=consecutive>=3?'STOP':consecutive>=2?'NO_PROGRESS':'NONE';
  if(recovery==='STOP'){phase='BLOCKED';next=null;}
  const stage=row.phase==='VERIFICATION_PASSED'||candidates.length>=2&&failed?'EXPLAIN':candidates.length?'REPAIR':'IMPLEMENT';
  const stages=row.completion.stages??[];
  const used=(id:string)=>calls.filter(c=>c.bounds?.completion?.id===row.completion.id&&c.bounds?.completion?.stage===id).length;
  const held=stages.reduce((n:number,s:any)=>n+Math.max(0,s.calls-used(s.id))*s.microUsd,0);
  const productiveCallIds=new Set(observations.filter(e=>e.productive).map(e=>e.modelCallId??e.callId));
  const noProgressCallIds=new Set(observations.filter(e=>!e.productive).map(e=>e.modelCallId??e.callId));
  const matches=(c:any,ids:Set<string>)=>ids.has(c.id)||(c.result?.content??[]).some((p:any)=>p.type==='tool-call'&&ids.has(p.toolCallId));
  const productiveCalls=calls.filter(c=>matches(c,productiveCallIds)||c.bounds?.completion?.stage==='EXPLAIN'&&c.status==='RECONCILED'&&c.result?.content?.some((p:any)=>p.type==='text'&&p.text?.trim())).length;
  const transitions:Phase[]=[];for(const p of [...observations.flatMap(e=>[e.phaseBefore,e.phaseAfter]),phase])if(transitions.at(-1)!==p)transitions.push(p);
  const currentWork=await store.get(workId);
  if(currentWork.version!==work.version || currentWork.generation!==work.generation || currentWork.criteriaVersion!==work.criteriaVersion)
    throw new WorkError("native_progress_changed","Work changed while native progress was observed. Reload Current Truth.");
  return {phase,nextOperation:next,allowedOperations:next?[next,...(next!=='read'&&['PLAN','IMPLEMENT','REPAIR'].includes(phase)?['read' as const]:[])]:[],
    runId:row.run_id,writer:row.session_id??null,version:work.version,generation:work.generation,base:row.base_sha??null,revision:row.revision??null,candidate:candidate?.sha??null,targets:approvedTargets,
    known:{opened:!!row.revision,inspected,requiredReads,absentTargets:approvedTargets.filter(p=>!Object.hasOwn(source,p)),plan,diagnosed},
    budget:{callsRemaining:Math.max(0,Number(row.max_calls??10)-Number(row.calls_admitted??0)),stageCallsRemaining:Math.max(0,Number(stages.find((s:any)=>s.id===stage)?.calls??0)-used(stage)),repairRemaining:Math.max(0,1-Math.max(0,candidates.length-1)),heldMicrousd:held,spentMicrousd:Number(row.spent_microusd??0)},
    progress:{fingerprint:digest({base:row.base_sha,inspected,plan:row.plan,files,candidates,evidence:row.evidence,result:row.partial_result,diagnosed}),consecutiveNoProgress:consecutive,recovery},
    metrics:{modelCalls:calls.length,productiveCalls,coordinationCalls:calls.length-productiveCalls,noProgressCalls:calls.filter(c=>matches(c,noProgressCallIds)).length,
      operations:observations.length,candidateRevisions:candidates.length,verificationAttempts:Number(row.verification_attempts??0),repairAttempts:Math.max(0,candidates.length-1),humanInterventions:Number(row.interventions??0),phaseTransitions:transitions}};
}

export function nativeProgressGuidance(capsule:NativeExecutionCapsule) {
  return {status:"NO_PROGRESS",phase:capsule.phase,nextOperation:capsule.nextOperation,
    known:capsule.known,targets:capsule.targets,recovery:capsule.progress.recovery,
    message:"Use the current productive operation. Completed admission/orientation must not be restarted. This observation grants no authority."};
}

export function permitsNativeOperation(c:NativeExecutionCapsule,input:{operation:NativeOperation;path?:string;reason?:string;plan?:unknown}) {
  if(input.operation==='admit')return true; // Existing exact-token duplicate contract remains authoritative.
  if(input.operation==='read')return !!input.path&&!c.known.inspected.some(i=>i.path===input.path)&&
    (c.phase==='ORIENT'?c.known.requiredReads.includes(input.path):['PLAN','IMPLEMENT','REPAIR'].includes(c.phase)&&!!input.reason?.trim());
  if(input.operation!==c.nextOperation)return false;
  if(input.operation==='plan') {
    const plan=planValue(input.plan);
    return plan.success&&plan.data.files.every(p=>c.targets.includes(p));
  }
  return true;
}

/** Append successful server observations, never model claims. Work/version/writer
 * fences scope every event; idempotent replays cannot inflate progress counters. */
export async function recordNativeOperation(store:WorkStore,workId:string,input:{operation:NativeOperation;path?:string},
  sessionId:string,callId:string,before:NativeExecutionCapsule,targets:string[],success:boolean,readResult?:unknown) {
  const after=await nativeExecutionCapsule(store,workId);if(!after)throw new WorkError('native_progress','Missing native state');
  let inspected:{path:string;hash:string}|undefined;
  if(success&&input.operation==='read'&&input.path) {
    const result=readResult as {path?:string;content?:string}|undefined;
    const [row]=await store.database.query(`SELECT draft_files->$4 AS content FROM engineering_direct_workspaces WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3`,[store.principal.scopeId,store.principal.scopeKind,workId,input.path]);
    if(result?.path===input.path && typeof result.content==='string' && result.content===row?.content)
      inspected={path:input.path,hash:digest(result.content)};
  }
  const diagnosed=success&&input.operation==='inspect'&&before.phase==='REPAIR'?before.candidate??undefined:undefined;
  const productive=success&&(before.progress.fingerprint!==after.progress.fingerprint||!!inspected&&!before.known.inspected.some(i=>i.path===inspected.path&&i.hash===inspected.hash)||!!diagnosed&&diagnosed!==before.known.diagnosed);
  // Model-owned tool ids may repeat across provider responses. Bind observation
  // idempotency to the durable paid call as well, so repeats cannot hide a loop.
  const [modelCall]=await store.database.query(`SELECT id FROM engineering_work_model_calls
    WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3 AND session_id=$4 AND route_run_id=$5
      AND status='RECONCILED' AND EXISTS(SELECT 1 FROM jsonb_array_elements(result->'content') p
        WHERE p->>'type'='tool-call' AND p->>'toolName'='engineering_direct' AND p->>'toolCallId'=$6)
    ORDER BY created_at DESC,id DESC LIMIT 1`,[store.principal.scopeId,store.principal.scopeKind,workId,sessionId,before.runId,callId]);
  const payload={modelCallId:modelCall?.id,operation:input.operation,path:input.path,inspected,diagnosed,targets,phaseBefore:before.phase,phaseAfter:after.phase,productive,fingerprint:after.progress.fingerprint,callId};
  const id='native-operation:'+digest({workId,runId:before.runId,sessionId,callId,modelCallId:modelCall?.id});
  const rows=await store.database.query(`INSERT INTO eve_events(id,owner_id,type,source_type,source_id,run_id,summary,payload,idempotency_key)
    SELECT $1,w.scope_id,'NATIVE_OPERATION','native-engineering',w.id::text,$4,$5,$6::jsonb,$1
    FROM engineering_work w JOIN engineering_native_runtime n ON n.scope_id=w.scope_id AND n.scope_kind=w.scope_kind AND n.work_id=w.id
    WHERE w.scope_id=$2 AND w.scope_kind='personal' AND w.id=$3 AND w.version=$7 AND w.generation=$8 AND w.control='agent' AND w.lifecycle='active'
      AND n.route_run_id::text=$4 AND n.session_id=$9 ON CONFLICT DO NOTHING RETURNING id`,
    [id,store.principal.scopeId,workId,before.runId,productive?'Native engineering progress':'Native engineering no progress',JSON.stringify(payload),before.version,before.generation,sessionId]);
  if(!rows.length){const [existing]=await store.database.query('SELECT id FROM eve_events WHERE owner_id=$1 AND id=$2',[store.principal.scopeId,id]);if(!existing)throw new WorkError('native_progress_changed','Work or writer changed while recording progress.');}
  return nativeExecutionCapsule(store,workId);
}
