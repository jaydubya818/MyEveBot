import { BraintrustExporter } from "@braintrust/otel";
import { disableInstrumentation } from "eve/instrumentation";
import { otelIntegration } from "eve/instrumentation/otel";
import { resolveBraintrustParent } from "./telemetry";

export default process.env.BRAINTRUST_API_KEY
  ? otelIntegration({
      traceExporter: new BraintrustExporter({
        parent: resolveBraintrustParent("eve-agent", process.env.BRAINTRUST_PARENT, process.env.BRAINTRUST_PROJECT_ID),
        filterAISpans: true,
      }),
    })
  : disableInstrumentation();
