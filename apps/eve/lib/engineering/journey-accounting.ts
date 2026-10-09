import { z } from "zod";
import { digest } from "./contract.ts";
import { workSpendSchema } from "./factory-spend.ts";
import type { WorkStore } from "./store.ts";

const amount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
import { journeyAccountingSchema, type JourneyAccounting } from "../digital-worker/model-accounting.ts";
export { journeyAccountingSchema, type JourneyAccounting };

type Call = {id:string;purpose:string;status:string;spent_microusd:unknown;reserved_microusd:unknown};
/** Work-scoped, attributable model costs. Snapshots/receipts are observations, never extra charges. */
export function summarizeJourneyAccounting(workId:string, calls:Call[], observations:unknown[]):JourneyAccounting {
  let sofie=0,native=0,factory=0,reserved=0,unknown=0,unavailable=false;
  const number=(value:unknown)=>amount.parse(Number(value));
  const seen=new Map<string,string>();
  for(const call of calls){
    const hash=digest(call),prior=seen.get(call.id);
    if(prior){if(prior!==hash)throw Error("Conflicting model ledger operation");continue;}seen.set(call.id,hash);
    if(call.status==='RECONCILED'){
      if(call.spent_microusd==null){unavailable=true;continue;}
      if(call.purpose==='NATIVE_EXECUTION')native+=number(call.spent_microusd);else sofie+=number(call.spent_microusd);
    }else if(['RESERVED','DISPATCHED','RESULT_RETAINED','USAGE_UNKNOWN'].includes(call.status)){
      const exposure=number(call.reserved_microusd);reserved+=exposure;
      if(call.status==='USAGE_UNKNOWN')unknown+=exposure;
    }else if(call.status!=='FAILED_BEFORE_DISPATCH')unavailable=true;
  }
  const operations=new Map<string,{hash:string;identity:string;state:string;actual:number|null;reserve:number}>();
  for(const observation of observations){
    const parsed=workSpendSchema.safeParse(observation);
    if(!parsed.success){unavailable=true;continue;}
    const spend=parsed.data;if(spend.workId!==workId)throw Error('Foreign Factory ledger');
    for(const op of spend.operations){
      const previous=operations.get(op.operationId),hash=digest(op);
      const {state,actualMicrousd,providerRequestId,usage,...binding}=op,identity=digest(binding);
      const rank={reserved:0,dispatched:1,unknown:2,settled:3,released:3};
      if(previous){
        if((state==='released'&&!['reserved','released'].includes(previous.state))||(previous.state==='released'&&!['reserved','released'].includes(state)))throw Error('Exposed operation cannot be released');
        if(previous.identity!==identity || (previous.state===state&&previous.hash!==hash))throw Error('Conflicting Factory ledger operation');
        if(rank[previous.state as keyof typeof rank]>=rank[state])continue;
      }
      operations.set(op.operationId,{hash,identity,state,actual:actualMicrousd,reserve:op.reservedMicrousd});
    }
  }
  for(const op of operations.values()){
    if(op.state==='settled')factory+=number(op.actual);else if(op.state!=='released'){reserved+=op.reserve;if(op.state==='unknown')unknown+=op.reserve;}
  }
  return journeyAccountingSchema.parse({currency:'USD',unit:'microUSD',observedAt:new Date().toISOString(),sofieMicrousd:sofie,
    factoryMicrousd:factory,nativeMicrousd:native,settledMicrousd:sofie+native+factory,reservedMicrousd:reserved,
    unknownExposureMicrousd:unknown,coverage:unavailable?'UNAVAILABLE':reserved?'UNSETTLED':'COMPLETE',externalCharges:'NOT_REPRESENTED'});
}

export async function readJourneyAccounting(store:WorkStore,id:string):Promise<JourneyAccounting>{
  const scope=[store.principal.scopeId,store.principal.scopeKind,id];
  // One statement provides a consistent ledger snapshot, including a final Sofie call when settled.
  const [row]=await store.database.query(`SELECT
    COALESCE((SELECT jsonb_agg(c) FROM (SELECT id::text,purpose,status,spent_microusd,reserved_microusd FROM engineering_work_model_calls
      WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3
      UNION ALL SELECT 'legacy-sofie:'||step_key,'CONVERSATION_REASONING',CASE status WHEN 'COMPLETED' THEN 'RECONCILED' WHEN 'UNKNOWN' THEN 'USAGE_UNKNOWN' ELSE 'DISPATCHED' END,spent_microusd,reserved_microusd
        FROM engineering_conversation_calls WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3
      UNION ALL SELECT 'legacy-native:'||step_key,'NATIVE_EXECUTION',CASE status WHEN 'COMPLETED' THEN 'RECONCILED' WHEN 'UNKNOWN' THEN 'USAGE_UNKNOWN' ELSE 'DISPATCHED' END,spent_microusd,reserved_microusd
        FROM engineering_native_model_calls WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3) c),'[]'::jsonb) calls,
    COALESCE((SELECT jsonb_agg(f.spend) FROM (SELECT
      factory_observation#>'{value,spend}' spend FROM engineering_routing_decisions
      WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3 AND factory_preparation IS NOT NULL
      ORDER BY created_at DESC) f),'[]'::jsonb) observations`,scope);
  if(!row)throw Error('Journey accounting unavailable');
  return summarizeJourneyAccounting(id,row.calls,row.observations);
}
