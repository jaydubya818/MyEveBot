import {createHash,randomUUID} from "node:crypto";
import {db} from "../../agent/lib/receipts-db.ts";
import {factoryBindingSchema} from "./factory-return-contract.ts";
import {observeAuthenticatedFactoryResult} from "./factory-authenticated-result.ts";
import type {Graphql,HostedConfig} from "../myfactory-protocol.mjs";
const sha=(s:string)=>createHash("sha256").update(s).digest("hex");
type Database={query(sql:string,params?:unknown[]):Promise<Record<string,any>[]>};
export interface FactoryAdmissionInput {binding:unknown;hostedInput:unknown;currentWork:{ownerId:string;agentId:string;workId:string;workVersion:number;workGeneration:number;criteriaVersion:number;lifecycle:string;control:string};expectedWorkOrderId:string;expectedRunId:string;expectedAttempt:number;requiredChecks:string[];trustedPin:unknown;config:HostedConfig;graphql:Graphql;scopeKind:"personal"|"organization"}
/** Only this authenticated path may produce a Gate C receipt; it grants no authority. */
export class FactoryResultStore {
 constructor(readonly database:Database=db()){}
 async get(scopeId:string,scopeKind:string,workId:string,operationId:string){const [row]=await this.database.query("SELECT * FROM engineering_factory_results WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3 AND operation_id=$4",[scopeId,scopeKind,workId,operationId]);return row??null}
 async admit(input:FactoryAdmissionInput){
  const binding=factoryBindingSchema.parse(input.binding),sub=binding.submission;
  if(sub.ownerId!==input.currentWork.ownerId||sub.workId!==input.currentWork.workId)throw Error("FACTORY_RESULT_WORK_SCOPE_DENIED");
  const observed=await observeAuthenticatedFactoryResult(input);
  if(!("signedResult" in observed)||!observed.signedResult||!observed.signedEnvelope||!observed.signedEnvelopeDigest||!observed.resultTrust)return observed;
  const result=observed.signedResult,m=result.manifest,trust=observed.resultTrust,envelope=JSON.stringify(observed.signedEnvelope);
  if(sha(envelope)!==observed.signedEnvelopeDigest)throw Error("FACTORY_RESULT_ENVELOPE_CHANGED");
  const payload={receiptId:randomUUID(),scopeId:sub.ownerId,scopeKind:input.scopeKind,workId:sub.workId,workVersion:sub.workVersion,workGeneration:sub.workGeneration,criteriaVersion:sub.criteriaVersion,agentId:sub.agentId,factoryRequestId:binding.requestId,factoryId:result.factoryId,factorySourceCommit:result.factoryVersion.sourceCommit,factorySourceTree:result.factoryVersion.sourceTree,factoryConfigurationDigest:result.factoryVersion.configurationDigest,workOrderId:m.workOrderId,runId:m.runId,attemptNumber:m.attemptNumber,producerStatus:"ready_for_review",protocolVersion:result.version,signingKeyId:trust.keyId??"legacy",signingKeyVersion:trust.keyVersion,operationId:result.operationId,manifestDigest:result.manifestDigest,candidateCommit:m.candidateCommit,candidateTree:m.candidateTree,evidenceManifestDigest:sha(JSON.stringify(m.checks)),artifactManifestDigest:sha(JSON.stringify(m.artifacts)),signedEnvelope:envelope,signedEnvelopeDigest:observed.signedEnvelopeDigest,producerIssuedAt:result.issuedAt,producerCompletedAt:result.issuedAt};
  const [received]=await this.database.query("SELECT engineering_factory_receive($1::jsonb) AS value",[JSON.stringify(payload)]);
  if(received.value.state==="CONFLICT")return {status:"CONFLICT" as const,receiptId:received.value.receiptId,authorityGranted:false,readiness:"NOT_READY" as const};
  const receiptId=received.value.receiptId as string,stages=["RECEIVED","AUTHENTICATED","ATTESTED","INTEGRITY_VERIFIED","ADMITTED"];
  let row=await this.get(sub.ownerId,input.scopeKind,sub.workId,result.operationId);
  for(let i=0;i<stages.length-1;i++){
   if(row.admission_state!==stages[i])continue;
   const [change]=await this.database.query("SELECT engineering_factory_advance($1::jsonb) AS value",[JSON.stringify({scopeId:sub.ownerId,scopeKind:input.scopeKind,workId:sub.workId,receiptId,expected:stages[i],target:stages[i+1],proofDigest:observed.signedEnvelopeDigest,trustStatus:trust.keyId ? (trust.trustStatus === "active" ? "CURRENT" : trust.trustStatus.toUpperCase()) : "LEGACY",reason:"Work binding changed"})]);
   row=await this.get(sub.ownerId,input.scopeKind,sub.workId,result.operationId);if(change.value.state==="STALE")break;
  }
  return {status:row.admission_state,receiptId,operationId:result.operationId,manifestDigest:result.manifestDigest,authorityGranted:false,independentVerification:"NOT_RUN" as const,readiness:"NOT_READY" as const};
 }
}
