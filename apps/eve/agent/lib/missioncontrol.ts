import { randomUUID } from 'node:crypto';
import { getCapability } from '../../lib/capability-registry.ts';
import type { ToolContext } from 'eve/tools';
import { ActionBlocked, ActionGateway, consumeActionAuthority, consumeProviderAuthority, type ActionAdapter } from '../../lib/action-gateway.ts';
import { CAPABILITY, enterpriseConfig, enterpriseInput, sendEnterpriseCommand, validateResponse, explainEnterpriseResult, type EnterpriseConfig, type EnterpriseInput } from '../../lib/missioncontrol/consumer.ts';
import { toolActionRequest } from './action-context.ts';
import { capabilityWorkDatabase } from '../../lib/capability-control/admission.ts';
import { MissionControlBindings } from '../../lib/missioncontrol/permit-store.ts';
import { installedMissionControlConfig } from '../../lib/missioncontrol/installed-client.ts';
import { missionControlToolInput,prepareMissionControlExecution,type MissionControlToolInput } from '../../lib/missioncontrol/prepare-execution.ts';
import { WorkStore } from '../../lib/engineering/store.ts';

type Response = Awaited<ReturnType<typeof sendEnterpriseCommand>>;
export function enterpriseAdapter(config:EnterpriseConfig,input:EnterpriseInput):ActionAdapter<Response> {
  const observationId=input.operation==='enterprise.result'?randomUUID():null;
  return {
    async resolveTarget(){return {provider:'missioncontrol',account:config.missionControlOwnerId,
      resource:`${config.projectId}/${config.connectionId}${observationId ? '/result-observation/'+observationId : ''}`,environment:config.environment??'ISOLATED_DETERMINISTIC'};},
    async execute(parameters,authority){
      await consumeActionAuthority(authority,parameters,CAPABILITY);
      await consumeProviderAuthority(authority,parameters,CAPABILITY);
      const parsed=enterpriseInput.parse(parameters);
      return sendEnterpriseCommand(config,parsed,authority.signal);
    },
    receipt(result){return result;},
    async verify(result){return {verified:true,receipt:validateResponse(config,input,result)};},
  };
}
export async function executeEnterpriseTool(raw:MissionControlToolInput,ctx:Pick<ToolContext,'session'|'callId'|'abortSignal'>) {
  const installed=process.env.MYEVE_MISSIONCONTROL_MODE==='APPROVED_NONPRODUCTION',input=missionControlToolInput.parse(raw);
  const ownerId=installed?process.env.MYEVE_OWNER_ID:enterpriseConfig().ownerId;
  if(getCapability(CAPABILITY)?.availability.status!=='available')throw new ActionBlocked('denied','enterprise_disabled');
  const {current,initiator}=ctx.session.auth;
  for(const principal of [current,initiator]) {
    if(!principal || principal.authenticator!=='myeve-web-session' || principal.principalType!=='user'
      || !ownerId || principal.principalId!==ownerId || principal.attributes.owner!=='true' || principal.attributes.role==='guest'
      || principal.attributes.myeveRoleId || ctx.session.parent)throw new ActionBlocked('denied','enterprise_owner_session_required');
  }
  const config=installed?installedMissionControlConfig(await new MissionControlBindings(capabilityWorkDatabase(),ownerId!).enrollment(),ownerId!):enterpriseConfig();
  const action=await toolActionRequest(ctx,{capabilityId:CAPABILITY,actionClass:['enterprise.read','enterprise.inspect','enterprise.result'].includes(input.operation)?'read':'create',parameters:input});
  if(action.ownerId!==config.ownerId || action.trigger.kind!=='owner_chat' || action.executor.kind!=='primary-agent')throw new ActionBlocked('denied','enterprise_owner_session_required');
  if(input.operation==='enterprise.prepare_execution'){
    if(!installed)throw new ActionBlocked('denied','enterprise_installed_connection_required');
    const store=new WorkStore({scopeKind:'personal',scopeId:config.ownerId,actorId:config.ownerId},capabilityWorkDatabase());
    const adapter:ActionAdapter<Awaited<ReturnType<typeof prepareMissionControlExecution>>>={
      async resolveTarget(){return {provider:'missioncontrol',account:config.missionControlOwnerId,resource:config.projectId+'/'+config.connectionId,environment:'APPROVED_NONPRODUCTION'};},
      async execute(parameters,authority){await consumeActionAuthority(authority,parameters,CAPABILITY);await consumeProviderAuthority(authority,parameters,CAPABILITY);
        return prepareMissionControlExecution(store,parameters,ctx.callId);},
      receipt:result=>result,verify:async result=>({verified:result.status==='OWNER_APPROVAL_REQUIRED',receipt:result}),
    };
    return new ActionGateway().execute(action,adapter,ctx.abortSignal);
  }
  // Revalidate live remote access even when the gateway would replay a historical receipt.
  // An unapproved submit is denied before Action admission, not recorded as an uncertain write.
  if(input.operation!=='enterprise.result') {
  const inspection=await sendEnterpriseCommand(config,input.operation==='enterprise.propose'
    ? {operation:'enterprise.inspect',intentKey:input.intentKey,proposalId:null}
    : input.operation==='enterprise.inspect' ? input : {operation:'enterprise.inspect',intentKey:null,proposalId:input.proposalId},ctx.abortSignal);
  const observed=inspection.response.proposal as {id:string;digest:string;authorized:boolean;missionId:string|null}|null;
  if(input.operation==='enterprise.submit' && (!observed?.authorized || observed.digest!==input.proposalDigest))
    throw new ActionBlocked('denied','enterprise_owner_approval_required');
  if(input.operation==='enterprise.read' && observed?.missionId!==input.missionId)throw new ActionBlocked('denied','enterprise_mission_binding');
  }
  // Each Result observation is a new read. Historical Action receipts cannot establish current evidence.
  if(input.operation==='enterprise.result')action.actionKey += ':observation:'+randomUUID();
  const result=await new ActionGateway().execute(action,enterpriseAdapter(config,input),ctx.abortSignal);
  // Completed Action replays bypass adapter.verify. Never expose an expired,
  // altered or redacted observation as its original authenticated response.
  validateResponse(config,input,result.receipt);
  return input.operation==='enterprise.result' ? {...result,explanation:explainEnterpriseResult(result.receipt.response)} : result;
}
