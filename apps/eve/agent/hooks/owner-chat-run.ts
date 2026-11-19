import { defineHook } from "eve/hooks";
import { executionIdentityFromAuth } from "../../lib/execution-auth.ts";
import { ownerChatRun } from "../lib/action-context.ts";
import { resolveSessionAgent } from "../lib/session-settings.ts";
import { qdevInstallation, qdevMessageRoute } from "../../lib/qualification/ingress.ts";
import { recordQdevTurn } from "../lib/qdev-turn.ts";

export default defineHook({events:{
  async "message.received"(event,ctx) {
    // QDEV installation: decide the route of this owner message once and record it for every step of the turn. A JOURNEY message
    // (build request, exact confirmation, or anything not admitted as chat) stays isolated: it must not recover or bind an owner-chat run.
    // A CHAT message is ordinary chat and binds its run below exactly as a non-QDEV installation does.
    if(qdevInstallation()){
      const text=typeof event.data.message==="string"&&!event.data.parts?.some(part=>part.type==="file")?event.data.message:undefined;
      const record={...await qdevMessageRoute(ctx.session as never,text),turnId:event.data.turnId};
      recordQdevTurn(record);
      if(record.route!=="CHAT")return;
    }
    const caller=ctx.session.auth.current;
    if(caller?.attributes.myeveRetainedSummary!==undefined)return; // Observation must not renew an expired execution run or budget.
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
