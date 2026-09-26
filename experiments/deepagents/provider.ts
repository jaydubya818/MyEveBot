import { createHash } from "node:crypto";
import { createDeepAgent, type BackendProtocolV2 } from "deepagents";
import { createMiddleware, tool } from "langchain";
import { ToolMessage } from "@langchain/core/messages";
import type { BaseLanguageModel } from "@langchain/core/language_models/base";
import type { BaseCheckpointSaver } from "@langchain/langgraph-checkpoint";
import { z } from "zod";
import { createExperimentalHarnessBoundary, type ExperimentalCheckpoint,
  type ExperimentalHarnessInput, type ExperimentalWriteGuard } from "../../apps/eve/lib/digital-worker/experimental-harness-boundary.ts";
import type { HarnessProvider, ProviderRunRef, ProviderStartInput, ProviderCheckpoint,
  ProviderInput, ProviderOutcome } from "../../apps/eve/lib/digital-worker/providers.ts";

const PROVIDER = Object.freeze({ id: "deepagents-experiment-1.14.1", version: 1 });
const ALLOWED_TOOLS = new Set(["myeve_read_file", "myeve_write_file"]);
const hash = (value: unknown) => `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
const unsupported = <T extends string>(operation: T, reason: string) =>
  ({ status: "UNSUPPORTED" as const, operation, reason });

/** Kept by MyEve, outside graph state. Not a model argument or provider-issued authority. */
export interface ExperimentHost {
  prepare(input: ProviderStartInput): Promise<ExperimentalHarnessInput>;
  guard: ExperimentalWriteGuard;
  /** Reserve each model call against current authority and durable run budget. */
  authorizeModelCall(run: ProviderRunRef): Promise<boolean>;
  checkpointer: BaseCheckpointSaver;
  /** Must durably retain before resolving, reject conflicting operation IDs, and fence old generations. */
  retain(run: ProviderRunRef, checkpoint: ExperimentalCheckpoint): Promise<string>;
  /** Must authenticate caller/scope and return a fresh context plus the exact retained checkpoint. */
  restore(checkpoint: ProviderCheckpoint): Promise<{
    input: ExperimentalHarnessInput; checkpoint: ExperimentalCheckpoint;
  }>;
}

/** No host filesystem, shell, durable memory or provider-side fallback storage. */
function deniedBackend(): BackendProtocolV2 {
  const deny = () => { throw new Error("Provider filesystem access is disabled; use MyEve tools."); };
  return { read: deny, readRaw: deny, write: deny, edit: deny, delete: deny,
    ls: deny, glob: deny, grep: deny };
}

/** Isolated ER2 experiment. Never registered in Sofie's normal runtime or route qualification. */
export class ExperimentalDeepAgentsProvider implements HarnessProvider {
  readonly metadata = {
    kind: "DEEP_AGENT" as const, provider: PROVIDER,
    operations: { start: "SUPPORTED", observe: "SUPPORTED", sendInput: "UNSUPPORTED",
      checkpoint: "SUPPORTED", resume: "SUPPORTED", requestStop: "SUPPORTED",
      collectResult: "SUPPORTED", collectUsage: "SUPPORTED" } as const,
  };
  private claimed = false;
  private active?: {
    run: ProviderRunRef;
    boundary: ReturnType<typeof createExperimentalHarnessBoundary>;
    abort: AbortController;
    task: Promise<void>;
    state: "RUNNING" | "COMPLETED" | "FAILED" | "STOPPED";
    sourceRef: string;
    retainedRevision: number;
    calls: number;
    deniedCalls: number;
    failure: string | null;
  };
  constructor(private readonly host: ExperimentHost, private readonly model: BaseLanguageModel,
    private readonly limits = { maxModelCalls: 12, timeoutMs: 60_000 }) {
    if ([process.env.LANGSMITH_TRACING, process.env.LANGCHAIN_TRACING_V2]
      .some(value => value && !["false", "0"].includes(value.toLowerCase())))
      throw new Error("External tracing must be disabled for the isolated experiment.");
    if (!Number.isSafeInteger(limits.maxModelCalls) || limits.maxModelCalls < 1 || limits.maxModelCalls > 30 ||
        !Number.isSafeInteger(limits.timeoutMs) || limits.timeoutMs < 1 || limits.timeoutMs > 300_000)
      throw new Error("Experimental model/time limits are invalid.");
  }

  private current(run: ProviderRunRef) {
    if (!this.active || JSON.stringify(run) !== JSON.stringify(this.active.run))
      throw new Error("Unknown or stale experimental run.");
    return this.active;
  }

  async start(input: ProviderStartInput) {
    if (this.claimed) throw new Error("One provider instance owns one run; reconcile it before starting again.");
    this.claimed = true;
    const prepared = await this.host.prepare(input);
    if (hash(prepared.work) !== hash(input.work) || hash(prepared.context) !== hash(input.context) ||
        prepared.generation !== input.generation)
      throw new Error("Host preparation changed the Work, context or generation.");
    // The host must reserve this idempotency key and the sole writer before this method is called.
    const run = { provider: PROVIDER, workId: input.work.workId,
      workVersion: input.work.workVersion, generation: input.generation, runId: input.idempotencyKey };
    z.string().uuid().parse(run.runId);
    await this.launch(run, prepared);
    return { status: "OK" as const, value: run };
  }

  private async launch(run: ProviderRunRef, input: ExperimentalHarnessInput, restored?: ExperimentalCheckpoint) {
    const boundary = createExperimentalHarnessBoundary(input, this.host.guard, restored);
    if (restored?.stopped) throw new Error("Stopped checkpoints cannot resume.");
    const sourceRef = await this.host.retain(run, boundary.host.checkpoint());
    const active = { run, boundary, abort: new AbortController(), task: Promise.resolve(),
      state: "RUNNING" as "RUNNING" | "COMPLETED" | "FAILED" | "STOPPED",
      sourceRef, retainedRevision: boundary.host.checkpoint().revision, calls: 0, deniedCalls: 0, failure: null as string | null };
    this.active = active;
    const persist = async () => {
      try {
        const snapshot = boundary.host.checkpoint();
        active.sourceRef = await this.host.retain(run, snapshot);
        active.retainedRevision = snapshot.revision;
      }
      catch (error) { boundary.host.requestStop(); active.abort.abort(); throw error; }
    };
    const tools = [
      tool(async ({ path }) => boundary.tools.readFile(path), {
        name: "myeve_read_file", description: "Read an exact MyEve-selected relative file path.",
        schema: z.object({ path: z.string().min(1).max(400) }).strict(),
      }),
      tool(async request => {
        const receipt = await boundary.tools.writeFile(request);
        await persist();
        return receipt;
      }, { name: "myeve_write_file", description: "Replace an approved file at its current revision; reuse operationId only for an identical retry.",
        schema: z.object({ path: z.string().min(1).max(400), content: z.string().max(65536),
          operationId: z.string().uuid(), expectedRevision: z.number().int().nonnegative() }).strict() }),
    ];
    const gateway = createMiddleware({
      name: "MyEveExperimentGateway",
      wrapModelCall: async (request, handler) => {
        if (active.abort.signal.aborted || ++active.calls > this.limits.maxModelCalls)
          throw new Error("Experimental run stopped or model-call limit reached.");
        if (!await this.host.authorizeModelCall(run) || active.abort.signal.aborted)
          throw new Error("Current host authority or model budget denied the request.");
        return handler({ ...request, tools: request.tools.filter(item =>
          typeof item.name === "string" && ALLOWED_TOOLS.has(item.name)) });
      },
      wrapToolCall: async (request, handler) => {
        if (active.abort.signal.aborted || !ALLOWED_TOOLS.has(request.toolCall.name)) {
          active.deniedCalls++;
          return new ToolMessage({ content: "DENIED: this tool is outside the MyEve experiment.",
            tool_call_id: request.toolCall.id ?? "denied" });
        }
        return handler(request);
      },
    });
    const agent = await createDeepAgent({ name: "sofie-er2-experiment", model: this.model,
      backend: deniedBackend(), tools, middleware: [gateway], checkpointer: this.host.checkpointer,
      memory: [], skills: [], subagents: [],
      permissions: [{ operations: ["read", "write"], paths: ["/**"], mode: "deny" }],
      systemPrompt: "You are Sofie's isolated experimental harness. Use only MyEve tools. " +
        "You cannot approve actions, publish, modify memory, verify your own work, or claim readiness. " +
        `Selected files: ${input.readablePaths.join(", ")}. Writable files: ${input.writablePaths.join(", ")}. ` +
        `Current workspace revision: ${boundary.host.candidate().revision}.`,
    });
    active.task = (async () => {
      const timer = setTimeout(() => { boundary.host.requestStop(); active.abort.abort(); }, this.limits.timeoutMs);
      try {
        await agent.invoke(restored ? null : { messages: [{ role: "user", content: input.work.objective }] }, {
          configurable: { thread_id: `${run.workId}:${run.workVersion}:${run.generation}:${run.runId}` },
          signal: active.abort.signal, recursionLimit: this.limits.maxModelCalls * 3,
          callbacks: [],
        });
        active.state = active.abort.signal.aborted ? "STOPPED" : "COMPLETED";
      } catch {
        active.state = active.abort.signal.aborted ? "STOPPED" : "FAILED";
        // Provider errors can contain prompts or credentials. Keep the operator-facing value bounded.
        active.failure = "Harness failed; inspect the host-owned trace before retrying.";
      } finally {
        clearTimeout(timer);
        try { await persist(); }
        catch { active.state = "FAILED"; active.failure = "Checkpoint retention failed; reconcile before retrying."; }
      }
    })();
  }

  async observe(run: ProviderRunRef) {
    const active = this.current(run);
    return { status: "OK" as const, value: { state: active.state,
      observedAt: new Date().toISOString(), sourceRef: active.sourceRef } };
  }
  async sendInput(_run: ProviderRunRef, _input: ProviderInput): Promise<ProviderOutcome<void, "sendInput">> {
    return unsupported("sendInput", "Steering during a run is not qualified.");
  }
  async checkpoint(run: ProviderRunRef) {
    const active = this.current(run);
    if (active.state === "RUNNING") return unsupported("checkpoint", "Quiesce the graph before exporting a resumable checkpoint.");
    const snapshot = active.boundary.host.checkpoint();
    const checkpointRef = await this.host.retain(run, snapshot);
    active.sourceRef = checkpointRef;
    active.retainedRevision = snapshot.revision;
    return { status: "OK" as const, value: { run, checkpointRef, contentHash: hash(snapshot) } };
  }
  async resume(checkpoint: ProviderCheckpoint, idempotencyKey: string) {
    if (this.claimed) throw new Error("Resume requires a fresh provider instance and a fenced old process.");
    this.claimed = true;
    if (checkpoint.run.provider.id !== PROVIDER.id || checkpoint.run.provider.version !== PROVIDER.version ||
        idempotencyKey !== checkpoint.run.runId) throw new Error("Resume must use the original provider and run key.");
    const restored = await this.host.restore(checkpoint);
    if (hash(restored.checkpoint) !== checkpoint.contentHash ||
        restored.input.work.workId !== checkpoint.run.workId ||
        restored.input.work.workVersion !== checkpoint.run.workVersion ||
        restored.input.generation !== checkpoint.run.generation)
      throw new Error("Checkpoint identity or integrity changed.");
    if (!await this.host.checkpointer.getTuple({ configurable: {
      thread_id: `${checkpoint.run.workId}:${checkpoint.run.workVersion}:${checkpoint.run.generation}:${checkpoint.run.runId}`,
    } })) throw new Error("Graph checkpoint is missing; reconcile before resuming.");
    await this.launch(checkpoint.run, restored.input, restored.checkpoint);
    return { status: "OK" as const, value: checkpoint.run };
  }
  async requestStop(run: ProviderRunRef) {
    const active = this.current(run);
    active.boundary.host.requestStop();
    active.abort.abort();
    const snapshot = active.boundary.host.checkpoint();
    active.sourceRef = await this.host.retain(run, snapshot);
    active.retainedRevision = snapshot.revision;
    // A stop receipt is not confirmation the model transport has terminated. observe remains RUNNING until settled.
    return { status: "OK" as const, value: { requestedAt: new Date().toISOString(), sourceRef: active.sourceRef } };
  }
  async collectResult(run: ProviderRunRef) {
    const active = this.current(run);
    if (active.state === "RUNNING") return unsupported("collectResult", "The harness has not quiesced.");
    const candidate = active.boundary.host.candidate();
    return { status: "OK" as const, value: { resultRevision: candidate.changedPaths.length > 0 && active.retainedRevision === candidate.revision ? candidate.contentHash : null,
      artifactRefs: [active.sourceRef], sourceRef: active.sourceRef,
      limitations: ["EXPERIMENTAL: no independent verification or readiness claim.",
        "Shell, MCP and subagent execution are disabled and unqualified.",
        `Denied tool calls: ${active.deniedCalls}. Model calls: ${active.calls}.`,
        ...(active.failure ? [active.failure] : [])] } };
  }
  async collectUsage(run: ProviderRunRef) {
    this.current(run);
    return { status: "OK" as const, value: { coverage: "UNKNOWN" as const, providerCostUsd: null, sourceRef: null } };
  }
  /** Host/testing synchronization only; not a model-visible tool. */
  async settled(run: ProviderRunRef) { await this.current(run).task; }
}
