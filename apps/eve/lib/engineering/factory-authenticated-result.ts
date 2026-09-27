import {createPublicKey} from 'node:crypto';
import {z} from 'zod';
import {canonical,digest,sha256,validateManifest,verifyResult,RESULT_PROTOCOL,MAX_RESULT_BYTES,
 type ResultKey, type ResultManifest, type SignedResult} from './factory-producer-protocol.ts';
import {verifyProtocolPayload} from './factory-producer-signature.ts';
import {type FactoryBinding, type FactoryReceipt} from './factory-receipt-store.ts';

const hash=z.string().regex(/^[a-f0-9]{64}$/), text=z.string().min(1).max(4000);
const bindingSchema=z.object({workId:z.uuid(),workVersion:z.number().int().positive(),workGeneration:z.number().int().positive(),
 criteriaVersion:z.number().int().positive(),agentId:text,factoryId:text,factoryVersion:hash,requestId:text,requestDigest:hash,
 sourceDigest:hash,configurationDigest:hash,workOrderId:z.uuid(),runId:z.uuid(),attemptNumber:z.number().int().positive(),
 inputCommit:z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/)}).strict();
/** Values must originate from trusted request admission, never from a return.
 * Registration creates receipt correlation only, no dispatch or writer grant. */
export function prepareAuthenticatedFactoryInput(value: unknown): FactoryBinding {
 const b=bindingSchema.parse(value);
 if(digest({sourceDigest:b.sourceDigest,configurationDigest:b.configurationDigest})!==b.factoryVersion)
  throw new Error('Untrusted FactoryVersion pin');
 return {...b,operationId:digest([RESULT_PROTOCOL,b.factoryId,b.requestId,b.workOrderId,b.runId])};
}
export function authenticateFactoryResult(value: unknown, binding: FactoryBinding, keys: ResultKey[]) {
 if(!value || typeof value!=='object' || Array.isArray(value) ||
  Object.keys(value).sort().join(',')!=='artifacts,encoded,manifestDigest,protocol,signature') throw new Error('Malformed result envelope');
 const result=value as SignedResult;
 if(result.protocol!==RESULT_PROTOCOL || typeof result.encoded!=='string' || typeof result.signature!=='string') throw new Error('Unknown result protocol');
 if(Buffer.byteLength(JSON.stringify(value))>MAX_RESULT_BYTES) throw new Error('Result size limit');
 const raw=Buffer.from(result.encoded,'base64url').toString('utf8');
 const untrusted=JSON.parse(raw);
 // Only the untrusted key selector is read before signature verification. The
 // Factory identity and public key source are independently stored expectations.
 const selected=keys.filter(k=>k.factoryId===binding.factoryId && k.keyId===untrusted?.keyId);
 if(selected.length!==1) throw new Error('Unknown or ambiguous producer key');
 const key=selected[0];
 if(!verifyProtocolPayload(RESULT_PROTOCOL,result.encoded,result.signature,key.publicKey)) throw new Error('Invalid producer signature');
 if(canonical(untrusted)!==raw || Buffer.from(raw).toString('base64url')!==result.encoded || sha256(raw)!==result.manifestDigest)
  throw new Error('Noncanonical or substituted manifest');
 const fingerprint=sha256(createPublicKey(key.publicKey).export({type:'spki',format:'der'}));
 return {result,manifest:untrusted as ResultManifest,key,fingerprint};
}
export function attestFactoryManifest(m: ResultManifest,b: FactoryBinding) {
 validateManifest(m);
 const e=m.execution;
 if(m.producer!==b.factoryId || m.operationId!==b.operationId || e.factoryVersion!==b.factoryVersion ||
  e.sourceDigest!==b.sourceDigest || e.configurationDigest!==b.configurationDigest || e.requestId!==b.requestId ||
  e.requestDigest!==b.requestDigest || e.workOrderId!==b.workOrderId || e.runId!==b.runId ||
  e.attemptNumber!==b.attemptNumber || e.inputCommit!==b.inputCommit) throw new Error('Factory attestation binding mismatch');
}
/** Q37-owned Current Truth seam; it never updates protected owner projections. */
export function projectFactoryReceipt(row: FactoryReceipt,admission: Record<string,unknown>|null,keyCurrent: boolean,verified: boolean) {
 return {receiptId:row.state==='ADMITTED' && typeof admission?.receipt_id==='string'?admission.receipt_id:row.id,deliveryId:row.id,admissionReceiptId:admission?.receipt_id??null,status:row.state,reason:row.reason,
  factoryProvenance:verified?'VERIFIED':'UNVERIFIED',eligibleForCurrentAdmission:keyCurrent && row.state==='ADMITTED',
  candidate:verified?row.provenance?.manifest.candidate??null:null,
  manifestDigest:verified?row.provenance?.manifestDigest??null:null,receivedAt:row.received_at,
  factoryGrantedAuthority:0,independentVerification:'NOT_RUN',readiness:'NOT_READY'} as const;
}

/** Read-only exact-protocol adapter. Durable processing is a separately governed
 * Q37 receipt service, not a mutation hidden behind the old read-only entry. */
export function observeAuthenticatedFactoryResult(value: unknown,binding: FactoryBinding,keys: ResultKey[],historical=false) {
 const authenticated=authenticateFactoryResult(value,binding,keys);
 attestFactoryManifest(authenticated.manifest,binding);
 return verifyResult(value,{...binding,keys,historical});
}
