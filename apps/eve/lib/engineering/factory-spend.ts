import {digest} from './contract.ts';
import {z} from 'zod';

const amount=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const count=z.number().int().nonnegative().max(2000);
const text=z.string().min(1).max(256);
const hash=z.string().regex(/^[a-f0-9]{64}$/);
const phase=z.enum(['productive','completion']);
const authorityState=z.enum(['prepared','active','fenced']);
const evidence=z.object({status:z.enum(['QUALIFIED','PENDING']),evidenceRef:z.string().min(1).max(1000).nullable()}).strict();
/** Consumer-reviewed evidence, never a producer grant or a model-selected policy. */
export const factorySpendReviewSchema=z.object({
 environment:z.enum(['LOCAL_FIXTURE','CLOUD_DETERMINISTIC','CLOUD_PRODUCTION_VALIDATION','LIVE']),sourceDigest:hash,factoryVersion:hash,
 expiresAt:z.string().datetime(),hardCeiling:evidence,preCallEnforcement:evidence,
 accounting:evidence,unknownRetention:evidence,completion:evidence,
 pricing:evidence.extend({model:text,revision:text,validUntil:z.string().datetime()}).strict(),
}).strict();
export type FactorySpendReview=z.infer<typeof factorySpendReviewSchema>;
export const factorySpendPlanSchema=z.object({
 version:z.literal('WORK_LEDGER_V2'),pricingRevision:text,
 plannedProductiveOperations:count.positive(),plannedCompletionOperations:count.positive(),
 maxPaidOperations:count.positive(),completionReserveMicrousd:amount.positive(),
}).strict().refine(p=>p.maxPaidOperations===p.plannedProductiveOperations+p.plannedCompletionOperations,
 'Paid operation limit must equal the complete productive and completion plan');
export type FactorySpendPlan=z.infer<typeof factorySpendPlanSchema>;
export const factorySpendContractSchema=z.object({version:z.enum(['WORK_LEDGER_V1','WORK_LEDGER_V2']),sourceDigest:hash}).strict();
export type FactorySpendProfile={sourceDigest:string;factoryVersion:string;spendContract?:z.infer<typeof factorySpendContractSchema>;
 spendPlan?:FactorySpendPlan;qualification:{mode:'LOCAL_FIXTURE'|'LOCAL_SPEND_FIXTURE'|'CLOUD_DETERMINISTIC'|'CLOUD_PRODUCTION_VALIDATION'|'LIVE'|'OWNER_SUBSCRIPTION_LOCAL';spendEnforced:boolean;spendReview?:FactorySpendReview}};
/** The exact operations-only plan the OWNER_SUBSCRIPTION_LOCAL route accepts (MyFactory FACTORY-HOST.md): N=1|2 productive + 1 completion. */
export const OWNER_SUBSCRIPTION_PRICING_REVISION='owner-subscription-local.operations-v1';
/**
 * Owner-local subscription route: there is no USD price to review, so no spend review is required. Admission instead requires the
 * enforced V2 Work-ledger contract bound to this source and the exact operation plan of the route. Usage is recorded in operations
 * (SUBSCRIPTION_UNMETERED, never $0) and the Factory still enforces its operation limits, single-use dispatch and UNKNOWN fencing.
 */
function ownerSubscriptionAdmission(profile:FactorySpendProfile){
 const reasons:string[]=[],q=profile.qualification,plan=factorySpendPlanSchema.safeParse(profile.spendPlan);
 if(!q.spendEnforced)reasons.push('Pre-call operation enforcement is not qualified');
 if(profile.spendContract?.version!=='WORK_LEDGER_V2'||profile.spendContract.sourceDigest!==profile.sourceDigest)reasons.push('Work ledger V2 contract bound to this source is required');
 if(q.spendReview)reasons.push('A USD spend review does not apply to the unmetered owner subscription route');
 if(!plan.success||plan.data.pricingRevision!==OWNER_SUBSCRIPTION_PRICING_REVISION||plan.data.plannedCompletionOperations!==1||plan.data.completionReserveMicrousd!==1
  ||![1,2].includes(plan.data.plannedProductiveOperations)||plan.data.maxPaidOperations!==plan.data.plannedProductiveOperations+1)
  reasons.push('The exact owner-subscription operation plan is required');
 return {allowed:reasons.length===0,reasons};
}
export function factorySpendAdmission(profile:FactorySpendProfile,now=Date.now()){
 const q=profile.qualification,r=q.spendReview,reasons:string[]=[];
 if(q.mode==='LOCAL_FIXTURE')return {allowed:true,reasons};
 if(q.mode==='OWNER_SUBSCRIPTION_LOCAL')return ownerSubscriptionAdmission(profile);
 if(!q.spendEnforced)reasons.push('Pre-call spend enforcement is not qualified');
 if(profile.spendContract?.version!=='WORK_LEDGER_V2'||profile.spendContract.sourceDigest!==profile.sourceDigest)
  reasons.push('Reviewed Work ledger V2 contract is required for paid production');
 const plan=factorySpendPlanSchema.safeParse(profile.spendPlan);
 if(!plan.success)reasons.push('Complete bounded productive/completion plan is missing');
 if(!r||r.sourceDigest!==profile.sourceDigest||r.factoryVersion!==profile.factoryVersion||Date.parse(r.expiresAt)<=now||r.environment!==(q.mode==='LIVE'?'LIVE':['CLOUD_DETERMINISTIC','CLOUD_PRODUCTION_VALIDATION'].includes(q.mode)?q.mode:'LOCAL_FIXTURE')){
  reasons.push('Current producer-bound spend qualification is missing');return {allowed:false,reasons};
 }
 for(const key of ['hardCeiling','preCallEnforcement','accounting','unknownRetention','completion'] as const)
  if(r[key].status!=='QUALIFIED'||!r[key].evidenceRef)reasons.push(`${key} qualification is missing`);
 if(r.pricing.status!=='QUALIFIED'||!r.pricing.evidenceRef||Date.parse(r.pricing.validUntil)<=now||
  plan.success&&plan.data.pricingRevision!==r.pricing.revision)reasons.push('Current model pricing is not qualified');
 return {allowed:reasons.length===0,reasons};
}
const operationSchema=z.object({operationId:text,workId:text,workGeneration:z.number().int().positive(),dispatchIdentity:text,
 requestId:text,workOrderId:text,factoryVersion:hash,runId:text,model:text,pricingRevision:text,reservedMicrousd:amount.positive(),
 actualMicrousd:amount.nullable(),providerRequestId:text.nullable(),usage:z.record(z.string(),amount).nullable(),
 state:z.enum(['reserved','dispatched','unknown','settled','released'])}).strict();
const ledgerShape=z.object({status:z.enum(['KNOWN','UNKNOWN']),currency:z.literal('USD'),unit:z.literal('microUSD'),
 workId:z.string().uuid(),workGeneration:z.number().int().positive(),requestId:z.string().uuid(),workOrderId:z.string().uuid(),deadline:z.string().datetime(),
 ceilingMicrousd:amount.positive(),settledMicrousd:amount,retainedMicrousd:amount,availableMicrousd:amount,cancelled:z.boolean(),
 operations:z.array(operationSchema).max(2000),reason:z.string().max(2000).optional()}).strict();
function accounting(s:z.infer<typeof ledgerShape>,ctx:z.RefinementCtx){
 const bad=(message:string)=>ctx.addIssue({code:'custom',message});
 let settled=0,retained=0;const ids=new Set<string>(),providerIds=new Set<string>();
 for(const op of s.operations){
  if(ids.has(op.operationId))bad('Duplicate spend operation');ids.add(op.operationId);
  if(op.workId!==s.workId||op.workGeneration>s.workGeneration)bad('Foreign or future spend operation');
  if(op.state==='settled'){
   if(op.actualMicrousd===null||op.actualMicrousd>op.reservedMicrousd||!op.providerRequestId||op.usage?.input_tokens===undefined||op.usage?.output_tokens===undefined)bad('Incomplete settled usage');
   if(op.providerRequestId&&providerIds.has(op.providerRequestId))bad('Duplicate provider settlement');
   if(op.providerRequestId)providerIds.add(op.providerRequestId);
   settled+=op.actualMicrousd??0;
  }else{
   if(op.actualMicrousd!==null||op.providerRequestId!==null||op.usage!==null)bad('Unresolved reservation has settlement fields');
   if(op.state!=='released')retained+=op.reservedMicrousd;
  }
 }
 if(!Number.isSafeInteger(settled+retained)||settled!==s.settledMicrousd||retained!==s.retainedMicrousd||settled+retained+s.availableMicrousd!==s.ceilingMicrousd)bad('Incomplete or inconsistent Work accounting');
 if((s.status==='UNKNOWN')!==s.operations.some(op=>op.state==='unknown'))bad('UNKNOWN exposure status mismatch');
}
export const legacyWorkSpendSchema=ledgerShape.superRefine(accounting);
export const workSpendV2Schema=ledgerShape.extend({
 contractVersion:z.literal('WORK_LEDGER_V2'),pricingRevision:text,
 plannedProductiveOperations:count.positive(),plannedCompletionOperations:count.positive(),
 perOperationReserveMicrousd:amount.positive(),completionReserveMicrousd:amount.positive(),
 completionReserveRemainingMicrousd:amount,productiveAllowanceRemainingMicrousd:amount,unknownExposureMicrousd:amount,
 paidOperationsUsed:count,maxPaidOperations:count.positive(),completionOperationsUsed:count,completionOperationSlotsRemaining:count,
 accountingComplete:z.boolean(),pricingQualified:z.boolean(),authorityState,phase,
 operations:z.array(operationSchema.extend({phase}).strict()).max(2000),
}).strict().superRefine((s,ctx)=>{
 accounting(s,ctx);const bad=(message:string)=>ctx.addIssue({code:'custom',message});
 const completion=s.operations.filter(op=>op.phase==='completion');
 const exposure=(ops:typeof s.operations)=>ops.reduce((sum,op)=>sum+(op.state==='released'?0:op.state==='settled'?op.actualMicrousd??0:op.reservedMicrousd),0);
 const completionExposure=exposure(completion),remaining=s.completionReserveMicrousd-completionExposure;
 if(s.maxPaidOperations!==s.plannedProductiveOperations+s.plannedCompletionOperations||
  s.paidOperationsUsed!==s.operations.length||s.paidOperationsUsed>s.maxPaidOperations||
  s.completionOperationsUsed!==completion.length||completion.length>s.plannedCompletionOperations||
  s.operations.length-completion.length>s.plannedProductiveOperations||
  s.completionOperationSlotsRemaining!==s.plannedCompletionOperations-completion.length)bad('Incomplete or exceeded operation plan');
 const completeBound=s.plannedProductiveOperations*s.perOperationReserveMicrousd+s.completionReserveMicrousd;
 if(!Number.isSafeInteger(completeBound)||completeBound>s.ceilingMicrousd||
  s.plannedCompletionOperations*s.perOperationReserveMicrousd>s.completionReserveMicrousd)bad('Conservative complete plan does not fit');
 if(remaining<0||remaining!==s.completionReserveRemainingMicrousd||
  s.productiveAllowanceRemainingMicrousd!==s.availableMicrousd-remaining)bad('Protected completion reserve mismatch or theft');
 if(s.unknownExposureMicrousd!==s.operations.filter(op=>op.state==='unknown').reduce((n,op)=>n+op.reservedMicrousd,0))bad('UNKNOWN exposure mismatch');
 if(s.accountingComplete!==s.operations.every(op=>['settled','released'].includes(op.state)))bad('Accounting completeness mismatch');
 if(s.phase==='productive'&&completion.some(op=>op.workGeneration===s.workGeneration))bad('Completion phase regressed');
 for(const op of s.operations)if(op.pricingRevision!==s.pricingRevision||op.reservedMicrousd!==s.perOperationReserveMicrousd)bad('Operation differs from qualified plan');
});
// Migrated V1 rows remain readable for custody/recovery; these fields confer no paid eligibility.
export const migratedLegacyWorkSpendSchema=ledgerShape.extend({
 contractVersion:z.literal('WORK_LEDGER_V1'),pricingRevision:z.null(),pricingQualified:z.literal(false),
 plannedProductiveOperations:z.literal(0),plannedCompletionOperations:z.literal(0),maxPaidOperations:z.literal(0),
 perOperationReserveMicrousd:z.literal(0),completionReserveMicrousd:z.literal(0),completionReserveRemainingMicrousd:z.literal(0),
 productiveAllowanceRemainingMicrousd:amount,unknownExposureMicrousd:amount,paidOperationsUsed:count,
 completionOperationsUsed:z.literal(0),completionOperationSlotsRemaining:z.literal(0),accountingComplete:z.boolean(),authorityState,phase:z.literal('productive'),
 operations:z.array(operationSchema.extend({phase:z.literal('productive')}).strict()).max(2000),
}).strict().superRefine((s,ctx)=>{
 accounting(s,ctx);
 if(s.paidOperationsUsed!==s.operations.length||s.productiveAllowanceRemainingMicrousd!==s.availableMicrousd||
  s.unknownExposureMicrousd!==s.operations.filter(op=>op.state==='unknown').reduce((n,op)=>n+op.reservedMicrousd,0)||
  s.accountingComplete!==s.operations.every(op=>['settled','released'].includes(op.state)))ctx.addIssue({code:'custom',message:'Migrated V1 accounting mismatch'});
});
export const workSpendSchema=z.union([workSpendV2Schema,migratedLegacyWorkSpendSchema,legacyWorkSpendSchema]);
export type WorkSpend=z.infer<typeof workSpendSchema>;
export type WorkSpendV2=z.infer<typeof workSpendV2Schema>;
export const legacySpendSchema=z.object({status:z.enum(['KNOWN','UNKNOWN']),ceilingUsd:z.number().finite().nonnegative(),reason:z.string().optional()}).strict();
/**
 * OWNER_SUBSCRIPTION_LOCAL readback (owner-local private beta only): an operations-only Work ledger. Usage is counted in OPERATIONS and is never
 * priced: every money field is null and `metering` is SUBSCRIPTION_UNMETERED. It is a distinct kind, never a WorkSpend, so no reader can turn a
 * null amount into $0. Consumers accept it only under the pinned OWNER_SUBSCRIPTION_LOCAL qualification mode.
 */
const nullMoney=z.null();
export const subscriptionSpendSchema=z.object({
 status:z.enum(['SUBSCRIPTION_UNMETERED','UNKNOWN']),metering:z.literal('SUBSCRIPTION_UNMETERED'),costKnown:z.literal(false),currency:z.null(),unit:z.literal('OPERATION'),
 workId:z.string().uuid(),workGeneration:z.number().int().positive(),requestId:z.string().uuid(),workOrderId:z.string().uuid(),deadline:z.string().min(1).max(64),
 ceilingMicrousd:nullMoney,settledMicrousd:nullMoney,retainedMicrousd:nullMoney,availableMicrousd:nullMoney,unknownExposureMicrousd:nullMoney,
 unknownOperations:count,inFlightOperations:count,operationsUsed:count,maxOperations:count.positive(),paidOperationsUsed:count,maxPaidOperations:count.positive(),
 plannedProductiveOperations:count.positive(),plannedCompletionOperations:count.positive(),completionOperationsUsed:count,completionOperationSlotsRemaining:count,
 contractVersion:z.literal('WORK_LEDGER_V2'),pricingRevision:text,pricingQualified:z.literal(false),routeQualified:z.boolean(),authorityState,accountingComplete:z.boolean(),phase,cancelled:z.boolean(),
 operations:z.array(z.object({operationId:text,workId:text,workGeneration:z.number().int().positive(),requestId:text,workOrderId:text,runId:text.nullable().optional(),
  reservedMicrousd:nullMoney,actualMicrousd:nullMoney,metering:z.literal('SUBSCRIPTION_UNMETERED'),spendStatus:z.enum(['SUBSCRIPTION_UNMETERED','UNKNOWN','RELEASED']),
  state:z.enum(['reserved','dispatched','unknown','settled','released'])}).passthrough()).max(2000),
}).passthrough().superRefine((s,ctx)=>{
 const bad=(message:string)=>ctx.addIssue({code:'custom',message});
 const unknown=s.operations.filter(op=>op.state==='unknown').length,inFlight=s.operations.filter(op=>op.state==='reserved'||op.state==='dispatched').length;
 if((s.status==='UNKNOWN')!==(unknown>0)||s.unknownOperations!==unknown||s.inFlightOperations!==inFlight)bad('Subscription UNKNOWN/in-flight mismatch');
 if(s.operationsUsed!==s.operations.filter(op=>op.state!=='released').length||s.operationsUsed>s.maxOperations||s.paidOperationsUsed!==s.operations.length
  ||s.paidOperationsUsed>s.maxPaidOperations||s.maxPaidOperations!==s.plannedProductiveOperations+s.plannedCompletionOperations)bad('Subscription operation limit mismatch');
 if(s.accountingComplete!==s.operations.every(op=>['settled','released'].includes(op.state)))bad('Subscription accounting completeness mismatch');
 for(const op of s.operations)if(op.workId!==s.workId||op.spendStatus!==(op.state==='settled'?'SUBSCRIPTION_UNMETERED':op.state==='released'?'RELEASED':'UNKNOWN'))bad('Subscription operation mismatch');
});
export type SubscriptionSpend=z.infer<typeof subscriptionSpendSchema>;
export const factorySpendSchema=z.union([subscriptionSpendSchema,workSpendSchema,legacySpendSchema]);
export type FactorySpend=z.infer<typeof factorySpendSchema>;
export function isSubscriptionSpend(value:FactorySpend|unknown):value is SubscriptionSpend{return !!value&&typeof value==='object'&&(value as {metering?:unknown}).metering==='SUBSCRIPTION_UNMETERED';}
export function isWorkSpend(value:FactorySpend):value is WorkSpend{return 'currency' in value&&!isSubscriptionSpend(value);}
export function isWorkSpendV2(value:FactorySpend):value is WorkSpendV2{return 'contractVersion' in value&&value.contractVersion==='WORK_LEDGER_V2'&&!isSubscriptionSpend(value);}
/** Operations-only accounting for an OWNER_SUBSCRIPTION_LOCAL readback. Every money figure is null by construction (never 0). */
export function subscriptionAccounting(spend:SubscriptionSpend){
 return {metering:'SUBSCRIPTION_UNMETERED' as const,status:spend.status,unit:'OPERATION' as const,operationsUsed:spend.operationsUsed,maxOperations:spend.maxOperations,
  inFlightOperations:spend.inFlightOperations,unknownOperations:spend.unknownOperations,completionOperationsUsed:spend.completionOperationsUsed,accountingComplete:spend.accountingComplete,
  settledMicrousd:null,activeMicrousd:null,unknownMicrousd:null,ceilingMicrousd:null};
}
export type SubscriptionAccounting=ReturnType<typeof subscriptionAccounting>;
export type SpendBinding={workId:string;workGeneration:number;requestId:string;workOrderId:string;deadline:string;dispatchIdentity?:string;remoteRunId?:string;factoryVersion?:string};
export function validateSpendBinding(spend:FactorySpend,expected:SpendBinding,ceilingUsd?:number,plan?:FactorySpendPlan){
 if(isSubscriptionSpend(spend)){
  // Operations-only: no ceiling amount exists to compare. The binding and the operation plan (the units the owner approved) still must match exactly.
  if(spend.workId!==expected.workId||spend.workGeneration!==expected.workGeneration||spend.requestId!==expected.requestId||spend.workOrderId!==expected.workOrderId||spend.deadline!==expected.deadline)
   throw Error('Factory spend binding mismatch');
  if(plan&&(spend.pricingRevision!==plan.pricingRevision||spend.plannedProductiveOperations!==plan.plannedProductiveOperations
   ||spend.plannedCompletionOperations!==plan.plannedCompletionOperations||spend.maxPaidOperations!==plan.maxPaidOperations))throw Error('Factory subscription plan differs from approved Work plan');
  for(const op of spend.operations.filter(op=>op.workGeneration===expected.workGeneration))
   if(op.requestId!==expected.requestId||op.workOrderId!==expected.workOrderId||(expected.remoteRunId!==undefined&&op.runId!=null&&op.runId!==expected.remoteRunId))
    throw Error('Factory spend operation differs from exact attempt');
  return;
 }
 if(!isWorkSpend(spend))return;
 if(spend.workId!==expected.workId||spend.workGeneration!==expected.workGeneration||spend.requestId!==expected.requestId||spend.workOrderId!==expected.workOrderId||spend.deadline!==expected.deadline||
  (ceilingUsd!==undefined&&spend.ceilingMicrousd!==Math.floor(ceilingUsd*1_000_000)))throw Error('Factory spend binding or immutable Work ceiling mismatch');
 if(plan){
  if(!isWorkSpendV2(spend))throw Error('Factory spend V2 plan missing');
  for(const key of ['pricingRevision','plannedProductiveOperations','plannedCompletionOperations','maxPaidOperations','completionReserveMicrousd'] as const)
   if(spend[key]!==plan[key])throw Error('Factory spend plan differs from approved Work plan');
 }
 for(const op of spend.operations.filter(op=>op.workGeneration===expected.workGeneration))
  if(op.requestId!==expected.requestId||op.workOrderId!==expected.workOrderId||
   (expected.dispatchIdentity!==undefined&&op.dispatchIdentity!==expected.dispatchIdentity)||
   (expected.remoteRunId!==undefined&&op.runId!==expected.remoteRunId)||
   (expected.factoryVersion!==undefined&&op.factoryVersion!==expected.factoryVersion))throw Error('Factory spend operation differs from exact attempt');
}
function startBlocker(spend:FactorySpend){
 if(!isWorkSpendV2(spend))return 'Work ledger V2 plan is required for paid production';
 if(!spend.pricingQualified)return 'Factory pricing is unqualified';
 if(spend.cancelled)return 'Work budget cancelled; no further paid operation';
 if(spend.status==='UNKNOWN'||spend.unknownExposureMicrousd>0)return 'Uncertain spend remains reserved; reconcile before another paid operation (authoritative reconciliation required)';
 if(!spend.accountingComplete)return 'Factory accounting is incomplete';
 if(spend.retainedMicrousd>0)return 'A paid operation still holds a reservation';
 if(spend.authorityState==='fenced')return 'Factory paid authority is fenced';
 if(spend.phase!=='productive')return 'Factory completion phase cannot restart productive execution';
 if(spend.paidOperationsUsed>=spend.maxPaidOperations||spend.paidOperationsUsed-spend.completionOperationsUsed>=spend.plannedProductiveOperations)return 'Paid productive operation limit exhausted';
 if(spend.productiveAllowanceRemainingMicrousd<spend.perOperationReserveMicrousd)return 'Productive allowance cannot fund a qualified operation';
 if(spend.completionReserveRemainingMicrousd<spend.completionOperationSlotsRemaining*spend.perOperationReserveMicrousd||spend.completionOperationSlotsRemaining===0)return 'Protected completion reserve or operation slots unavailable';
 return null;
}
export function factorySpendSummary(spend:FactorySpend,profile:FactorySpendProfile){
 const review=factorySpendAdmission(profile),ledger=isWorkSpend(spend)?spend:null,v2=isWorkSpendV2(spend)?spend:null;
 const unknownMicrousd=ledger?.operations.filter(op=>op.state==='unknown').reduce((n,op)=>n+op.reservedMicrousd,0)??null;
 const activeMicrousd=ledger?.operations.filter(op=>op.state==='reserved'||op.state==='dispatched').reduce((n,op)=>n+op.reservedMicrousd,0)??null;
 const admissionBlocker=startBlocker(spend);
 // A settled terminal completion is not an accounting error, but cannot start again.
 const completed=v2?.phase==='completion'&&v2.authorityState==='fenced'&&v2.accountingComplete&&!v2.cancelled&&
  v2.operations.some(op=>op.phase==='completion'&&op.workGeneration===v2.workGeneration&&op.state==='settled');
 const blocker=!ledger?'Legacy zero-cost fixture; paid accounting unavailable':(completed?null:admissionBlocker)??(!review.allowed?review.reasons.join('; '):null);
 const candidate=profile.qualification.spendReview;
 const r=candidate&&candidate.sourceDigest===profile.sourceDigest&&candidate.factoryVersion===profile.factoryVersion&&candidate.environment===(profile.qualification.mode==='LIVE'?'LIVE':['CLOUD_DETERMINISTIC','CLOUD_PRODUCTION_VALIDATION'].includes(profile.qualification.mode)?profile.qualification.mode:'LOCAL_FIXTURE')&&Date.parse(candidate.expiresAt)>Date.now()?candidate:undefined;
 return {ceilingMicrousd:ledger?.ceilingMicrousd??null,settledMicrousd:ledger?.settledMicrousd??null,
  reservedMicrousd:ledger?.retainedMicrousd??null,unknownMicrousd,activeMicrousd,availableMicrousd:ledger?.availableMicrousd??null,
  safeAllowanceMicrousd:!blocker&&!admissionBlocker&&v2?v2.productiveAllowanceRemainingMicrousd:0,
  productiveAllowanceRemainingMicrousd:v2?.productiveAllowanceRemainingMicrousd??null,
  completionReserveMicrousd:v2?.completionReserveMicrousd??null,completionReserveRemainingMicrousd:v2?.completionReserveRemainingMicrousd??null,
  paidOperationsUsed:v2?.paidOperationsUsed??null,maxPaidOperations:v2?.maxPaidOperations??null,completionOperationSlotsRemaining:v2?.completionOperationSlotsRemaining??null,
  accountingCompleteness:ledger?(v2&&!v2.accountingComplete?'UNSETTLED':'VALIDATED_READBACK'):'UNAVAILABLE',pricingQualification:r?.pricing.status==='QUALIFIED'&&!!r.pricing.evidenceRef&&Date.parse(r.pricing.validUntil)>Date.now()&&v2?.pricingQualified?'QUALIFIED':'PENDING',
  completionQualification:r?.completion.status==='QUALIFIED'&&!!r.completion.evidenceRef&&v2?'QUALIFIED':'PENDING',
  spendEnforcementQualified:review.allowed&&!!v2&&profile.qualification.mode!=='LOCAL_FIXTURE',blocker};
}
export type FactorySpendSummary=ReturnType<typeof factorySpendSummary>;
/** Readback may settle uncertainty, never erase liabilities or reset budget/plan/slots. */
export function assertSpendContinuation(previous:WorkSpend,next:WorkSpend){
 if(previous.workId!==next.workId||previous.ceilingMicrousd!==next.ceilingMicrousd||next.workGeneration<previous.workGeneration||previous.cancelled&&!next.cancelled)throw Error('Work spend ceiling, generation or cancellation reset');
 if(isWorkSpendV2(previous)){
  if(!isWorkSpendV2(next))throw Error('Work spend contract regressed');
  for(const key of ['pricingRevision','plannedProductiveOperations','plannedCompletionOperations','perOperationReserveMicrousd','completionReserveMicrousd','maxPaidOperations'] as const)
   if(previous[key]!==next[key])throw Error('Immutable Work spend plan changed');
  if(previous.workGeneration===next.workGeneration&&previous.phase==='completion'&&next.phase!=='completion')throw Error('Completion phase regressed');
 }
 for(const old of previous.operations){
  const current=next.operations.find(op=>op.operationId===old.operationId);
  if(!current)throw Error('Historical spend operation disappeared');
  for(const key of ['workId','workGeneration','dispatchIdentity','requestId','workOrderId','factoryVersion','runId','model','pricingRevision','reservedMicrousd'] as const)
   if(old[key]!==current[key])throw Error('Historical spend binding changed');
  if('phase' in old&&(!('phase' in current)||old.phase!==current.phase))throw Error('Historical operation phase changed');
  if(old.state==='settled'&&digest(old)!==digest(current))throw Error('Settled spend changed');
  if(current.state==='released'&&!['reserved','released'].includes(old.state)||old.state==='released'&&current.state!=='released')throw Error('Exposed reservation cannot be released');
  const order={reserved:0,dispatched:1,unknown:2,settled:3,released:3};if(order[current.state]<order[old.state])throw Error('Uncertain spend reservation regressed');
 }
}
export function assertFactorySpendCanStart(spend:FactorySpend){
 if(!isWorkSpend(spend))return; // Only the adapter's explicit zero-cost LOCAL_FIXTURE accepts this shape.
 const validated=workSpendSchema.parse(spend),blocker=startBlocker(validated);
 if(blocker)throw Error(blocker);
}
