import { defineDynamic, defineInstructions } from "eve/instructions";
import { externalAlphaInstallation } from "../../lib/external-alpha/policy.ts";

/** Omit procedures for unavailable alpha capabilities at assembly; tool guards remain authoritative. */
export function optionalDeploymentInstructions(input: Parameters<typeof defineInstructions>[0]) {
  return defineDynamic({ events: {
    "turn.started": () => externalAlphaInstallation() ? null : defineInstructions(input),
  } });
}
