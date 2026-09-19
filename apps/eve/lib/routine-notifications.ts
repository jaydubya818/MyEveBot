import type { NotificationProvider } from "./execution-delivery.ts";
import { db } from "../agent/lib/receipts-db.ts";
import { deploymentOwnerId } from "./routine-review.ts";
import { ActionBlocked,ActionGateway,consumeActionAuthority } from "./action-gateway.ts";

const MESSAGE="Your routine completed. Open MyEve to review the result.";
export const routineNotificationProvider:NotificationProvider={
  async deliver(delivery) {
    const rows=await db().query(`SELECT r.agent_id FROM task_runs r JOIN web_chat_threads t ON t.owner_id=r.owner_id
      WHERE r.owner_id=$1 AND r.id=$2 AND t.id=$3 AND r.status='completed'`,[delivery.ownerId,delivery.runId,delivery.resultReference]);
    if(!rows[0])return {status:"definitely_failed",retryable:false};
    if(delivery.channel==="in_app")return {status:"delivered"};
    // Push needs an adapter binding the exact subscription snapshot.
    if(delivery.channel==="push")return {status:"definitely_failed",retryable:false};
    const token=process.env.TELEGRAM_BOT_TOKEN?.trim();
    const chatId=process.env.TELEGRAM_PROACTIVE_CHAT_ID?.trim();
    const allowed=(process.env.TELEGRAM_ALLOWED_USER_IDS??"").split(",").map(id=>id.trim());
    try {
      await new ActionGateway().execute({ownerId:delivery.ownerId,runId:delivery.runId,actionKey:`delivery:${delivery.id}`,
        capabilityId:"notification.send",actionClass:"send",executor:{kind:"system",agentId:String(rows[0].agent_id)},
        trigger:{kind:"system",id:delivery.id},parameters:{channel:delivery.channel,resultReference:delivery.resultReference},
        delivery:{id:delivery.id,claimVersion:delivery.version,channel:delivery.channel,resultReference:delivery.resultReference}},
      {
        async resolveTarget() {
          if(delivery.ownerId!==deploymentOwnerId() || !token || !chatId || !allowed.includes(chatId))throw new Error("Notification target unavailable");
          return {provider:"telegram",account:delivery.ownerId,resource:chatId};
        },
        async execute(parameters,context) {
          await consumeActionAuthority(context,parameters,"notification.send");
          const response=await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{
            method:"POST",headers:{"content-type":"application/json"},signal:AbortSignal.timeout(15_000),
            body:JSON.stringify({chat_id:context.target.resource,text:MESSAGE}),
          });
          const body=await response.json().catch(()=>null) as {ok?:boolean;result?:{message_id?:number;chat?:{id?:number};text?:string}}|null;
          return {ok:response.ok && body?.ok===true,messageId:body?.result?.message_id,chatId:body?.result?.chat?.id,text:body?.result?.text};
        },
        receipt:result=>({messageId:result.messageId??null,chatId:result.chatId??null}),
        async verify(result,target) {
          return {verified:result.ok && !!result.messageId && String(result.chatId)===target.resource && result.text===MESSAGE,
            receipt:{messageId:result.messageId??null,chatId:result.chatId??null}};
        },
      });
      return {status:"delivered"};
    } catch(error) {
      return error instanceof ActionBlocked && error.status!=="result_unknown"?{status:"definitely_failed",retryable:false}:{status:"unknown"};
    }
  },
};
