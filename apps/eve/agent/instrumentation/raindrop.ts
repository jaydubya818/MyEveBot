import { disableInstrumentation } from "eve/instrumentation";
import { otelIntegration } from "eve/instrumentation/otel";
import { raindropTraceExporter } from "./telemetry";

export default raindropTraceExporter
  ? otelIntegration({ traceExporter: raindropTraceExporter })
  : disableInstrumentation();
