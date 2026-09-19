import { Client,type HandleMessageStreamEvent } from "eve/client";
import { ExecutionFailure,type ExecutionRunner } from "../../lib/execution-worker.ts";
import { EXECUTION_HEADER,signExecution,resolveExecution } from "../../lib/execution-auth.ts";
import { validateRoutineAgent,ROUTINE_EXECUTION_READY } from "../../lib/routine-review.ts";
import { upsertThread } from "../../lib/threads-db.ts";
import { db } from "./receipts-db.ts";

export const routineRunner:ExecutionRunner={
  async preflight(claim) {
    if(!ROUTINE_EXECUTION_READY)throw new ExecutionFailure("capability_unavailable");
    const resolved=await resolveExecution(claim);
    try {await validateRoutineAgent(claim.ownerId,resolved.agentId,claim.configuration);signExecution(claim);}
    catch {throw new ExecutionFailure("capability_unavailable");}
  },
  async run(claim,signal) {
    const host=process.env.VERCEL_URL?`https://${process.env.VERCEL_URL}`:`http://localhost:${process.env.PORT??"3000"}`;
    const client=new Client({host,redirect:"error",headers:()=>({[EXECUTION_HEADER]:signExecution({ownerId:claim.ownerId,occurrenceId:claim.occurrenceId,version:claim.version,workerId:claim.workerId})})});
    const session=client.session();
    const stream=await session.send({message:claim.configuration.instructions,signal,streamReconnectPolicy:{reconnect:false}});
    const events:HandleMessageStreamEvent[]=[];
    let completed=false;
    let failed=false;
    for await(const event of stream) {
      events.push(event);
      if(event.type==="turn.completed")completed=true;
      if(event.type==="turn.failed" || event.type==="session.failed" || event.type==="turn.cancelled")failed=true;
    }
    const threadId=`${claim.occurrenceId}_attempt_${claim.attempt}`;
    const savedAt=Date.now();
    await upsertThread(claim.ownerId,threadId,{title:"Routine result",updatedAt:savedAt,pinned:false,renamed:true,origin:"reminder"},{events,session:session.state,savedAt});
    await db().query(`UPDATE task_runs SET thread_id=$3 WHERE owner_id=$1 AND id=$2`,[claim.ownerId,claim.runId,threadId]);
    if(!completed || failed)throw new ExecutionFailure("unknown");
    return {resultReference:threadId};
  },
};
