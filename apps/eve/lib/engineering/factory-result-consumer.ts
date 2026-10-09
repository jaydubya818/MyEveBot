import {verifyResult,RESULT_PROTOCOL,type ResultKey} from './factory-producer-protocol.ts';
import {authenticateFactoryResult,attestFactoryManifest,projectFactoryReceipt} from './factory-authenticated-result.ts';
import {FactoryReceiptStore,type ReceiptState} from './factory-receipt-store.ts';

const stages: ReceiptState[]=['RECEIVED','AUTHENTICATED','ATTESTED','INTEGRITY_VERIFIED'];
export interface ConsumerOptions {
 keys: ()=>Promise<ResultKey[]>;
 /** Qualification hook runs only after a durable stage commit. No policy bypass. */
 afterStage?: (state: ReceiptState)=>Promise<void>;
}
/** Resume always rechecks saved bytes with current trust, including after key
 * revocation. Historical verification cannot authorize a new admission. */
export async function resumeFactoryResult(store: FactoryReceiptStore, requestId: string, receiptId: string, options: ConsumerOptions) {
 const request=await store.request(requestId), b=request.binding;
 let row=await store.get(requestId,receiptId);
 const advance=async(state: ReceiptState,extra: Parameters<FactoryReceiptStore['transition']>[2]={})=>{
  if(!stages.includes(row.state)) return;
  if(stages.indexOf(row.state)>=stages.indexOf(state) && stages.includes(state)) return;
  row=await store.transition(row,state,extra);
  await options.afterStage?.(row.state);
 };
 let keyCurrent=false, verified=false;
 // Catch only validation failures; persistence/hook failures must remain
 // retryable pending work, never become a falsely terminal rejection.
 let authenticated: ReturnType<typeof authenticateFactoryResult>;
 const authenticationKeys=await options.keys();
 try { authenticated=authenticateFactoryResult(JSON.parse(row.envelope),b,authenticationKeys); }
 catch(error) { row=await store.transition(row,'REJECTED',{reason:String(error)}); return projectFactoryReceipt(row,null,false,false); }
 const {manifest,result,key,fingerprint}=authenticated;
 await advance('AUTHENTICATED',{provenance:{manifest,manifestDigest:result.manifestDigest,keyFingerprint:fingerprint,keyId:key.keyId,protocol:RESULT_PROTOCOL,key}});
 try { attestFactoryManifest(manifest,b); }
 catch(error) { row=await store.transition(row,'REJECTED',{reason:String(error)}); return projectFactoryReceipt(row,null,false,false); }
 await advance('ATTESTED');
 const historicalKeys=await options.keys();
 try {
  verifyResult(result,{...b,keys:historicalKeys,historical:true});
  verified=true;
 } catch(error) { row=await store.transition(row,'REJECTED',{reason:String(error)}); return projectFactoryReceipt(row,null,false,false); }
 await advance('INTEGRITY_VERIFIED');
 // Repeat current-key validation immediately before the admission transaction.
 // A backdated signed timestamp cannot bypass current revocation/retirement.
 const currentKeys=await options.keys();
 try { keyCurrent=verifyResult(result,{...b,keys:currentKeys}).keyValidForCurrentUse; } catch { keyCurrent=false; }
 await advance('ADMITTED',{keyCurrent,key:currentKeys.find(k=>k.factoryId===b.factoryId && k.keyId===key.keyId)});
 const admission=await store.admission(requestId);
 const current=await store.request(requestId);
 return projectFactoryReceipt(row,admission,keyCurrent && current.eligible,verified);
}
export async function admitFactoryResult(store: FactoryReceiptStore,requestId: string,result: unknown,options: ConsumerOptions) {
 const row=await store.receive(requestId,result);
 await options.afterStage?.('RECEIVED');
 return resumeFactoryResult(store,requestId,row.id,options);
}

/** Reconcile the existing attempt through the qualified authenticated channel.
 * A timeout or nonterminal read never submits another WorkOrder/attempt. */
export async function reconcileFactoryAttempt(store: FactoryReceiptStore,requestId: string,
 config: {origin: string;token: string},options: ConsumerOptions,fetcher: typeof fetch=fetch) {
 const request=await store.request(requestId);
 const {readFactoryAttempt}=await import('./factory-result-channel.ts');
 const observed=await readFactoryAttempt(config,request.binding,fetcher);
 if(observed.result===null) return {status:observed.state,requestId,factoryGrantedAuthority:0,
  independentVerification:'NOT_RUN',readiness:'NOT_READY'} as const;
 return admitFactoryResult(store,requestId,observed.result,options);
}
