import { z } from "zod";
import {
  getHostedRequest,
  type Graphql,
  type HostedConfig,
  type HostedResult,
} from "../myfactory-protocol.mjs";
import type { Work } from "./types.ts";

const RECEIPT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 2 * 60 * 1000;

/** This binding must come from a trusted, durable request-to-Work record. The
 * existing free-form Factory chat tool does not create that record yet. */
export const factoryRequestBindingSchema = z.object({
  requestId: z.string().uuid(),
  workId: z.string().uuid(),
  workVersion: z.number().int().positive(),
  workGeneration: z.number().int().positive(),
  routeRunId: z.string().uuid(),
  submittedAt: z.iso.datetime(),
}).strict();
export type FactoryRequestBinding = z.infer<typeof factoryRequestBindingSchema>;

export interface FactoryRouteRun {
  id: string;
  workId: string;
  route: string;
  workVersion: number | null;
  workGeneration: number | null;
  status: string;
}

export type FactoryIntakeObservation = {
  requestId: string;
  workId: string;
  routeRunId: string;
  observedAt: string;
  status: "AWAITING" | "ADMITTED" | "STALE" | "UNKNOWN";
  reason: string;
  workOrderId: string | null;
  receiptUpdatedAt: string | null;
};

const intakeReceiptSchema = z.object({
  version: z.literal(1),
  issueId: z.string().uuid(),
  workOrderId: z.string().trim().min(1).max(160),
  state: z.string().trim().min(1).max(120),
  updatedAt: z.iso.datetime(),
  workOrderUrl: z.url(),
});

type CurrentWork = Pick<Work, "id" | "version" | "generation" | "lifecycle">;

function observation(binding: FactoryRequestBinding, now: number,
  status: FactoryIntakeObservation["status"], reason: string,
  receipt?: { workOrderId: string; updatedAt: string }): FactoryIntakeObservation {
  return {
    requestId: binding.requestId,
    workId: binding.workId,
    routeRunId: binding.routeRunId,
    observedAt: new Date(now).toISOString(),
    status,
    reason,
    workOrderId: status === "ADMITTED" ? receipt?.workOrderId ?? null : null,
    receiptUpdatedAt: receipt?.updatedAt ?? null,
  };
}

function staleBinding(work: CurrentWork, run: FactoryRouteRun, binding: FactoryRequestBinding): string | null {
  if (work.id !== binding.workId || work.version !== binding.workVersion ||
      work.generation !== binding.workGeneration || work.lifecycle !== "active")
    return "The bound Work revision or lifecycle changed.";
  if (run.id !== binding.routeRunId || run.workId !== binding.workId || run.route !== "MYFACTORY" ||
      run.workVersion !== binding.workVersion || run.workGeneration !== binding.workGeneration ||
      !["QUEUED", "RUNNING", "BLOCKED", "UNKNOWN"].includes(run.status))
    return "The bound MyFactory route run is no longer current.";
  return null;
}

/** Projects intake only. A signed WorkOrder receipt never establishes a
 * candidate, completed checks, usage, publication, or MyEve readiness. */
function projectFactoryIntake(
  work: CurrentWork,
  run: FactoryRouteRun,
  rawBinding: FactoryRequestBinding,
  result: HostedResult | null,
  now = Date.now(),
): FactoryIntakeObservation {
  const binding = factoryRequestBindingSchema.parse(rawBinding);
  if (!Number.isFinite(now)) throw new Error("Invalid observation time.");
  const stale = staleBinding(work, run, binding);
  if (stale) return observation(binding, now, "STALE", stale);
  if (!result || result.requestId !== binding.requestId)
    return observation(binding, now, "UNKNOWN", "The same signed request could not be confirmed.");
  if (!result.receipt)
    return observation(binding, now, "AWAITING", "The request exists; the local Factory has not signed an intake receipt.");

  const parsed = intakeReceiptSchema.safeParse(result.receipt);
  if (!parsed.success)
    return observation(binding, now, "UNKNOWN", "The signed intake receipt has invalid fields.");
  const receipt = parsed.data;
  const signedAt = Date.parse(receipt.updatedAt);
  const submittedAt = Date.parse(binding.submittedAt);
  if (receipt.issueId !== binding.requestId ||
      signedAt > now + CLOCK_SKEW_MS || signedAt < submittedAt - CLOCK_SKEW_MS)
    return observation(binding, now, "UNKNOWN", "The signed intake receipt has invalid identity or time fields.");
  if (now - signedAt > RECEIPT_MAX_AGE_MS)
    return observation(binding, now, "STALE", "The signed intake receipt is older than the observation window.", receipt);
  // The hosted contract currently establishes intake only for queued. Other
  // states require an explicit adapter revision rather than guessed semantics.
  if (receipt.state !== "queued")
    return observation(binding, now, "UNKNOWN", "The signed Factory state is not qualified for this adapter.", receipt);
  return observation(binding, now, "ADMITTED", "The signed receipt confirms Factory intake only.", receipt);
}

/** Read back the exact hosted request. The existing protocol verifies its
 * request HMAC and the local Factory's signature before this projection. */
export async function observeFactoryIntake(
  work: CurrentWork,
  run: FactoryRouteRun,
  rawBinding: FactoryRequestBinding,
  config: HostedConfig,
  graphql: Graphql,
  now = Date.now(),
): Promise<FactoryIntakeObservation> {
  const binding = factoryRequestBindingSchema.parse(rawBinding);
  if (!Number.isFinite(now)) throw new Error("Invalid observation time.");
  const stale = staleBinding(work, run, binding);
  if (stale) return observation(binding, now, "STALE", stale);
  try {
    const result = await getHostedRequest(config, binding.requestId, graphql);
    return projectFactoryIntake(work, run, binding, result, now);
  } catch {
    return observation(binding, now, "UNKNOWN", "Hosted request or signature could not be verified. Reconcile the same request ID.");
  }
}
