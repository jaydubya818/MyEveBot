import {verifyResult,verifyLocalResultV4,RESULT_PROTOCOL,sha256,digest,type ResultKey,type SignedResult,type ResultManifest,type LocalResultManifestV4} from './factory-producer-protocol.ts';
import {authenticateFactoryResult,attestFactoryManifest,projectFactoryReceipt,requireFactoryBinding,
 authenticateLocalFactoryResultV4,attestLocalFactoryManifestV4,requireLocalFactoryBindingV4} from './factory-authenticated-result.ts';
import {FactoryReceiptStore,type ReceiptState,type FactoryBinding,type LocalFactoryBindingV4,type FactoryManifest} from './factory-receipt-store.ts';
import {factoryTransport} from './factory-transport.ts';

const stages: ReceiptState[]=['RECEIVED','AUTHENTICATED','ATTESTED','INTEGRITY_VERIFIED'];
export interface ConsumerOptions {
 keys: ()=>Promise<ResultKey[]>;
 /** Qualification hook runs only after a durable stage commit. No policy bypass. */
 afterStage?: (state: ReceiptState)=>Promise<void>;
}
// Only these built-in modes enter the private engine. Neither returned bytes
// nor saved manifest versions choose a verifier, and callers cannot inject one.
interface ConsumerMode<M extends FactoryManifest,B extends FactoryBinding> {
 binding: (value: unknown)=>B;
 authenticate: (value: unknown,binding: B,keys: ResultKey[])=>{result: SignedResult;manifest: M;key: ResultKey;fingerprint: string};
 attest: (manifest: M,binding: B)=>void;
 verify: (result: SignedResult,binding: B,keys: ResultKey[],historical: boolean)=>{keyValidForCurrentUse: boolean};
}
const legacyMode: ConsumerMode<ResultManifest,FactoryBinding>={
 binding:requireFactoryBinding,authenticate:authenticateFactoryResult,attest:attestFactoryManifest,
 verify:(result,binding,keys,historical)=>verifyResult(result,{...binding,keys,historical}),
};
const localV4Mode: ConsumerMode<LocalResultManifestV4,LocalFactoryBindingV4>={
 binding:requireLocalFactoryBindingV4,authenticate:authenticateLocalFactoryResultV4,attest:attestLocalFactoryManifestV4,
 verify:(result,binding,keys,historical)=>verifyLocalResultV4(result,{expected:binding,keys,historical}),
};
/** Resume always rechecks saved bytes with current trust, including after key
 * revocation. Historical verification cannot authorize a new admission. */
async function resume<M extends FactoryManifest,B extends FactoryBinding>(store: FactoryReceiptStore<M,B>, requestId: string, receiptId: string, options: ConsumerOptions,mode: ConsumerMode<M,B>) {
 const request=await store.request(requestId);
 if(request.id!==requestId) throw new Error('Factory receipt integrity mismatch');
 // Outside payload rejection handling: wrong APIs must not poison pending
 // custody, including receipts accidentally enumerated by a mixed-mode worker.
 const b=mode.binding(request.binding);
 let row=await store.get(requestId,receiptId);
 // A recovery read must retain the original delivery identity and exact bytes.
 // Corrupt custody is preserved for diagnosis, never rewritten as a rejection.
 if(request.id!==requestId || row.id!==receiptId || row.request_id!==requestId ||
  typeof row.envelope!=='string' || sha256(row.envelope)!==row.envelope_digest)
  throw new Error('Factory receipt integrity mismatch');
 const advance=async(state: ReceiptState,extra: Parameters<FactoryReceiptStore<M,B>['transition']>[2]={})=>{
  if(!stages.includes(row.state)) return;
  if(stages.indexOf(row.state)>=stages.indexOf(state) && stages.includes(state)) return;
  row=await store.transition(row,state,extra);
  await options.afterStage?.(row.state);
 };
 let keyCurrent=false, verified=false;
 // Catch only validation failures; persistence/hook failures must remain
 // retryable pending work, never become a falsely terminal rejection.
 let authenticated: ReturnType<ConsumerMode<M,B>['authenticate']>;
 const authenticationKeys=await options.keys();
 try { authenticated=mode.authenticate(JSON.parse(row.envelope),b,authenticationKeys); }
 catch(error) { row=await store.transition(row,'REJECTED',{reason:String(error)}); return projectFactoryReceipt(row,null,false,false); }
 const {manifest,result,key,fingerprint}=authenticated;
 // Reauthentication cannot silently replace provenance saved by an earlier
 // stage. Key retirement metadata may change; the signed key identity may not.
 const retained=row.provenance;
 let provenanceMatches=retained===null && ['RECEIVED','REJECTED'].includes(row.state);
 if(retained) {
  try {
   provenanceMatches=retained.manifestDigest===result.manifestDigest &&
    digest(retained.manifest)===result.manifestDigest && retained.keyFingerprint===fingerprint &&
    retained.keyId===key.keyId && retained.protocol===RESULT_PROTOCOL;
  } catch { provenanceMatches=false; }
 }
 if(!provenanceMatches) throw new Error('Factory receipt provenance mismatch');
 await advance('AUTHENTICATED',{provenance:{manifest,manifestDigest:result.manifestDigest,keyFingerprint:fingerprint,keyId:key.keyId,protocol:RESULT_PROTOCOL,key}});
 try { mode.attest(manifest,b); }
 catch(error) { row=await store.transition(row,'REJECTED',{reason:String(error)}); return projectFactoryReceipt(row,null,false,false); }
 await advance('ATTESTED');
 const historicalKeys=await options.keys();
 try {
  mode.verify(result,b,historicalKeys,true);
  verified=true;
 } catch(error) { row=await store.transition(row,'REJECTED',{reason:String(error)}); return projectFactoryReceipt(row,null,false,false); }
 await advance('INTEGRITY_VERIFIED');
 // Repeat current-key validation immediately before the admission transaction.
 // A backdated signed timestamp cannot bypass current revocation/retirement.
 const currentKeys=await options.keys();
 try { keyCurrent=mode.verify(result,b,currentKeys,false).keyValidForCurrentUse; } catch { keyCurrent=false; }
 await advance('ADMITTED',{keyCurrent,key:currentKeys.find(k=>k.factoryId===b.factoryId && k.keyId===key.keyId)});
 const admission=await store.admission(requestId);
 const current=await store.request(requestId);
 return projectFactoryReceipt(row,admission,keyCurrent && current.eligible,verified);
}
async function admit<M extends FactoryManifest,B extends FactoryBinding>(store: FactoryReceiptStore<M,B>,requestId: string,result: unknown,options: ConsumerOptions,mode: ConsumerMode<M,B>) {
 const request=await store.request(requestId);
 if(request.id!==requestId) throw new Error('Factory receipt integrity mismatch');
 mode.binding(request.binding);
 const row=await store.receive(requestId,result);
 await options.afterStage?.('RECEIVED');
 return resume(store,requestId,row.id,options,mode);
}
export async function resumeFactoryResult(store: FactoryReceiptStore,requestId: string,receiptId: string,options: ConsumerOptions) {
 return resume(store,requestId,receiptId,options,legacyMode);
}
export async function admitFactoryResult(store: FactoryReceiptStore,requestId: string,result: unknown,options: ConsumerOptions) {
 return admit(store,requestId,result,options,legacyMode);
}
/** Inactive explicit local V4 custody API. No route, service/default selection,
 * Work dispatch, protected verification or owner MyApps acceptance is added. */
export async function resumeLocalFactoryResultV4(store: FactoryReceiptStore<LocalResultManifestV4,LocalFactoryBindingV4>,requestId: string,receiptId: string,options: ConsumerOptions) {
 return resume(store,requestId,receiptId,options,localV4Mode);
}
export async function admitLocalFactoryResultV4(store: FactoryReceiptStore<LocalResultManifestV4,LocalFactoryBindingV4>,requestId: string,result: unknown,options: ConsumerOptions) {
 return admit(store,requestId,result,options,localV4Mode);
}

/** Reconcile the existing attempt through the qualified authenticated channel.
 * A timeout or nonterminal read never submits another WorkOrder/attempt. */
export async function reconcileFactoryAttempt(store: FactoryReceiptStore,requestId: string,
 config: {origin: string;token: string},options: ConsumerOptions,fetcher: typeof fetch=fetch) {
 const request=await store.request(requestId);
 if(request.id!==requestId) throw new Error('Factory receipt integrity mismatch');
 requireFactoryBinding(request.binding);
 const {readFactoryAttempt}=await import('./factory-result-channel.ts');
 const observed=await readFactoryAttempt(config,request.binding,fetcher);
 if(observed.result===null) return {status:observed.state,requestId,factoryGrantedAuthority:0,
  independentVerification:'NOT_RUN',readiness:'NOT_READY'} as const;
 return admitFactoryResult(store,requestId,observed.result,options);
}

/** Explicit inactive local V4 readback. Credentials and the exact existing
 * attempt come from trusted configuration/custody; no submission or retry. */
export async function reconcileLocalFactoryAttemptV4(store: FactoryReceiptStore<LocalResultManifestV4,LocalFactoryBindingV4>,requestId: string,
 config: {origin: string;token: string},options: ConsumerOptions,fetcher: typeof fetch=fetch) {
 const request=await store.request(requestId);
 if(request.id!==requestId) throw new Error('Factory receipt integrity mismatch');
 const binding=requireLocalFactoryBindingV4(request.binding);
 // Inspect only the two own configured fields, then detach their primitive
 // values before any asynchronous channel/header work can observe mutation.
 if(!config || typeof config!=='object' || Array.isArray(config)) throw new Error('Exact local Factory read configuration required');
 const fields=Reflect.ownKeys(config);
 if(fields.length!==2 || !fields.includes('origin') || !fields.includes('token')) throw new Error('Exact local Factory read configuration required');
 const origin=config.origin,token=config.token;
 if(typeof origin!=='string' || typeof token!=='string') throw new Error('Exact local Factory read configuration required');
 const local=Object.freeze({origin,token});
 factoryTransport(local);
 const {readFactoryAttempt}=await import('./factory-result-channel.ts');
 const observed=await readFactoryAttempt(local,binding,fetcher);
 if(observed.result===null) return {status:observed.state,requestId,factoryGrantedAuthority:0,
  independentVerification:'NOT_RUN',readiness:'NOT_READY'} as const;
 return admitLocalFactoryResultV4(store,requestId,observed.result,options);
}
