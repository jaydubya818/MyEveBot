import { getCapability } from '../../lib/capability-registry.ts';
import type { ToolContext } from 'eve/tools';
import { ActionBlocked, ActionGateway, consumeActionAuthority, consumeProviderAuthority, type ActionAdapter } from '../../lib/action-gateway.ts';
import { CAPABILITY, enterpriseConfig, enterpriseInput, sendEnterpriseCommand, validateResponse, type EnterpriseConfig, type EnterpriseInput } from '../../lib/missioncontrol/consumer.ts';
import { toolActionRequest } from './action-context.ts';

type Response = Awaited<ReturnType<typeof sendEnterpriseCommand>>;
export function enterpriseAdapter(config:EnterpriseConfig,input:EnterpriseInput):ActionAdapter<Response> {
  return {
    async resolveTarget(){return {provider:'missioncontrol',account:config.missionControlOwnerId,
      resource:`${config.projectId}/${config.connectionId}`,environment:'ISOLATED_DETERMINISTIC'};},
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
export async function executeEnterpriseTool(raw:EnterpriseInput,ctx:Pick<ToolContext,'session'|'callId'|'abortSignal'>) {
  const config=enterpriseConfig(),input=enterpriseInput.parse(raw);
  if(getCapability(CAPABILITY)?.availability.status!=='available')throw new ActionBlocked('denied','enterprise_disabled');
  const {current,initiator}=ctx.session.auth;
  for(const principal of [current,initiator]) {
    if(!principal || principal.authenticator!=='myeve-web-session' || principal.principalType!=='user'
      || principal.principalId!==config.ownerId || principal.attributes.owner!=='true' || principal.attributes.role==='guest'
      || principal.attributes.myeveRoleId || ctx.session.parent)throw new ActionBlocked('denied','enterprise_owner_session_required');
  }
  const action=await toolActionRequest(ctx,{capabilityId:CAPABILITY,actionClass:['enterprise.read','enterprise.inspect'].includes(input.operation)?'read':'create',parameters:input});
  if(action.ownerId!==config.ownerId || action.trigger.kind!=='owner_chat' || action.executor.kind!=='primary-agent')throw new ActionBlocked('denied','enterprise_owner_session_required');
  // Revalidate live remote access even when the gateway would replay a historical receipt.
  // An unapproved submit is denied before Action admission, not recorded as an uncertain write.
  const inspection=await sendEnterpriseCommand(config,input.operation==='enterprise.propose'
    ? {operation:'enterprise.inspect',intentKey:input.intentKey,proposalId:null}
    : input.operation==='enterprise.inspect' ? input : {operation:'enterprise.inspect',intentKey:null,proposalId:input.proposalId},ctx.abortSignal);
  const observed=inspection.response.proposal as {id:string;digest:string;authorized:boolean;missionId:string|null}|null;
  if(input.operation==='enterprise.submit' && (!observed?.authorized || observed.digest!==input.proposalDigest))
    throw new ActionBlocked('denied','enterprise_owner_approval_required');
  if(input.operation==='enterprise.read' && observed?.missionId!==input.missionId)throw new ActionBlocked('denied','enterprise_mission_binding');
  const result=await new ActionGateway().execute(action,enterpriseAdapter(config,input),ctx.abortSignal);
  // Completed Action replays bypass adapter.verify. Never expose an expired,
  // altered or redacted observation as its original authenticated response.
  validateResponse(config,input,result.receipt);
  return result;
}
