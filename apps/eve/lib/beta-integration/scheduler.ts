import { betaIntegration, type BetaIntegration } from "./runtime.ts";
import { GoalScheduleAdapter } from "../goal-work/event-adapters.ts";
import { deploymentOwnerId } from "../owner-identity.ts";

/** Called by the existing operations monitor. Only due retained dependencies
 * can advance Goal eligibility; resulting Work remains paused and unadmitted. */
export async function sweepBetaSchedules(beta: BetaIntegration, owner: string) {
  const due = await beta.query(
    `SELECT d.goal_id,d.task_id,d.id,d.reference
    FROM goal_work_dependencies d JOIN goals g ON g.owner_id=d.owner_id AND g.id=d.goal_id
    JOIN goal_tasks t ON t.goal_id=d.goal_id AND t.id=d.task_id
    WHERE d.owner_id=$1 AND d.kind='schedule' AND d.resolved_at IS NULL AND d.not_before<=now()
      AND g.status='active' AND t.status NOT IN ('completed','cancelled','paused')
    ORDER BY d.not_before,d.goal_id,d.task_id,d.id LIMIT 20`,
    [owner],
  );
  const service = beta.service(owner),
    adapter = new GoalScheduleAdapter(service);
  for (const row of due) {
    const context = await service.context(
      String(row.goal_id),
      String(row.task_id),
    );
    await adapter.wake({
      ...context,
      dependencyId: String(row.id),
      scheduleReference: String(row.reference),
    });
  }
  return { checked: due.length };
}
export async function runBetaScheduleSweep() {
  if (
    process.env.MYEVE_BETA_MODE !== "qualification" ||
    process.env.VERCEL_ENV === "production"
  )
    return;
  return sweepBetaSchedules(betaIntegration(), deploymentOwnerId());
}
