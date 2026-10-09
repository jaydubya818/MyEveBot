import { defineTool } from "eve/tools";
import { ActionBlocked, ActionGateway } from "../../lib/action-gateway.ts";
import { toolActionRequest } from "../lib/action-context.ts";
import { ownerOnly } from "../lib/owner-gate.ts";
import { FOREMAN_CAPABILITY, foremanAdapter, foremanConfig, foremanDescription, foremanInput, foremanIssueId } from "../lib/foreman.ts";

export default defineTool({
  approval: ownerOnly,
  availableInSubagents: false,
  description: "When the owner explicitly asks to file an issue and start Foreman, create and delegate one Linear issue in the configured workspace for the configured repository. Summarize only relevant chat context, requirements, acceptance criteria, and checks. Never include secrets. This starts real coding work and a draft PR, never merge or deployment. Use this dedicated tool instead of connection_search or Composio for Foreman. Return the verified issue link; claim started only when receipt.status is started. If delegated_pending, tell the owner delegation is saved but startup is not yet confirmed. If delegated_failed, report the startup failure and do not retry. Never retry an uncertain outcome or create a replacement issue.",
  inputSchema: foremanInput,
  label: { start: () => "Send issue to Foreman" },
  async execute(input,ctx) {
    try {
      const config=foremanConfig();
      const action=await toolActionRequest(ctx,{capabilityId:FOREMAN_CAPABILITY,actionClass:"create",parameters:{title:input.title,description:foremanDescription(input,config)}});
      if(action.trigger.kind!=="owner_chat" || action.executor.kind!=="primary-agent") throw new ActionBlocked("denied","foreman_owner_chat_required");
      action.parameters.issueId=foremanIssueId(action.ownerId,ctx.session.id,input);
      return await new ActionGateway().execute(action,foremanAdapter(config),ctx.abortSignal);
    } catch(error) {
      if(error instanceof ActionBlocked) return {status:error.status,actionId:error.actionId,retryable:false,message:"Foreman handoff was not confirmed. Do not retry or claim an issue was created; report the action status."};
      return {status:"unavailable",retryable:false,message:"Could not verify the Foreman handoff. Do not create a replacement issue. Check the Linear workspace and integration configuration."};
    }
  },
});
