import {WorkStore} from './store.ts';
import {FactoryReceiptStore} from './factory-receipt-store.ts';
import {verifyResult,sha256} from './factory-producer-protocol.ts';
import {attestFactoryManifest} from './factory-authenticated-result.ts';
/** Historical data only. Never calls admission, custody, verification or dispatch. */
export async function retainedFactoryCheckpoint(store:WorkStore,workId:string){
 await store.get(workId);
 const rows=await store.database.query(`SELECT r.id,r.request_id FROM engineering_factory_receipts r
 JOIN engineering_factory_requests q ON q.id=r.request_id
 WHERE q.scope_id=$1 AND q.scope_kind=$2 AND q.actor_id=$3 AND q.work_id=$4
 AND r.state='STALE' AND r.provenance#>>'{manifest,status}'='CANCELLED'
 AND r.provenance#>>'{manifest,candidate,commit}' IS NOT NULL ORDER BY r.received_at DESC,r.id DESC LIMIT 2`,
 [store.principal.scopeId,store.principal.scopeKind,store.principal.actorId,workId]);
 if(!rows.length)return null;
 const row=rows[0],receipts=new FactoryReceiptStore(store.principal,store.database),request=await receipts.request(String(row.request_id)),receipt=await receipts.get(request.id,String(row.id));
 if(!receipt.provenance)throw Error('Checkpoint provenance unavailable');
 if(sha256(receipt.envelope)!==receipt.envelope_digest)throw Error('Checkpoint envelope changed');
 const envelope=JSON.parse(receipt.envelope);
 const {manifest}=verifyResult(envelope,{...request.binding,keys:[receipt.provenance.key],historical:true});
 attestFactoryManifest(manifest,request.binding);
 if(envelope.manifestDigest!==receipt.provenance.manifestDigest)throw Error('Checkpoint provenance digest changed');
 if(manifest.status!=='CANCELLED'||!manifest.candidate)throw Error('Checkpoint is not historical cancelled data');
 return {workId,workVersion:request.binding.workVersion,workGeneration:request.binding.workGeneration,
  requestId:request.binding.requestId,attemptId:request.binding.runId,receiptId:receipt.id,
  manifestDigest:receipt.provenance.manifestDigest,factoryVersion:request.binding.factoryVersion,
  candidate:manifest.candidate.commit,tree:manifest.candidate.tree,base:manifest.candidate.base,
  independentlyVerified:false as const,authorityGranted:false as const,trust:'ADVISORY_ONLY' as const};
}

import {factorySpendSchema,isWorkSpendV2,validateSpendBinding} from './factory-spend.ts';
/** Retained generations remain financially authoritative after Work cancellation. */
export async function retainedFactoryAccounting(store:WorkStore,workId:string){
 const work=await store.get(workId);
 const rows=await store.database.query(`SELECT q.binding,r.dispatch_identity,r.dispatch_state,r.fenced_at,
 d.admission_authority_snapshot#>>'{factory,deadline}' AS deadline,d.factory_observation->'value'->'spend' AS spend
 FROM engineering_route_runs r JOIN engineering_factory_requests q ON q.id=r.factory_request_id
 JOIN engineering_routing_decisions d ON d.id=r.decision_id
 WHERE r.scope_id=$1 AND r.scope_kind=$2 AND r.work_id=$3 AND r.route='MYFACTORY'
 AND q.scope_id=r.scope_id AND q.scope_kind=r.scope_kind AND q.work_id=r.work_id AND q.actor_id=$4
 AND d.scope_id=r.scope_id AND d.scope_kind=r.scope_kind AND d.work_id=r.work_id
 ORDER BY r.updated_at DESC LIMIT 101`,[store.principal.scopeId,store.principal.scopeKind,workId,store.principal.actorId]);
 if(rows.length>100)throw Error('Retained Factory accounting history requires review');
 return rows.map(row=>{
  const spend=factorySpendSchema.parse(row.spend??{status:'UNKNOWN',ceilingUsd:work.maxCostUsd,reason:'No retained accounting readback'}),b=row.binding;
  if(!b||b.workId!==workId)throw Error('Retained accounting Work binding mismatch');
  validateSpendBinding(spend,{workId,workGeneration:b.workGeneration,requestId:b.requestId,workOrderId:b.workOrderId,
   deadline:String(row.deadline),factoryVersion:b.factoryVersion,remoteRunId:b.runId,dispatchIdentity:String(row.dispatch_identity)},work.maxCostUsd);
  return {workGeneration:b.workGeneration,requestId:b.requestId,terminal:row.dispatch_state==='TERMINAL'&&!!row.fenced_at,spend};
 });
}
export async function assertFencedFactoryAccounting(store:WorkStore,workId:string){
 const records=await retainedFactoryAccounting(store,workId);
 for(const r of records){const s=r.spend;
  if(!r.terminal||!isWorkSpendV2(s)||s.status!=='KNOWN'||s.authorityState!=='fenced'||!s.accountingComplete||s.retainedMicrousd!==0||
    s.unknownExposureMicrousd!==0||s.operations.some(op=>!['settled','released'].includes(op.state)))
   throw Error('Canonical retained accounting requires reconciliation');
 }
 return records;
}
