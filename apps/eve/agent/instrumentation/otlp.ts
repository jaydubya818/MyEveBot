import { OTLPHttpProtoTraceExporter } from "@vercel/otel";
import { disableInstrumentation } from "eve/instrumentation";
import { otelIntegration } from "eve/instrumentation/otel";

// The exporter reads the existing OTLP endpoint and headers from the environment.
export default process.env.OTEL_EXPORTER_OTLP_ENDPOINT
  ? otelIntegration({ traceExporter: new OTLPHttpProtoTraceExporter() })
  : disableInstrumentation();
