import type { GoalWorkService } from "./service.ts";
/** Called by the existing authenticated scheduler/event consumer. Explicit owner
 * cursor makes each sweep fair across Goals; checkpoint nextCursor durably.
 * Replaying a page is safe. Never register a second high-frequency scheduler. */
export async function dispatchGoalPage(
  service: GoalWorkService,
  afterGoalId = "",
  now = new Date(),
) {
  const goals = await service.database.query(
    `SELECT id FROM goals WHERE owner_id=$1 AND status='active' AND id>$2 ORDER BY id LIMIT 11`,
    [service.ownerId, afterGoalId],
  );
  const outcomes = [];
  for (const goal of goals.slice(0, 10)) {
    try {
      outcomes.push({
        goalId: String(goal.id),
        outcomes: await service.tick(goal.id, now),
      });
    } catch {
      outcomes.push({
        goalId: String(goal.id),
        error: "Continuation failed; retry from retained intent",
      });
    }
  }
  return {
    outcomes,
    nextCursor: goals.length > 10 ? String(goals[9].id) : null,
  };
}
