// Installed only in the isolated source copy by the no-paid journey runner.
// The production externalAlphaModel still reserves, binds and settles each call.
import type { gateway as realGateway } from 'ai';
type Model = ReturnType<typeof realGateway>;
const fixture = (modelId: string): Model => ({
  specificationVersion: 'v4', provider: 'offline-ux-fixture', modelId,
  supportedUrls: {},
  async doGenerate(options) {
    const response = await fetch('http://127.0.0.1:3184/model', {
      method: 'POST', headers: {'content-type':'application/json'},
      body: JSON.stringify({prompt:options.prompt,tools:options.tools}), signal:options.abortSignal,
    });
    if (!response.ok) throw Error('OFFLINE_FIXTURE_MODEL_FAILED');
    return response.json();
  },
  async doStream() { throw Error('Use the canonical external-alpha stream wrapper'); },
});
export const gateway = Object.assign(fixture, {
  async getAvailableModels() {
    return {models:[{id:'openai/gpt-5.4-mini',pricing:{input:'0.00000001',output:'0.00000001'}}]} as Awaited<ReturnType<typeof realGateway.getAvailableModels>>;
  },
});
