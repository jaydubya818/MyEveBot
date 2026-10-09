import { disableInstrumentation } from "eve/instrumentation";
import { otelIntegration } from "eve/instrumentation/otel";
import { raindrop } from "./telemetry";

export default raindrop
  ? otelIntegration({ spanProcessors: [raindrop.createSpanProcessor()] })
  : disableInstrumentation();
