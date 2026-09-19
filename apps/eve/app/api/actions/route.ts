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
      r.title AS run_title,r.status AS run_status
      FROM action_requests a JOIN task_runs r ON r.owner_id=a.owner_id AND r.id=a.run_id
      WHERE a.owner_id=$1 AND ($2::text IS NULL OR a.run_id=$2) ORDER BY a.created_at DESC,a.id DESC LIMIT 100`,[ownerId,runId]);
    return Response.json({actions:rows.map(row=>safeActionParameters(row))},{headers:{"Cache-Control":"no-store"}});
  } catch {return apiError(request,503,"actions_unavailable","Action history is unavailable. Retry when the database is ready.");}
}
