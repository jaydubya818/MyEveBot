import { otel } from "eve/instrumentation/otel";
import { RECORD_IO } from "./telemetry";

// Apply the existing privacy ceiling to every destination, including Agent Runs.
export default otel({
  tracePolicy: () => ({ emit: true, recordInputs: RECORD_IO, recordOutputs: RECORD_IO }),
});
