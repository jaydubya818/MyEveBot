import { z } from 'zod';
import type { gateway } from 'ai';
import { WorkStore } from '../../lib/engineering/store.ts';
import { FactoryEvidenceStore } from '../../lib/engineering/factory-evidence-store.ts';
import { proofOfWorkSchema } from '../../lib/digital-worker/contracts.ts';
import { readJourneyAccounting } from '../../lib/engineering/journey-accounting.ts';
import { digest } from '../../lib/engineering/contract.ts';
import { retainedSessionOwner, retainedWorkSessionBinding } from './retained-work-session.ts';

const selectionSchema = z.object({ ownerId:z.string().min(1), threadId:z.string().min(1), sessionId:z.string().min(1), workId:z.string().uuid() }).strict();
const bindingSchema = selectionSchema.extend({ resultId:z.string().uuid(), proofHash:z.string().regex(/^[a-f0-9]{64}$/), version:z.number().int().positive(), generation:z.number().int().positive() }).strict();
export type RetainedSummaryBinding = z.infer<typeof bindingSchema>;
type Model = ReturnType<typeof gateway>;
type Part = Awaited<ReturnType<Model['doStream']>>['stream'] extends ReadableStream<infer P> ? P : never;

export async function assertRetainedSummaryMessage(request:Request,threadId:string) {
  const text = await request.clone().text();
  if(Buffer.byteLength(text)>16000)throw Error('RETAINED_SUMMARY_MESSAGE');
  const part=z.object({type:z.literal('text'),text:z.string().trim().min(1).max(4000)}).strict();
  z.object({message:z.union([z.string().trim().min(1).max(4000),z.array(part).min(1).max(4)]),
    clientContext:z.object({webThreadId:z.literal(threadId),eveWebModel:z.string().max(150).optional(),
      eveWebReasoning:z.string().max(20).optional(),clientTime:z.string().max(150).optional(),myeveAgentId:z.string().max(100).optional()}).strict().optional(),
  }).strict().parse(JSON.parse(text));
}

/** Canonical observation only: no provider, catalog, tool, reservation or Factory mutation. */
export async function readRetainedWorkSummary(input:z.infer<typeof selectionSchema>, expected?:RetainedSummaryBinding) {
  const selected = selectionSchema.parse(input), {ownerId,threadId,sessionId,workId}=selected;
  if (await retainedSessionOwner(sessionId,ownerId,threadId)!==true ||
      !await retainedWorkSessionBinding(sessionId,ownerId,threadId,workId)) throw Error('RETAINED_SUMMARY_BINDING');
  const store = new WorkStore({scopeId:ownerId,scopeKind:'personal',actorId:ownerId});
  const work = await store.get(workId);
  if (work.control!=='paused') throw Error('RETAINED_SUMMARY_REQUIRES_PAUSED_WORK');
  const [row] = await store.database.query(`SELECT id,proof,content_hash,candidate_sha,work_version,work_generation
    FROM engineering_native_results WHERE scope_id=$1 AND scope_kind='personal' AND work_id=$2
    ORDER BY created_at DESC,id DESC LIMIT 1`, [ownerId,workId]);
  if (!row || digest(row.proof)!==row.content_hash) throw Error('RETAINED_PROOF_INTEGRITY');
  const proof = proofOfWorkSchema.parse(row.proof);
  if (proof.workId!==workId || proof.workVersion!==Number(row.work_version) || proof.resultRevision!==row.candidate_sha ||
      !['PARTIAL','FAILED'].includes(proof.outcome)) throw Error('RETAINED_PROOF_BINDING');
  const binding = bindingSchema.parse({...selected,resultId:row.id,proofHash:row.content_hash,version:work.version,generation:work.generation});
  if (expected && digest(binding)!==digest(bindingSchema.parse(expected))) throw Error('RETAINED_SUMMARY_CHANGED');
  const refs = proof.artifactRefs.filter(ref=>ref.startsWith('factory-evidence:sha256:'));
  if (refs.length!==2 || new Set(refs).size!==2) throw Error('RETAINED_EVIDENCE_REQUIRED');
  const evidence = await Promise.all(refs.map(ref=>new FactoryEvidenceStore(store).readProof(workId,binding.resultId,ref)));
  if (evidence.map(e=>e.ref.kind).sort().join(',')!=='DiffEvidence,TestEvidence') throw Error('RETAINED_EVIDENCE_KINDS');
  const receiptRef = proof.artifactRefs.find(ref=>/^factory-receipt:[a-f0-9-]{36}$/.test(ref));
  if (!receiptRef) throw Error('RETAINED_RECEIPT_REQUIRED');
  const [receipt] = await store.database.query(`SELECT r.provenance->'manifest'->'verification' AS verification
    FROM engineering_factory_receipts r JOIN engineering_factory_requests q ON q.id=r.request_id
    WHERE r.id=$3 AND r.state='ADMITTED' AND q.scope_id=$1 AND q.scope_kind='personal' AND q.work_id=$2`,[ownerId,workId,receiptRef.slice('factory-receipt:'.length)]);
  const verification = z.object({kind:z.literal('INDEPENDENT_CLOUD_VERIFICATION'),workId:z.literal(workId),
    workGeneration:z.literal(Number(row.work_generation)),candidateCommit:z.literal(String(row.candidate_sha)),
    checks:z.array(z.object({id:z.string().min(1),result:z.enum(['PASS','FAIL'])})).min(1),cleanupConfirmed:z.literal(true)}).parse(receipt?.verification);
  if (new Set(verification.checks.map(c=>c.id)).size!==verification.checks.length) throw Error('RETAINED_VERIFICATION_DUPLICATES');
  const accounting = await readJourneyAccounting(store,workId);
  const passed = verification.checks.filter(c=>c.result==='PASS').length;
  const changed = proof.artifactRefs.filter(ref=>ref.startsWith('changed-source:')).map(ref=>ref.slice('changed-source:'.length));
  const text = [
    `Here is the retained evidence summary for “${work.title}”.`,
    `The recorded objective was: ${work.objective}`,
    `Factory produced a candidate${changed.length ? ` changing ${changed.join(', ')}` : ''}. Independent verification recorded ${passed}/${verification.checks.length} checks passing. TestEvidence and DiffEvidence are in durable custody and their bytes and Proof references have been verified.`,
    `The Result remains ${proof.outcome}. ${proof.limitations.filter(line=>!line.startsWith('Accounting snapshot')).join(' ')}`,
    `The current Work is paused at version ${work.version}, generation ${work.generation}. This retained Result belongs to execution version ${row.work_version}, generation ${row.work_generation}; it is historical evidence, not renewed execution authority.`,
    `Recorded model cost is $${(accounting.settledMicrousd/1e6).toFixed(6)} settled, with $${(accounting.unknownExposureMicrousd/1e6).toFixed(6)} UNKNOWN exposure. Accounting coverage: ${accounting.coverage}. Infrastructure and other charges outside this ledger are not represented.`,
    'This is a deterministic summary of the existing Result and Proof. No model provider was called, no Work was resumed, and no Factory execution was requested. Publication and acceptance require separate owner decisions.',
    `[Open this Work and its Proof](/work?id=${workId}&kind=work)`,
  ].join('\n\n');
  return {binding,text};
}

export function retainedSummaryBinding(value:unknown):RetainedSummaryBinding {
  if (typeof value!=='string') throw Error('RETAINED_SUMMARY_BINDING');
  return bindingSchema.parse(JSON.parse(value));
}

export function retainedWorkSummaryModel(binding:RetainedSummaryBinding):Model {
  async function generate(options:Parameters<Model['doGenerate']>[0]):Promise<Awaited<ReturnType<Model['doGenerate']>>> {
    options.abortSignal?.throwIfAborted();
    const {ownerId,threadId,sessionId,workId}=binding;
    const result=await readRetainedWorkSummary({ownerId,threadId,sessionId,workId},binding);
    options.abortSignal?.throwIfAborted();
    return {content:[{type:'text',text:result.text}],usage:{inputTokens:{total:0,noCache:0,cacheRead:0,cacheWrite:0},outputTokens:{total:0,text:0,reasoning:0}},finishReason:{unified:'stop',raw:'stop'},warnings:[]};
  }
  return {specificationVersion:'v4',provider:'myeve-retained-evidence',modelId:'deterministic-summary',supportedUrls:{},doGenerate:generate,
    async doStream(options){const result=await generate(options);return {stream:new ReadableStream<Part>({start(controller){
      controller.enqueue({type:'stream-start',warnings:[]});controller.enqueue({type:'text-start',id:'summary'});
      controller.enqueue({type:'text-delta',id:'summary',delta:(result.content[0] as {text:string}).text});controller.enqueue({type:'text-end',id:'summary'});
      controller.enqueue({type:'finish',usage:result.usage,finishReason:result.finishReason});controller.close();
    }})};}};
}
