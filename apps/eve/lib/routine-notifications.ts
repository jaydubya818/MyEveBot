import type { NotificationProvider } from "./execution-delivery.ts";
import { db } from "../agent/lib/receipts-db.ts";
import { sendPushToOwner } from "./push-db.ts";
import { deploymentOwnerId } from "./routine-review.ts";

export const routineNotificationProvider:NotificationProvider={
  async deliver(delivery) {
    const result=await db().query(`SELECT id FROM web_chat_threads WHERE owner_id=$1 AND id=$2`,[delivery.ownerId,delivery.resultReference]);
    if(!result.length)return {status:"definitely_failed",retryable:false};
    if(delivery.channel==="in_app")return {status:"delivered"};
    const url=`/?thread=${encodeURIComponent(delivery.resultReference)}`;
    if(delivery.channel==="push") {
      await sendPushToOwner(delivery.ownerId,{title:"Routine completed",body:"Your result is ready in MyEve.",url});
      return {status:"delivered"};
    }
    const token=process.env.TELEGRAM_BOT_TOKEN?.trim();
    const chatId=process.env.TELEGRAM_PROACTIVE_CHAT_ID?.trim();
    const allowed=(process.env.TELEGRAM_ALLOWED_USER_IDS??"").split(",").map(id=>id.trim());
    if(delivery.ownerId!==deploymentOwnerId() || !token || !chatId || !allowed.includes(chatId))return {status:"definitely_failed",retryable:false};
    const response=await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{
      method:"POST",headers:{"content-type":"application/json"},signal:AbortSignal.timeout(15_000),
      body:JSON.stringify({chat_id:chatId,text:"Your routine completed. Open MyEve to review the result."}),
    });
    if(response.status===429)return {status:"definitely_failed",retryable:true};
    if(response.status===400 || response.status===401 || response.status===403)return {status:"definitely_failed",retryable:false};
    const body=await response.json().catch(()=>null) as {ok?:boolean;result?:{message_id?:number}}|null;
    return response.ok && body?.ok && body.result?.message_id ? {status:"delivered"} : {status:"unknown"};
  },
};
