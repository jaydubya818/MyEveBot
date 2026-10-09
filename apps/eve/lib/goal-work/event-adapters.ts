import { z } from "zod";
import type { DependencySignal, GoalContext } from "./contracts.ts";
import { contractDigest } from "./canonical-adapter.ts";
import type { GoalWorkService } from "./service.ts";
const ref = z.string().min(1).max(255);
export const sourceEventSchema = z
  .object({
    id: ref,
    source: ref,
    accountId: ref,
    kind: z.enum([
      "external_reply",
      "webhook",
      "file_arrival",
      "provider_completion",
      "capability_available",
    ]),
    subjectReference: ref,
    evidenceRef: ref,
    occurredAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type SourceEvent = z.infer<typeof sourceEventSchema>;
export interface EventResolver {
  /** Authenticate upstream delivery, dedupe source identity and bind an exact
   * registered requirement. Unknown/unrelated events return null. No heuristic matching. */
  resolve(
    event: SourceEvent,
  ): Promise<
    | (GoalContext & {
        dependencyId: string;
        kind: DependencySignal["kind"];
        reference: string;
      })
    | null
  >;
}
export class GoalEventAdapter {
  constructor(
    readonly resolver: EventResolver,
    readonly service: (ownerId: string) => GoalWorkService,
  ) {}
  async deliver(value: unknown) {
    const event = sourceEventSchema.parse(value),
      binding = await this.resolver.resolve(event);
    if (!binding) return { ignored: true };
    const permitted: Record<SourceEvent["kind"], DependencySignal["kind"][]> = {
      external_reply: ["external"],
      webhook: ["external"],
      file_arrival: ["file"],
      provider_completion: ["work"],
      capability_available: ["capability"],
    };
    if (
      !permitted[event.kind].includes(binding.kind) ||
      binding.reference !== event.subjectReference
    )
      throw new Error("Source event requirement mismatch");
    // The service's SignalPort independently verifies the retained source receipt.
    return this.service(binding.ownerId).receive({
      ...binding,
      eventId: `source:${contractDigest([event.source, event.accountId, event.id])}`,
      evidenceRef: event.evidenceRef,
    });
  }
}
export interface ScheduleWake {
  ownerId: string;
  goalId: string;
  taskId: string;
  goalGeneration: number;
  taskGeneration: number;
  dependencyId: string;
  scheduleReference: string;
}
/** An existing reviewed scheduler calls this adapter; there is no timer or cron. */
export class GoalScheduleAdapter {
  constructor(
    readonly service: GoalWorkService,
    readonly clock = () => new Date(),
  ) {}
  async wake(wake: ScheduleWake) {
    if (wake.ownerId !== this.service.ownerId)
      throw new Error("Goal not found");
    const context = await this.service.context(wake.goalId, wake.taskId);
    if (
      context.goalGeneration !== wake.goalGeneration ||
      context.taskGeneration !== wake.taskGeneration
    )
      return { blocked: "Stale schedule delivery" };
    const [d] = await this.service.database.query(
      `SELECT not_before FROM goal_work_dependencies
      WHERE owner_id=$1 AND goal_id=$2 AND task_id=$3 AND id=$4 AND kind='schedule' AND reference=$5`,
      [
        wake.ownerId,
        wake.goalId,
        wake.taskId,
        wake.dependencyId,
        wake.scheduleReference,
      ],
    );
    if (!d) throw new Error("Schedule dependency not found");
    const now = this.clock();
    if (new Date(d.not_before) > now)
      return { blocked: "WAITING FOR SCHEDULE" };
    // No producer-supplied timestamp advances the trusted scheduler clock.
    return this.service.continue(context, now);
  }
}
