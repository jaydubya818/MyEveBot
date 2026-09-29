import {describe,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {workSpendSchema,factorySpendAdmission,factorySpendSummary,validateSpendBinding,assertSpendContinuation,assertFactorySpendCanStart,type WorkSpendV2,type FactorySpendProfile} from './factory-spend.ts';
import {LiveFactoryAdapter,type FactoryConnection} from './factory-live-adapter.ts';
import {digest} from './contract.ts';
import {engineeringConversationModel} from './conversation-model.ts';
const sourceDigest='a'.repeat(64),configurationDigest='b'.repeat(64),factoryVersion=digest({sourceDigest,configurationDigest});
const plan={version:'WORK_LEDGER_V2' as const,pricingRevision:'fixture-v1',plannedProductiveOperations:2,plannedCompletionOperations:1,maxPaidOperations:3,completionReserveMicrousd:1200};
const evidence={status:'QUALIFIED' as const,evidenceRef:'synthetic qualification only'};
const binding={workId:randomUUID(),workGeneration:2,requestId:randomUUID(),workOrderId:randomUUID(),deadline:'2099-01-01T00:00:00.000Z',dispatchIdentity:randomUUID(),remoteRunId:randomUUID(),factoryVersion};
function profile():FactorySpendProfile{return {sourceDigest,factoryVersion,spendContract:{version:'WORK_LEDGER_V2',sourceDigest},spendPlan:plan,qualification:{mode:'LOCAL_SPEND_FIXTURE',spendEnforced:true,spendReview:{environment:'LOCAL_FIXTURE',sourceDigest,factoryVersion,expiresAt:binding.deadline,hardCeiling:{...evidence},preCallEnforcement:{...evidence},accounting:{...evidence},unknownRetention:{...evidence},completion:{...evidence},pricing:{...evidence,model:'fixture-model',revision:'fixture-v1',validUntil:binding.deadline}}}};}
function ledger(state?:'reserved'|'dispatched'|'unknown'|'settled'):WorkSpendV2{
 const settled=state==='settled'?30:0,retained=state&&state!=='settled'?1200:0;
 return {status:state==='unknown'?'UNKNOWN':'KNOWN',currency:'USD',unit:'microUSD',workId:binding.workId,workGeneration:2,
 requestId:binding.requestId,workOrderId:binding.workOrderId,deadline:binding.deadline,ceilingMicrousd:3600,
 settledMicrousd:settled,retainedMicrousd:retained,availableMicrousd:3600-settled-retained,cancelled:false,
 contractVersion:'WORK_LEDGER_V2',pricingRevision:'fixture-v1',plannedProductiveOperations:2,plannedCompletionOperations:1,
 perOperationReserveMicrousd:1200,completionReserveMicrousd:1200,completionReserveRemainingMicrousd:1200,
 productiveAllowanceRemainingMicrousd:2400-settled-retained,unknownExposureMicrousd:state==='unknown'?1200:0,
 paidOperationsUsed:state?1:0,maxPaidOperations:3,completionOperationsUsed:0,completionOperationSlotsRemaining:1,
 accountingComplete:!state||state==='settled',pricingQualified:true,authorityState:state?'active':'prepared',phase:'productive',
 operations:state?[{operationId:'operation-1',workId:binding.workId,workGeneration:2,dispatchIdentity:binding.dispatchIdentity,
 requestId:binding.requestId,workOrderId:binding.workOrderId,factoryVersion,runId:binding.remoteRunId,model:'fixture-model',pricingRevision:'fixture-v1',
 reservedMicrousd:1200,phase:'productive',state,actualMicrousd:state==='settled'?30:null,providerRequestId:state==='settled'?'provider-1':null,
 usage:state==='settled'?{input_tokens:10,output_tokens:10}:null}]:[]};
}
function connection():FactoryConnection{return {...profile(),origin:'http://127.0.0.1:12345',token:'c'.repeat(64),factoryId:'fixture',configurationDigest,repositoryPath:'/fixture',keys:[{factoryId:'fixture',keyId:'key',publicKey:'fixture',activeFrom:'2020-01-01',notAfter:'2099-01-01'}],qualification:{...profile().qualification,scopeId:'owner',profileHash:'d'.repeat(64),evidenceRef:'fixture',qualifiedAt:'2020-01-01T00:00:00.000Z',expiresAt:binding.deadline}};}
const identity={...binding,runId:randomUUID(),writerGeneration:1,factoryId:'fixture',repository:'fixture/golden',baseSha:'a'.repeat(40),allowedPaths:['quantity.mjs']};
const body=(spend:WorkSpendV2,state='COMPLETED',quiescent=true)=>({requestId:binding.requestId,workOrderId:binding.workOrderId,runId:binding.remoteRunId,snapshot:null,identity,state,quiescent,evidenceRef:quiescent?'terminal-proof':null,spend,blocker:null});
describe('candidate Work spend contract (not live qualification)',()=>{
 it.each([false,true])('Factory-only qualification denies separately paid conversation/native work (productive=%s)',async productive=>{
  const reserve=vi.fn(),provider=vi.fn(),catalog=vi.fn();
  const model=engineeringConversationModel({store:{} as never,workId:binding.workId,sessionId:'qualification',stepKey:'qualification:0',modelId:'anthropic/claude-sonnet-5',productive},{
   authority:{readConfig:async()=>({model:'claude-sonnet-5',nativeQualification:undefined})} as never,
   budget:{reserve} as never,catalog,model:()=>({doGenerate:provider}) as never});
  await expect(model.doGenerate({prompt:[]} as never)).rejects.toThrow(/qualification/);
  expect(reserve).not.toHaveBeenCalled();expect(catalog).not.toHaveBeenCalled();expect(provider).not.toHaveBeenCalled();
 });
 it('requires reviewed capabilities, price and completion independently of field presence',()=>{
  expect(factorySpendAdmission(profile()).allowed).toBe(true);
  for(const key of ['hardCeiling','preCallEnforcement','accounting','unknownRetention','completion'] as const){const p=profile();p.qualification.spendReview![key]={status:'PENDING',evidenceRef:null};expect(factorySpendAdmission(p).allowed).toBe(false);}
  for(const mutation of [(p:FactorySpendProfile)=>{delete p.spendContract;},(p:FactorySpendProfile)=>{delete p.qualification.spendReview;},(p:FactorySpendProfile)=>{p.qualification.spendEnforced=false;},(p:FactorySpendProfile)=>{p.qualification.mode='LIVE';},(p:FactorySpendProfile)=>{p.qualification.spendReview!.sourceDigest='f'.repeat(64);}]){const p=profile();mutation(p);expect(factorySpendAdmission(p).allowed).toBe(false);}
 });
 it.each(['missing','stale','unknown'] as const)('denies %s pricing',variant=>{const p=profile(),price=p.qualification.spendReview!.pricing;if(variant==='stale')price.validUntil='2000-01-01T00:00:00.000Z';else if(variant==='missing')price.evidenceRef=null;else price.status='PENDING';expect(factorySpendAdmission(p).allowed).toBe(false);expect(factorySpendSummary(ledger(),p).pricingQualification).toBe('PENDING');});
 it.each(['reserved','dispatched','unknown','settled'] as const)('accounts exact %s exposure',state=>{
  const s=workSpendSchema.parse(ledger(state));validateSpendBinding(s,binding,0.0036,plan);
  const summary=factorySpendSummary(s,profile());expect(summary.safeAllowanceMicrousd).toBe(state==='settled'?2370:0);expect(summary.unknownMicrousd).toBe(state==='unknown'?1200:0);
  if(state==='settled')expect(()=>assertFactorySpendCanStart(s)).not.toThrow();else expect(()=>assertFactorySpendCanStart(s)).toThrow();
 });
 it('holds cancellation and exhausted budgets',()=>{
  const cancelled={...ledger(),cancelled:true};expect(()=>assertFactorySpendCanStart(cancelled)).toThrow();
  const exhausted=ledger('settled');exhausted.operations.push({...exhausted.operations[0],operationId:'operation-2',providerRequestId:'provider-2'});exhausted.paidOperationsUsed=2;exhausted.settledMicrousd=60;exhausted.availableMicrousd=3540;exhausted.productiveAllowanceRemainingMicrousd=2340;expect(()=>assertFactorySpendCanStart(workSpendSchema.parse(exhausted))).toThrow(/limit/);
 });
 it('rejects incomplete, fractional, duplicated, foreign and underreported accounting',()=>{
  for(const mutate of [(s:WorkSpendV2)=>s.availableMicrousd++, (s:WorkSpendV2)=>s.retainedMicrousd=0,(s:WorkSpendV2)=>s.status='KNOWN',(s:WorkSpendV2)=>s.operations.push(s.operations[0]),(s:WorkSpendV2)=>s.operations[0].workId=randomUUID(),(s:WorkSpendV2)=>s.operations[0].reservedMicrousd=1.5]){const s=ledger('unknown');mutate(s);expect(workSpendSchema.safeParse(s).success).toBe(false);}
  const settled=ledger('settled');settled.operations[0].usage=null;expect(workSpendSchema.safeParse(settled).success).toBe(false);
 });
 it('rejects wrong Work, generation, request, attempt, version and reset ceiling',()=>{
  for(const key of ['workId','requestId','workOrderId','dispatchIdentity','remoteRunId','factoryVersion'] as const)expect(()=>validateSpendBinding(ledger('unknown'),{...binding,[key]:'wrong'})).toThrow();
  expect(()=>validateSpendBinding(ledger(),{...binding,workGeneration:3})).toThrow();expect(()=>validateSpendBinding(ledger(),binding,0.004)).toThrow();
 });
 it('retains UNKNOWN across attempts/restart and allows only accounted settlement',()=>{
  const prior=ledger('unknown'),next=structuredClone(prior);next.workGeneration++;next.requestId=randomUUID();next.workOrderId=randomUUID();assertSpendContinuation(prior,next);expect(()=>assertFactorySpendCanStart(next)).toThrow();
  expect(()=>assertSpendContinuation(prior,{...next,operations:[],retainedMicrousd:0,availableMicrousd:3600})).toThrow();
  expect(()=>assertSpendContinuation(prior,{...next,ceilingMicrousd:4000})).toThrow();
  assertSpendContinuation(prior,ledger('settled'));expect(()=>assertSpendContinuation(ledger('settled'),ledger('unknown'))).toThrow();
 });
 it('keeps execution quiescence separate from UNKNOWN accounting',async()=>{
  const adapter=new LiveFactoryAdapter(connection(),vi.fn(async()=>Response.json(body(ledger('unknown')))) as typeof fetch);
  expect((await adapter.read(identity)).accounting.unknownMicrousd).toBe(1200);
  expect((await adapter.observe(identity))?.quiescent).toBe(true);
  const unsafe=new LiveFactoryAdapter(connection(),vi.fn(async()=>Response.json(body(ledger('unknown'),'UNKNOWN',false))) as typeof fetch);expect(await unsafe.observe(identity)).toBeNull();
 });
 it('does not silently accept ledger fields or legacy amounts under an incompatible contract',async()=>{
  const c=connection();delete c.spendContract;await expect(new LiveFactoryAdapter(c,vi.fn(async()=>Response.json(body(ledger()))) as typeof fetch).read(identity)).rejects.toThrow(/contract/);
  await expect(new LiveFactoryAdapter(connection(),vi.fn(async()=>Response.json({...body(ledger()),spend:{status:'KNOWN',ceilingUsd:0}})) as typeof fetch).read(identity)).rejects.toThrow(/ledger/);
 });
 it('denies V1 paid starts while preserving historical readback and STOP observation',async()=>{
  const old=ledger('unknown') as unknown as Record<string,unknown>;
  for(const key of ['contractVersion','pricingRevision','plannedProductiveOperations','plannedCompletionOperations','perOperationReserveMicrousd','completionReserveMicrousd','completionReserveRemainingMicrousd','productiveAllowanceRemainingMicrousd','unknownExposureMicrousd','paidOperationsUsed','maxPaidOperations','completionOperationsUsed','completionOperationSlotsRemaining','accountingComplete','pricingQualified','authorityState','phase'])delete old[key];
  old.operations=(old.operations as Record<string,unknown>[]).map(({phase,...op})=>op);
  const parsed=workSpendSchema.parse(old);expect(()=>assertFactorySpendCanStart(parsed)).toThrow(/V2/);
  const c=connection();c.spendContract!.version='WORK_LEDGER_V1';delete c.spendPlan;
  expect(factorySpendAdmission(c).allowed).toBe(false);
  const adapter=new LiveFactoryAdapter(c,vi.fn(async()=>Response.json({...body(ledger('unknown')),spend:old})) as typeof fetch);
  expect((await adapter.read(identity)).accounting.unknownMicrousd).toBe(1200);
  expect((await adapter.observe(identity))?.quiescent).toBe(true);
 });
 it.each(['unknownExposureMicrousd','paidOperationsUsed','completionOperationsUsed','completionOperationSlotsRemaining','completionReserveRemainingMicrousd','productiveAllowanceRemainingMicrousd'] as const)('rejects forged %s readback',key=>{
  const s=ledger('unknown');s[key]++;expect(workSpendSchema.safeParse(s).success).toBe(false);
 });
 it('requires a full conservative plan, exact prepared plan and immutable plan across attempts',()=>{
  const p=profile();delete p.spendPlan;expect(factorySpendAdmission(p).allowed).toBe(false);
  const tooLarge=ledger();tooLarge.perOperationReserveMicrousd=2000;expect(workSpendSchema.safeParse(tooLarge).success).toBe(false);
  expect(()=>validateSpendBinding(ledger(),binding,0.0036,{...plan,completionReserveMicrousd:1300})).toThrow(/plan/);
  const previous=ledger(),next=ledger();next.completionReserveMicrousd=1300;expect(()=>assertSpendContinuation(previous,next)).toThrow(/plan/);
 });
 it.each(['accountingComplete','pricingQualified'] as const)('denies unavailable %s before paid start',key=>{
  const s=ledger();s[key]=false;expect(()=>assertFactorySpendCanStart(s)).toThrow();
 });
 it('denies revoked authority, phase reset, missing completion capacity and repeat productive calls',()=>{
  const revoked=ledger();revoked.authorityState='fenced';expect(()=>assertFactorySpendCanStart(revoked)).toThrow(/authority/);
  const complete=ledger();complete.phase='completion';expect(()=>assertFactorySpendCanStart(complete)).toThrow(/completion/);
  expect(()=>assertSpendContinuation(complete,ledger())).toThrow(/phase/);
  const missing=ledger();missing.completionReserveRemainingMicrousd=0;expect(()=>assertFactorySpendCanStart(missing)).toThrow();
 });
 it('accepts prepared admission and immutable completion history on a new generation',()=>{
  expect(()=>assertFactorySpendCanStart(ledger())).not.toThrow();
  const prior=ledger('settled');prior.operations[0].phase='completion';prior.phase='completion';
  prior.completionOperationsUsed=1;prior.completionOperationSlotsRemaining=0;prior.completionReserveRemainingMicrousd=1170;prior.productiveAllowanceRemainingMicrousd=2400;
  const next=structuredClone(prior);next.workGeneration++;next.phase='productive';next.authorityState='prepared';
  expect(workSpendSchema.safeParse(next).success).toBe(true);expect(()=>assertSpendContinuation(prior,next)).not.toThrow();
  expect(()=>assertFactorySpendCanStart(next)).toThrow(/completion/);
 });
 it('rejects forged completeness and a reservation smaller than the pinned full-call bound',()=>{
  const incomplete=ledger('unknown');incomplete.accountingComplete=true;expect(workSpendSchema.safeParse(incomplete).success).toBe(false);
  const under=ledger('settled');under.operations[0].reservedMicrousd=1199;expect(workSpendSchema.safeParse(under).success).toBe(false);
 });
 it('reads migrated V1 history but never admits it for paid production',()=>{
  const old={...ledger('unknown'),contractVersion:'WORK_LEDGER_V1',pricingRevision:null,pricingQualified:false,
   plannedProductiveOperations:0,plannedCompletionOperations:0,maxPaidOperations:0,perOperationReserveMicrousd:0,
   completionReserveMicrousd:0,completionReserveRemainingMicrousd:0,completionOperationSlotsRemaining:0,productiveAllowanceRemainingMicrousd:2400};
  const parsed=workSpendSchema.parse(old);expect(()=>assertFactorySpendCanStart(parsed)).toThrow(/V2/);
 });
 it('cannot relabel a retained productive operation as completion or reuse provider settlement identity',()=>{
  const previous=ledger('settled'),next=structuredClone(previous);next.operations[0].phase='completion';expect(()=>assertSpendContinuation(previous,next)).toThrow(/phase/);
  const duplicate=ledger('settled');duplicate.operations.push({...duplicate.operations[0],operationId:'other'});expect(workSpendSchema.safeParse(duplicate).success).toBe(false);
 });

});
