import type { WorkStore } from './store.ts';
import { FactoryReceiptStore, type LocalFactoryBindingV4 } from './factory-receipt-store.ts';
import { admitLocalFactoryResultV4 } from './factory-result-consumer.ts';
import { requireLocalFactoryBindingV4 } from './factory-authenticated-result.ts';
import { canonical, sha256, verifyLocalResultV4, type LocalResultManifestV4, type ResultKey } from './factory-producer-protocol.ts';

/** Reuse Gate C against the already-registered exact request. No writer, verification job, native Proof or dispatch is created. */
export async function retainLocalFactoryResult(store: WorkStore, binding: LocalFactoryBindingV4, result: unknown, keys: ()=>Promise<ResultKey[]>) {
  const expected = requireLocalFactoryBindingV4(binding);
  const matches = await store.database.query(`SELECT id,binding FROM engineering_factory_requests
    WHERE scope_id=$1 AND scope_kind=$2 AND actor_id=$3 AND work_id=$4 AND binding->>'requestId'=$5`,
    [store.principal.scopeId, store.principal.scopeKind, store.principal.actorId, expected.workId, expected.requestId]);
  if (matches.length !== 1 || canonical(matches[0].binding) !== canonical(expected)) throw Error('LOCAL_FACTORY_RESULT_REQUEST_MISMATCH');
  const receipt = await admitLocalFactoryResultV4(new FactoryReceiptStore<LocalResultManifestV4,LocalFactoryBindingV4>(store.principal,store.database),String(matches[0].id),result,{keys});
  if (receipt.status !== 'ADMITTED' || receipt.factoryProvenance !== 'VERIFIED' || !receipt.eligibleForCurrentAdmission) throw Error('LOCAL_FACTORY_RESULT_NOT_ADMITTED');
}

export interface LocalFactoryResultView {
  id:string;workId:string;title:string;receivedAt:string;status:string;manifestDigest:string;runId:string;workOrderId:string;
  candidateCommit:string|null;candidateTree:string|null;checksOutcome:string;checksPassed:number;checksTotal:number;historical:boolean;
  independentVerification:'NOT_RUN';readiness:'NOT_READY';
}
/** Owner-scoped historical signed receipt readback. It does not claim native protected verification or current execution authority. */
export async function readLocalFactoryResults(store: WorkStore, readKeys:()=>Promise<ResultKey[]>):Promise<LocalFactoryResultView[]> {
  const rows = await store.database.query(`SELECT r.id,r.envelope,r.envelope_digest,r.received_at,a.manifest_digest AS admitted_manifest_digest,q.binding,w.title,w.version,w.generation
    FROM engineering_factory_receipts r JOIN engineering_factory_requests q ON q.id=r.request_id
    JOIN engineering_factory_admissions a ON a.request_id=q.id AND a.receipt_id=r.id
    JOIN engineering_work w ON w.scope_id=q.scope_id AND w.scope_kind=q.scope_kind AND w.id=q.work_id
    WHERE q.scope_id=$1 AND q.scope_kind=$2 AND q.actor_id=$3 AND r.state='ADMITTED'
      AND q.binding->>'localSnapshotVersion'='4' ORDER BY r.received_at DESC,r.id LIMIT 20`,
    [store.principal.scopeId,store.principal.scopeKind,store.principal.actorId]);
  if(!rows.length)return [];
  const keys=await readKeys();
  return rows.map(row=>{
    const binding=requireLocalFactoryBindingV4(row.binding);
    if(typeof row.envelope!=='string'||Buffer.byteLength(row.envelope)>12*1024*1024||sha256(row.envelope)!==row.envelope_digest)throw Error('LOCAL_FACTORY_RESULT_CUSTODY_CHANGED');
    const signed=JSON.parse(row.envelope),{manifest}=verifyLocalResultV4(signed,{expected:binding,keys,historical:true});
    if(signed.manifestDigest!==row.admitted_manifest_digest)throw Error('LOCAL_FACTORY_RESULT_ADMISSION_CHANGED');
    return {id:String(row.id),workId:binding.workId,title:String(row.title),receivedAt:new Date(row.received_at).toISOString(),status:manifest.status,
      manifestDigest:signed.manifestDigest,runId:binding.runId,workOrderId:binding.workOrderId,candidateCommit:manifest.candidate?.commit??null,candidateTree:manifest.candidate?.tree??null,
      checksOutcome:manifest.evidence.length&&manifest.evidence.every(c=>c.status==='passed')?'PASS':manifest.evidence.some(c=>c.status==='failed')?'FAIL':'UNKNOWN',checksPassed:manifest.evidence.filter(c=>c.status==='passed').length,checksTotal:manifest.evidence.length,
      historical:Number(row.version)!==binding.workVersion||Number(row.generation)!==binding.workGeneration,independentVerification:'NOT_RUN',readiness:'NOT_READY'};
  });
}
