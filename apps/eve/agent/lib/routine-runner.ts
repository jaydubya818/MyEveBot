import { RoutineAdmission } from "../../lib/routine-admission.ts";
import { Client,type HandleMessageStreamEvent } from "eve/client";
import { ExecutionFailure,type ExecutionRunner } from "../../lib/execution-worker.ts";
import { EXECUTION_HEADER,signExecution,resolveExecution } from "../../lib/execution-auth.ts";
import { validateRoutineAgent,ROUTINE_EXECUTION_READY } from "../../lib/routine-review.ts";
import { upsertThread } from "../../lib/threads-db.ts";
import { db } from "./receipts-db.ts";
import { RoutinePendingSend } from "../../lib/routine-pending-send.ts";
import { ActionGateway } from "../../lib/action-gateway.ts";
import { agentMailSendAdapter } from "./email-send-adapter.ts";

export const routineRunner:ExecutionRunner={
  async preflight(claim) {
    if(!ROUTINE_EXECUTION_READY)throw new ExecutionFailure("capability_unavailable");
    try {
      const resolved=await resolveExecution(claim);
      const admission=await new RoutineAdmission().inspect(claim.ownerId,claim.routineId);
      if(!admission?.canRun)throw new ExecutionFailure("capability_unavailable");
      await validateRoutineAgent(claim.ownerId,resolved.agentId,claim.configuration);
      signExecution(claim);
    }
    catch {throw new ExecutionFailure("capability_unavailable");}
  },
  async run(claim,signal) {
    const pending=new RoutinePendingSend();
    if(await pending.get(claim.ownerId,claim.runId)) {
      return {resultReference:await pending.resume(claim,new ActionGateway(),agentMailSendAdapter(),signal)};
    }
    const host=process.env.VERCEL_URL?`https://${process.env.VERCEL_URL}`:`http://localhost:${process.env.PORT??"3000"}`;
    const client=new Client({host,redirect:"error",headers:()=>({[EXECUTION_HEADER]:signExecution({ownerId:claim.ownerId,occurrenceId:claim.occurrenceId,version:claim.version,workerId:claim.workerId})})});
    const {session,response:stream}=await client.sessions.create({message:claim.configuration.instructions,signal,streamReconnectPolicy:{reconnect:false}});
    const events:HandleMessageStreamEvent[]=[];
    let completed=false;
    let failed=false;
    try {
      for await(const event of stream) {
        events.push(event);
        if(event.type==="turn.completed")completed=true;
        if(event.type==="turn.failed" || event.type==="session.failed" || event.type==="turn.cancelled")failed=true;
      }
    }catch{failed=true;} // Preserve the pending draft even when approval ends the stream.
    const threadId=`${claim.occurrenceId}_attempt_${claim.attempt}`;
    const savedAt=Date.now();
    await upsertThread(claim.ownerId,threadId,{title:"Routine result",updatedAt:savedAt,pinned:false,renamed:true,origin:"reminder"},{events,session:session.state,savedAt});
    await db().query(`UPDATE task_runs SET thread_id=$3 WHERE owner_id=$1 AND id=$2`,[claim.ownerId,claim.runId,threadId]);
    if(await pending.get(claim.ownerId,claim.runId))throw new ExecutionFailure("approval_required");
    if(!completed || failed)throw new ExecutionFailure("unknown");
    return {resultReference:threadId};
  },
};
