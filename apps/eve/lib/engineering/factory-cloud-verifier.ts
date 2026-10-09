import {randomUUID} from 'node:crypto';
import {digest} from './contract.ts';
import type {DirectProtectedVerifier,DirectVerificationContract} from './direct-development.ts';
import type {Candidate,Evidence} from './execution.ts';
import {FactoryReceiptStore} from './factory-receipt-store.ts';
import {attestFactoryManifest} from './factory-authenticated-result.ts';
import {verifyResult,type ResultKey,type ResultManifest} from './factory-producer-protocol.ts';

/** Project independent cloud observations into the existing protected Evidence
 * contract. Producer checks alone cannot satisfy this adapter. */
export function cloudProtectedEvidence(manifest:ResultManifest,contract:DirectVerificationContract,candidate:Candidate,
 expected:{workGeneration:number;profileHash:string;factoryVersion:string}):Evidence[]{
 const v=manifest.verification,p=candidate.factoryProvenance;
 if(!v||manifest.execution.version!==2||candidate.producer!=='MYFACTORY'||!p||
    manifest.execution.factoryVersion!==expected.factoryVersion||p.factoryVersion!==expected.factoryVersion||
    manifest.execution.runId!==p.remoteRunId||candidate.attemptId!==p.remoteRunId||v.runId!==p.remoteRunId||
    contract.workId!==candidate.workId||v.workId!==contract.workId||v.workGeneration!==expected.workGeneration||
    v.candidateCommit!==candidate.sha||v.candidateTree!==candidate.tree||manifest.candidate?.commit!==candidate.sha||
    manifest.execution.inputCommit!==contract.baseSha||candidate.baseSha!==contract.baseSha||
    contract.profileHash!==expected.profileHash||digest(contract.profile)!==expected.profileHash||
    v.image!==contract.profile.image||!v.cleanupConfirmed||v.providerSessionId===v.producerSessionId)
  throw Error('CLOUD_VERIFICATION_BINDING_REQUIRED');
 const expectedIds=contract.profile.checks.map(check=>check.id);
 if(v.outcome!=='UNKNOWN'&&(v.checks.length!==expectedIds.length||v.checks.some((check,index)=>check.id!==expectedIds[index])))
  throw Error('CLOUD_VERIFICATION_CHECKS_MISMATCH');
 // Only authenticated, policy-bound statuses and resource receipts are retained.
 // Expected values and hidden verifier inputs never enter producer context.
 const artifact=JSON.stringify({factoryVersion:expected.factoryVersion,verification:v}),artifactHash=digest(artifact);
 return expectedIds.map(id=>({id:randomUUID(),workId:contract.workId,candidate:candidate.sha,base:contract.baseSha,
  criteriaVersion:contract.criteriaVersion,profileHash:contract.profileHash,environment:v.image,check:id,
  producer:'protected-supervisor',attemptId:candidate.attemptId,observedAt:v.finishedAt,
  result:v.outcome==='UNKNOWN'?'UNKNOWN':v.checks.find(check=>check.id===id)!.result,artifact,artifactHash}));
}

/** Reads the current scoped Gate C receipt and rechecks current signing keys.
 * It has no cloud allocation, publication, local Docker or model capability. */
export class FactoryCloudProtectedVerifier implements DirectProtectedVerifier {
 constructor(readonly receipts:FactoryReceiptStore,readonly requestId:string,
  readonly keys:()=>Promise<ResultKey[]>,readonly expected:{profileHash:string;factoryVersion:string}){}
 async verify(contract:DirectVerificationContract,candidate:Candidate):Promise<Evidence[]>{
  const q=await this.receipts.request(this.requestId),admission=await this.receipts.admission(this.requestId);
  if(!q.eligible||q.binding.workId!==contract.workId||q.binding.criteriaVersion!==contract.criteriaVersion||
     !admission||admission.receipt_id!==candidate.factoryProvenance?.receiptId)throw Error('CLOUD_VERIFICATION_CURRENT_RECEIPT_REQUIRED');
  const receipt=await this.receipts.get(this.requestId,String(admission.receipt_id));
  if(receipt.state!=='ADMITTED')throw Error('CLOUD_VERIFICATION_CURRENT_RECEIPT_REQUIRED');
  const verified=verifyResult(JSON.parse(receipt.envelope),{...q.binding,keys:await this.keys()});
  attestFactoryManifest(verified.manifest,q.binding);
  return cloudProtectedEvidence(verified.manifest,contract,candidate,{...this.expected,workGeneration:q.binding.workGeneration});
 }
}
