import {describe,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {workSpendSchema,factorySpendAdmission,factorySpendSummary,validateSpendBinding,assertSpendContinuation,assertFactorySpendCanStart,type WorkSpend,type FactorySpendProfile} from './factory-spend.ts';
import {LiveFactoryAdapter,type FactoryConnection} from './factory-live-adapter.ts';
import {digest} from './contract.ts';
const sourceDigest='a'.repeat(64),configurationDigest='b'.repeat(64),factoryVersion=digest({sourceDigest,configurationDigest});
const evidence={status:'QUALIFIED' as const,evidenceRef:'synthetic qualification only'};
const binding={workId:randomUUID(),workGeneration:2,requestId:randomUUID(),workOrderId:randomUUID(),deadline:'2099-01-01T00:00:00.000Z',dispatchIdentity:randomUUID(),remoteRunId:randomUUID(),factoryVersion};
function profile():FactorySpendProfile{return {sourceDigest,factoryVersion,spendContract:{version:'WORK_LEDGER_V1',sourceDigest},qualification:{mode:'LOCAL_SPEND_FIXTURE',spendEnforced:true,spendReview:{environment:'LOCAL_FIXTURE',sourceDigest,factoryVersion,expiresAt:binding.deadline,hardCeiling:{...evidence},preCallEnforcement:{...evidence},accounting:{...evidence},unknownRetention:{...evidence},completion:{...evidence},pricing:{...evidence,model:'fixture-model',revision:'fixture-v1',validUntil:binding.deadline}}}};}
function ledger(state?:'reserved'|'dispatched'|'unknown'|'settled'):WorkSpend{return {status:state==='unknown'?'UNKNOWN':'KNOWN',currency:'USD',unit:'microUSD',workId:binding.workId,workGeneration:2,requestId:binding.requestId,workOrderId:binding.workOrderId,deadline:binding.deadline,ceilingMicrousd:1500,settledMicrousd:state==='settled'?30:0,retainedMicrousd:state&&state!=='settled'?1200:0,availableMicrousd:state==='settled'?1470:state?300:1500,cancelled:false,operations:state?[{operationId:'operation-1',workId:binding.workId,workGeneration:2,dispatchIdentity:binding.dispatchIdentity,requestId:binding.requestId,workOrderId:binding.workOrderId,factoryVersion,runId:binding.remoteRunId,model:'fixture-model',pricingRevision:'fixture-v1',reservedMicrousd:1200,state,actualMicrousd:state==='settled'?30:null,providerRequestId:state==='settled'?'provider-1':null,usage:state==='settled'?{input_tokens:10,output_tokens:10}:null}]:[]};}
function connection():FactoryConnection{return {...profile(),origin:'http://127.0.0.1:12345',token:'c'.repeat(64),factoryId:'fixture',configurationDigest,repositoryPath:'/fixture',keys:[{factoryId:'fixture',keyId:'key',publicKey:'fixture',activeFrom:'2020-01-01',notAfter:'2099-01-01'}],qualification:{...profile().qualification,scopeId:'owner',profileHash:'d'.repeat(64),evidenceRef:'fixture',qualifiedAt:'2020-01-01T00:00:00.000Z',expiresAt:binding.deadline}};}
const identity={...binding,runId:randomUUID(),writerGeneration:1,factoryId:'fixture',repository:'fixture/golden',baseSha:'a'.repeat(40),allowedPaths:['quantity.mjs']};
const body=(spend:WorkSpend,state='COMPLETED',quiescent=true)=>({requestId:binding.requestId,workOrderId:binding.workOrderId,runId:binding.remoteRunId,snapshot:null,identity,state,quiescent,evidenceRef:quiescent?'terminal-proof':null,spend,blocker:null});
describe('candidate Work spend contract (not live qualification)',()=>{
 it('requires reviewed capabilities, price and completion independently of field presence',()=>{
  expect(factorySpendAdmission(profile()).allowed).toBe(true);
  for(const key of ['hardCeiling','preCallEnforcement','accounting','unknownRetention','completion'] as const){const p=profile();p.qualification.spendReview![key]={status:'PENDING',evidenceRef:null};expect(factorySpendAdmission(p).allowed).toBe(false);}
  for(const mutation of [(p:FactorySpendProfile)=>{delete p.spendContract;},(p:FactorySpendProfile)=>{delete p.qualification.spendReview;},(p:FactorySpendProfile)=>{p.qualification.spendEnforced=false;},(p:FactorySpendProfile)=>{p.qualification.mode='LIVE';},(p:FactorySpendProfile)=>{p.qualification.spendReview!.sourceDigest='f'.repeat(64);}]){const p=profile();mutation(p);expect(factorySpendAdmission(p).allowed).toBe(false);}
 });
 it.each(['missing','stale','unknown'] as const)('denies %s pricing',variant=>{const p=profile(),price=p.qualification.spendReview!.pricing;if(variant==='stale')price.validUntil='2000-01-01T00:00:00.000Z';else if(variant==='missing')price.evidenceRef=null;else price.status='PENDING';expect(factorySpendAdmission(p).allowed).toBe(false);expect(factorySpendSummary(ledger(),p).pricingQualification).toBe('PENDING');});
 it.each(['reserved','dispatched','unknown','settled'] as const)('accounts exact %s exposure',state=>{
  const s=workSpendSchema.parse(ledger(state));validateSpendBinding(s,binding,0.0015);
  const summary=factorySpendSummary(s,profile());expect(summary.safeAllowanceMicrousd).toBe(state==='settled'?1470:300);expect(summary.unknownMicrousd).toBe(state==='unknown'?1200:0);
  if(state==='settled')expect(()=>assertFactorySpendCanStart(s)).not.toThrow();else expect(()=>assertFactorySpendCanStart(s)).toThrow();
 });
 it('holds cancellation and exhausted budgets',()=>{
  const cancelled={...ledger(),cancelled:true};expect(()=>assertFactorySpendCanStart(cancelled)).toThrow();
  const exhausted=ledger('settled');exhausted.operations[0].reservedMicrousd=1500;exhausted.operations[0].actualMicrousd=1500;exhausted.settledMicrousd=1500;exhausted.availableMicrousd=0;expect(()=>assertFactorySpendCanStart(workSpendSchema.parse(exhausted))).toThrow();
 });
 it('rejects incomplete, fractional, duplicated, foreign and underreported accounting',()=>{
  for(const mutate of [(s:WorkSpend)=>s.availableMicrousd++, (s:WorkSpend)=>s.retainedMicrousd=0,(s:WorkSpend)=>s.status='KNOWN',(s:WorkSpend)=>s.operations.push(s.operations[0]),(s:WorkSpend)=>s.operations[0].workId=randomUUID(),(s:WorkSpend)=>s.operations[0].reservedMicrousd=1.5]){const s=ledger('unknown');mutate(s);expect(workSpendSchema.safeParse(s).success).toBe(false);}
  const settled=ledger('settled');settled.operations[0].usage=null;expect(workSpendSchema.safeParse(settled).success).toBe(false);
 });
 it('rejects wrong Work, generation, request, attempt, version and reset ceiling',()=>{
  for(const key of ['workId','requestId','workOrderId','dispatchIdentity','remoteRunId','factoryVersion'] as const)expect(()=>validateSpendBinding(ledger('unknown'),{...binding,[key]:'wrong'})).toThrow();
  expect(()=>validateSpendBinding(ledger(),{...binding,workGeneration:3})).toThrow();expect(()=>validateSpendBinding(ledger(),binding,0.002)).toThrow();
 });
 it('retains UNKNOWN across attempts/restart and allows only accounted settlement',()=>{
  const prior=ledger('unknown'),next=structuredClone(prior);next.workGeneration++;next.requestId=randomUUID();next.workOrderId=randomUUID();assertSpendContinuation(prior,next);expect(()=>assertFactorySpendCanStart(next)).toThrow();
  expect(()=>assertSpendContinuation(prior,{...next,operations:[],retainedMicrousd:0,availableMicrousd:1500})).toThrow();
  expect(()=>assertSpendContinuation(prior,{...next,ceilingMicrousd:3000})).toThrow();
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
});
