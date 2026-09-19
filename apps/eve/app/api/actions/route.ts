import {getCapability} from "@/lib/capability-registry";
import { db } from "@/agent/lib/receipts-db";
import { requireWebAuth,webPrincipal } from "@/lib/web-auth";
import { apiError,requireDatabase } from "@/lib/api-errors";
import { safeActionParameters } from "@/lib/approvals";

export async function GET(request:Request):Promise<Response> {
  const denied=requireWebAuth(request)??requireDatabase(request);if(denied)return denied;
  const ownerId=webPrincipal(request)!.id;
  const runId=new URL(request.url).searchParams.get("runId");
  try {
    const rows=await db().query(`SELECT a.id,a.run_id,a.capability_id,a.action_class,a.target,a.safe_summary,a.status,
      a.decision,a.reason_code,a.authority_source,a.approval_id,a.provider_receipt,a.executor,a.trigger,a.created_at,
      a.attempt_count,a.recovery_result,a.updated_at::text AS updated_at,
      (SELECT coalesce(jsonb_agg(jsonb_build_object('event',h.event,'attempt',h.attempt_number,'details',h.details,'at',h.created_at) ORDER BY h.created_at),'[]'::jsonb) FROM action_receipts h WHERE h.owner_id=a.owner_id AND h.action_id=a.id) AS history,
      r.title AS run_title,r.status AS run_status,g.name AS executor_name,o.routine_id,o.routine_version
      FROM action_requests a JOIN task_runs r ON r.owner_id=a.owner_id AND r.id=a.run_id
      LEFT JOIN agents g ON g.owner_id=r.owner_id AND g.id=r.agent_id
      LEFT JOIN execution_occurrences o ON o.owner_id=r.owner_id AND o.run_id=r.id
      WHERE a.owner_id=$1 AND ($2::text IS NULL OR a.run_id=$2) ORDER BY a.created_at DESC,a.id DESC LIMIT 100`,[ownerId,runId]);
    return Response.json({actions:rows.map(row=>safeActionParameters({...row,capability_name:getCapability(String(row.capability_id))?.name??String(row.capability_id)}))},{headers:{"Cache-Control":"no-store"}});
  } catch {return apiError(request,503,"actions_unavailable","Action history is unavailable. Retry when the database is ready.");}
}
