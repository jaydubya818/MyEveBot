import {randomUUID} from 'node:crypto';
import {digest,isFactoryCommandCheck,type RepositoryProfile} from './contract.ts';
import type {DirectProtectedVerifier,DirectVerificationContract} from './direct-development.ts';
import type {Candidate,Evidence} from './execution.ts';
import {FactoryReceiptStore} from './factory-receipt-store.ts';
import {attestFactoryManifest} from './factory-authenticated-result.ts';
import {verifyResult,type ResultKey,type ResultManifest} from './factory-producer-protocol.ts';

export function usesFactoryCommandChecks(profile:RepositoryProfile){return profile.checks.every(isFactoryCommandCheck);}
export function protectedVerifierKind(connection:object,profile:RepositoryProfile):'CLOUD'|'FACTORY_SIGNED_CHECKS'|'INJECTED'{
 return 'source' in connection?'CLOUD':usesFactoryCommandChecks(profile)?'FACTORY_SIGNED_CHECKS':'INJECTED';
}
const imageId=(image:string)=>image.slice(image.indexOf('sha256:'));

/** Projects MyFactory's signed, offline-verifier check outcomes onto the profile's command checks.
 * MyEve runs nothing here: the Evidence is only as strong as the Factory signature it rechecks. */
export function signedCheckEvidence(manifest:ResultManifest,contract:DirectVerificationContract,candidate:Candidate,
 expected:{factoryVersion:string}):Evidence[]{
 const e=manifest.execution,p=candidate.factoryProvenance;
 if(manifest.status!=='COMPLETED'||!manifest.candidate||manifest.candidate.commit!==candidate.sha||manifest.candidate.base!==contract.baseSha||
    e.inputCommit!==contract.baseSha||candidate.baseSha!==contract.baseSha||candidate.producer!=='MYFACTORY'||!p||
    e.factoryVersion!==expected.factoryVersion||p.factoryVersion!==expected.factoryVersion||e.runId!==p.remoteRunId||candidate.attemptId!==e.runId||
    contract.workId!==candidate.workId||e.configuration.verificationImage!==imageId(contract.profile.image)||
    !usesFactoryCommandChecks(contract.profile)||manifest.evidence.some(item=>item.candidateCommit!==candidate.sha||item.runId!==e.runId))
  throw Error('FACTORY_SIGNED_CHECKS_BINDING');
 return contract.profile.checks.map(check=>{
  if(!isFactoryCommandCheck(check))throw Error('FACTORY_SIGNED_CHECKS_BINDING');
  const signed=manifest.evidence.filter(item=>item.command===check.command).at(-1);
  const result=!signed?'UNKNOWN':signed.status==='passed'&&signed.exitCode===0?'PASS':signed.status==='failed'?'FAIL':'UNKNOWN';
  const artifact=JSON.stringify({kind:'MYFACTORY_SIGNED_CHECK',factoryVersion:expected.factoryVersion,manifestDigest:digest(manifest),check:signed??null});
  return {id:randomUUID(),workId:contract.workId,candidate:candidate.sha,base:contract.baseSha,criteriaVersion:contract.criteriaVersion,
   profileHash:contract.profileHash,environment:contract.profile.image,check:check.id,producer:'protected-supervisor' as const,
   attemptId:candidate.attemptId,observedAt:signed?.finishedAt??manifest.completedAt,result,artifact,artifactHash:digest(artifact)};
 });
}

/** Rechecks the current scoped receipt and Factory signing keys before every projection. */
export class FactorySignedCheckVerifier implements DirectProtectedVerifier {
 readonly receipts:FactoryReceiptStore;
 readonly requestId:string;
 readonly keys:()=>Promise<ResultKey[]>;
 readonly expected:{factoryVersion:string};
 constructor(receipts:FactoryReceiptStore,requestId:string,keys:()=>Promise<ResultKey[]>,expected:{factoryVersion:string}){
  this.receipts=receipts;this.requestId=requestId;this.keys=keys;this.expected=expected;
 }
 async verify(contract:DirectVerificationContract,candidate:Candidate):Promise<Evidence[]>{
  const q=await this.receipts.request(this.requestId),admission=await this.receipts.admission(this.requestId);
  if(!q.eligible||q.binding.workId!==contract.workId||q.binding.criteriaVersion!==contract.criteriaVersion||
     !admission||admission.receipt_id!==candidate.factoryProvenance?.receiptId)throw Error('FACTORY_SIGNED_CHECKS_CURRENT_RECEIPT_REQUIRED');
  const receipt=await this.receipts.get(this.requestId,String(admission.receipt_id));
  if(receipt.state!=='ADMITTED')throw Error('FACTORY_SIGNED_CHECKS_CURRENT_RECEIPT_REQUIRED');
  const verified=verifyResult(JSON.parse(receipt.envelope),{...q.binding,keys:await this.keys()});
  attestFactoryManifest(verified.manifest,q.binding);
  return signedCheckEvidence(verified.manifest,contract,candidate,this.expected);
 }
}
