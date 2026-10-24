import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { isOtelDeclaration, isOtelIntegration } from "eve/instrumentation/otel";

vi.mock("@vercel/otel", () => ({
  registerOTel: () => { throw new Error("A second provider must never register"); },
  OTLPHttpProtoTraceExporter: class {},
}));
vi.mock("@braintrust/otel", () => ({ BraintrustExporter: class {} }));
const exporterConstructed = vi.hoisted(() => vi.fn());
vi.mock("@opentelemetry/exporter-trace-otlp-proto", () => ({ OTLPTraceExporter: class {
  constructor() { exporterConstructed(); }
  export() {}
  async forceFlush() {}
  async shutdown() {}
} }));
beforeEach(() => exporterConstructed.mockClear());
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

it("declares configured production exporters without registering another provider", async () => {
  vi.stubEnv("NODE_ENV", "production");
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

it.each(["test", "no-key"])("keeps Raindrop network-off in %s mode even with Workshop configured", async mode => {
  vi.stubEnv("NODE_ENV", mode === "test" ? "test" : "production");
  vi.stubEnv("RAINDROP_WRITE_KEY", mode === "test" ? "synthetic-unused-key" : "");
  vi.stubEnv("RAINDROP_WORKSHOP", "1");
  vi.stubEnv("RAINDROP_LOCAL_DEBUGGER", "http://127.0.0.1:5899");
  const telemetry = await import("../instrumentation/telemetry");
  expect(telemetry.raindrop).toBeNull();
  expect(telemetry.raindropTraceExporter).toBeNull();
  expect(exporterConstructed).not.toHaveBeenCalled();
});
