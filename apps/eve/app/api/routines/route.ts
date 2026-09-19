import { z } from "zod";
import { apiError, requireDatabase } from "@/lib/api-errors";
import { requireWebAuth, webPrincipal } from "@/lib/web-auth";
import { listAgents } from "@/lib/agents";
import { getCapability } from "@/lib/capability-registry";
import { RoutineReviewStore, ROUTINE_CAPABILITIES, ROUTINE_EXECUTION_READY, validateRoutineAgent } from "@/lib/routine-review";
import { routineConfigurationSchema } from "@/lib/execution-types";

const reviewSchema=z.object({reminderId:z.number().int().positive(),expectedVersion:z.number().int().positive(),agentId:z.string().min(1),configuration:routineConfigurationSchema,confirm:z.literal(true)}).strict();

export async function GET(request:Request):Promise<Response> {
  const denied=requireWebAuth(request)??requireDatabase(request); if(denied) return denied;
  try {
    const ownerId=webPrincipal(request)!.id;
    const [routines,agents]=await Promise.all([new RoutineReviewStore().list(ownerId),listAgents(ownerId)]);
    return Response.json({executionReady:ROUTINE_EXECUTION_READY,routines,agents:agents.map(a=>({id:a.id,name:a.name,status:a.status,limits:a.limits})),capabilities:ROUTINE_CAPABILITIES.map(id=>({id,name:getCapability(id)?.name??id,risk:getCapability(id)?.risk.level??"critical"}))},{headers:{"Cache-Control":"no-store"}});
  } catch { return apiError(request,503,"routines_unavailable","Routines could not be loaded. Retry when the database is available."); }
}

export async function POST(request:Request):Promise<Response> {
  const denied=requireWebAuth(request)??requireDatabase(request); if(denied) return denied;
  const parsed=reviewSchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success) return apiError(request,400,"invalid_routine_review","Review the instructions, Agent, capabilities and limits, then confirm activation.");
  const ownerId=webPrincipal(request)!.id;
  try {
    await validateRoutineAgent(ownerId,parsed.data.agentId,parsed.data.configuration);
    const routine=await new RoutineReviewStore().review({...parsed.data,ownerId});
    return Response.json({routine});
  } catch(error) {
    const message=error instanceof Error?error.message:"";
    const safe=/^(Choose an active Agent|This capability is not yet|A selected capability|Push delivery|Owner Telegram notification|This capability cannot enforce|Routine limits cannot exceed|Reminder changed\.|Target restrictions and per-action approvals)/.test(message);
    return apiError(request,409,"routine_review_conflict",safe?message:"Routine review could not be saved. Reload and retry.");
  }
}
