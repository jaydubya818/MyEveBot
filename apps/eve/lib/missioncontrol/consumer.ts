import { createHash, createHmac, randomUUID } from 'node:crypto';
import { z } from 'zod';

const text = (max: number) => z.string().min(1).max(max).refine(s => s === s.trim() && !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(s));
const id = text(200), digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const proposal = z.object({ title:text(160), objective:text(4000), workstreams:z.array(text(160)).min(2).max(12),
  milestones:z.array(text(160)).min(1).max(20), stopCondition:text(500), budgetMicrousd:z.literal(0) }).strict();
export const enterpriseInput = z.discriminatedUnion('operation', [
  z.object({operation:z.literal('enterprise.inspect'),intentKey:id.nullable(),proposalId:id.nullable()}).strict().refine(r=>(r.intentKey===null)!==(r.proposalId===null)),
  z.object({operation:z.literal('enterprise.propose'),intentKey:id,proposal}).strict(),
  z.object({operation:z.literal('enterprise.submit'),proposalId:id,proposalDigest:digest}).strict(),
  z.object({operation:z.literal('enterprise.read'),proposalId:id,missionId:id,expectedPlanDigest:digest.nullable()}).strict(),
]);
export type EnterpriseInput = z.infer<typeof enterpriseInput>;
export const APPLICATION = 'myeve-sofie-readiness-v1';
export const CAPABILITY = 'tool.mission_control';
export interface EnterpriseConfig {
  endpoint:string; ownerId:string; missionControlOwnerId:string; tenantId:string; projectId:string; connectionId:string; secret:string;
}
/** Canonical mc-service-command-v1 encoding; parity is checked against pinned MissionControl source. */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
}
export const contentDigest = (value: unknown) => 'sha256:' + createHash('sha256').update(canonical(value)).digest('hex');

export function enterpriseConfig(env: NodeJS.ProcessEnv = process.env): EnterpriseConfig {
  if (env.MYEVE_MISSIONCONTROL_MODE !== 'ISOLATED_DETERMINISTIC') throw Error('ENTERPRISE_DISABLED');
  const required = (name:string) => {const value=env[name];if(!value || value!==value.trim())throw Error('ENTERPRISE_UNCONFIGURED');return value;};
  const endpoint=required('MYEVE_MISSIONCONTROL_URL'), url=new URL(endpoint);
  // This engineering candidate cannot address any cloud or production endpoint.
  if(url.protocol!=='http:' || url.hostname!=='127.0.0.1' || !url.port || url.pathname!=='/' || url.search || url.hash || url.username || url.password)
    throw Error('ENTERPRISE_DESTINATION_DENIED');
  const secret=required('MYEVE_MISSIONCONTROL_SECRET');if(secret.length<32)throw Error('ENTERPRISE_UNCONFIGURED');
  return Object.freeze({endpoint:url.origin,secret,ownerId:required('MYEVE_MISSIONCONTROL_OWNER_ID'),
    missionControlOwnerId:required('MYEVE_MISSIONCONTROL_OPERATOR_ID'),tenantId:required('MYEVE_MISSIONCONTROL_TENANT_ID'),
    projectId:required('MYEVE_MISSIONCONTROL_PROJECT_ID'),connectionId:required('MYEVE_MISSIONCONTROL_CONNECTION_ID')});
}

export function signedCommand(config:EnterpriseConfig, input:EnterpriseInput, commandId=randomUUID(), now=Date.now()) {
  const request={...enterpriseInput.parse(input),connectionId:config.connectionId},payloadJson=JSON.stringify(request);
  const envelope={serviceId:APPLICATION,capability:input.operation,projectId:config.projectId,repositoryId:'connection:'+config.connectionId,
    commandId,issuedAt:now,expiresAt:now+60000,payloadDigest:'sha256='+createHash('sha256').update(payloadJson).digest('hex')};
  const bytes=['mc-service-command-v1',envelope.serviceId,envelope.capability,envelope.projectId,envelope.repositoryId,
    envelope.commandId,String(envelope.issuedAt),String(envelope.expiresAt),envelope.payloadDigest].join('\n');
  return {envelope:{...envelope,signature:'sha256='+createHmac('sha256',config.secret).update(bytes).digest('hex')},payloadJson};
}
const qualityGate=z.object({eligible:z.boolean(),reasons:z.array(text(500)).max(100),identity:z.record(z.string(),z.unknown()).nullable().optional()}).strict();
const plan=z.object({id,revision:z.number().int().positive(),status:text(60),digest,
  milestones:z.array(z.object({id,title:text(500),dependsOn:z.array(id).max(100)}).strict()).max(100)}).strict();
const readResponse=z.object({
  mission:z.object({id,title:text(500),state:text(60),budgetUsd:z.number().nonnegative().nullable(),spentUsd:z.number().nonnegative()}).strict(),
  plan:plan.nullable(),plans:z.array(z.object({id,revision:z.number().int().positive(),status:text(60),digest,isCurrent:z.boolean()}).strict()).max(20),
  workOrders:z.array(z.object({id,title:text(500),state:text(60),revisionId:id.nullable(),planId:id.nullable(),blockingIssue:z.string().max(4000).nullable(),qualityGate}).strict()).max(100),
  blockers:z.array(z.string().max(4000)).max(101),needsYou:z.string().max(4000).nullable(),
  resultProof:z.object({status:z.literal('NOT_AVAILABLE'),reason:z.literal('COMPLETED_RESULT_CONSUMPTION_NOT_QUALIFIED'),
    references:z.array(z.object({handoffId:id,workOrderId:id,outcome:text(60)}).strict()).max(100)}).strict(),
  truncated:z.boolean(),executionAuthority:z.literal('NONE'),explanation:z.string().max(4000),
}).strict();
const proposeResponse=z.object({proposalId:id,digest,proposal,needsYou:text(4000),executionAuthority:z.literal('NONE')}).strict();
const submitResponse=z.object({missionId:id,proposalDigest:digest,created:z.boolean(),executionAuthority:z.literal('NONE')}).strict();
const envelopeSchema=z.object({schema:z.literal('sofie-enterprise-response/v1'),applicationId:z.literal(APPLICATION),connectionId:id,
  projectId:id,ownerId:id,observedAt:z.number().int().positive(),responseDigest:digest,response:z.unknown()}).strict();
export function validateResponse(config:EnterpriseConfig,input:EnterpriseInput,value:unknown, now=Date.now()) {
  const envelope=envelopeSchema.parse(value);
  if(envelope.connectionId!==config.connectionId || envelope.projectId!==config.projectId || envelope.ownerId!==config.missionControlOwnerId
    || Math.abs(now-envelope.observedAt)>60000 || contentDigest(envelope.response)!==envelope.responseDigest)throw Error('ENTERPRISE_RESPONSE_BINDING');
  if(input.operation==='enterprise.inspect') {
    const r=z.object({proposal:z.object({id,intentKey:id,digest,authorized:z.boolean(),missionId:id.nullable()}).strict().nullable(),executionAuthority:z.literal('NONE')}).strict().parse(envelope.response);
    if((input.proposalId && r.proposal?.id!==input.proposalId) || (input.intentKey && r.proposal && r.proposal.intentKey!==input.intentKey))throw Error('ENTERPRISE_PROPOSAL_BINDING');
  } else if(input.operation==='enterprise.propose') {
    const r=proposeResponse.parse(envelope.response);
    const expected=contentDigest({connectionId:config.connectionId,tenantId:config.tenantId,projectId:config.projectId,
      ownerId:config.missionControlOwnerId,intentKey:input.intentKey,proposal:input.proposal});
    if(r.digest!==expected || contentDigest(r.proposal)!==contentDigest(input.proposal))throw Error('ENTERPRISE_PROPOSAL_BINDING');
  } else if(input.operation==='enterprise.submit') {
    if(submitResponse.parse(envelope.response).proposalDigest!==input.proposalDigest)throw Error('ENTERPRISE_PROPOSAL_BINDING');
  } else {
    const r=readResponse.parse(envelope.response);
    if(r.mission.id!==input.missionId || (input.expectedPlanDigest!==null && r.plan?.digest!==input.expectedPlanDigest))throw Error('ENTERPRISE_MISSION_BINDING');
  }
  return {...envelope,response:envelope.response as Record<string,unknown>};
}
/** No automatic retry: uncertain writes remain in the canonical Action Gateway recovery path. */
export async function sendEnterpriseCommand(config:EnterpriseConfig,input:EnterpriseInput,signal?:AbortSignal) {
  const response=await fetch(config.endpoint+'/api/action',{method:'POST',redirect:'error',signal:AbortSignal.any([AbortSignal.timeout(20000),...(signal?[signal]:[])]),
    headers:{'Content-Type':'application/json'},body:JSON.stringify({path:'sofieEnterprise:command',args:[signedCommand(config,input)],format:'convex_encoded_json'})});
  if(!response.ok || !response.body)throw Error('ENTERPRISE_RESPONSE_UNAVAILABLE');
  const reader=response.body.getReader();let size=0;const chunks:Uint8Array[]=[];
  try {for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>256000)throw Error('ENTERPRISE_RESPONSE_TOO_LARGE');chunks.push(value);}}
  finally{await reader.cancel();}
  const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(body.status!=='success')throw Error('ENTERPRISE_COMMAND_DENIED');
  return validateResponse(config,input,body.value);
}
