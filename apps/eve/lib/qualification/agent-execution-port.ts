import { prepareAuthenticatedLocalFactoryInputV4 } from "../engineering/factory-authenticated-result.ts";
import { AgentNotStarted, type AgentExecutionPort, type AgentRunRecord, type AgentTask } from "./agent-port.ts";
import type { RetainedFactoryAdmission } from "./factory-live-port.ts";

/**
 * Concrete AgentExecutionPort over an injected Deep Agent runtime and the host's RETAINED Factory admissions.
 *
 * The runtime only runs the agent (Sofie planning / coding conversation with the grant-checked Relay tools) and reports whether the run
 * finished with final usage. It never supplies the execution tuple: for CODING the request/work order/run reported to the journey is read
 * from the retained admission for that stage (the same authenticated binding LiveFactoryPort proves against Factory), so nothing the model
 * or a tool says can select, replay or forge an execution. A record exists only for a handle this port started, for exactly that task, and
 * only after the runtime reports the run finished.
 *
 * Adds no authority: no transport, credential, spend or enrollment. The runtime binding itself (model spend) remains protected custody.
 */
export interface AgentRuntime {
  /** Real-provider availability for this installation. */
  available(): boolean;
  /** Throw AgentNotStarted only when provably nothing was sent. Any other failure is ambiguous. */
  start(task: AgentTask): Promise<{ handle: string }>;
  /** Null while the run has not finished. `usageFinal` is true only when the final usage/spend proof for the run is complete. */
  finished(handle: string): Promise<{ usageFinal: boolean } | null>;
}
export class AgentExecutionPortRefused extends Error { constructor(readonly code: string) { super(code); } }

export class RetainedExecutorAgentPort implements AgentExecutionPort {
  private readonly started = new Map<string, AgentTask>();
  constructor(private readonly c: { runtime: AgentRuntime; retained(stage: 1 | 2 | 3): RetainedFactoryAdmission | Promise<RetainedFactoryAdmission> }) {}

  available(): boolean { return this.c.runtime.available() === true; }

  async start(task: AgentTask): Promise<{ handle: string }> {
    if (!Number.isInteger(task?.stage) || task.stage < 1 || task.stage > 3) throw new AgentNotStarted("stage outside the admitted Factory stages");
    if (this.started.size >= 64) throw new AgentNotStarted("too many unreconciled runs");
    const { handle } = await this.c.runtime.start(task);
    if (typeof handle !== "string" || !handle || this.started.has(handle)) throw new AgentExecutionPortRefused("QDEV_AGENT_HANDLE");
    this.started.set(handle, task);
    return { handle };
  }

  async record(handle: string): Promise<AgentRunRecord | null> {
    const task = this.started.get(handle);
    if (!task) return null;
    const done = await this.c.runtime.finished(handle);
    if (!done) return null;
    const base = { source: "EXECUTOR_RECORD" as const, taskKey: task.key, ownerId: task.ownerId, projectSha256: task.projectSha256, usageFinal: done.usageFinal === true };
    if (task.purpose !== "CODING") return base;
    const retained = await this.c.retained(task.stage as 1 | 2 | 3);
    const binding = prepareAuthenticatedLocalFactoryInputV4(retained.binding);
    return { ...base, execution: { requestId: binding.requestId, workOrderId: binding.workOrderId, runId: binding.runId } };
  }
}
