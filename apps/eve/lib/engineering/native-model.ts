import { gateway } from "ai";
import { nativeDevelopmentToolSchema } from "./native-input.ts";
import { digest } from "./contract.ts";
import { NativeModelBudget } from "./native-model-budget.ts";
import { NativeRouteAuthority } from "./native-routing.ts";
import { WorkStore } from "./store.ts";
import { WorkError } from "./types.ts";

type Model = ReturnType<typeof gateway>;
type Options = Parameters<Model["doGenerate"]>[0];
type Result = Awaited<ReturnType<Model["doGenerate"]>>;
type StreamPart = Awaited<ReturnType<Model["doStream"]>>["stream"] extends ReadableStream<infer Part> ? Part : never;

/** At the provider boundary, native Work has one scoped tool and bounded text.
 * Provider tools, remote media, arbitrary provider options and fallback models
 * cannot inherit this Work's authority or spend allowance. */
export function nativeModelOptions(options: Options, maxOutputTokens: number): Options {
  if (options.prompt.some(message => message.role !== "system" && message.content.some(part =>
    !["text", "tool-call", "tool-result", "reasoning"].includes(part.type) ||
    (part.type==="tool-result" && !["text","json","error-text","error-json"].includes(part.output.type)))))
    throw new WorkError("native_model_input", "Native engineering accepts bounded text context only.");
  const tools = options.tools?.filter(tool => tool.type === "function" && tool.name === "engineering_direct");
  if (!tools?.length) throw new WorkError("native_model_tools", "The selected Work's guarded native tool is unavailable.");
  const scoped: Options = { prompt: options.prompt, tools, toolChoice: { type: "auto" },
    maxOutputTokens, abortSignal: options.abortSignal, providerOptions: {} };
  if (Buffer.byteLength(JSON.stringify({ prompt: scoped.prompt, tools })) > 180_000)
    throw new WorkError("native_model_input", "Native Work context exceeds its model request bound.");
  return scoped;
}

/** Gateway may return a rawInvalidInput wrapper even when the original object
 * satisfies our exact schema. Recover only that complete, locally validated
 * object; never coerce fields or repair malformed arguments. */
export function nativeToolInput(input: string): string {
  try {
    const value = JSON.parse(input);
    if (value && typeof value === "object" && Object.keys(value).length === 1 && "rawInvalidInput" in value) {
      const parsed = nativeDevelopmentToolSchema.safeParse(value.rawInvalidInput);
      if (parsed.success) return JSON.stringify(parsed.data);
    }
  } catch { /* Framework validation will reject malformed input without an effect. */ }
  return input;
}

/** Gateway's complete result is retained before any text/tool call is exposed.
 * A crashed call cannot silently retry, switch models or start another writer. */
export function nativeBudgetedModel(input: { store: WorkStore; workId: string; sessionId: string; stepKey: string; modelId: string },
  dependencies: { authority?: NativeRouteAuthority; budget?: NativeModelBudget;
    catalog?: typeof gateway.getAvailableModels; model?: (id: string) => Model } = {}): Model {
  const authority = dependencies.authority ?? new NativeRouteAuthority(input.store);
  const budget = dependencies.budget ?? new NativeModelBudget(input.store, authority);
  async function generate(options: Options): Promise<Result> {
    if (options.abortSignal?.aborted) throw new Error("Native model call cancelled before admission.");
    const config = await authority.readConfig();
    if (input.modelId !== `anthropic/${config.model}`) throw new WorkError("native_model_changed", "Use the independently qualified model for this native Work.", 403);
    await authority.assertEffect(input.workId);
    const scoped = nativeModelOptions(options, config.profile.maxOutputTokens);
    const catalog = await Promise.race([(dependencies.catalog ?? gateway.getAvailableModels)(), new Promise<never>((_, reject) => {
      const timer = setTimeout(() => reject(new Error("Current model pricing is unavailable.")), 5000); timer.unref();
    })]);
    const pricing = catalog.models.find(model => model.id === input.modelId)?.pricing;
    const rates = pricing ? [pricing.input, pricing.output, pricing.cachedInputTokens ?? pricing.input, pricing.cacheCreationInputTokens ?? pricing.input].map(Number) : [];
    if (rates.length !== 4 || rates.some(rate => !Number.isFinite(rate) || rate <= 0)) throw new Error("Complete current model pricing is required.");
    const inputBound = Buffer.byteLength(JSON.stringify({ prompt: scoped.prompt, tools: scoped.tools })) + 4096;
    const microUsd = Math.ceil(2 * (inputBound * Math.max(rates[0], rates[2], rates[3]) + config.profile.maxOutputTokens * rates[1]) * 1_000_000);
    const current = await authority.assertEffect(input.workId);
    const reservation = { ...input, microUsd, pricing, bounds: {inputBytes:inputBound,maxOutputTokens:config.profile.maxOutputTokens}, maxCalls: config.profile.maxModelRequests,
      requestHash: digest({ modelId: input.modelId, prompt: scoped.prompt, tools: scoped.tools, maxOutputTokens: scoped.maxOutputTokens }) };
    const prior = await budget.reserve(reservation);
    if (prior) return prior.result as Result;
    try {
      await budget.assertDispatch(reservation);
      const response = await (dependencies.model ?? gateway)(input.modelId).doGenerate({ ...scoped,
        providerOptions: { gateway: { only: [input.modelId.split("/")[0]] } },
        abortSignal: AbortSignal.any([...(options.abortSignal ? [options.abortSignal] : []), AbortSignal.timeout(Math.max(1, Date.parse(current.contract.deadline) - Date.now()))]),
      });
      const raw = response.providerMetadata?.gateway?.cost;
      const cost = typeof raw === "number" || (typeof raw === "string" && raw.trim() !== "") ? Number(raw) : NaN;
      if (!Number.isFinite(cost) || cost < 0) throw new Error("Native provider usage is unavailable; further calls are fenced.");
      const clean: Result = { content: response.content.filter(item => item.type !== "reasoning").map(item =>
        item.type === "tool-call" && item.toolName === "engineering_direct" ? { ...item, input: nativeToolInput(item.input) } : item), usage: response.usage,
        finishReason: response.finishReason, warnings: response.warnings, providerMetadata: response.providerMetadata };
      const invalid = clean.content.some(item => !["text", "tool-call"].includes(item.type) ||
        (item.type === "tool-call" && (item.providerExecuted || item.toolName !== "engineering_direct")));
      if (invalid) {
        await budget.settle(reservation, Math.ceil(cost * 1_000_000), { ...clean, content: [], finishReason: { unified: "error", raw: "scope_denied" } });
        throw new Error("The model requested an unqualified native Work capability.");
      }
      await budget.settle(reservation, Math.ceil(cost * 1_000_000), clean);
      await budget.assertOutput(reservation);
      await authority.assertEffect(input.workId);
      return clean;
    } catch (error) { await budget.unknown(reservation); throw error; }
  }
  return { specificationVersion: "v4", provider: "myeve-native-budget", modelId: input.modelId, supportedUrls: {}, doGenerate: generate,
    async doStream(options) {
      const result = await generate(options);
      return { stream: new ReadableStream<StreamPart>({ start(controller) {
        controller.enqueue({ type: "stream-start", warnings: result.warnings });
        for (const [index, item] of result.content.entries()) {
          if (item.type === "text") {
            const id = String(index); controller.enqueue({ type: "text-start", id });
            controller.enqueue({ type: "text-delta", id, delta: item.text }); controller.enqueue({ type: "text-end", id });
          } else if (item.type === "tool-call") controller.enqueue(item);
        }
        controller.enqueue({ type: "finish", usage: result.usage, finishReason: result.finishReason, providerMetadata: result.providerMetadata });
        controller.close();
      } }) };
    } };
}
