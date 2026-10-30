import { ProviderNotSent, type KnownOutcome, type UnknownOutcome } from "./gate.ts";
import type { AgentPort, AgentExecution } from "./wiring.ts";
import type { RelayDeveloperTools } from "./relay-tools.ts";
import type { QualificationPurpose } from "../external-alpha/qualification-accounting.ts";

/**
 * Disabled-by-default Sofie / Deep Agent adapter for the qdev journey.
 *
 * The beta's "Deep Agent is unavailable until qualified" label is locked-beta copy, not a provider fact; for this
 * installation availability comes from the real execution provider (`AgentExecutionPort.available()`), and the
 * adapter additionally requires an explicit host `enabled` switch plus the qualified owner binding. Nothing here
 * enrolls, authenticates, pays or activates anything: every transport is the injected port, and the only tool
 * surface the agent receives is the grant-checked Relay tool set the journey already holds.
 *
 * Contract with the journey:
 *  - Refusals that are proven before anything leaves the process throw ProviderNotSent (gate tombstones the claim).
 *  - Once `start` has been called, any failure, missing usage proof or untrusted record is post-send ambiguity:
 *    the adapter returns `{known:false}` or rethrows, so the gate fences and nothing is resent.
 *  - The request/work order/run reported for CODING comes from the trusted executor record, never the model's
 *    own report, and must be the host-owned record for exactly this task.
 */
export type AgentTask = {
  stage: number; key: string; purpose: "SOFIE" | "CODING"; ownerId: string; slot: "Q1" | "Q2";
  projectSha256: string; sourceSha256: string; relay: RelayDeveloperTools;
};
export type AgentRunRecord = {
  /** Only a host-owned executor record is trusted; anything else (model text, tool output) is refused. */
  source: "EXECUTOR_RECORD";
  taskKey: string; ownerId: string; projectSha256: string;
  usageFinal: boolean; execution?: AgentExecution;
};
/** The existing execution surface, narrowed. Production binds it to the owner-scoped execution APIs; tests inject fakes. */
export interface AgentExecutionPort {
  /** Real-provider availability for this installation (not the locked beta label). */
  available(): boolean;
  /** Throw AgentNotStarted only when provably nothing was sent. Any other failure is ambiguous. */
  start(task: AgentTask): Promise<{ handle: string }>;
  /** Host-owned record of the finished execution; null while unavailable. */
  record(handle: string): Promise<AgentRunRecord | null>;
}
export class AgentNotStarted extends Error {}
/** Post-start failure: a plain Error (never ProviderNotSent) so the gate fences instead of tombstoning. */
const ambiguous = (code: string, cause: unknown) => new Error(code, { cause });
export class AgentPortRefused extends Error { constructor(readonly code: string) { super(code); } }

export type DeepAgentConfig = {
  enabled?: boolean;
  /** The qualified member this journey acts for; a turn from any other owner is refused. */
  ownerId: string; slot: "Q1" | "Q2"; projectSha256: string; sourceSha256: string;
  port: AgentExecutionPort;
};
type Outcome = KnownOutcome<unknown> | UnknownOutcome<unknown>;

export class DeepAgentAdapter implements AgentPort {
  constructor(private readonly c: DeepAgentConfig) {}

  /** Guarded Sofie entrypoint: admits a turn for the qualified owner/project only. Throws before any send. */
  admit(input: { ownerId: string; purpose: QualificationPurpose; projectSha256: string; sourceSha256: string }): void {
    const refuse = (code: string): never => { throw new AgentPortRefused(code); };
    if (this.c.enabled !== true) refuse("QDEV_AGENT_DISABLED");
    if (input.purpose !== "SOFIE" && input.purpose !== "CODING") refuse("QDEV_AGENT_PURPOSE");
    if (input.ownerId !== this.c.ownerId) refuse("QDEV_AGENT_OWNER");
    if (input.projectSha256 !== this.c.projectSha256 || input.sourceSha256 !== this.c.sourceSha256) refuse("QDEV_AGENT_BINDING");
    if (!this.c.port.available()) refuse("QDEV_AGENT_UNAVAILABLE");
  }

  async run(op: { stage: number; key: string; purpose: QualificationPurpose }, relay: RelayDeveloperTools): Promise<Outcome> {
    let task: AgentTask;
    try {
      this.admit({ ownerId: this.c.ownerId, purpose: op.purpose, projectSha256: this.c.projectSha256, sourceSha256: this.c.sourceSha256 });
      task = { stage: op.stage, key: op.key, purpose: op.purpose as "SOFIE" | "CODING", ownerId: this.c.ownerId, slot: this.c.slot,
        projectSha256: this.c.projectSha256, sourceSha256: this.c.sourceSha256, relay };
    } catch { throw new ProviderNotSent("agent admission refused"); }
    let handle: string;
    try { handle = (await this.c.port.start(task)).handle; }
    catch (error) {
      // Only the explicit whole-execution pre-start proof is a no-send. Any other failure (including a
      // ProviderNotSent thrown by a nested layer) happened once start began and is ambiguous exposure.
      if (error instanceof AgentNotStarted) throw new ProviderNotSent("agent not started");
      throw ambiguous("QDEV_AGENT_START_AMBIGUOUS", error);
    }
    // From here the provider may have been charged: never throw ProviderNotSent, never resend.
    let record: AgentRunRecord | null;
    try { record = await this.c.port.record(handle); }
    catch (error) { throw ambiguous("QDEV_AGENT_RECORD_UNAVAILABLE", error); }
    const trusted = !!record && record.source === "EXECUTOR_RECORD" && record.taskKey === op.key
      && record.ownerId === this.c.ownerId && record.projectSha256 === this.c.projectSha256 && record.usageFinal === true;
    if (!trusted) return { known: false };
    if (op.purpose === "CODING") {
      const e = record!.execution;
      if (!e || !e.requestId || !e.workOrderId || !e.runId) return { known: false };
      return { known: true, value: { execution: { requestId: e.requestId, workOrderId: e.workOrderId, runId: e.runId } } };
    }
    return { known: true, value: { sofie: "completed" } };
  }
}
