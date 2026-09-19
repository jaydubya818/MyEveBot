import { ActionRecovery,recoveryStrategy } from "@/lib/action-recovery";
import { requireWebAuth,webPrincipal } from "@/lib/web-auth";
import { apiError,requireDatabase } from "@/lib/api-errors";

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}):Promise<Response> {
  const denied=requireWebAuth(request)??requireDatabase(request);if(denied)return denied;
  const {id}=await params;
  if(!/^action_[\w-]+$/.test(id))return apiError(request,400,"invalid_action","Invalid action.");
  try {
    const status=await new ActionRecovery().recover(webPrincipal(request)!.id,id,recoveryStrategy);
    if(!status)return apiError(request,409,"recovery_unavailable","The action is still running, already resolved, or recovery is in progress.");
    return Response.json({status,anotherExecutionOccurred:false},{headers:{"Cache-Control":"no-store"}});
  }catch{return apiError(request,503,"recovery_unavailable","Inspection is unavailable. No action was resent.");}
}
