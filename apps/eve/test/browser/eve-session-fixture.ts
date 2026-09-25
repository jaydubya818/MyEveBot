// Test-only model. The isolated harness copies this over agent/agent.ts;
// production builds and the builder's deployment manifest exclude test/.
import { defineAgent, defineDynamic } from "eve";
import { MockLanguageModelV4, convertArrayToReadableStream } from "ai/test";
import { setTimeout } from "node:timers/promises";

const usage = { inputTokens: { total: 12, noCache: 12, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } };
export default defineAgent({
  build: { externalDependencies: ["@remotion/bundler", "@remotion/renderer", "heif2jpeg"] },
  model: defineDynamic({ events: {
    "turn.started": () => ({ model: "openai/gpt-4o", modelContextWindowTokens: 128000 }),
    "step.started": () => ({ modelContextWindowTokens: 128000, model: new MockLanguageModelV4({
      modelId: "migration-fixture",
      doStream: async ({ prompt, abortSignal }) => {
        const last = prompt.at(-1);
        const user = JSON.stringify(prompt.findLast(message => message.role === "user")?.content ?? "");
        const isAnswer = last?.role === "tool";
        const name = !isAnswer && user.includes("fixture approval") ? "migration_approval_probe"
          : !isAnswer && user.includes("fixture question") ? "ask_question" : null;
        if (!isAnswer && user.includes("fixture slow")) await setTimeout(30000, undefined, { signal: abortSignal });
        const parts = name ? [
          { type: "tool-call" as const, toolCallId: `fixture-${name}`, toolName: name,
            input: JSON.stringify(name === "ask_question" ? { question: "Which fixture option?", options: [{ label: "Alpha", description: "Choose Alpha." }, { label: "Beta", description: "Choose Beta." }] } : {}) },
        ] : [
          { type: "text-start" as const, id: "text" },
          { type: "text-delta" as const, id: "text", delta: "Migration fixture reply." },
          { type: "text-end" as const, id: "text" },
        ];
        return { stream: convertArrayToReadableStream([
          { type: "stream-start", warnings: [] }, ...parts,
          { type: "finish", finishReason: { unified: name ? "tool-calls" : "stop", raw: name ? "tool_calls" : "stop" }, usage },
        ]) };
      },
    }) }),
  } }),
});
