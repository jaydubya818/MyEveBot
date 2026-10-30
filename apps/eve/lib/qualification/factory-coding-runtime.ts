import type { LocalFactoryBindingV4 } from "../engineering/factory-receipt-store.ts";
import type { QualificationProjectInput } from "../external-alpha/qualification-accounting.ts";
import { digest } from "../engineering/contract.ts";
import { AgentNotStarted, type AgentTask } from "./agent-port.ts";
import type { AgentRuntime } from "./agent-execution-port.ts";
import { bindFactoryDispatch, type StageStart } from "./factory-dispatch.ts";
import type { RetainedFactoryAdmission } from "./factory-live-port.ts";
import { ProviderNotSent } from "./gate.ts";
import type { StageExpected } from "./journey.ts";
import type { FactoryPort } from "./wiring.ts";

/**
 * Productive CODING backend for `RetainedExecutorAgentPort`: stages 1-2 are executed by the SAME native Factory run machinery that stage 3
 * uses, so the coding agent is Factory's own worker under Factory's own native ceiling, never a second spend path.
 *
 *   start(CODING, stage 1|2): reads the lazily admitted retained admission for the stage (the journey prepared it after the predecessor was
 *   accepted and before the expectation was frozen), validates the pre-send tuple against the frozen expectation, binds it with
 *   `bindFactoryDispatch`, and calls `LiveFactoryPort.dispatch(binding, reserveMicrousd)`. That call refuses when the native ceiling exceeds the
 *   charged parent reservation, and returns only after the exact-identity readback is terminal, quiescent, evidence-bearing, with zero
 *   active/unknown spend and settled spend within the native ceiling. `start` therefore blocks until the run has FINISHED; `finished` then
 *   reports final usage from that settled outcome, never from anything the model or a tool said.
 *
 * SOFIE planning is not a Factory run: it is delegated to an injected runtime (model spend = protected custody); absent, SOFIE is a proven
 * no-send. Adds no transport, credential, spend or enrollment authority, and never resends: a second start for a stage is ambiguous, not retried.
 */
export type FactoryCodingConfig = {
  project: QualificationProjectInput; baseline?: StageStart;
  factory: Pick<FactoryPort, "admit" | "dispatch">;
  retained(stage: 1 | 2 | 3): RetainedFactoryAdmission | Promise<RetainedFactoryAdmission>;
  /** The frozen Result expectation for the stage (the same source the journey freezes). */
  expectedFor(stage: 1 | 2 | 3): StageExpected; sourceDigest: string;
  /** Planning runtime for SOFIE operations. Optional: without it Sofie is unavailable and no Factory run is affected. */
  sofie?: AgentRuntime;
};

export class FactoryCodingRuntime implements AgentRuntime {
  private readonly settled = new Map<string, { usageFinal: boolean }>();
  private readonly sofie = new Set<string>();
  private readonly dispatched = new Set<number>();
  constructor(private readonly c: FactoryCodingConfig) {}

  available(): boolean { return true; }

  async start(task: AgentTask): Promise<{ handle: string }> {
    if (task.purpose === "SOFIE") {
      if (!this.c.sofie || this.c.sofie.available() !== true) throw new AgentNotStarted("sofie planning runtime unavailable");
      const started = await this.c.sofie.start(task);
      this.sofie.add(started.handle);
      return started;
    }
    if (task.purpose !== "CODING" || (task.stage !== 1 && task.stage !== 2)) throw new AgentNotStarted("not a Factory coding stage");
    const stage = task.stage as 1 | 2;
    // A second start for the same stage may follow a dispatch whose outcome this process no longer holds: fence, never resend.
    if (this.dispatched.has(stage)) throw new Error("QDEV_CODING_STAGE_ALREADY_STARTED");
    let bound: LocalFactoryBindingV4;
    try {
      const retained = await this.c.retained(stage);
      const raw = retained.binding as { inputCommit?: unknown; inputTree?: unknown };
      if (typeof raw?.inputCommit !== "string" || typeof raw?.inputTree !== "string") throw new Error("QDEV_CODING_ADMISSION");
      const start: StageStart = { commit: raw.inputCommit, tree: raw.inputTree };
      bound = bindFactoryDispatch({ admitted: this.c.factory.admit(stage, start), project: this.c.project, stage, start, baseline: this.c.baseline });
      const expected = this.c.expectedFor(stage);
      const fields = ["factoryId", "configurationDigest", "requestId", "requestDigest", "workOrderId", "runId", "attemptNumber"] as const;
      if (bound.sourceDigest !== this.c.sourceDigest || fields.some(field => bound[field] !== expected[field]) || digest(bound.configuration) !== digest(expected.configuration)) throw new Error("QDEV_CODING_BINDING");
    } catch { throw new AgentNotStarted("coding admission refused before any send"); }
    this.dispatched.add(stage);
    let outcome;
    try { outcome = await this.c.factory.dispatch(bound, task.reserveMicrousd); }
    catch (error) {
      // LiveFactoryPort throws ProviderNotSent only for its own pre-send refusals (disabled, unprepared binding, ceiling above the reservation).
      if (error instanceof ProviderNotSent) { this.dispatched.delete(stage); throw new AgentNotStarted("factory dispatch refused before any send"); }
      throw error;
    }
    // Unsettled or non-final native execution is ambiguous exposure: the gate fences and nothing is resent.
    if (outcome.known !== true) throw new Error("QDEV_CODING_UNSETTLED");
    const handle = `factory:${stage}:${task.key}`;
    this.settled.set(handle, { usageFinal: true });
    return { handle };
  }

  async finished(handle: string): Promise<{ usageFinal: boolean } | null> {
    if (this.sofie.has(handle)) return this.c.sofie!.finished(handle);
    return this.settled.get(handle) ?? null;
  }
}
