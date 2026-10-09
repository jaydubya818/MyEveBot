import { afterEach, expect, it, vi } from "vitest";
import { isOtelDeclaration, isOtelIntegration } from "eve/instrumentation/otel";

vi.mock("@vercel/otel", () => ({
  registerOTel: () => { throw new Error("A second provider must never register"); },
  OTLPHttpProtoTraceExporter: class {},
}));
vi.mock("@braintrust/otel", () => ({ BraintrustExporter: class {} }));
vi.mock("raindrop-ai", () => ({ Raindrop: class {
  createSpanProcessor() { return { onStart() {}, onEnd() {}, forceFlush: async () => {}, shutdown: async () => {} }; }
} }));
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

it("declares configured production exporters without registering another provider", async () => {
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("BRAINTRUST_API_KEY", "test-key");
  vi.stubEnv("RAINDROP_WRITE_KEY", "test-key");
  vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "https://example.com/traces");
  vi.stubEnv("OTEL_RECORD_IO", "false");
  const telemetry = (await import("../instrumentation/telemetry")).default;
  expect(telemetry).not.toHaveProperty("setup");
  const policy = (await import("../instrumentation/otel")).default;
  expect(isOtelDeclaration(policy)).toBe(true);
  expect(policy.options.tracePolicy?.({} as never)).toEqual({emit:true,recordInputs:false,recordOutputs:false});
  for (const destination of [
    (await import("../instrumentation/braintrust")).default,
    (await import("../instrumentation/raindrop")).default,
    (await import("../instrumentation/otlp")).default,
  ]) expect(isOtelIntegration(destination)).toBe(true);
});
