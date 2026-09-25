import { defineHook } from "eve/hooks";
import { executionIdentityFromAuth } from "../../lib/execution-auth.ts";
import { ownerChatRun } from "../lib/action-context.ts";
import { resolveSessionAgent } from "../lib/session-settings.ts";

export default defineHook({events:{
  async "message.received"(event,ctx) {
    const caller=ctx.session.auth.current;
    if(!caller || caller.principalType!=="user" || caller.attributes.owner!=="true"
      || ctx.session.parent || executionIdentityFromAuth(ctx.session.auth) || caller.attributes.myeveRoleId)return;
    const message=event.data.message;
    // A confirmation is not fresh work and must not create replacement authority.
    if(typeof message!=="string" || !message.trim() || /^(yes|no|approve|approved|deny|ok|okay)[.!]?$/i.test(message.trim()))return;
    const agent=await resolveSessionAgent({ownerId:caller.principalId,sessionId:ctx.session.id,auth:ctx.session.auth,primaryFallback:true});
    if(!agent)return;
    await ownerChatRun({ownerId:caller.principalId,sessionId:ctx.session.id,agentId:agent.id,recover:true,initialize:false});
  },
}});
