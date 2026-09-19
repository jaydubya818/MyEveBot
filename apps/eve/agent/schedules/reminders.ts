import { defineSchedule } from "eve/schedules";
import { enqueueReviewedReminders,executionWorkerId } from "../../lib/reminder-execution.ts";
import { deploymentOwnerId,ROUTINE_EXECUTION_READY } from "../../lib/routine-review.ts";
import { ExecutionStore } from "../../lib/execution-store.ts";
import { executeNextOccurrence } from "../../lib/execution-worker.ts";
import { routineRunner } from "../lib/routine-runner.ts";
import { ExecutionDelivery } from "../../lib/execution-delivery.ts";
import { routineNotificationProvider } from "../../lib/routine-notifications.ts";

export default defineSchedule({cron:"* * * * *",async run({waitUntil}) {
  if(!ROUTINE_EXECUTION_READY)return;
  const ownerId=deploymentOwnerId();
  await enqueueReviewedReminders(ownerId);
  waitUntil((async()=>{
    const store=new ExecutionStore();
    await executeNextOccurrence({ownerId,workerId:executionWorkerId(),store,runner:routineRunner});
    const delivery=new ExecutionDelivery();
    for(let count=0;count<10;count++)if(!await delivery.deliverNext(ownerId,routineNotificationProvider))break;
  })());
}});
