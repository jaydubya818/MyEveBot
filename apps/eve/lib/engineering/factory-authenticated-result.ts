import {createPublicKey} from 'node:crypto';
import {z} from 'zod';
import {canonical,digest,sha256,validateManifest,verifyResult,RESULT_PROTOCOL,MAX_RESULT_BYTES,
 validateLocalResultManifestV4,
 type ResultKey, type ResultManifest, type SignedResult, type LocalResultManifestV4} from './factory-producer-protocol.ts';
import {verifyProtocolPayload} from './factory-producer-signature.ts';
import {type FactoryBinding, type FactoryReceipt, type FactoryManifest, type LocalFactoryBindingV4} from './factory-receipt-store.ts';

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
const gitHash=z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/);
const localConfigurationSchema=z.object({
 model:z.string().min(1).max(120).refine(value=>!value.includes('..') && !/\s/.test(value) && value.split('/').length<=2 && value.split('/').every(part=>/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(part))),
 executor:z.literal('codex-cli'),executorVersion:text,skillRevision:text,workerProfile:z.enum(['mac','container']),
 verificationImage:text,nodeVersion:text,platform:text,architecture:text,
 commands:z.array(text).min(1).max(100),allowedPaths:z.array(text).min(1).max(100),timeoutMs:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
}).strict();
const localBindingSchema=bindingSchema.extend({localSnapshotVersion:z.literal(4),inputTree:gitHash,configuration:localConfigurationSchema}).strict();
export function prepareAuthenticatedLocalFactoryInputV4(value: unknown): LocalFactoryBindingV4 {
 const b=localBindingSchema.parse(value);
 if(b.inputTree.length!==b.inputCommit.length || digest(b.configuration)!==b.configurationDigest ||
  digest({sourceDigest:b.sourceDigest,configurationDigest:b.configurationDigest})!==b.factoryVersion)
  throw new Error('Untrusted local V4 request binding');
 return {...b,operationId:digest([RESULT_PROTOCOL,b.factoryId,b.requestId,b.workOrderId,b.runId])};
}
/** Strict retained-request guards run before receive, stage writes or keys reads.
 * Parsing also captures independent primitive/configuration snapshots. */
export function requireFactoryBinding(value: unknown): FactoryBinding {
 const stored=bindingSchema.extend({operationId:hash}).parse(value);
 const {operationId,...input}=stored,b=prepareAuthenticatedFactoryInput(input);
 if(operationId!==b.operationId) throw new Error('Factory request operation mismatch');
 return b;
}
export function requireLocalFactoryBindingV4(value: unknown): LocalFactoryBindingV4 {
 const stored=localBindingSchema.extend({operationId:hash}).parse(value);
 const {operationId,...input}=stored,b=prepareAuthenticatedLocalFactoryInputV4(input);
 if(operationId!==b.operationId) throw new Error('Factory request operation mismatch');
 return b;
}
function authenticateEnvelope<M extends FactoryManifest>(value: unknown, binding: FactoryBinding, keys: ResultKey[]) {
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
 return {result,manifest:untrusted as M,key,fingerprint};
}
export function authenticateFactoryResult(value: unknown, binding: FactoryBinding, keys: ResultKey[]) {
 return authenticateEnvelope<ResultManifest>(value,binding,keys);
}
export function authenticateLocalFactoryResultV4(value: unknown, binding: LocalFactoryBindingV4, keys: ResultKey[]) {
 return authenticateEnvelope<LocalResultManifestV4>(value,binding,keys);
}
export function attestFactoryManifest(m: ResultManifest,b: FactoryBinding) {
 validateManifest(m);
 const e=m.execution;
 if(m.producer!==b.factoryId || m.operationId!==b.operationId || e.factoryVersion!==b.factoryVersion ||
  e.sourceDigest!==b.sourceDigest || e.configurationDigest!==b.configurationDigest || e.requestId!==b.requestId ||
  e.requestDigest!==b.requestDigest || e.workOrderId!==b.workOrderId || e.runId!==b.runId ||
  e.attemptNumber!==b.attemptNumber || e.inputCommit!==b.inputCommit) throw new Error('Factory attestation binding mismatch');
}
export function attestLocalFactoryManifestV4(m: LocalResultManifestV4,b: LocalFactoryBindingV4) {
 validateLocalResultManifestV4(m);
 const e=m.execution;
 if(m.producer!==b.factoryId || m.operationId!==b.operationId ||
  !(['factoryId','factoryVersion','sourceDigest','configurationDigest','requestId','requestDigest','workOrderId','runId','attemptNumber','inputCommit','inputTree'] as const).every(field=>e[field]===b[field]) ||
  canonical(e.configuration)!==canonical(b.configuration)) throw new Error('Local V4 Factory attestation binding mismatch');
}
/** Q37-owned Current Truth seam; it never updates protected owner projections. */
export function projectFactoryReceipt<M extends FactoryManifest>(row: FactoryReceipt<M>,admission: Record<string,unknown>|null,keyCurrent: boolean,verified: boolean) {
 // Alternate deliveries may share one canonical admission, but only for the
 // same verified manifest. A saved ADMITTED label alone is not current custody.
 const canonicalReceiptId=admission && verified && typeof admission.receipt_id==='string' && admission.receipt_id.length>0 &&
  typeof row.provenance?.manifestDigest==='string' && admission.manifest_digest===row.provenance.manifestDigest
  ? admission.receipt_id : null;
 return {receiptId:row.state==='ADMITTED' && canonicalReceiptId!==null?canonicalReceiptId:row.id,deliveryId:row.id,admissionReceiptId:admission?.receipt_id??null,status:row.state,reason:row.reason,
  factoryProvenance:verified?'VERIFIED':'UNVERIFIED',eligibleForCurrentAdmission:verified && keyCurrent && row.state==='ADMITTED' && canonicalReceiptId!==null,
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
