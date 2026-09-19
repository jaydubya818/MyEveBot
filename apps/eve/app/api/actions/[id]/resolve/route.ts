import { ActionRecovery } from "@/lib/action-recovery";
import { requireWebAuth,webPrincipal } from "@/lib/web-auth";
import { apiError,requireDatabase } from "@/lib/api-errors";

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}):Promise<Response> {
  const denied=requireWebAuth(request)??requireDatabase(request);if(denied)return denied;
  const {id}=await params;
  const body=await request.json().catch(()=>null);
  if(!/^action_[\w-]+$/.test(id) || !["occurred","not_occurred","cancel"].includes(body?.decision)
    || typeof body?.expectedUpdatedAt!=="string" || !Number.isFinite(Date.parse(body.expectedUpdatedAt))) {
    return apiError(request,400,"invalid_resolution","Choose a resolution for the current action.");
  }
  try {
    const status=await new ActionRecovery().resolveByOwner(webPrincipal(request)!.id,id,body.decision,body.expectedUpdatedAt);
    if(!status)return apiError(request,409,"stale_resolution","This action changed. Refresh before deciding.");
    return Response.json({status,anotherExecutionOccurred:false},{headers:{"Cache-Control":"no-store"}});
  }catch{return apiError(request,503,"resolution_unavailable","The decision could not be saved. Nothing was resent.");}
}
