import { generateText, jsonSchema, tool, type LanguageModel, type ModelMessage as SdkMessage } from "ai";
import type { MeteredModel, ModelMessage, ModelStepOutput, ToolCall } from "./sofie-planning-runtime.ts";
import type { RelayTool } from "./relay-tools.ts";

/**
 * The AI SDK binding of `MeteredModel`. The language model itself (provider, gateway, credentials) is passed in by the host's protected
 * custody; this adapter adds no provider, fallback, retry, compaction or delegation of its own. Each `step` is exactly ONE provider request
 * (no SDK-side multi-step loop, no tool `execute`), so the runtime's reservation check, output ceiling and usage accounting see every
 * request. Tools are exposed as schema-less declarations only: the strict per-tool input schema and the grant check run in
 * RelayDeveloperTools when the runtime executes a call, never in the model layer.
 */
export function aiSdkMeteredModel(model: LanguageModel, options: { temperature?: number } = {}): MeteredModel {
  return {
    async step(input): Promise<ModelStepOutput> {
      const byName = new Map(input.tools.map(t => [t.name, t] as const));
      const tools = Object.fromEntries(input.tools.map(t => [t.name, tool({
        description: `Relay developer tool ${t.name} (${t.kind}); arguments are validated and authorized by the host.`,
        inputSchema: jsonSchema({ type: "object", additionalProperties: true }),
      })]));
      const result = await generateText({
        model, system: input.system, messages: input.messages as SdkMessage[], ...(input.tools.length ? { tools } : {}),
        maxOutputTokens: input.maxOutputTokens, abortSignal: input.signal, maxRetries: 0,
        ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
      });
      const inputTokens = result.usage?.inputTokens, outputTokens = result.usage?.outputTokens;
      const toolCalls: ToolCall[] = result.toolCalls.map(call => ({
        id: call.toolCallId,
        // A name the host never offered stays a call so the model gets a denial back; the Relay contract refuses it.
        tool: byName.get(call.toolName) ?? ({ name: call.toolName, kind: "unsupported" } as unknown as RelayTool),
        args: call.input && typeof call.input === "object" && !Array.isArray(call.input) ? call.input as Record<string, unknown> : {},
      }));
      return {
        messages: result.response.messages as ModelMessage[], toolCalls,
        usage: typeof inputTokens === "number" && typeof outputTokens === "number" ? { inputTokens, outputTokens } : null,
      };
    },
    toolResult(call, outcome): ModelMessage {
      return { role: "tool", content: [{ type: "tool-result", toolCallId: call.id, toolName: call.tool.name,
        output: outcome.ok ? { type: "json", value: outcome.value } : { type: "error-json", value: { code: outcome.code } } }] };
    },
  };
}
