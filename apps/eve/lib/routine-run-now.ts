import { randomUUID } from "node:crypto";
import { ExecutionStore } from "./execution-store.ts";
export async function runRoutineNow(
  ownerId: string,
  id: string,
  version: number,
  store = new ExecutionStore(),
) {
  const readiness = await store.admission.inspect(ownerId, id, version);
  if (!readiness) return { status: 404, readiness: null, occurrenceId: null };
  if (!readiness.canRun) return { status: 409, readiness, occurrenceId: null };
  // enqueue performs the same fresh admission as the scheduler, including a race recheck.
  const occurrenceId = await store.enqueue({
    ownerId,
    routineId: id,
    key: `manual:${randomUUID()}`,
    scheduledFor: new Date().toISOString(),
    expectedVersion: version,
  });
  const fresh = await store.admission.inspect(ownerId, id, version);
  const occurrence = occurrenceId
    ? await store.occurrence(ownerId, occurrenceId)
    : null;
  return {
    status: fresh?.canRun && occurrence?.status === "pending" ? 202 : 409,
    readiness: fresh,
    occurrenceId,
  };
}
