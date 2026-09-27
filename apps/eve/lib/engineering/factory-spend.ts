import {digest} from './contract.ts';
import {z} from 'zod';

const amount=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const text=z.string().min(1).max(256);
const hash=z.string().regex(/^[a-f0-9]{64}$/);
const evidence=z.object({status:z.enum(['QUALIFIED','PENDING']),evidenceRef:z.string().min(1).max(1000).nullable()}).strict();
/** Consumer-reviewed evidence, not fields advertised by the producer wire protocol. */
export const factorySpendReviewSchema=z.object({
 environment:z.enum(['LOCAL_FIXTURE','LIVE']),sourceDigest:hash,factoryVersion:hash,
 expiresAt:z.string().datetime(),hardCeiling:evidence,preCallEnforcement:evidence,
 accounting:evidence,unknownRetention:evidence,completion:evidence,
 pricing:evidence.extend({model:text,revision:text,validUntil:z.string().datetime()}).strict(),
}).strict();
export type FactorySpendReview=z.infer<typeof factorySpendReviewSchema>;
export const factorySpendContractSchema=z.object({version:z.literal('WORK_LEDGER_V1'),sourceDigest:hash}).strict();
export type FactorySpendProfile={sourceDigest:string;factoryVersion:string;spendContract?:z.infer<typeof factorySpendContractSchema>;qualification:{mode:'LOCAL_FIXTURE'|'LOCAL_SPEND_FIXTURE'|'LIVE';spendEnforced:boolean;spendReview?:FactorySpendReview}};
export function factorySpendAdmission(profile:FactorySpendProfile,now=Date.now()){
 const q=profile.qualification,r=q.spendReview,reasons:string[]=[];
 if(q.mode==='LOCAL_FIXTURE')return {allowed:true,reasons};
 if(!q.spendEnforced)reasons.push('Pre-call spend enforcement is not qualified');
 if(profile.spendContract?.version!=='WORK_LEDGER_V1'||profile.spendContract.sourceDigest!==profile.sourceDigest)reasons.push('Reviewed Work ledger contract is missing');
 if(!r||r.sourceDigest!==profile.sourceDigest||r.factoryVersion!==profile.factoryVersion||Date.parse(r.expiresAt)<=now||r.environment!==(q.mode==='LIVE'?'LIVE':'LOCAL_FIXTURE')){
  reasons.push('Current producer-bound spend qualification is missing');return {allowed:false,reasons};
 }
 for(const key of ['hardCeiling','preCallEnforcement','accounting','unknownRetention','completion'] as const)
  if(r[key].status!=='QUALIFIED'||!r[key].evidenceRef)reasons.push(`${key} qualification is missing`);
 if(r.pricing.status!=='QUALIFIED'||!r.pricing.evidenceRef||Date.parse(r.pricing.validUntil)<=now)reasons.push('Current model pricing is not qualified');
 return {allowed:reasons.length===0,reasons};
}
const operationSchema=z.object({operationId:text,workId:text,workGeneration:z.number().int().positive(),dispatchIdentity:text,
 requestId:text,workOrderId:text,factoryVersion:hash,runId:text,model:text,pricingRevision:text,reservedMicrousd:amount.positive(),
 actualMicrousd:amount.nullable(),providerRequestId:text.nullable(),usage:z.record(z.string(),amount).nullable(),
 state:z.enum(['reserved','dispatched','unknown','settled'])}).strict();
export const workSpendSchema=z.object({status:z.enum(['KNOWN','UNKNOWN']),currency:z.literal('USD'),unit:z.literal('microUSD'),
 workId:z.string().uuid(),workGeneration:z.number().int().positive(),requestId:z.string().uuid(),workOrderId:z.string().uuid(),deadline:z.string().datetime(),
 ceilingMicrousd:amount.positive(),settledMicrousd:amount,retainedMicrousd:amount,availableMicrousd:amount,cancelled:z.boolean(),
 operations:z.array(operationSchema).max(2000),reason:z.string().max(2000).optional()}).strict().superRefine((s,ctx)=>{
 const bad=(message:string)=>ctx.addIssue({code:'custom',message});
 let settled=0,retained=0;const ids=new Set<string>();
 for(const op of s.operations){
  if(ids.has(op.operationId))bad('Duplicate spend operation');ids.add(op.operationId);
  if(op.workId!==s.workId||op.workGeneration>s.workGeneration)bad('Foreign or future spend operation');
  if(op.state==='settled'){
   if(op.actualMicrousd===null||op.actualMicrousd>op.reservedMicrousd||!op.providerRequestId||op.usage?.input_tokens===undefined||op.usage?.output_tokens===undefined)bad('Incomplete settled usage');
   settled+=op.actualMicrousd??0;
  }else{
   if(op.actualMicrousd!==null||op.providerRequestId!==null||op.usage!==null)bad('Unresolved reservation has settlement fields');
   retained+=op.reservedMicrousd;
  }
 }
 if(!Number.isSafeInteger(settled+retained)||settled!==s.settledMicrousd||retained!==s.retainedMicrousd||settled+retained+s.availableMicrousd!==s.ceilingMicrousd)bad('Incomplete or inconsistent Work accounting');
 if((s.status==='UNKNOWN')!==s.operations.some(op=>op.state==='unknown'))bad('UNKNOWN exposure status mismatch');
});
export type WorkSpend=z.infer<typeof workSpendSchema>;
export const legacySpendSchema=z.object({status:z.enum(['KNOWN','UNKNOWN']),ceilingUsd:z.number().finite().nonnegative(),reason:z.string().optional()}).strict();
export const factorySpendSchema=z.union([workSpendSchema,legacySpendSchema]);
export type FactorySpend=z.infer<typeof factorySpendSchema>;
export function isWorkSpend(value:FactorySpend):value is WorkSpend{return 'currency' in value;}
export type SpendBinding={workId:string;workGeneration:number;requestId:string;workOrderId:string;deadline:string;dispatchIdentity?:string;remoteRunId?:string;factoryVersion?:string};
export function validateSpendBinding(spend:FactorySpend,expected:SpendBinding,ceilingUsd?:number){
 if(!isWorkSpend(spend))return;
 if(spend.workId!==expected.workId||spend.workGeneration!==expected.workGeneration||spend.requestId!==expected.requestId||spend.workOrderId!==expected.workOrderId||spend.deadline!==expected.deadline||
  (ceilingUsd!==undefined&&spend.ceilingMicrousd!==Math.floor(ceilingUsd*1_000_000)))throw Error('Factory spend binding or immutable Work ceiling mismatch');
 for(const op of spend.operations.filter(op=>op.workGeneration===expected.workGeneration))
  if(op.requestId!==expected.requestId||op.workOrderId!==expected.workOrderId||
   (expected.dispatchIdentity!==undefined&&op.dispatchIdentity!==expected.dispatchIdentity)||
   (expected.remoteRunId!==undefined&&op.runId!==expected.remoteRunId)||
   (expected.factoryVersion!==undefined&&op.factoryVersion!==expected.factoryVersion))throw Error('Factory spend operation differs from exact attempt');
}
export function factorySpendSummary(spend:FactorySpend,profile:FactorySpendProfile){
 const review=factorySpendAdmission(profile),ledger=isWorkSpend(spend)?spend:null;
 const unknownMicrousd=ledger?.operations.filter(op=>op.state==='unknown').reduce((n,op)=>n+op.reservedMicrousd,0)??null;
 const activeMicrousd=ledger?.operations.filter(op=>op.state==='reserved'||op.state==='dispatched').reduce((n,op)=>n+op.reservedMicrousd,0)??null;
 const blocker=!ledger?'Legacy zero-cost fixture; paid accounting unavailable':ledger.status==='UNKNOWN'?'Uncertain spend remains reserved; reconcile before another paid operation':ledger.cancelled?'Work budget cancelled; no further paid operation':ledger.availableMicrousd===0?'Work allowance exhausted':!review.allowed?review.reasons.join('; '):activeMicrousd?'A paid operation still holds a reservation':null;
 const candidate=profile.qualification.spendReview;
 const r=candidate&&candidate.sourceDigest===profile.sourceDigest&&candidate.factoryVersion===profile.factoryVersion&&candidate.environment===(profile.qualification.mode==='LIVE'?'LIVE':'LOCAL_FIXTURE')&&Date.parse(candidate.expiresAt)>Date.now()?candidate:undefined;
 return {ceilingMicrousd:ledger?.ceilingMicrousd??null,settledMicrousd:ledger?.settledMicrousd??null,
  reservedMicrousd:ledger?.retainedMicrousd??null,unknownMicrousd,activeMicrousd,safeAllowanceMicrousd:ledger?.availableMicrousd??null,
  accountingCompleteness:ledger?'VALIDATED_READBACK':'UNAVAILABLE',pricingQualification:r?.pricing.status==='QUALIFIED'&&!!r.pricing.evidenceRef&&Date.parse(r.pricing.validUntil)>Date.now()?'QUALIFIED':'PENDING',
  completionQualification:r?.completion.status==='QUALIFIED'&&!!r.completion.evidenceRef?'QUALIFIED':'PENDING',
  spendEnforcementQualified:review.allowed&&profile.qualification.mode!=='LOCAL_FIXTURE',blocker};
}
export type FactorySpendSummary=ReturnType<typeof factorySpendSummary>;
/** A readback may settle uncertainty, never erase liabilities or reset the ceiling. */
export function assertSpendContinuation(previous:WorkSpend,next:WorkSpend){
 if(previous.workId!==next.workId||previous.ceilingMicrousd!==next.ceilingMicrousd||next.workGeneration<previous.workGeneration||previous.cancelled&&!next.cancelled)throw Error('Work spend ceiling, generation or cancellation reset');
 for(const old of previous.operations){
  const current=next.operations.find(op=>op.operationId===old.operationId);
  if(!current)throw Error('Historical spend operation disappeared');
  for(const key of ['workId','workGeneration','dispatchIdentity','requestId','workOrderId','factoryVersion','runId','model','pricingRevision','reservedMicrousd'] as const)
   if(old[key]!==current[key])throw Error('Historical spend binding changed');
  if(old.state==='settled'&&digest(old)!==digest(current))throw Error('Settled spend changed');
  const order={reserved:0,dispatched:1,unknown:2,settled:3};if(order[current.state]<order[old.state])throw Error('Uncertain spend reservation regressed');
 }
}
export function assertFactorySpendCanStart(spend:FactorySpend){
 if(!isWorkSpend(spend))return;
 if(spend.cancelled||spend.status==='UNKNOWN'||spend.retainedMicrousd>0||spend.availableMicrousd<=0)throw Error('Factory spend reconciliation required before a new paid operation');
}
