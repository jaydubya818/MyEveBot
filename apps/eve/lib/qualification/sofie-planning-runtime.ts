import { AgentNotStarted, type AgentTask } from "./agent-port.ts";
import type { AgentRuntime } from "./agent-execution-port.ts";
import type { RelayTool } from "./relay-tools.ts";
import { RelayDenied } from "./relay-grant.ts";

/**
 * Generic metered SOFIE planning runtime: the `AgentRuntime` body for the journey's SOFIE operation. It runs one bounded model conversation
 * for the qualified owner against the grant-checked Relay developer tools and never exceeds the CHARGED parent reservation:
 *
 *  - Before every model step it computes a worst-case price (the prompt's UTF-8 byte length, plus an explicit allowance for what the model
 *    client adds around it, is an upper bound on its tokens; plus the step's output ceiling) and refuses a step whose worst case does not fit in what remains of the reservation. The step's `maxOutputTokens` is
 *    derived from the remaining reservation, so the provider is told the cap rather than trusted to stop.
 *  - After every step the reported usage must be present, integral and within the ceiling that was sent; the measured cost is added to the
 *    running total and a total above the reservation is a violation. Any violation, missing usage, thrown error or abort leaves the run
 *    `usageFinal: false`, which the journey treats as unproven spend (fenced, never settled, never resent).
 *  - `start` returns only after the whole conversation has settled (every model step and tool call has returned or been aborted), so a
 *    record exists only for a quiescent run. A step that ignores its abort and never settles is reported as `QDEV_SOFIE_NOT_QUIESCENT`
 *    after the deadline plus grace; that is ambiguous exposure and fences the operation.
 *  - Only the first step can be refused as "not started": once a model request has been issued every failure is ambiguous.
 *
 * The model client (provider, credentials, gateway, pricing source) is the protected custody part and is injected as `MeteredModel`; this
 * module reads no credential and opens no connection. Output is never trusted for authority: the run reports only usage.
 */
export type ModelMessage = { role: "user" | "assistant" | "tool"; content: unknown };
export type ToolCall = { id: string; tool: RelayTool; args: Record<string, unknown> };
export type ModelStepInput = { system: string; messages: ModelMessage[]; tools: RelayTool[]; maxOutputTokens: number; signal: AbortSignal };
export type ModelStepOutput = {
  /** Messages produced by this step (assistant text and tool calls), appended to the conversation. */
  messages: ModelMessage[];
  toolCalls: ToolCall[];
  /** Provider-reported usage for this step (reasoning tokens count as output). null when the provider reported none. */
  usage: { inputTokens: number; outputTokens: number } | null;
};
export interface MeteredModel {
  step(input: ModelStepInput): Promise<ModelStepOutput>;
  /** Encodes a tool outcome as the message the model expects next. */
  toolResult(call: ToolCall, outcome: { ok: true; value: unknown } | { ok: false; code: string }): ModelMessage;
}
export type ModelPrice = { inputMicrousdPerMillionTokens: number; outputMicrousdPerMillionTokens: number };

export type SofiePlanningConfig = {
  model: MeteredModel;
  price: ModelPrice;
  /** The approved request text the planning conversation starts from (host-owned, never model-supplied). */
  request: string;
  system: string;
  maxSteps?: number;
  maxOutputTokensPerStep?: number;
  /** Hard wall-clock bound for the whole conversation. */
  deadlineMs?: number;
  /** Extra time after the deadline abort in which an aborted step may still settle before cessation is reported unproven. */
  quiescenceGraceMs?: number;
  /** Largest tool result forwarded to the model, in UTF-8 bytes of its JSON. */
  maxToolResultBytes?: number;
  /** Bytes added to the prompt bound for what the model client itself sends (wrappers, tool declarations): fixed part, plus 1024 per tool. */
  promptOverheadBytes?: number;
  available?: () => boolean;
};
export type SofieRunSummary = { usageFinal: boolean; spentMicrousd: number; steps: number; outcome: "COMPLETED" | "BUDGET_EXHAUSTED" | "STEP_LIMIT" | "VIOLATION" | "FAILED"; code?: string };
export class SofieRuntimeRefused extends Error { constructor(readonly code: string) { super(code); } }

const MAX_PROMPT_BYTES = 1_000_000;
const millionths = (tokens: number, microusdPerMillion: number) => Math.ceil((tokens * microusdPerMillion) / 1_000_000);
export const stepCostMicrousd = (price: ModelPrice, inputTokens: number, outputTokens: number) =>
  millionths(inputTokens, price.inputMicrousdPerMillionTokens) + millionths(outputTokens, price.outputMicrousdPerMillionTokens);

export class SofiePlanningRuntime implements AgentRuntime {
  private readonly runs = new Map<string, SofieRunSummary>();
  private readonly starting = new Set<string>();
  private readonly c: Required<Omit<SofiePlanningConfig, "available">> & { available?: () => boolean };
  constructor(config: SofiePlanningConfig) {
    const p = config.price;
    for (const v of [p?.inputMicrousdPerMillionTokens, p?.outputMicrousdPerMillionTokens])
      if (!Number.isSafeInteger(v) || v < 0 || v > 1_000_000_000) throw new SofieRuntimeRefused("QDEV_SOFIE_PRICE");
    if (p.inputMicrousdPerMillionTokens === 0 && p.outputMicrousdPerMillionTokens === 0) throw new SofieRuntimeRefused("QDEV_SOFIE_PRICE");
    if (typeof config.request !== "string" || !config.request.trim() || config.request.length > 4000) throw new SofieRuntimeRefused("QDEV_SOFIE_REQUEST");
    if (typeof config.system !== "string" || !config.system.trim() || config.system.length > 20_000) throw new SofieRuntimeRefused("QDEV_SOFIE_SYSTEM");
    if (typeof config.model?.step !== "function" || typeof config.model?.toolResult !== "function") throw new SofieRuntimeRefused("QDEV_SOFIE_MODEL");
    const maxSteps = config.maxSteps ?? 8, maxOut = config.maxOutputTokensPerStep ?? 4096, deadlineMs = config.deadlineMs ?? 10 * 60_000;
    const grace = config.quiescenceGraceMs ?? 5_000, toolBytes = config.maxToolResultBytes ?? 32_768, overhead = config.promptOverheadBytes ?? 4_096;
    if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 32 || !Number.isInteger(maxOut) || maxOut < 1 || maxOut > 128_000
      || !Number.isInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 3_600_000 || !Number.isInteger(grace) || grace < 0 || grace > 60_000
      || !Number.isInteger(toolBytes) || toolBytes < 1 || toolBytes > 1_000_000 || !Number.isInteger(overhead) || overhead < 0 || overhead > 100_000) throw new SofieRuntimeRefused("QDEV_SOFIE_BOUNDS");
    this.c = { model: config.model, price: { ...p }, request: config.request, system: config.system, maxSteps, maxOutputTokensPerStep: maxOut,
      deadlineMs, quiescenceGraceMs: grace, maxToolResultBytes: toolBytes, promptOverheadBytes: overhead, available: config.available };
  }

  available(): boolean { return this.c.available ? this.c.available() === true : true; }

  /** Observability for the host; the journey sees only `finished`. */
  summary(handle: string): SofieRunSummary | null { return this.runs.has(handle) ? { ...this.runs.get(handle)! } : null; }

  async start(task: AgentTask): Promise<{ handle: string }> {
    if (task?.purpose !== "SOFIE") throw new AgentNotStarted("not a SOFIE task");
    if (!Number.isSafeInteger(task.reserveMicrousd) || task.reserveMicrousd < 1) throw new AgentNotStarted("reservation invalid");
    const handle = `sofie:${task.key}`;
    if (this.runs.has(handle) || this.starting.has(handle)) throw new SofieRuntimeRefused("QDEV_SOFIE_ALREADY_STARTED");
    this.starting.add(handle);
    try {
      const tools = await task.relay.discover().catch(() => { throw new AgentNotStarted("relay tools unavailable"); });
      const messages: ModelMessage[] = [{ role: "user", content: [{ type: "text", text: this.c.request }] }];
      // The first step must be affordable before anything leaves the process; otherwise nothing was sent.
      if (this.plan(messages, tools, 0, task.reserveMicrousd) === null) throw new AgentNotStarted("first step does not fit the reservation");
      this.runs.set(handle, await this.run(task, tools, messages));
      return { handle };
    } finally { this.starting.delete(handle); }
  }

  async finished(handle: string): Promise<{ usageFinal: boolean } | null> {
    const run = this.runs.get(handle);
    return run ? { usageFinal: run.usageFinal } : null;
  }

  /** The step's output ceiling that fits the remaining reservation after the prompt's worst-case price, or null when no step fits. */
  private plan(messages: ModelMessage[], tools: RelayTool[], committed: number, reserve: number): { maxOutputTokens: number; promptBound: number } | null {
    const promptBound = Buffer.byteLength(JSON.stringify({ system: this.c.system, messages, tools })) + this.c.promptOverheadBytes + 1024 * tools.length;
    if (promptBound > MAX_PROMPT_BYTES) return null;
    const afterPrompt = reserve - committed - millionths(promptBound, this.c.price.inputMicrousdPerMillionTokens);
    if (afterPrompt < 1) return null;
    const out = this.c.price.outputMicrousdPerMillionTokens;
    const affordable = out === 0 ? this.c.maxOutputTokensPerStep : Math.floor((afterPrompt * 1_000_000) / out);
    const maxOutputTokens = Math.min(this.c.maxOutputTokensPerStep, affordable);
    return maxOutputTokens >= 1 ? { maxOutputTokens, promptBound } : null;
  }

  private async run(task: AgentTask, tools: RelayTool[], messages: ModelMessage[]): Promise<SofieRunSummary> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, this.c.deadlineMs);
    let committed = 0, steps = 0, outcome: SofieRunSummary["outcome"] = "COMPLETED", code: string | undefined, usageFinal = true;
    const violate = (reason: string) => { usageFinal = false; outcome = "VIOLATION"; code = reason; };
    try {
      for (;;) {
        if (steps >= this.c.maxSteps) { outcome = "STEP_LIMIT"; break; }
        const plan = this.plan(messages, tools, committed, task.reserveMicrousd);
        if (!plan) { outcome = steps === 0 ? "FAILED" : "BUDGET_EXHAUSTED"; break; }
        steps++;
        let output: ModelStepOutput;
        // Cessation is the step promise settling; the abort signal alone is never taken as cessation.
        const call = Promise.resolve().then(() => this.c.model.step({ system: this.c.system, messages: [...messages], tools: [...tools], maxOutputTokens: plan.maxOutputTokens, signal: controller.signal }));
        let graceTimer: ReturnType<typeof setTimeout> | undefined;
        const unsettled = new Promise<never>((_, reject) => controller.signal.addEventListener("abort", () => {
          graceTimer = setTimeout(() => reject(new SofieRuntimeRefused("QDEV_SOFIE_NOT_QUIESCENT")), this.c.quiescenceGraceMs);
        }, { once: true }));
        try { output = await Promise.race([call, unsettled]); }
        catch (error) {
          if (error instanceof SofieRuntimeRefused) throw error;
          usageFinal = false; outcome = "FAILED"; code = timedOut ? "QDEV_SOFIE_DEADLINE" : "QDEV_SOFIE_MODEL_ERROR"; break;
        } finally { clearTimeout(graceTimer); }
        const usage = output?.usage;
        if (!usage || !Number.isSafeInteger(usage.inputTokens) || !Number.isSafeInteger(usage.outputTokens) || usage.inputTokens < 0 || usage.outputTokens < 0) { violate("QDEV_SOFIE_USAGE_MISSING"); break; }
        if (usage.outputTokens > plan.maxOutputTokens || usage.inputTokens > plan.promptBound) {
          committed += stepCostMicrousd(this.c.price, usage.inputTokens, usage.outputTokens);
          violate("QDEV_SOFIE_USAGE_CEILING"); break;
        }
        committed += stepCostMicrousd(this.c.price, usage.inputTokens, usage.outputTokens);
        if (committed > task.reserveMicrousd) { violate("QDEV_SOFIE_OVER_RESERVE"); break; }
        if (!Array.isArray(output.messages) || !Array.isArray(output.toolCalls)) { violate("QDEV_SOFIE_OUTPUT"); break; }
        messages.push(...output.messages);
        if (output.toolCalls.length === 0) { outcome = "COMPLETED"; break; }
        if (output.toolCalls.length > 8) { violate("QDEV_SOFIE_TOOL_CALLS"); break; }
        for (const toolCall of output.toolCalls) messages.push(await this.runTool(task, toolCall, controller.signal));
      }
    } finally { clearTimeout(timer); controller.abort(); }
    return { usageFinal, spentMicrousd: committed, steps, outcome, ...(code ? { code } : {}) };
  }

  private async runTool(task: AgentTask, call: ToolCall, signal: AbortSignal): Promise<ModelMessage> {
    const model = this.c.model;
    // Every outcome, including a denial, is returned to the model as data; the grant check inside RelayDeveloperTools is the only authority.
    try {
      signal.throwIfAborted();
      const value = await task.relay.execute(call.tool, call.args);
      const text = JSON.stringify(value ?? null);
      if (Buffer.byteLength(text) > this.c.maxToolResultBytes) return model.toolResult(call, { ok: false, code: "QDEV_SOFIE_TOOL_RESULT_TOO_LARGE" });
      return model.toolResult(call, { ok: true, value: JSON.parse(text) });
    } catch (error) {
      return model.toolResult(call, { ok: false, code: error instanceof RelayDenied ? (error.code ?? "QDEV_RELAY_DENIED") : "QDEV_SOFIE_TOOL_FAILED" });
    }
  }
}
