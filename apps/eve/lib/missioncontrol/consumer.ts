import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { enterpriseInput, enterpriseResult, hasConsistentEnterpriseResult, authenticationSchema, envelopeSchema, readResponse, proposeResponse, submitResponse, id, text, type EnterpriseInput } from './contracts.ts';
export { enterpriseInput, enterpriseResult, type EnterpriseInput } from './contracts.ts';

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

export function signedCommand(config:EnterpriseConfig, input:EnterpriseInput, commandId:string=randomUUID(), now=Date.now()) {
  const request={...enterpriseInput.parse(input),connectionId:config.connectionId},payloadJson=JSON.stringify(request);
  const envelope={serviceId:APPLICATION,capability:input.operation,projectId:config.projectId,repositoryId:'connection:'+config.connectionId,
    commandId,issuedAt:now,expiresAt:now+60000,payloadDigest:'sha256='+createHash('sha256').update(payloadJson).digest('hex')};
  const bytes=['mc-service-command-v1',envelope.serviceId,envelope.capability,envelope.projectId,envelope.repositoryId,
    envelope.commandId,String(envelope.issuedAt),String(envelope.expiresAt),envelope.payloadDigest].join('\n');
  return {envelope:{...envelope,signature:'sha256='+createHmac('sha256',config.secret).update(bytes).digest('hex')},payloadJson};
}
export function validateResponse(config:EnterpriseConfig,input:EnterpriseInput,value:unknown, now=Date.now()) {
  const envelope=envelopeSchema.parse(value);
  if(envelope.connectionId!==config.connectionId || envelope.projectId!==config.projectId || envelope.ownerId!==config.missionControlOwnerId
    || Math.abs(now-envelope.observedAt)>60000 || contentDigest(envelope.response)!==envelope.responseDigest)throw Error('ENTERPRISE_RESPONSE_BINDING');
  if(input.operation==='enterprise.result') {
    const authentication=authenticationSchema.parse(envelope.authentication),{signature,...binding}=authentication;
    const {authentication:_auth,...unsigned}=envelope;
    const expected='sha256:'+createHmac('sha256',config.secret).update(contentDigest({...unsigned,authentication:binding})).digest('hex');
    const request=signedCommand(config,input,authentication.commandId,now);
    if(!timingSafeEqual(Buffer.from(expected),Buffer.from(signature)) || authentication.requestDigest!==request.envelope.payloadDigest
      || authentication.expiresAt<=now || authentication.expiresAt>envelope.observedAt+60000)throw Error('ENTERPRISE_RESULT_AUTHENTICATION');
    const r=enterpriseResult.parse(envelope.response);
    if(r.missionId!==input.missionId || r.plan.missionId!==input.missionId || r.plan.planDigest!==input.expectedPlanDigest
      || r.ownerId!==config.missionControlOwnerId || r.projectId!==config.projectId || r.tenantId!==config.tenantId
      || r.observedAt>envelope.observedAt || r.freshUntil<=now || authentication.expiresAt>r.freshUntil
      || !hasConsistentEnterpriseResult(r))throw Error('ENTERPRISE_RESULT_BINDING');
  } else if(input.operation==='enterprise.inspect') {
    const r=z.object({proposal:z.object({id,intentKey:id,digest:z.string().regex(/^sha256:[a-f0-9]{64}$/),authorized:z.boolean(),missionId:id.nullable()}).strict().nullable(),executionAuthority:z.literal('NONE')}).strict().parse(envelope.response);
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
  const packet=signedCommand(config,input);
  const response=await fetch(config.endpoint+'/api/action',{method:'POST',redirect:'error',signal:AbortSignal.any([AbortSignal.timeout(20000),...(signal?[signal]:[])]),
    headers:{'Content-Type':'application/json'},body:JSON.stringify({path:'sofieEnterprise:command',args:[packet],format:'convex_encoded_json'})});
  if(!response.ok || !response.body)throw Error('ENTERPRISE_RESPONSE_UNAVAILABLE');
  const reader=response.body.getReader();let size=0;const chunks:Uint8Array[]=[];
  try {for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>256000)throw Error('ENTERPRISE_RESPONSE_TOO_LARGE');chunks.push(value);}}
  finally{await reader.cancel();}
  const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(body.status!=='success')throw Error('ENTERPRISE_COMMAND_DENIED');
  const verified=validateResponse(config,input,body.value);
  if(input.operation==='enterprise.result' && verified.authentication?.commandId!==packet.envelope.commandId)throw Error('ENTERPRISE_RESULT_REQUEST_MISMATCH');
  return verified;
}

/** Evidence-derived wording; never promote producer narratives into enterprise PASS. */
export function explainEnterpriseResult(value:unknown):string {
  const result=enterpriseResult.parse(value);
  if(!hasConsistentEnterpriseResult(result))throw Error('ENTERPRISE_RESULT_BINDING');
  if(result.status!=='AVAILABLE')return 'Enterprise Result is not currently available: '+result.reasons.join(', ')+'. No enterprise PASS is established.';
  return `Mission ${result.missionId}, Plan revision ${result.plan.planRevision}: the isolated enterprise Quality Gate is PASS for ${result.workOrders.length} exact independently verified WorkOrders with settled accounting. Owner acceptance: ${result.ownerAcceptance}. This observation expires at ${new Date(result.freshUntil).toISOString()}; reconnect requires a fresh read. No production or execution authority is granted.`;
}
