/** Only installed by the reviewed isolated-copy provider import substitution. */
import type { gateway as realGateway } from "ai";
type Model = ReturnType<typeof realGateway>;
const model = (modelId: string): Model => ({
  specificationVersion: "v4", provider: "local-chat-only-fixture", modelId, supportedUrls: {},
  async doGenerate(options) {
    const origin = process.env.MYEVE_CHAT_ONLY_MODEL_ORIGIN;
    if (!origin || !/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw Error("CHAT_FIXTURE_MODEL_BINDING");
    const response = await fetch(`${origin}/model`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: options.prompt, tools: options.tools }), signal: options.abortSignal });
    if (!response.ok) throw Error("CHAT_FIXTURE_MODEL_FAILED");
    return response.json();
  },
  async doStream() { throw Error("Use the unchanged external-alpha stream wrapper"); },
});
export const gateway = Object.assign(model, {
  async getAvailableModels() {
    // Catalog lookup is substituted too; it never contacts a live provider.
    return { models: [{ id: "openai/gpt-5.4-mini", pricing: { input: "0.00000001", output: "0.00000001" } }] } as Awaited<ReturnType<typeof realGateway.getAvailableModels>>;
  },
});
